'use strict';

// 同步合并本地模拟测试（Web 同步演进 · 阶段 3）。
// 覆盖 plan/SYNC_PROTOCOL_DESIGN.md §5 合并算法与 §10 验收项：
// LWW、墓碑删除、不复活、确定性裁决、饮用记录并集不丢、预置方案排除、未知字段 round-trip。
// 纯逻辑、无网络、无云端、不触存储。

const test = require('node:test');
const assert = require('node:assert');
const core = require('../www/data-core.js');

function rec(id, updatedAt, extra) {
  return Object.assign({ id, updatedAt, revision: 1, deviceId: 'A', deletedAt: null, payload: {} }, extra || {});
}

test('sync: LWW 取 updatedAt 较新者', () => {
  const local = [rec('x', '2026-07-01T10:00:00.000Z', { payload: { name: '旧' } })];
  const remote = [rec('x', '2026-07-01T10:05:00.000Z', { payload: { name: '新' } })];
  const merged = core.mergeSyncRecords(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].payload.name, '新');
});

test('sync: updatedAt 相同用 revision、再用 deviceId 确定性裁决', () => {
  const a = rec('x', '2026-07-01T10:00:00.000Z', { revision: 2, deviceId: 'A' });
  const b = rec('x', '2026-07-01T10:00:00.000Z', { revision: 1, deviceId: 'B' });
  assert.equal(core.mergeSyncRecords([a], [b])[0].revision, 2); // revision 大者胜

  const c = rec('x', '2026-07-01T10:00:00.000Z', { revision: 1, deviceId: 'A' });
  const d = rec('x', '2026-07-01T10:00:00.000Z', { revision: 1, deviceId: 'B' });
  // 完全并列时按 deviceId 稳定裁决，且与输入顺序无关
  assert.equal(core.mergeSyncRecords([c], [d])[0].deviceId, 'B');
  assert.equal(core.mergeSyncRecords([d], [c])[0].deviceId, 'B');
});

test('sync: 删除更晚→结果为墓碑；编辑更晚→复活为编辑', () => {
  const del = rec('x', '2026-07-01T10:05:00.000Z', { deletedAt: '2026-07-01T10:05:00.000Z' });
  const edit = rec('x', '2026-07-01T10:00:00.000Z', { payload: { name: '改' } });
  assert.ok(core.mergeSyncRecords([edit], [del])[0].deletedAt, '删除更晚应为墓碑');

  const del2 = rec('x', '2026-07-01T10:00:00.000Z', { deletedAt: '2026-07-01T10:00:00.000Z' });
  const edit2 = rec('x', '2026-07-01T10:05:00.000Z', { payload: { name: '改' } });
  const merged = core.mergeSyncRecords([del2], [edit2])[0];
  assert.equal(merged.deletedAt, null, '编辑更晚应复活');
  assert.equal(merged.payload.name, '改');
});

test('sync: 缺失一侧不复活较新墓碑（no-resurrect）', () => {
  // 本地只有旧的存活版本，远端是更晚的墓碑 → 合并后为墓碑
  const localLive = [rec('x', '2026-07-01T09:00:00.000Z')];
  const remoteTomb = [rec('x', '2026-07-01T10:00:00.000Z', { deletedAt: '2026-07-01T10:00:00.000Z' })];
  assert.ok(core.mergeSyncRecords(localLive, remoteTomb)[0].deletedAt);
  // 一侧完全没有这条记录（缺失），另一侧是墓碑 → 仍为墓碑，不因“缺失”当作新增
  assert.ok(core.mergeSyncRecords([], remoteTomb)[0].deletedAt);
});

test('sync: liveSyncRecords 过滤墓碑', () => {
  const list = [
    rec('a', '2026-07-01T10:00:00.000Z'),
    rec('b', '2026-07-01T10:00:00.000Z', { deletedAt: '2026-07-01T10:00:00.000Z' })
  ];
  const live = core.liveSyncRecords(list);
  assert.deepEqual(live.map((r) => r.id), ['a']);
});

test('sync: 饮用记录按 id 并集，一条不丢（不同 id 不覆盖）', () => {
  const deviceA = [rec('log-1', '2026-07-01T10:00:00.000Z'), rec('log-2', '2026-07-01T10:01:00.000Z')];
  const deviceB = [rec('log-3', '2026-07-01T10:02:00.000Z')];
  const merged = core.mergeSyncRecords(deviceA, deviceB);
  assert.deepEqual(merged.map((r) => r.id).sort(), ['log-1', 'log-2', 'log-3']);
});

test('sync: syncablePlans 排除预置方案', () => {
  const plans = [
    { id: 'p1', source: 'preset' },
    { id: 'p2', source: 'user' },
    { id: 'p3', source: 'copy' }
  ];
  assert.deepEqual(core.syncablePlans(plans).map((p) => p.id), ['p2', 'p3']);
});

test('sync: 胜者的未知字段原样保留（round-trip）', () => {
  const local = [rec('x', '2026-07-01T10:00:00.000Z')];
  const remote = [rec('x', '2026-07-01T10:05:00.000Z', { futureField: 'keep-me', payload: { extraNew: 1 } })];
  const merged = core.mergeSyncRecords(local, remote)[0];
  assert.equal(merged.futureField, 'keep-me');
  assert.equal(merged.payload.extraNew, 1);
});

test('sync: 导入旧备份后再同步，不覆盖云端较新数据、不误删云端独有记录', () => {
  // 本地导入了一份旧备份（overwrite 只是替换本地集合，不为缺失的记录造墓碑）
  const localAfterImport = [rec('bean-x', '2026-07-01T09:00:00.000Z', { payload: { name: '旧备份的X' } })];
  // 云端：X 被别的设备改得更晚，且有本地导入里没有的 Y
  const remote = [
    rec('bean-x', '2026-07-01T10:00:00.000Z', { payload: { name: '云端较新的X' } }),
    rec('bean-y', '2026-07-01T10:00:00.000Z', { payload: { name: '云端独有Y' } })
  ];
  const merged = core.mergeSyncRecords(localAfterImport, remote);
  const byId = Object.fromEntries(merged.map((r) => [r.id, r]));
  assert.equal(byId['bean-x'].payload.name, '云端较新的X'); // 旧备份不覆盖云端新数据
  assert.ok(byId['bean-y'], '云端独有记录不应被误删');
  assert.equal(core.liveSyncRecords(merged).length, 2);
});

test('sync: 旧客户端缺同步元字段的 envelope 可容忍合并', () => {
  // 旧客户端只带 id/updatedAt/payload，无 revision/deviceId/deletedAt
  const oldClient = { id: 'x', updatedAt: '2026-07-01T10:00:00.000Z', payload: { name: 'old-client' } };
  const full = rec('x', '2026-07-01T09:00:00.000Z', { payload: { name: 'full' } });
  const merged = core.mergeSyncRecords([full], [oldClient]);
  assert.equal(merged[0].payload.name, 'old-client'); // 更晚者胜，缺字段不报错
  assert.equal(core.liveSyncRecords(merged).length, 1); // 无 deletedAt 视为存活
  // updatedAt 并列时，缺字段方 revision 视为 0，输给带 revision 的一方
  const oldTie = { id: 'y', updatedAt: '2026-07-01T10:00:00.000Z', payload: {} };
  const fullTie = rec('y', '2026-07-01T10:00:00.000Z', { revision: 3, payload: { name: 'full-tie' } });
  assert.equal(core.mergeSyncRecords([oldTie], [fullTie])[0].payload.name, 'full-tie');
});
