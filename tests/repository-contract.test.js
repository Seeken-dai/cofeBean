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
  'applySyncData',
  'deleteBrewPlan', 'deleteDrinkLog', 'deleteSmartValue', 'deleteWebImage',
  'duplicateBrewPlan', 'exportForSync', 'getAll', 'getBrewPlans', 'getDeviceId',
  'getDrinkLogs', 'getSettings', 'getWebImage', 'importData', 'init', 'isNative', 'legacyData', 'remove',
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

test('repository contract: 删除豆子写墓碑而非物理删除，读接口过滤且重载不复活', async () => {
  const storage = memoryStorage();
  let repo = await loadRepository(storage);
  await repo.save(core.normalizeBean({ id: 'tomb-bean', name: '墓碑豆', initialWeight: 100, remainingWeight: 100 }));

  await repo.remove('tomb-bean');
  assert.equal((await repo.getAll()).length, 0, '删除后 getAll 不含该豆');

  const raw = JSON.parse(storage.getItem('coffee-vault-browser-preview'));
  const stored = raw.beans.find((bean) => bean.id === 'tomb-bean');
  assert.ok(stored, '底层仍保留记录（软删除）');
  assert.ok(stored.deletedAt, '记录带墓碑 deletedAt');

  cleanupRepository();
  repo = await loadRepository(storage);
  assert.equal((await repo.getAll()).length, 0, '重载后仍不含该豆（不复活）');
  cleanupRepository();
});

test('repository contract: 删除饮用记录写墓碑并加回余量，读接口过滤', async () => {
  const storage = memoryStorage();
  const repo = await loadRepository(storage);
  await repo.save(core.normalizeBean({ id: 'b1', name: '豆', initialWeight: 100, remainingWeight: 100 }));
  await repo.saveDrinkLog({ id: 'l1', beanId: 'b1', beanName: '豆', grams: 20 });
  assert.equal((await repo.getDrinkLogs()).length, 1);
  assert.equal((await repo.getAll())[0].remainingWeight, 80);

  await repo.deleteDrinkLog('l1');
  assert.equal((await repo.getDrinkLogs()).length, 0, '删除后不含该记录');
  assert.equal((await repo.getAll())[0].remainingWeight, 100, '删除记录后余量加回');
  cleanupRepository();
});

test('repository contract: local writes stamp stable deviceId and increment revision', async () => {
  const storage = memoryStorage();
  const repo = await loadRepository(storage);
  const deviceId = repo.getDeviceId();

  const first = await repo.save({ id: 'sync-bean', name: '同步豆', initialWeight: 100, remainingWeight: 100 });
  const second = await repo.save({ ...first, name: '同步豆改名' });
  assert.equal(first.deviceId, deviceId);
  assert.equal(second.deviceId, deviceId);
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);

  const log = await repo.saveDrinkLog({ id: 'sync-log', beanId: 'sync-bean', beanName: '同步豆改名', grams: 10 });
  assert.equal(log.deviceId, deviceId);
  assert.equal(log.revision, 1);
  const beanAfterLog = (await repo.getAll())[0];
  assert.equal(beanAfterLog.revision, 3, '喝一杯会更新豆子库存并递增豆子 revision');
  cleanupRepository();
});

test('repository contract: sync export includes tombstones and applySyncData upserts without deleting absent records', async () => {
  const storage = memoryStorage();
  const repo = await loadRepository(storage);
  await repo.save({ id: 'sync-a', name: '会删除' });
  await repo.save({ id: 'sync-b', name: '会保留' });
  await repo.remove('sync-a');

  const exported = await repo.exportForSync();
  assert.equal(exported.beans.length, 2);
  assert.ok(exported.beans.find((bean) => bean.id === 'sync-a').deletedAt);
  assert.equal((await repo.getAll()).length, 1);

  await repo.applySyncData({
    beans: [
      core.normalizeBean({ id: 'remote-live', name: '远端豆', updatedAt: '2026-07-02T00:00:00.000Z', deviceId: 'remote' }, '2026-07-02T00:00:00.000Z'),
      core.normalizeBean({ id: 'remote-dead', name: '远端墓碑', deletedAt: '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z', deviceId: 'remote' }, '2026-07-02T00:00:00.000Z')
    ],
    drinkLogs: [],
    brewPlans: []
  });
  assert.deepEqual((await repo.getAll()).map((bean) => bean.id).sort(), ['remote-live', 'sync-b']);
  assert.equal((await repo.exportForSync()).beans.length, 4);
  cleanupRepository();
});

test('repository contract: merge import preserves newer local tombstones', async () => {
  const storage = memoryStorage();
  const repo = await loadRepository(storage);
  await repo.save(core.normalizeBean({ id: 'merge-tomb', name: '已删除豆', updatedAt: '2026-07-03T10:00:00.000Z' }, '2026-07-03T10:00:00.000Z'));
  await repo.remove('merge-tomb');
  const tombstone = (await repo.exportForSync()).beans.find((bean) => bean.id === 'merge-tomb');
  assert.ok(tombstone.deletedAt);

  await repo.importData({
    exportScope: 'library',
    beans: [core.normalizeBean({ id: 'merge-tomb', name: '旧备份豆', updatedAt: '2026-07-02T10:00:00.000Z' }, '2026-07-02T10:00:00.000Z')],
    drinkLogs: []
  }, 'merge');

  assert.equal((await repo.getAll()).some((bean) => bean.id === 'merge-tomb'), false, '较新的本地墓碑不应被旧备份复活');
  assert.ok((await repo.exportForSync()).beans.find((bean) => bean.id === 'merge-tomb').deletedAt);
  cleanupRepository();
});
