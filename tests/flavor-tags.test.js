const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

// 风味笔记 → 彩色标签（UI 2.0.8 项5）。纯逻辑：拆词 + 归类。

test('flavorTags 按顿号/逗号/空白拆词并去重', () => {
  const tags = core.flavorTags('茉莉花、柠檬，红茶尾韵 柠檬');
  assert.deepEqual(tags.map((t) => t.label), ['茉莉花', '柠檬', '红茶尾韵']);
});

test('flavorTags 空/无内容返回空数组', () => {
  assert.deepEqual(core.flavorTags(''), []);
  assert.deepEqual(core.flavorTags('   '), []);
  assert.deepEqual(core.flavorTags(null), []);
});

test('flavorTags 归类命中风味轮', () => {
  const cat = (s) => core.flavorTags(s)[0].category;
  assert.equal(cat('茉莉花'), 'floral');
  assert.equal(cat('蓝莓'), 'berry');
  assert.equal(cat('黑加仑'), 'berry');
  assert.equal(cat('柑橘'), 'citrus');
  assert.equal(cat('葡萄柚'), 'citrus'); // 柚(citrus) 先于 葡萄(fruit)
  assert.equal(cat('红茶尾韵'), 'tea');
  assert.equal(cat('黑巧克力'), 'nutty');
  assert.equal(cat('焦糖'), 'caramel');
  assert.equal(cat('水蜜桃'), 'fruit');
  assert.equal(cat('红酒发酵感'), 'ferment');
});

test('flavorTags 未知词归类 other', () => {
  assert.equal(core.flavorTags('矿物感')[0].category, 'other');
  assert.equal(core.flavorTags('圆润平衡')[0].category, 'other');
});

test('flavorTags 上限 12 个、单词截断 12 字', () => {
  const many = Array.from({ length: 30 }, (_, i) => '风味' + i).join('、');
  assert.equal(core.flavorTags(many).length, 12);
  const long = core.flavorTags('一二三四五六七八九十甲乙丙丁')[0].label;
  assert.equal(Array.from(long).length, 12);
});
