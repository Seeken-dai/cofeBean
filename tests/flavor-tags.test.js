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

test('flavorTags 覆盖风味轮补充分类与乳脂奶香', () => {
  const cat = (s) => core.flavorTags(s)[0].category;
  assert.equal(cat('酸奶'), 'dairy');
  assert.equal(cat('牛奶巧克力'), 'dairy');
  assert.equal(cat('柠檬酸'), 'sour');
  assert.equal(cat('豌豆荚'), 'green');
  assert.equal(cat('纸板'), 'papery');
  assert.equal(cat('橡胶味'), 'chemical');
  assert.equal(cat('烟熏味'), 'roasted');
  assert.equal(cat('肉豆蔻'), 'spice');
  assert.equal(cat('糖蜜'), 'caramel');
  assert.equal(cat('椰子'), 'fruit');
});

test('flavorTags 未知词归类 other', () => {
  assert.equal(core.flavorTags('矿物感')[0].category, 'other');
  assert.equal(core.flavorTags('圆润平衡')[0].category, 'other');
});

// 喝一杯的风味胶囊：取自己最近写过的短词，按饮用时间倒序去重。
const flavorLog = (id, consumedAt, notes, extra) => ({ id, source: 'bean', consumedAt, updatedAt: consumedAt, notes, deletedAt: null, ...extra });

test('recentFlavorTags 按饮用时间倒序取词并去重', () => {
  const logs = [
    flavorLog('a', '2026-07-01T08:00:00.000Z', '柑橘、蜂蜜'),
    flavorLog('c', '2026-07-03T08:00:00.000Z', '茉莉花、柑橘'),
    flavorLog('b', '2026-07-02T08:00:00.000Z', '红茶')
  ];
  assert.deepEqual(core.recentFlavorTags(logs).map((t) => t.label), ['茉莉花', '柑橘', '红茶', '蜂蜜']);
});

test('recentFlavorTags 只留短风味词，挡掉备注里的句子碎片', () => {
  const logs = [flavorLog('a', '2026-07-01T08:00:00.000Z', '柑橘和红糖，酸甜很明亮，整体很平衡、白桃、矿物感、黑加仑')];
  // 「柑橘和红糖」「酸甜很明亮」命中风味轮但超过 4 字；「整体很平衡」既没命中也超过 3 字。
  assert.deepEqual(core.recentFlavorTags(logs).map((t) => t.label), ['白桃', '矿物感', '黑加仑']);
});

test('recentFlavorTags 跳过长句、已删除记录与当前正在编辑的记录', () => {
  const logs = [
    flavorLog('long', '2026-07-04T08:00:00.000Z', '今天这杯前段偏酸后段回甘明显'),
    flavorLog('gone', '2026-07-03T08:00:00.000Z', '焦糖', { deletedAt: '2026-07-05T00:00:00.000Z' }),
    flavorLog('editing', '2026-07-02T08:00:00.000Z', '烟熏味'),
    flavorLog('keep', '2026-07-01T08:00:00.000Z', '柠檬')
  ];
  const tags = core.recentFlavorTags(logs, { excludeId: 'editing' });
  assert.deepEqual(tags.map((t) => t.label), ['柠檬']);
  assert.equal(tags[0].category, 'citrus');
});

test('recentFlavorTags 支持排除已展示的词并限制数量', () => {
  const logs = [flavorLog('a', '2026-07-01T08:00:00.000Z', '柑橘、蜂蜜、红茶')];
  assert.deepEqual(core.recentFlavorTags(logs, { exclude: ['柑橘'] }).map((t) => t.label), ['蜂蜜', '红茶']);
  assert.equal(core.recentFlavorTags(logs, { limit: 2 }).length, 2);
  assert.deepEqual(core.recentFlavorTags([]), []);
  assert.deepEqual(core.recentFlavorTags(null), []);
});

test('flavorTags 上限 12 个、单词截断 12 字', () => {
  const many = Array.from({ length: 30 }, (_, i) => '风味' + i).join('、');
  assert.equal(core.flavorTags(many).length, 12);
  const long = core.flavorTags('一二三四五六七八九十甲乙丙丁')[0].label;
  assert.equal(Array.from(long).length, 12);
});
