(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanCloudSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const CONFIG_KEY = 'coffee-vault-sync-config';
  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    email: '',
    token: '',
    cursor: null,
    lastSyncAt: null
  });

  function normalizeConfig(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      enabled: source.enabled === true,
      email: String(source.email || '').trim(),
      token: String(source.token || ''),
      cursor: source.cursor == null || source.cursor === '' ? null : source.cursor,
      lastSyncAt: source.lastSyncAt || null
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
    let config = configStore.load();

    function persist(patch) {
      config = configStore.save({ ...config, ...(patch || {}) });
      return getConfig();
    }

    function getConfig() { return { ...config, loggedIn: Boolean(config.token) }; }
    function createTransport() {
      if (deps.transportFactory) return deps.transportFactory(config);
      return transportApi.createHttpTransport({ core, baseUrl: deps.baseUrl, fetch: deps.fetch, token: config.token });
    }
    function createAuthClient() {
      return deps.authClient || transportApi.createAuthClient({ baseUrl: deps.baseUrl, fetch: deps.fetch });
    }

    async function saveAuth(email, response) {
      if (!response || !response.token) throw new Error('登录响应缺少 token');
      return persist({ email: String(email || '').trim(), token: response.token, cursor: null, enabled: true });
    }

    async function sync(options = {}) {
      if (!canSync()) return { skipped: true, reason: 'not-allowed', config: getConfig() };
      if (!config.token) return { skipped: true, reason: 'not-authenticated', config: getConfig() };
      if (!config.enabled && !options.force) return { skipped: true, reason: 'disabled', config: getConfig() };
      const engine = syncEngine.createEngine({
        core,
        transport: createTransport(),
        getLocal: () => repository.exportForSync(),
        applyLocal: (merged) => repository.applySyncData(merged),
        cursor: config.cursor
      });
      const result = await engine.sync();
      persist({ cursor: result.cursor || null, lastSyncAt: now() });
      return { skipped: false, cursor: result.cursor || null, merged: result.merged, config: getConfig() };
    }

    return {
      getConfig,
      setEnabled: (enabled) => persist({ enabled: enabled === true }),
      logout: () => persist({ enabled: false, token: '', cursor: null }),
      register: async (body) => saveAuth(body && body.email, await createAuthClient().register(body)),
      login: async (body) => saveAuth(body && body.email, await createAuthClient().login(body)),
      recover: async (body) => saveAuth(body && body.email, await createAuthClient().recover(body)),
      sync
    };
  }

  return { CONFIG_KEY, DEFAULT_CONFIG, normalizeConfig, createConfigStore, createSyncService };
});
