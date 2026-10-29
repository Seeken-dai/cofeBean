'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const numberInput = require('../www/app-number-input.js');

test('number-input: stepValue 小数步进无浮点尾差并遵守边界', () => {
  assert.equal(numberInput.stepValue(15, 1, { step: 0.5, min: 0, max: 20 }), 15.5);
  assert.equal(numberInput.stepValue(0.1, 1, { step: 0.1, min: 0, max: 1 }), 0.2);
  assert.equal(numberInput.stepValue(20, 1, { step: 0.5, min: 0, max: 20 }), 20);
  assert.equal(numberInput.stepValue('', -1, { step: 1, min: 0, max: 10, defaultValue: 0 }), 0);
});

test('number-input: buildWheelWindow 保留精确当前值并只生成附近合法刻度', () => {
  const window = numberInput.buildWheelWindow(15.2, { step: 0.5, min: 14, max: 16, radius: 20 });
  assert.deepEqual(window.values, [14.2, 14.7, 15.2, 15.7]);
  assert.equal(window.value, 15.2);
  assert.equal(window.values[window.index], window.value);
});

test('number-input: buildWheelWindow 可处理大范围而不生成完整列表', () => {
  const window = numberInput.buildWheelWindow(5000, { step: 1, min: 0, max: 10000, radius: 50 });
  assert.equal(window.values.length, 101);
  assert.equal(window.values[0], 4950);
  assert.equal(window.values.at(-1), 5050);
});

// 滚轮闪动的根因：时长选择器这类短量程列（分钟停在 0-4、秒步长 5 只有 12 格），
// 选中项永远落在「靠近边缘」的判定里，每次滚停都会重建一次完全相同的列并重新 scrollTo。
// 这里锁住「同一个值重建出的窗口逐值相同」，控制器据此跳过重建。
test('number-input: buildWheelWindow 在量程边界处重建结果稳定', () => {
  const minuteColumn = { step: 1, min: 0, max: 999, radius: 50 };
  const first = numberInput.buildWheelWindow(2, minuteColumn);
  const again = numberInput.buildWheelWindow(first.values[first.index], minuteColumn);
  assert.deepEqual(again.values, first.values);
  assert.equal(again.index, first.index);
  assert.equal(first.values[0], 0);

  const secondColumn = { step: 5, min: 0, max: 59, radius: 50 };
  const seconds = numberInput.buildWheelWindow(39, secondColumn);
  assert.deepEqual(seconds.values, [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59]);
  assert.deepEqual(numberInput.buildWheelWindow(39, secondColumn).values, seconds.values);
});

test('number-input: rankSuggestions 当前值和上下文值优先、重复值按频率排序', () => {
  const result = numberInput.rankSuggestions([
    { value: 18, timestamp: '2026-07-01' },
    { value: 18, timestamp: '2026-07-02' },
    { value: 20, timestamp: '2026-07-03' },
    { value: 'bad' },
    { value: 200 }
  ], { current: 15, last: 20, defaults: [15, 16, 17], min: 1, max: 100, limit: 4 });
  assert.deepEqual(result.map((entry) => entry.value), [15, 20, 18, 16]);
});

test('number-input: rankSuggestions 过滤越界值并保持自定义标签', () => {
  const result = numberInput.rankSuggestions([
    { value: 92, label: '上一杯', priority: 80 },
    { value: -1 },
    { value: 120 }
  ], { defaults: [88, 90, 94], min: 0, max: 100, limit: 4 });
  assert.deepEqual(result, [
    { value: 92, label: '上一杯' },
    { value: 88, label: undefined },
    { value: 90, label: undefined },
    { value: 94, label: undefined }
  ]);
});

test('number-input 3.0.14: 打开滚轮不动直接确定，区间 / 文本原值保留；真的改了才写成单个数字', () => {
  // 区间 "90-92"：滚轮起点 90，不动 → 保留；改到 93 → "93"；改回 90 以外再改回 90 仍算没变（以最终值为准）。
  assert.equal(numberInput.commitText('90-92', 90, 90, 1), null);
  assert.equal(numberInput.commitText('90-92', 90, 93, 1), '93');
  assert.equal(numberInput.commitText('90-92', 90, 91, 1), '91');
  // 非数字文本「常温」：滚轮起点是默认值，不动 → 保留。
  assert.equal(numberInput.commitText('常温', 92, 92, 1), null);
  assert.equal(numberInput.commitText('常温', 92, 88, 1), '88');
  // 普通数字与空值行为不变：照常写回（空值确定即写入默认值）。
  assert.equal(numberInput.commitText('92', 92, 92, 1), '92');
  assert.equal(numberInput.commitText('92', 92, 94, 1), '94');
  assert.equal(numberInput.commitText('', 92, 92, 1), '92');
  assert.equal(numberInput.commitText('15', 15, 15.5, 0.5), '15.5');
});

// 3.0.15 方向键跳值根因：旧 selectValue 每按一次都重建列，新列 scrollTop 从 0 平滑滚到目标，
// 途中的 scroll 事件把中间刻度写回 column.value（且 130ms 防抖还会围绕中间值重建窗口），同时焦点随旧节点被移除。
test('number-input 3.0.15: wheelKeyTarget 窗口内原地移动，只在靠近可延伸的边缘时重建', () => {
  const window = numberInput.buildWheelWindow(93, { step: 1, min: 0, max: 100, radius: 50 });
  assert.deepEqual(numberInput.wheelKeyTarget(window, 94, { min: 0, max: 100 }), { rebuild: false, index: window.values.indexOf(94) });
  // 上限 100 已在窗口内：贴近底边也不需要重建
  assert.equal(numberInput.wheelKeyTarget(window, 100, { min: 0, max: 100 }).rebuild, false);
  const wide = numberInput.buildWheelWindow(500, { step: 1, min: 0, max: 1000, radius: 50 });
  assert.equal(numberInput.wheelKeyTarget(wide, 545, { min: 0, max: 1000 }).rebuild, true, '离窗口底边不足 8 格且还能延伸');
  assert.equal(numberInput.wheelKeyTarget(wide, 456, { min: 0, max: 1000 }).rebuild, true, '离窗口顶边不足 8 格且还能延伸');
  assert.equal(numberInput.wheelKeyTarget(wide, 520, { min: 0, max: 1000 }).rebuild, false);
  assert.deepEqual(numberInput.wheelKeyTarget(wide, 2000, { min: 0, max: 1000 }), { rebuild: true, index: -1 });
});

test('number-input 3.0.15: 键盘步进的平滑滚动途中不回写选中值，重建列时保留焦点', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'www', 'app-number-input.js'), 'utf8');
  const onScroll = source.slice(source.indexOf('function onScroll'), source.indexOf('function onKeydown'));
  assert.match(onScroll, /pendingIndex != null[\s\S]*return;[\s\S]*updateSelected/, 'onScroll 在 pendingIndex 期间提前返回');
  const replaceColumn = source.slice(source.indexOf('function replaceColumn'), source.indexOf('function markSelected'));
  assert.match(replaceColumn, /behavior: 'instant'/, '重建后瞬时定位，不从 0 平滑滚');
  assert.match(replaceColumn, /if \(hadFocus\) next\.focus/, '重建后焦点交给新列');
  const selectValue = source.slice(source.indexOf('function selectValue'), source.indexOf('function openManual'));
  assert.doesNotMatch(selectValue, /replaceWith/, 'selectValue 不再直接重建 DOM');
});
