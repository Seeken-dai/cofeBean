'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

function external(id, cafeName, consumedAt, extra) {
  return { id, source: 'external', cafeName, consumedAt, ...(extra || {}) };
}

test('recentCafeNames 空输入优先最近使用并去重', () => {
  const logs = [
    external('new', 'Manner Coffee', '2026-07-03T08:00:00.000Z'),
    external('duplicate', 'manner coffee', '2026-07-02T08:00:00.000Z'),
    external('old', '街角咖啡', '2026-07-01T08:00:00.000Z'),
    external('deleted', '已删除店铺', '2026-07-04T08:00:00.000Z', { deletedAt: '2026-07-05T08:00:00.000Z' }),
    { id: 'home', source: 'bean', cafeName: '自家厨房', consumedAt: '2026-07-05T08:00:00.000Z' }
  ];
  assert.deepEqual(core.recentCafeNames(logs, '', 4), ['Manner Coffee', '街角咖啡']);
});

test('recentCafeNames 输入时按精确、前缀、包含、子序列排序', () => {
  const logs = [
    external('contains', '上海街角店', '2026-07-04T08:00:00.000Z'),
    external('prefix', '街角咖啡', '2026-07-03T08:00:00.000Z'),
    external('subsequence', '街边转角咖啡', '2026-07-02T08:00:00.000Z'),
    external('exact', '街角', '2026-07-01T08:00:00.000Z')
  ];
  assert.deepEqual(core.recentCafeNames(logs, '街角', 4), ['街角', '街角咖啡', '上海街角店', '街边转角咖啡']);
});
