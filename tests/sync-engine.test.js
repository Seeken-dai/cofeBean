'use strict';

// 同步引擎骨架的本地模拟测试（阶段 4.2-b）。
// 用一个共享的内存 mock server 模拟云端；两台设备各持一个引擎，验证：
// 创建→同步→对端可见；删除（墓碑）→同步→对端隐藏且不复活；预置方案不上传。
// 纯逻辑、无网络、无真实云端。

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const { createEngine } = require('../www/sync-engine.js');

function makeServer() {
  const store = { beans: [], drinkLogs: [], brewPlans: [] };
  return {
    store,
    transport: {
      async pull() {
        return { beans: store.beans.slice(), drinkLogs: store.drinkLogs.slice(), brewPlans: store.brewPlans.slice(), cursor: 's1' };
      },
      async push(records) {
        store.beans = core.mergeSyncRecords(store.beans, records.beans || []);
        store.drinkLogs = core.mergeSyncRecords(store.drinkLogs, records.drinkLogs || []);
        store.brewPlans = core.mergeSyncRecords(store.brewPlans, records.brewPlans || []);
        return { cursor: 's1' };
      }
    }
  };
}

function makeDevice(server) {
  const local = { beans: [], drinkLogs: [], brewPlans: [] };
  const engine = createEngine({
    core,
    transport: server.transport,
    getLocal: () => local,
    applyLocal: (merged) => { local.beans = merged.beans; local.drinkLogs = merged.drinkLogs; local.brewPlans = merged.brewPlans; }
  });
  return { local, engine };
}

const T = (h, m) => `2026-07-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

test('sync-engine: 一台创建，另一台同步后可见', async () => {
  const server = makeServer();
  const A = makeDevice(server);
  const B = makeDevice(server);
  A.local.beans = [core.normalizeBean({ id: 'x', name: 'A豆', updatedAt: T(10, 0), deviceId: 'A' }, T(10, 0))];

  await A.engine.sync();
  await B.engine.sync();

  assert.equal(core.liveSyncRecords(B.local.beans).length, 1);
  assert.equal(B.local.beans[0].name, 'A豆');
});

test('sync-engine: 编辑更晚者胜（跨设备 LWW）', async () => {
  const server = makeServer();
  const A = makeDevice(server);
  const B = makeDevice(server);
  A.local.beans = [core.normalizeBean({ id: 'x', name: '原名', updatedAt: T(10, 0), deviceId: 'A' }, T(10, 0))];
  await A.engine.sync();
  await B.engine.sync();

  // B 更晚改名
  B.local.beans = [core.normalizeBean({ ...B.local.beans[0], name: 'B改名', updatedAt: T(11, 0), revision: 2, deviceId: 'B' }, T(11, 0))];
  await B.engine.sync();
  await A.engine.sync();

  assert.equal(A.local.beans[0].name, 'B改名');
});

test('sync-engine: 删除（墓碑）同步后对端隐藏且不复活', async () => {
  const server = makeServer();
  const A = makeDevice(server);
  const B = makeDevice(server);
  A.local.beans = [core.normalizeBean({ id: 'x', name: 'A豆', updatedAt: T(10, 0), deviceId: 'A' }, T(10, 0))];
  await A.engine.sync();
  await B.engine.sync();
  assert.equal(core.liveSyncRecords(B.local.beans).length, 1);

  // A 删除（写墓碑）
  A.local.beans = [core.normalizeBean({ ...A.local.beans[0], deletedAt: T(12, 0), updatedAt: T(12, 0), revision: 2, deviceId: 'A' }, T(12, 0))];
  await A.engine.sync();
  await B.engine.sync();

  assert.equal(core.liveSyncRecords(B.local.beans).length, 0, 'B 端不再显示');
  assert.ok(B.local.beans[0].deletedAt, 'B 端保留墓碑');

  // 再同步一轮不复活
  await B.engine.sync();
  assert.equal(core.liveSyncRecords(B.local.beans).length, 0, '不复活');
});

test('sync-engine: 预置方案不上传服务端', async () => {
  const server = makeServer();
  const A = makeDevice(server);
  A.local.brewPlans = [
    core.normalizeBrewPlan({ id: 'preset-x', name: '预置', source: 'preset' }, T(10, 0)),
    core.normalizeBrewPlan({ id: 'u1', name: '用户方案', source: 'user', updatedAt: T(10, 0) }, T(10, 0))
  ];
  await A.engine.sync();

  assert.equal(server.store.brewPlans.length, 1);
  assert.equal(server.store.brewPlans[0].id, 'u1');
});

test('sync-engine: 游标随 push 结果推进', async () => {
  const server = makeServer();
  const A = makeDevice(server);
  assert.equal(A.engine.getCursor(), null);
  await A.engine.sync();
  assert.equal(A.engine.getCursor(), 's1');
});

test('sync-engine: pull 分页会拉到 hasMore 结束', async () => {
  const pages = {
    start: {
      beans: [core.normalizeBean({ id: 'b1', name: '第一页', updatedAt: T(10, 0), deviceId: 'S' })],
      drinkLogs: [],
      brewPlans: [],
      cursor: 'p1',
      hasMore: true
    },
    p1: {
      beans: [core.normalizeBean({ id: 'b2', name: '第二页', updatedAt: T(10, 1), deviceId: 'S' })],
      drinkLogs: [],
      brewPlans: [],
      cursor: 'p2',
      hasMore: false
    },
    p2: { beans: [], drinkLogs: [], brewPlans: [], cursor: 'p2', hasMore: false }
  };
  const calls = [];
  const local = { beans: [], drinkLogs: [], brewPlans: [] };
  const engine = createEngine({
    core,
    transport: {
      pull: async (cursor) => {
        calls.push(cursor || 'start');
        return pages[cursor || 'start'];
      },
      push: async () => ({ cursor: 'ignored' })
    },
    getLocal: () => local,
    applyLocal: (merged) => { local.beans = merged.beans; local.drinkLogs = merged.drinkLogs; local.brewPlans = merged.brewPlans; }
  });

  await engine.sync();

  assert.deepEqual(calls, ['start', 'p1', 'p2']);
  assert.deepEqual(local.beans.map((bean) => bean.id).sort(), ['b1', 'b2']);
  assert.equal(engine.getCursor(), 'p2');
});

test('sync-engine: push 后从 push 前游标补拉，避免跳过其他设备记录', async () => {
  const local = {
    beans: [core.normalizeBean({ id: 'a1', name: 'A本地', updatedAt: T(10, 0), deviceId: 'A' })],
    drinkLogs: [],
    brewPlans: []
  };
  const pulls = [];
  const engine = createEngine({
    core,
    transport: {
      pull: async (cursor) => {
        pulls.push(cursor || 0);
        if (!cursor) return { beans: [], drinkLogs: [], brewPlans: [], cursor: 10, hasMore: false };
        return {
          beans: [core.normalizeBean({ id: 'b1', name: 'B并发', updatedAt: T(10, 1), deviceId: 'B' })],
          drinkLogs: [],
          brewPlans: [],
          cursor: 20,
          hasMore: false
        };
      },
      push: async (records, cursor) => {
        assert.equal(cursor, 10);
        assert.equal(records.beans[0].id, 'a1');
        return { cursor: 20, serverSeqStart: 16, serverSeqEnd: 20 };
      }
    },
    getLocal: () => local,
    applyLocal: (merged) => { local.beans = merged.beans; local.drinkLogs = merged.drinkLogs; local.brewPlans = merged.brewPlans; }
  });

  await engine.sync();

  assert.deepEqual(pulls, [0, 10]);
  assert.deepEqual(local.beans.map((bean) => bean.id).sort(), ['a1', 'b1']);
  assert.equal(engine.getCursor(), 20);
});

test('sync-engine: 成功同步后仅 push 签名变化的记录', async () => {
  const local = {
    beans: [
      core.normalizeBean({ id: 'b1', name: '豆1', updatedAt: T(10, 0), deviceId: 'A' }),
      core.normalizeBean({ id: 'b2', name: '豆2', updatedAt: T(10, 1), deviceId: 'A' })
    ],
    drinkLogs: [],
    brewPlans: []
  };
  const pushed = [];
  const engine = createEngine({
    core,
    transport: {
      pull: async (cursor) => ({ beans: [], drinkLogs: [], brewPlans: [], cursor: cursor || 1, hasMore: false }),
      push: async (records) => { pushed.push(records); return { cursor: 1 }; }
    },
    getLocal: () => local,
    applyLocal: (merged) => { local.beans = merged.beans; local.drinkLogs = merged.drinkLogs; local.brewPlans = merged.brewPlans; }
  });

  await engine.sync();
  await engine.sync();
  local.beans = local.beans.map((bean) => bean.id === 'b2' ? core.normalizeBean({ ...bean, name: '豆2改', revision: 2, updatedAt: T(11, 0) }, T(11, 0)) : bean);
  await engine.sync();

  assert.deepEqual(pushed[0].beans.map((bean) => bean.id).sort(), ['b1', 'b2']);
  assert.deepEqual(pushed[1].beans, []);
  assert.deepEqual(pushed[2].beans.map((bean) => bean.id), ['b2']);
  assert.equal(typeof engine.getPushState().beans.b1, 'string');
  assert.equal(typeof engine.getPushState().beans.b2, 'string');
});
