'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../www/data-core.js');

function external(id, location, consumedAt, extra) {
  return { id, source: 'external', location, consumedAt, ...(extra || {}) };
}

test('recentDrinkLocations 空输入优先最近使用，忽略大小写去重并排除已删除与自家冲煮', () => {
  const logs = [
    external('new', '杭州', '2026-07-03T08:00:00.000Z'),
    external('duplicate', '杭州', '2026-07-02T08:00:00.000Z'),
    external('case', 'shanghai', '2026-07-02T09:00:00.000Z'),
    external('case-dup', 'ShangHai', '2026-07-01T09:00:00.000Z'),
    external('old', '深圳', '2026-06-30T08:00:00.000Z'),
    external('blank', '', '2026-07-06T08:00:00.000Z'),
    external('deleted', '已删除城市', '2026-07-04T08:00:00.000Z', { deletedAt: '2026-07-05T08:00:00.000Z' }),
    { id: 'home', source: 'bean', location: '自家厨房', consumedAt: '2026-07-05T08:00:00.000Z' }
  ];
  // 自家冲煮的 location 不参与；同名只留最近那次的写法。
  assert.deepEqual(core.recentDrinkLocations(logs, '', 4), ['杭州', 'shanghai', '深圳']);
});

test('recentDrinkLocations 输入时按精确、前缀、包含、子序列排序', () => {
  const logs = [
    external('contains', '浙江杭州市', '2026-07-04T08:00:00.000Z'),
    external('prefix', '杭州西湖', '2026-07-03T08:00:00.000Z'),
    external('subsequence', '杭儿州', '2026-07-02T08:00:00.000Z'),
    external('exact', '杭州', '2026-07-01T08:00:00.000Z')
  ];
  assert.deepEqual(core.recentDrinkLocations(logs, '杭州', 4), ['杭州', '杭州西湖', '浙江杭州市', '杭儿州']);
});

test('recentDrinkLocations 无匹配返回空数组，limit 生效', () => {
  const logs = [
    external('a', '杭州', '2026-07-03T08:00:00.000Z'),
    external('b', '上海', '2026-07-02T08:00:00.000Z'),
    external('c', '深圳', '2026-07-01T08:00:00.000Z')
  ];
  assert.deepEqual(core.recentDrinkLocations(logs, '巴黎', 4), []);
  assert.deepEqual(core.recentDrinkLocations(logs, '', 2), ['杭州', '上海']);
  assert.deepEqual(core.recentDrinkLocations([], '', 4), []);
});

test('地点联想 UI 与店名一致：全局候选、可点击回填，且只有新建外饮才自动填充', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  // 字段结构与店名一致：有独立候选容器。
  assert.match(html, /id="drinkLocationSuggestions"/);
  assert.match(html, /id="drink-location"[^>]*autocomplete="off"/);
  // 候选渲染 + 输入联想 + 点击回填。
  assert.match(appSource, /function renderLocationSuggestions\(showRecent\)/);
  // 打开弹窗与点胶囊回填都属于「值不是敲进去的」，应列最近几个而不是只回显一个匹配。
  assert.match(appSource, /const query = showRecent \? '' : input\.value\.trim\(\)/);
  // 必须包一层箭头函数：直接传函数会把 Event 当作 showRecent 首参，打字时就永远显示「最近」而非匹配。
  assert.match(appSource, /\$\('#drink-location'\)\.addEventListener\('input', \(\) => renderLocationSuggestions\(\)\)/);
  assert.doesNotMatch(appSource, /addEventListener\('input', renderLocationSuggestions\)/);
  assert.match(appSource, /data-drink-location[\s\S]{0,200}?\$\('#drink-location'\)\.value = choice\.dataset\.drinkLocation/);
  // 自动填充只发生在 openExternalDrinkDialog 的「新建」分支里（!log），编辑已有记录不受影响。
  const externalDialog = appSource.slice(appSource.indexOf('function openExternalDrinkDialog'), appSource.indexOf('function ratingPayload'));
  assert.match(externalDialog, /if \(!log\) \{[\s\S]*?recentDrinkLocations\(state\.drinkLogs, '', 1\)\[0\][\s\S]*?if \(lastLocation\) \$\('#drink-location'\)\.value = lastLocation/);
});
