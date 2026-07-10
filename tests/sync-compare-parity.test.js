'use strict';

// 两端 LWW 裁决对拍测试:客户端(BeanCore.compareSyncRecords)与云端 Worker(isNewer)
// 必须对同一组记录裁出同一个胜者,否则设备间数据永不收敛。
// 历史教训:客户端曾用 localeCompare 裁 deviceId 平局位,与 Worker 的码元比较在
// 大小写混合/非 ASCII deviceId 上分歧。现两端共用 www/sync-compare.js,此测试防止回退。

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const shared = require('../www/sync-compare.js');

function env(updatedAt, revision, deviceId) {
  return { updatedAt, revision, deviceId };
}
function row(e) {
  return { updated_at: e.updatedAt, revision: e.revision, device_id: e.deviceId };
}

// 覆盖三级裁决的每一层,以及曾经分歧的 deviceId 平局位:
// 大小写混合(码元序 'Z' < 'a',locale 序相反)、非 ASCII、空值、完全相等。
const CASES = [
  ['updatedAt 决胜', env('2026-07-01T10:00:00Z', 1, 'A'), env('2026-07-01T10:05:00Z', 1, 'A')],
  ['无效时间当 0', env('not-a-date', 5, 'A'), env('2026-07-01T10:00:00Z', 1, 'B')],
  ['revision 决胜', env('2026-07-01T10:00:00Z', 2, 'A'), env('2026-07-01T10:00:00Z', 1, 'B')],
  ['deviceId 大小写混合', env('2026-07-01T10:00:00Z', 1, 'Zebra'), env('2026-07-01T10:00:00Z', 1, 'apple')],
  ['deviceId 非 ASCII', env('2026-07-01T10:00:00Z', 1, '设备甲'), env('2026-07-01T10:00:00Z', 1, 'device-b')],
  ['deviceId 十六进制', env('2026-07-01T10:00:00Z', 1, '0a1b2c'), env('2026-07-01T10:00:00Z', 1, '0A1B2C')],
  ['deviceId 空 vs 非空', env('2026-07-01T10:00:00Z', 1, ''), env('2026-07-01T10:00:00Z', 1, 'a')],
  ['完全相等', env('2026-07-01T10:00:00Z', 1, 'same'), env('2026-07-01T10:00:00Z', 1, 'same')]
];

test('客户端 compareSyncRecords 与 Worker isNewer 对每组记录裁决一致', async () => {
  const logic = await import('../worker/src/sync-logic.mjs');
  for (const [name, a, b] of CASES) {
    const clientAB = core.compareSyncRecords(a, b) > 0;
    const workerAB = logic.isNewer(row(a), row(b));
    assert.equal(clientAB, workerAB, `${name}: a vs b 裁决分歧(client=${clientAB}, worker=${workerAB})`);
    const clientBA = core.compareSyncRecords(b, a) > 0;
    const workerBA = logic.isNewer(row(b), row(a));
    assert.equal(clientBA, workerBA, `${name}: b vs a 裁决分歧(client=${clientBA}, worker=${workerBA})`);
  }
});

test('客户端 compareSyncRecords 就是共享实现本身', () => {
  assert.equal(core.compareSyncRecords, shared.compareSyncRecords);
});

test('裁决具反对称性与确定性(与 locale 无关)', () => {
  const a = env('2026-07-01T10:00:00Z', 1, 'Zebra');
  const b = env('2026-07-01T10:00:00Z', 1, 'apple');
  // 码元序:'Z'(0x5A) < 'a'(0x61),b 胜;localeCompare 在中文/英文 locale 下通常相反。
  assert.ok(shared.compareSyncRecords(a, b) < 0);
  assert.ok(shared.compareSyncRecords(b, a) > 0);
  assert.equal(shared.compareSyncRecords(a, a), 0);
});
