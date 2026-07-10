'use strict';

// app-format.js:从 app.js 拆出的无状态格式化/解析工具。
// 这批逻辑此前埋在 app.js 闭包里无法单测,拆出后补上覆盖。

const test = require('node:test');
const assert = require('node:assert/strict');
const fmt = require('../www/app-format.js');

test('esc 转义全部 HTML 敏感字符', () => {
  assert.equal(fmt.esc(`<img src="x" onerror='a'&>`), '&lt;img src=&quot;x&quot; onerror=&#39;a&#39;&amp;&gt;');
  assert.equal(fmt.esc(null), '');
  assert.equal(fmt.esc(0), '0');
});

test('formatWeight 克/千克分档', () => {
  assert.equal(fmt.formatWeight(250), '250g');
  assert.equal(fmt.formatWeight(999.94), '999.9g');
  assert.equal(fmt.formatWeight(1000), '1kg');
  assert.equal(fmt.formatWeight(1500), '1.5kg');
  assert.equal(fmt.formatWeight('abc'), '0g');
});

test('formatPrice 合法与非法输入', () => {
  assert.equal(fmt.formatPrice(12.345), '¥12.35');
  assert.equal(fmt.formatPrice(0), '¥0');
  assert.equal(fmt.formatPrice(-1), '未记录');
  assert.equal(fmt.formatPrice('x'), '未记录');
});

test('waterFromRatio 按 1:N 粉水比算注水量', () => {
  assert.equal(fmt.waterFromRatio(15, '1:15'), 225);
  assert.equal(fmt.waterFromRatio(15, '1：16.5'), 247.5);
  assert.equal(fmt.waterFromRatio(0, '1:15'), null);
  assert.equal(fmt.waterFromRatio(15, '奇怪'), null);
});

test('ratioFromWater 反推比例右侧', () => {
  assert.equal(fmt.ratioFromWater(15, 225), '15');
  assert.equal(fmt.ratioFromWater(15, 247.5), '16.5');
  assert.equal(fmt.ratioFromWater(0, 225), '');
});

test('parseRatio 支持中英文冒号,失败回退 1:空', () => {
  assert.deepEqual(fmt.parseRatio('1:15'), ['1', '15']);
  assert.deepEqual(fmt.parseRatio('2：33.5'), ['2', '33.5']);
  assert.deepEqual(fmt.parseRatio('无'), ['1', '']);
});

test('secondsFromText 解析各种时长写法', () => {
  assert.equal(fmt.secondsFromText('2:30'), 150);
  assert.equal(fmt.secondsFromText('1:02:03'), 3723);
  assert.equal(fmt.secondsFromText('1h30m'), 5400);
  assert.equal(fmt.secondsFromText('2分30秒'), 150);
  assert.equal(fmt.secondsFromText('90'), 90);
  assert.equal(fmt.secondsFromText(''), null);
  assert.equal(fmt.secondsFromText('abc'), null);
});

test('durationText 分:秒与小时两种模式', () => {
  assert.equal(fmt.durationText(150), '2:30');
  assert.equal(fmt.durationText(3723), '62:03');
  assert.equal(fmt.durationText(5400, 'hour'), '1h30m');
  assert.equal(fmt.durationText(3600, 'hour'), '1h');
  assert.equal(fmt.durationText(-1), '');
});

test('dateTimeValue / localDateTime 互为格式桥', () => {
  assert.equal(fmt.dateTimeValue('2026-07-10 08:30'), '2026-07-10T08:30');
  assert.equal(fmt.dateTimeValue(''), '');
  assert.match(fmt.localDateTime('2026-07-10T08:30'), /^2026-07-10 08:30$/);
});

test('stars 渲染评分与未评分', () => {
  assert.equal(fmt.stars(3), '<span class="stars" aria-label="3 星">★★★☆☆</span>');
  assert.equal(fmt.stars(0), '<span class="unrated">未评分</span>');
});
