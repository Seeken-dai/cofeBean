'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('worker sync logic: LWW order matches updatedAt revision deviceId', async () => {
  const logic = await import('../worker/src/sync-logic.mjs');

  assert.equal(logic.isNewer(
    { updated_at: '2026-07-03T10:00:01.000Z', revision: 1, device_id: 'A' },
    { updated_at: '2026-07-03T10:00:00.000Z', revision: 9, device_id: 'Z' }
  ), true);
  assert.equal(logic.isNewer(
    { updated_at: '2026-07-03T10:00:00.000Z', revision: 2, device_id: 'A' },
    { updated_at: '2026-07-03T10:00:00.000Z', revision: 3, device_id: 'Z' }
  ), false);
  assert.equal(logic.isNewer(
    { updated_at: '2026-07-03T10:00:00.000Z', revision: 3, device_id: 'B' },
    { updated_at: '2026-07-03T10:00:00.000Z', revision: 3, device_id: 'A' }
  ), true);
});

test('worker sync logic: incoming collection and server seq assignment are stable', async () => {
  const logic = await import('../worker/src/sync-logic.mjs');
  const incoming = logic.collectIncoming({
    cursor: 10,
    beans: [{ id: 'b1' }],
    drinkLogs: [{ id: 'd1' }],
    brewPlans: [{ id: 'p1' }, { name: 'missing-id' }]
  });

  assert.deepEqual(incoming.map((item) => `${item.type}:${item.rec.id}`), ['bean:b1', 'drinkLog:d1', 'brewPlan:p1']);
  assert.equal(logic.shouldAcceptRecord({ updatedAt: '2026-07-03T10:00:00.000Z', revision: 1, deviceId: 'A' }, null), true);
  assert.equal(logic.shouldAcceptRecord(
    { updatedAt: '2026-07-03T10:00:00.000Z', revision: 1, deviceId: 'A' },
    { updated_at: '2026-07-03T10:00:01.000Z', revision: 1, device_id: 'B' }
  ), false);
  assert.deepEqual(logic.assignServerSeq(incoming, 16).map((item) => item.serverSeq), [16, 17, 18]);
});
