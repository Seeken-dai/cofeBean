'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

function external(id, cafeName, drinkName, consumedAt, extra) {
  return { id, source: 'external', cafeName, drinkName, consumedAt, ...(extra || {}) };
}

test('recentExternalDrinkNames 空输入只返回同店最近三种饮品并忽略大小写去重', () => {
  const logs = [
    external('1', 'Manner Coffee', 'Dirty', '2026-07-05T08:00:00.000Z'),
    external('2', 'manner coffee', 'dirty', '2026-07-04T08:00:00.000Z'),
    external('3', 'Manner Coffee', '拿铁', '2026-07-03T08:00:00.000Z'),
    external('4', 'Manner Coffee', '美式', '2026-07-02T08:00:00.000Z'),
    external('5', 'Manner Coffee', '澳白', '2026-07-01T08:00:00.000Z'),
    external('other', '别家店', '手冲', '2026-07-06T08:00:00.000Z'),
    external('deleted', 'Manner Coffee', '已删除', '2026-07-07T08:00:00.000Z', { deletedAt: '2026-07-08T08:00:00.000Z' })
  ];
  assert.deepEqual(core.recentExternalDrinkNames(logs, 'MANNER COFFEE', '', 3), ['Dirty', '拿铁', '美式']);
  assert.deepEqual(core.recentExternalDrinkNames(logs, '', '', 3), []);
});

test('recentExternalDrinkNames 输入时按精确、前缀、包含、子序列排序，同级按最近使用', () => {
  const logs = [
    external('contains-new', '街角咖啡', '冰燕麦拿铁', '2026-07-06T08:00:00.000Z'),
    external('prefix-new', '街角咖啡', '拿铁冰', '2026-07-05T08:00:00.000Z'),
    external('prefix-old', '街角咖啡', '拿铁热', '2026-07-04T08:00:00.000Z'),
    external('subsequence', '街角咖啡', '拿一杯铁观音', '2026-07-03T08:00:00.000Z'),
    external('exact', '街角咖啡', '拿铁', '2026-07-02T08:00:00.000Z')
  ];
  assert.deepEqual(core.recentExternalDrinkNames(logs, '街角咖啡', '拿铁', 5), ['拿铁', '拿铁冰', '拿铁热', '冰燕麦拿铁', '拿一杯铁观音']);
});
