(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanCloudSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const CONFIG_KEY = 'coffee-vault-sync-config';
  const SYNC_TIMEOUT_MS = 60000;
  function withDeadline(promise, ms) {
    if (!ms) return promise;
    let timer = null;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('同步超时，请检查网络后重试')), ms); });
    return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
  }
  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    email: '',
    token: '',
    cursor: null,
    pushState: null,
    imageSynced: null,
    lastSyncAt: null,
    lastSyncError: '',
    lastSyncErrorAt: null
  });

  function normalizeConfig(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      enabled: source.enabled === true,
      email: String(source.email || '').trim(),
      token: String(source.token || ''),
      cursor: source.cursor == null || source.cursor === '' ? null : source.cursor,
      pushState: source.pushState && typeof source.pushState === 'object' ? source.pushState : null,
      imageSynced: source.imageSynced && typeof source.imageSynced === 'object' ? source.imageSynced : null,
      lastSyncAt: source.lastSyncAt || null,
      lastSyncError: String(source.lastSyncError || ''),
      lastSyncErrorAt: source.lastSyncErrorAt || null
    };
  }

  function createMemoryStorage() {
    const data = {};
    return {
      getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
      setItem: (key, value) => { data[key] = String(value); },
      removeItem: (key) => { delete data[key]; }
    };
  }

  function createConfigStore(storage, key) {
    const target = storage || (typeof localStorage !== 'undefined' ? localStorage : createMemoryStorage());
    const storeKey = key || CONFIG_KEY;
    return {
      load() {
        try { return normalizeConfig(JSON.parse(target.getItem(storeKey) || 'null')); } catch (_) { return normalizeConfig({}); }
      },
      save(config) {
        const normalized = normalizeConfig(config);
        target.setItem(storeKey, JSON.stringify(normalized));
        return normalized;
      },
      clear() {
        target.removeItem(storeKey);
        return normalizeConfig({});
      }
    };
  }

  function defaultCanSync() { return true; }
  function syncErrorMessage(error) {
    const message = String(error && error.message || error || '同步失败');
    return message.length > 120 ? message.slice(0, 117) + '...' : message;
  }

  const IMAGE_FIELDS = ['bagImagePath', 'labelImagePath'];
  function isIdbRef(value) { return typeof value === 'string' && value.indexOf('idb:') === 0; }
  function isR2Ref(value) { return typeof value === 'string' && value.indexOf('r2:') === 0; }
  function isFileRef(value) { return typeof value === 'string' && value.indexOf('file:') === 0; }
  function imageRole(field) { return field === 'labelImagePath' ? 'label' : 'bag'; }
  function binaryToBase64(binary) {
    if (typeof btoa === 'function') return btoa(binary);
    if (typeof Buffer !== 'undefined') return Buffer.from(binary, 'binary').toString('base64');
    throw new Error('当前环境不支持图片编码');
  }
  function base64ToBinary(data) {
    if (typeof atob === 'function') return atob(data);
    if (typeof Buffer !== 'undefined') return Buffer.from(data, 'base64').toString('binary');
    throw new Error('当前环境不支持图片解码');
  }
  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return binaryToBase64(binary);
  }
  function base64ToBlob(data, mimeType) {
    const binary = base64ToBinary(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'image/webp' });
  }
  function extensionForMime(mimeType) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }
  function createNativeImageStore(scanner) {
    return {
      isUploadableRef: isFileRef,
      getImage: async (ref) => {
        if (!scanner || typeof scanner.readArchivedImage !== 'function') return null;
        const image = await scanner.readArchivedImage({ path: ref });
        if (!image || !image.data) return null;
        return base64ToBlob(image.data, image.mimeType);
      },
      saveImage: async (blob, roleOrField) => {
        if (!scanner || typeof scanner.restoreArchivedImage !== 'function') return '';
        const role = ['bag', 'label', 'drink'].includes(roleOrField) ? roleOrField : imageRole(roleOrField);
        const result = await scanner.restoreArchivedImage({
          data: await blobToBase64(blob),
          mimeType: blob && blob.type || 'image/webp',
          extension: extensionForMime(blob && blob.type),
          role
        });
        return result && (result.path || result.uri) || '';
      }
    };
  }
  // 图片映射 transport：让引擎/合并始终在本地图片空间，wire 上用云端 r2:。
  // Web 使用 idb:；Android 使用原生私有目录 file:。bean 图片字段与 drinkLog.photos 都走同一映射。
  function createImageMappingTransport(baseTransport, imageDeps) {
    const getImage = imageDeps.getImage;
    const saveImage = imageDeps.saveImage;
    const isUploadableRef = imageDeps.isUploadableRef || isIdbRef;
    // 持久映射 syncedMap：只记录“云端已确认承载该 r2”的本地图（localRef -> r2）。
    // 关键：确认信号是“pull 回显了该 r2”，而非“blob 上传成功”——两者会在 push 被服务端
    // LWW 拒绝时分叉。若用“已上传”当作跳过补推的依据，会出现“图传上了 R2、但 bean 记录没被
    // 接受、却再也不补推”的坑（金菠萝即此）。故上传只做会话内去重，确认才落持久层。
    const syncedMap = imageDeps.imageSynced && typeof imageDeps.imageSynced === 'object' ? imageDeps.imageSynced : {};
    const uploaded = new Map();   // localRef -> r2（会话去重 + 已确认）
    const restored = new Map();   // r2 -> localRef（round-trip 复用原引用，避免重复落盘）
    Object.keys(syncedMap).forEach((localRef) => {
      const r2 = syncedMap[localRef];
      if (!r2) return;
      uploaded.set(localRef, r2);
      if (!restored.has(r2)) restored.set(r2, localRef);
    });
    function confirm(localRef, r2) { // 云端已确认承载该 r2，落持久层，下轮不再补推
      if (!localRef || !r2) return;
      uploaded.set(localRef, r2);
      if (!restored.has(r2)) restored.set(r2, localRef);
      syncedMap[localRef] = r2;
    }
    async function uploadRef(ref) {
      const cached = uploaded.get(ref);
      if (cached) return cached;
      const blob = await getImage(ref);
      if (!blob) return null;
      const res = await baseTransport.uploadImage(blob);
      const r2 = res && (res.key || (res.sha256 ? 'r2:' + res.sha256 : null));
      if (r2) { uploaded.set(ref, r2); if (!restored.has(r2)) restored.set(r2, ref); } // 仅会话去重/复用，未确认不落持久层
      return r2;
    }
    async function beanIdbToR2(bean) {
      let next = null;
      for (const field of IMAGE_FIELDS) {
        if (!isUploadableRef(bean[field])) continue;
        try {
          const r2 = await uploadRef(bean[field]);
          if (r2) { next = next || { ...bean }; next[field] = r2; }
        } catch (_) {}
      }
      // 图片引用从本地脏值 file:/idb: 变成 r2 是一次真实内容变化，但 updatedAt 没变；
      // 服务端 LWW 按 (updatedAt, revision, deviceId) 判定，若不 bump revision，未编辑过的
      // 存量豆（updatedAt 与云端脏记录相同）会被判为“非更新”而拒绝覆盖。bump 后 finalPull
      // 会把新 revision 写回本地，下轮即稳定。
      if (next) next.revision = (Number(next.revision) || 0) + 1;
      return next || bean;
    }
    async function beanR2ToIdb(bean) {
      let next = null;
      for (const field of IMAGE_FIELDS) {
        if (!isR2Ref(bean[field])) continue;
        try {
          let localRef = restored.get(bean[field]);
          if (!localRef) {
            const blob = await baseTransport.downloadImage(bean[field]);
            if (!blob) continue;
            localRef = await saveImage(blob, field);
          }
          confirm(localRef, bean[field]); // 云端确实回显了该 r2 → 确认，之后不再补推
          next = next || { ...bean }; next[field] = localRef;
        } catch (_) {}
      }
      return next || bean;
    }
    async function logPhotosToR2(log) {
      const photos = Array.isArray(log && log.photos) ? log.photos : [];
      let next = null;
      const mapped = [];
      for (const ref of photos) {
        if (!isUploadableRef(ref)) { mapped.push(ref); continue; }
        try {
          const r2 = await uploadRef(ref);
          mapped.push(r2 || ref);
          if (r2) next = next || { ...log };
        } catch (_) { mapped.push(ref); }
      }
      if (next) { next.photos = mapped; next.revision = (Number(next.revision) || 0) + 1; }
      return next || log;
    }
    async function logPhotosToLocal(log) {
      const photos = Array.isArray(log && log.photos) ? log.photos : [];
      let next = null;
      const mapped = [];
      for (const ref of photos) {
        if (!isR2Ref(ref)) { mapped.push(ref); continue; }
        try {
          let localRef = restored.get(ref);
          if (!localRef) {
            const blob = await baseTransport.downloadImage(ref);
            if (!blob) { mapped.push(ref); continue; }
            localRef = await saveImage(blob, 'drink');
          }
          confirm(localRef, ref);
          mapped.push(localRef);
          next = next || { ...log };
        } catch (_) { mapped.push(ref); }
      }
      if (next) next.photos = mapped;
      return next || log;
    }
    function beanHasUnsyncedImage(bean) {
      return IMAGE_FIELDS.some((field) => isUploadableRef(bean[field]) && !syncedMap[bean[field]]);
    }
    function logHasUnsyncedImage(log) {
      return (log.photos || []).some((ref) => isUploadableRef(ref) && !syncedMap[ref]);
    }
    return {
      hello: () => baseTransport.hello(),
      deleteAccount: (...args) => baseTransport.deleteAccount(...args),
      async pull(cursor) {
        const data = await baseTransport.pull(cursor);
        const beans = [];
        const drinkLogs = [];
        for (const bean of data.beans || []) beans.push(await beanR2ToIdb(bean));
        for (const log of data.drinkLogs || []) drinkLogs.push(await logPhotosToLocal(log));
        return { ...data, beans, drinkLogs };
      },
      async push(records, cursor, allRecords) {
        const beans = [];
        const drinkLogs = [];
        const seen = new Set();
        const seenLogs = new Set();
        for (const bean of (records && records.beans) || []) {
          beans.push(await beanIdbToR2(bean));
          if (bean && bean.id != null) seen.add(bean.id);
        }
        for (const log of (records && records.drinkLogs) || []) {
          drinkLogs.push(await logPhotosToR2(log));
          if (log && log.id != null) seenLogs.add(log.id);
        }
        // 补推：本地仍有未上传到云端的图片（多为旧版本存量图，记录本身没变、
        // 不在增量集里）。只上传/补推“图片尚未映射到 r2”的豆，一次修复后即稳定。
        for (const bean of (allRecords && allRecords.beans) || []) {
          if (!bean || bean.id == null || seen.has(bean.id)) continue;
          if (bean.deletedAt) continue; // 墓碑不必上传图片
          if (!beanHasUnsyncedImage(bean)) continue;
          const converted = await beanIdbToR2(bean);
          if (converted === bean) continue; // 没有任何图片成功上传（如本机缺源文件），不补推 file: 脏值
          beans.push(converted);
          seen.add(bean.id);
        }
        for (const log of (allRecords && allRecords.drinkLogs) || []) {
          if (!log || log.id == null || seenLogs.has(log.id)) continue;
          if (log.deletedAt) continue;
          if (!logHasUnsyncedImage(log)) continue;
          const converted = await logPhotosToR2(log);
          if (converted === log) continue;
          drinkLogs.push(converted);
          seenLogs.add(log.id);
        }
        return baseTransport.push({ ...records, beans, drinkLogs }, cursor);
      }
    };
  }

  function createSyncService(options) {
    const deps = options || {};
    const core = deps.core || root.BeanCore;
    const repository = deps.repository || root.BeanRepository;
    const syncEngine = deps.syncEngine || root.BeanSync;
    const transportApi = deps.transportApi || root.BeanSyncTransport;
    if (!core) throw new Error('缺少 BeanCore');
    if (!repository) throw new Error('缺少 BeanRepository');
    if (!syncEngine || typeof syncEngine.createEngine !== 'function') throw new Error('缺少 BeanSync.createEngine');
    if (!transportApi || typeof transportApi.createHttpTransport !== 'function') throw new Error('缺少 BeanSyncTransport');

    const configStore = deps.configStore || createConfigStore(deps.storage, deps.configKey);
    const canSync = deps.canSync || defaultCanSync;
    const now = deps.now || (() => new Date().toISOString());
    const syncTimeoutMs = deps.syncTimeoutMs == null ? SYNC_TIMEOUT_MS : deps.syncTimeoutMs;
    let config = configStore.load();

    function persist(patch) {
      config = configStore.save({ ...config, ...(patch || {}) });
      return getConfig();
    }

    function getConfig() { return { ...config, loggedIn: Boolean(config.token) }; }
    function createTransport(imageSynced) {
      if (deps.transportFactory) return deps.transportFactory(config);
      const base = transportApi.createHttpTransport({ core, baseUrl: deps.baseUrl, fetch: deps.fetch, token: config.token });
      const scanner = root.Capacitor && root.Capacitor.Plugins ? root.Capacitor.Plugins.CoffeeLabelScanner : null;
      const nativeImages = repository.isNative && repository.isNative() && scanner ? createNativeImageStore(scanner) : null;
      const getImage = deps.getImage || (nativeImages && nativeImages.getImage) || (typeof repository.getWebImage === 'function' ? (ref) => repository.getWebImage(ref) : null);
      const saveImage = deps.saveImage || (nativeImages && nativeImages.saveImage) || (typeof repository.saveWebImage === 'function' ? (blob) => repository.saveWebImage(blob) : null);
      const isUploadableRef = deps.isUploadableRef || (nativeImages && nativeImages.isUploadableRef) || isIdbRef;
      if (getImage && saveImage) return createImageMappingTransport(base, { getImage, saveImage, isUploadableRef, imageSynced: imageSynced || {} });
      return base;
    }
    function createAuthClient() {
      return deps.authClient || transportApi.createAuthClient({ baseUrl: deps.baseUrl, fetch: deps.fetch });
    }

    async function saveAuth(email, response) {
      if (!response || !response.token) throw new Error('登录响应缺少 token');
      return persist({ email: String(email || '').trim(), token: response.token, cursor: null, pushState: null, imageSynced: null, enabled: true, lastSyncError: '', lastSyncErrorAt: null });
    }

    async function sync(options = {}) {
      if (!canSync()) return { skipped: true, reason: 'not-allowed', config: getConfig() };
      if (!config.token) return { skipped: true, reason: 'not-authenticated', config: getConfig() };
      if (!config.enabled && !options.force) return { skipped: true, reason: 'disabled', config: getConfig() };
      const imageSynced = { ...(config.imageSynced || {}) };
      const engine = syncEngine.createEngine({
        core,
        transport: createTransport(imageSynced),
        getLocal: () => repository.exportForSync(),
        applyLocal: (merged) => repository.applySyncData(merged),
        cursor: config.cursor,
        pushState: config.pushState
      });
      try {
        const result = await withDeadline(engine.sync(), options.timeoutMs == null ? syncTimeoutMs : options.timeoutMs);
        persist({ cursor: result.cursor || null, pushState: result.pushState || null, imageSynced, lastSyncAt: now(), lastSyncError: '', lastSyncErrorAt: null });
        return { skipped: false, cursor: result.cursor || null, merged: result.merged, config: getConfig() };
      } catch (error) {
        persist({ lastSyncError: syncErrorMessage(error), lastSyncErrorAt: now() });
        throw error;
      }
    }

    async function deleteAccount() {
      if (!config.token) return getConfig();
      const transport = createTransport();
      if (typeof transport.deleteAccount === 'function') await transport.deleteAccount();
      return persist({ enabled: false, token: '', cursor: null, pushState: null, imageSynced: null, lastSyncError: '', lastSyncErrorAt: null });
    }

    return {
      getConfig,
      setEnabled: (enabled) => persist({ enabled: enabled === true }),
      logout: () => persist({ enabled: false, token: '', cursor: null, pushState: null, imageSynced: null, lastSyncError: '', lastSyncErrorAt: null }),
      deleteAccount,
      register: async (body) => saveAuth(body && body.email, await createAuthClient().register(body)),
      login: async (body) => saveAuth(body && body.email, await createAuthClient().login(body)),
      recover: async (body) => saveAuth(body && body.email, await createAuthClient().recover(body)),
      sync
    };
  }

  return { CONFIG_KEY, DEFAULT_CONFIG, normalizeConfig, createConfigStore, createNativeImageStore, createImageMappingTransport, createSyncService };
});
