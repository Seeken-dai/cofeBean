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
