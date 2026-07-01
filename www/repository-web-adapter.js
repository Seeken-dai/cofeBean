(function (root) {
  'use strict';

  const WEB_KEY = 'coffee-vault-browser-preview';
  const WEB_DB_NAME = 'coffee_vault_web';
  const WEB_STORE = 'kv';
  const WEB_IMAGE_STORE = 'images';
  const WEB_STATE_KEY = 'state';

  root.BeanWebRepositoryAdapter = function createWebRepositoryAdapter(options) {
    const core = options.core;
    const presetPlans = options.presetPlans;
    const storage = options.storage || localStorage;
    let webCache = null;
    let webCacheLoaded = false;

    function idbSupported() { return typeof indexedDB !== 'undefined'; }
    function idbOpen() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(WEB_DB_NAME, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(WEB_STORE)) db.createObjectStore(WEB_STORE);
          if (!db.objectStoreNames.contains(WEB_IMAGE_STORE)) db.createObjectStore(WEB_IMAGE_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    function idbGet(key) {
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(WEB_STORE, 'readonly');
        const req = tx.objectStore(WEB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }));
    }
    function idbPut(key, value) {
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(WEB_STORE, 'readwrite');
        tx.objectStore(WEB_STORE).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      }));
    }
    function withPresetPlans(plans) {
      const normalized = (plans || []).map((plan) => core.normalizeBrewPlan(plan, plan.updatedAt));
      const presets = presetPlans();
      const presetIds = new Set(presets.map((plan) => plan.id));
      const userPlans = normalized.filter((plan) => !presetIds.has(plan.id));
      const userIds = new Set(userPlans.map((plan) => plan.id));
      presets.forEach((plan) => { if (!userIds.has(plan.id)) userPlans.push(plan); });
      return userPlans;
    }
    function blankState() {
      return { beans: [], drinkLogs: [], brewPlans: presetPlans(), settings: core.normalizeSettings({}) };
    }
    async function init() {
      webCacheLoaded = false;
      try {
        if (idbSupported()) {
          const stored = await idbGet(WEB_STATE_KEY);
          if (stored !== undefined && stored !== null) { webCache = stored; webCacheLoaded = true; return; }
        }
      } catch (_) {}
      try { const ls = storage.getItem(WEB_KEY); webCache = ls ? JSON.parse(ls) : null; } catch (_) { webCache = null; }
      webCacheLoaded = true;
      if (webCache != null && idbSupported()) { try { await idbPut(WEB_STATE_KEY, webCache); } catch (_) {} }
    }
    function loadState() {
      try {
        const parsed = webCacheLoaded ? webCache : JSON.parse(storage.getItem(WEB_KEY) || 'null');
        if (Array.isArray(parsed)) return { beans: parsed.map((bean) => core.normalizeBean(bean, bean.updatedAt)), drinkLogs: [], brewPlans: presetPlans(), settings: core.normalizeSettings({}) };
        if (!parsed || typeof parsed !== 'object') return blankState();
        return {
          beans: (parsed.beans || []).map((bean) => core.normalizeBean(bean, bean.updatedAt)),
          drinkLogs: (parsed.drinkLogs || []).map((log) => core.normalizeDrinkLog(log, log.updatedAt)),
          brewPlans: withPresetPlans(parsed.brewPlans || []),
          settings: core.normalizeSettings(parsed.settings)
        };
      } catch (_) { return blankState(); }
    }
    function saveState(state) {
      webCache = state;
      webCacheLoaded = true;
      if (idbSupported()) {
        return idbPut(WEB_STATE_KEY, state).catch(() => { try { storage.setItem(WEB_KEY, JSON.stringify(state)); } catch (_) {} });
      }
      try { storage.setItem(WEB_KEY, JSON.stringify(state)); } catch (_) {}
      return Promise.resolve();
    }
    async function saveImage(blob) {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('img-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
      await idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(WEB_IMAGE_STORE, 'readwrite');
        tx.objectStore(WEB_IMAGE_STORE).put(blob, id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      }));
      return 'idb:' + id;
    }
    function getImage(ref) {
      if (!ref || String(ref).indexOf('idb:') !== 0) return Promise.resolve(null);
      const id = String(ref).slice(4);
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(WEB_IMAGE_STORE, 'readonly');
        const req = tx.objectStore(WEB_IMAGE_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }));
    }
    async function deleteImage(ref) {
      if (!ref || String(ref).indexOf('idb:') !== 0) return;
      const id = String(ref).slice(4);
      try {
        await idbOpen().then((db) => new Promise((resolve, reject) => {
          const tx = db.transaction(WEB_IMAGE_STORE, 'readwrite');
          tx.objectStore(WEB_IMAGE_STORE).delete(id);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        }));
      } catch (_) {}
    }

    return { init, loadState, saveState, saveImage, getImage, deleteImage };
  };
})(window);
