'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const syncEngine = require('../www/sync-engine.js');
const transportApi = require('../www/sync-transport.js');
const serviceApi = require('../www/sync-service.js');

function createStorage() {
  const data = {};
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
}

function createRepository(local) {
  return {
    exportForSync: async () => ({
      beans: local.beans.slice(),
      drinkLogs: local.drinkLogs.slice(),
      brewPlans: local.brewPlans.slice()
    }),
    applySyncData: async (merged) => {
      local.beans = merged.beans || [];
      local.drinkLogs = merged.drinkLogs || [];
      local.brewPlans = merged.brewPlans || [];
    }
  };
}

test('sync-service: 未登录或关闭时不会创建 transport', async () => {
  let created = 0;
  const service = serviceApi.createSyncService({
    core,
    syncEngine,
    transportApi,
    repository: createRepository({ beans: [], drinkLogs: [], brewPlans: [] }),
    storage: createStorage(),
    transportFactory: () => { created += 1; throw new Error('不应联网'); }
  });

  assert.deepEqual(await service.sync(), { skipped: true, reason: 'not-authenticated', config: service.getConfig() });
  service.setEnabled(true);
  assert.deepEqual(await service.sync(), { skipped: true, reason: 'not-authenticated', config: service.getConfig() });
  assert.equal(created, 0);
});

test('sync-service: 登录保存 token 并默认开启同步', async () => {
  const authCalls = [];
  const service = serviceApi.createSyncService({
    core,
    syncEngine,
    transportApi,
    repository: createRepository({ beans: [], drinkLogs: [], brewPlans: [] }),
    storage: createStorage(),
    authClient: {
      register: async () => { throw new Error('unused'); },
      login: async (body) => { authCalls.push(body); return { token: 'token-1' }; },
      recover: async () => { throw new Error('unused'); }
    }
  });

  const config = await service.login({ email: ' user@example.com ', password: '12345678' });
  assert.equal(config.email, 'user@example.com');
  assert.equal(config.token, 'token-1');
  assert.equal(config.enabled, true);
  assert.equal(config.cursor, null);
  assert.deepEqual(authCalls, [{ email: ' user@example.com ', password: '12345678' }]);
});

test('sync-service: 已登录同步流程会推进 cursor', async () => {
  const local = {
    beans: [core.normalizeBean({ id: 'b1', name: '本地豆', updatedAt: '2026-07-02T01:00:00.000Z', deviceId: 'A' })],
    drinkLogs: [],
    brewPlans: []
  };
  const storage = createStorage();
  serviceApi.createConfigStore(storage).save({ enabled: true, email: 'sync@example.com', token: 'token-1', cursor: null });
  const pushed = [];
  const service = serviceApi.createSyncService({
    core,
    syncEngine,
    transportApi,
    repository: createRepository(local),
    storage,
    now: () => '2026-07-02T03:00:00.000Z',
    transportFactory: () => ({
      pull: async (cursor) => {
        assert.equal(cursor, null);
        return {
          beans: [core.normalizeBean({ id: 'b2', name: '云豆', updatedAt: '2026-07-02T02:00:00.000Z', deviceId: 'B' })],
          drinkLogs: [],
          brewPlans: [],
          cursor: 7
        };
      },
      push: async (records) => {
        pushed.push(records);
        return { cursor: 8 };
      }
    })
  });

  const result = await service.sync();
  assert.equal(result.skipped, false);
  assert.equal(result.cursor, 8);
  assert.equal(service.getConfig().cursor, 8);
  assert.equal(service.getConfig().lastSyncAt, '2026-07-02T03:00:00.000Z');
  assert.deepEqual(local.beans.map((bean) => bean.id).sort(), ['b1', 'b2']);
  assert.deepEqual(pushed[0].beans.map((bean) => bean.id).sort(), ['b1', 'b2']);
});

test('sync-service: 删号调用后端并清空本地凭证', async () => {
  const storage = createStorage();
  serviceApi.createConfigStore(storage).save({ enabled: true, email: 'd@example.com', token: 'tok', cursor: 5 });
  let called = 0;
  const service = serviceApi.createSyncService({
    core, syncEngine, transportApi,
    repository: createRepository({ beans: [], drinkLogs: [], brewPlans: [] }),
    storage,
    transportFactory: () => ({ deleteAccount: async () => { called += 1; return { deleted: true }; }, pull: async () => ({}), push: async () => ({}) })
  });

  const config = await service.deleteAccount();
  assert.equal(called, 1);
  assert.equal(config.token, '');
  assert.equal(config.enabled, false);
  assert.equal(config.loggedIn, false);
});

test('sync-service: 可从全局默认依赖创建服务', async () => {
  const originalCore = global.BeanCore;
  const originalRepository = global.BeanRepository;
  const originalSync = global.BeanSync;
  const originalTransport = global.BeanSyncTransport;
  try {
    global.BeanCore = core;
    global.BeanRepository = createRepository({ beans: [], drinkLogs: [], brewPlans: [] });
    global.BeanSync = syncEngine;
    global.BeanSyncTransport = transportApi;
    const service = serviceApi.createSyncService({ storage: createStorage(), transportFactory: () => { throw new Error('不应联网'); } });
    const result = await service.sync();
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'not-authenticated');
  } finally {
    global.BeanCore = originalCore;
    global.BeanRepository = originalRepository;
    global.BeanSync = originalSync;
    global.BeanSyncTransport = originalTransport;
  }
});
