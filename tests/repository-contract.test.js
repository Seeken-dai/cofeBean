'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../www/data-core.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function fakeIndexedDB(options = {}) {
  const databases = new Map();
  const failPutStores = new Set(options.failPutStores || []);
  function asyncCall(callback) { queueMicrotask(callback); }
  function complete(tx) { asyncCall(() => { if (tx.oncomplete) tx.oncomplete(); }); }
  function fail(tx, error) { asyncCall(() => { tx.error = error; if (tx.onerror) tx.onerror(); }); }
  function requestSuccess(request, value) { asyncCall(() => { request.result = value; if (request.onsuccess) request.onsuccess(); }); }

  return {
    open(name) {
      const request = {};
      asyncCall(() => {
        let db = databases.get(name);
        const fresh = !db;
        if (!db) {
          const stores = new Map();
          db = {
            objectStoreNames: { contains: (storeName) => stores.has(storeName) },
            createObjectStore: (storeName) => stores.set(storeName, new Map()),
            transaction(storeName) {
              const tx = {
                objectStore() {
                  const store = stores.get(storeName);
                  return {
                    get(key) {
                      const req = {};
                      requestSuccess(req, store ? store.get(key) : undefined);
                      complete(tx);
                      return req;
                    },
                    put(value, key) {
                      if (failPutStores.has(storeName)) {
                        fail(tx, new Error('IndexedDB put failed'));
                        return;
                      }
                      store.set(key, value);
                      complete(tx);
                    },
                    delete(key) {
                      if (store) store.delete(key);
                      complete(tx);
                    }
                  };
                }
              };
              return tx;
            },
            close() {}
          };
          databases.set(name, db);
        }
        request.result = db;
        if (fresh && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

async function loadRepository(storage) {
  global.localStorage = storage || memoryStorage();
  global.window = { BeanCore: core };
  const adapterPath = path.resolve(__dirname, '../www/repository-web-adapter.js');
  const modulePath = path.resolve(__dirname, '../www/repository.js');
  delete require.cache[adapterPath];
  delete require.cache[modulePath];
  require(adapterPath);
  require(modulePath);
  const repo = global.window.BeanRepository;
  await repo.init();
  return repo;
}

function cleanupRepository() {
  delete global.window;
  delete global.localStorage;
  delete global.indexedDB;
}

const PUBLIC_METHODS = [
  'deleteBrewPlan', 'deleteDrinkLog', 'deleteSmartValue', 'deleteWebImage',
  'duplicateBrewPlan', 'getAll', 'getBrewPlans', 'getDrinkLogs', 'getSettings',
  'getWebImage', 'importData', 'init', 'isNative', 'legacyData', 'remove',
  'renameSmartValue', 'replaceAll', 'replaceAllData', 'save', 'saveBrewPlan',
  'saveDrinkLog', 'saveSettings', 'saveWebImage', 'smartValues'
];

test('repository contract: public interface remains stable', async () => {
  const repo = await loadRepository();
  assert.deepEqual(Object.keys(repo).sort(), PUBLIC_METHODS);
  assert.equal(repo.isNative(), false);
  cleanupRepository();
});

test('repository contract: web adapter normalizes writes and persists across reload', async () => {
  const storage = memoryStorage();
  let repo = await loadRepository(storage);

  const saved = await repo.save({
    id: 'contract-bean',
    name: '契约豆',
    status: '乱写',
    favorite: '1',
    bestFlavorDays: 5000,
    initialWeight: '200',
    remainingWeight: '180'
  });
  await repo.saveSettings({ quickGrams: 0, theme: 'frost', priceUnit: 'jin' });

  assert.equal(saved.status, '未开封');
  assert.equal(saved.favorite, true);
  assert.equal(saved.bestFlavorDays, 3650);

  cleanupRepository();
  repo = await loadRepository(storage);

  const [bean] = await repo.getAll();
  const settings = await repo.getSettings();
  assert.equal(bean.id, 'contract-bean');
  assert.equal(bean.status, '未开封');
  assert.equal(bean.favorite, true);
  assert.equal(bean.bestFlavorDays, 3650);
  assert.equal(bean.initialWeight, 200);
  assert.equal(bean.remainingWeight, 180);
  assert.equal(settings.quickGrams, 1);
  assert.equal(settings.theme, 'frost');
  assert.equal(settings.priceUnit, 'jin');
  cleanupRepository();
});

test('repository contract: smart values update through the repository boundary', async () => {
  const repo = await loadRepository();
  await repo.replaceAllData([
    core.normalizeBean({ id: 'bean-a', name: 'A', roaster: '旧烘焙商', origin: '云南' }),
    core.normalizeBean({ id: 'bean-b', name: 'B', roaster: '旧烘焙商', process: '水洗' })
  ], [], core.normalizeSettings({}), []);

  assert.deepEqual(await repo.smartValues('roaster'), ['旧烘焙商']);
  await repo.renameSmartValue('roaster', '旧烘焙商', '新烘焙商');
  assert.deepEqual(await repo.smartValues('roaster'), ['新烘焙商']);
  await repo.deleteSmartValue('roaster', '新烘焙商');
  assert.deepEqual(await repo.smartValues('roaster'), []);

  const beans = await repo.getAll();
  assert.equal(beans.every((bean) => bean.roaster === ''), true);
  cleanupRepository();
});

test('repository contract: web image adapter stores, reads, and deletes IndexedDB blobs', async () => {
  global.indexedDB = fakeIndexedDB();
  const repo = await loadRepository();
  const blob = new Blob(['bag-bytes'], { type: 'image/webp' });

  const ref = await repo.saveWebImage(blob);
  assert.match(ref, /^idb:/);

  const saved = await repo.getWebImage(ref);
  assert.equal(saved.type, 'image/webp');
  assert.equal(await saved.text(), 'bag-bytes');
  assert.equal(await repo.getWebImage('file:///bag.jpg'), null);

  await repo.deleteWebImage(ref);
  assert.equal(await repo.getWebImage(ref), null);
  cleanupRepository();
});

test('repository contract: web state migrates localStorage preview data into IndexedDB', async () => {
  const storage = memoryStorage();
  const indexedDB = fakeIndexedDB();
  storage.setItem('coffee-vault-browser-preview', JSON.stringify({
    beans: [core.normalizeBean({ id: 'legacy-web-bean', name: '旧 Web 豆' })]
  }));
  global.indexedDB = indexedDB;
  let repo = await loadRepository(storage);
  assert.equal((await repo.getAll())[0].id, 'legacy-web-bean');

  cleanupRepository();
  storage.removeItem('coffee-vault-browser-preview');
  global.indexedDB = indexedDB;
  repo = await loadRepository(storage);
  assert.equal((await repo.getAll())[0].id, 'legacy-web-bean');
  cleanupRepository();
});

test('repository contract: web state falls back to localStorage when IndexedDB writes fail', async () => {
  const storage = memoryStorage();
  global.indexedDB = fakeIndexedDB({ failPutStores: ['kv'] });
  let repo = await loadRepository(storage);
  await repo.save({ id: 'fallback-bean', name: '回退豆' });

  cleanupRepository();
  repo = await loadRepository(storage);
  assert.equal((await repo.getAll())[0].id, 'fallback-bean');
  cleanupRepository();
});
