'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('recentCafeNames 空输入能给满 4 家最近的店', () => {
  const logs = ['A 店', 'B 店', 'C 店', 'D 店', 'E 店']
    .map((name, index) => external(`log-${index}`, name, `2026-07-${String(10 - index).padStart(2, '0')}T08:00:00.000Z`));
  assert.deepEqual(core.recentCafeNames(logs, '', 4), ['A 店', 'B 店', 'C 店', 'D 店']);
});

test('店名联想与地点一致：自动带出的值列最近几家店，只有手敲时才按匹配过滤', () => {
  // 2.4.2 之前空输入写死 limit 1，只列一家；编辑既有记录时又只剩一个和输入完全重复的
  // 「匹配店名」胶囊，等于没有候选可选。
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');
  assert.match(appSource, /function renderCafeSuggestions\(showRecent\) \{/);
  assert.match(appSource, /const query = showRecent \? '' : input\.value\.trim\(\);\s*\n\s*const names = BeanCore\.recentCafeNames\(state\.drinkLogs, query, 4\);/);
  // 打开弹窗与点胶囊回填都属于「不是用户正在敲」，要列最近使用。
  assert.match(appSource, /\$\('#drink-drinkName'\)\.value = log \? log\.drinkName \|\| '' : ''; renderCafeSuggestions\(true\);/);
  assert.match(appSource, /\$\('#drink-cafeName'\)\.value = choice\.dataset\.cafeName; renderCafeSuggestions\(true\);/);
  // input 事件仍然按输入内容匹配。
  assert.match(appSource, /\$\('#drink-cafeName'\)\.addEventListener\('input', \(\) => \{ renderCafeSuggestions\(\); renderDrinkNameSuggestions\(\); \}\);/);
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
