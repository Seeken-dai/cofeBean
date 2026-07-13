'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const insights = require('../www/insights-core.js');
const appInsights = require('../www/app-insights.js');

function atLocal(year, month, day, hour) {
  return new Date(year, month - 1, day, hour || 12).toISOString();
}

function log(id, consumedAt, extra) {
  return { id, consumedAt, source: 'bean', beanId: 'bean-a', beanName: 'A', grams: 15, ...extra };
}

function bean(id, extra) {
  return { id, name: id, initialWeight: 200, price: 100, origin: '埃塞俄比亚', process: '水洗', roastLevel: '浅烘', ...extra };
}

test('filterLogsByRange 使用本地自然日、排除未来/删除/无效日期', () => {
  const now = new Date(2026, 6, 13, 18, 0, 0);
  const logs = [
    log('today', atLocal(2026, 7, 13)),
    log('day-29', atLocal(2026, 6, 14)),
    log('day-30', atLocal(2026, 6, 13)),
    log('future', atLocal(2026, 7, 14)),
    log('deleted', atLocal(2026, 7, 12), { deletedAt: atLocal(2026, 7, 13) }),
    log('bad', 'not-a-date')
  ];
  assert.deepEqual(insights.filterLogsByRange(logs, '30d', now).map((item) => item.id), ['today', 'day-29']);
  assert.deepEqual(insights.filterLogsByRange(logs, 'thisYear', now).map((item) => item.id), ['today', 'day-29', 'day-30']);
});

test('averageDimensions 尊重功能开关且小样本不返回雷达数据', () => {
  const rows = [
    log('1', atLocal(2026, 7, 1), { aroma: 4, acidity: 3, sweetness: 5 }),
    log('2', atLocal(2026, 7, 2), { aroma: 5, acidity: 4, sweetness: 4 }),
    log('3', atLocal(2026, 7, 3), { aroma: 3, acidity: 5, sweetness: 3 })
  ];
  assert.equal(insights.averageDimensions(rows.slice(0, 2), { enabled: true }).reason, 'insufficient');
  assert.equal(insights.averageDimensions(rows, { enabled: false }).reason, 'featureOff');
  const result = insights.averageDimensions(rows, { enabled: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.axes.map((axis) => [axis.key, axis.value]), [['aroma', 4], ['acidity', 4], ['sweetness', 4]]);
});

test('flavorProfile 只消费饮用 notes，至少三条有效风味记录', () => {
  const rows = [
    log('1', atLocal(2026, 7, 1), { notes: '茉莉花、柠檬' }),
    log('2', atLocal(2026, 7, 2), { notes: '柠檬 红茶，适合早晨' }),
    log('3', atLocal(2026, 7, 3), { notes: '莓果、柠檬' })
  ];
  assert.equal(insights.flavorProfile(rows.slice(0, 2)).ok, false);
  const result = insights.flavorProfile(rows);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.tags[0], { label: '柠檬', count: 3, category: 'citrus' });
  assert.equal(result.data.categories.find((item) => item.category === 'citrus').count, 3);
  assert.equal(result.data.tags.some((item) => item.label.includes('早晨')), false);
});

test('preferenceGap 只关联当前存在豆子并采用修正后的资料', () => {
  const beans = [
    bean('bean-a', { origin: '哥伦比亚' }),
    bean('bean-b', { origin: '巴拿马' }),
    bean('bean-deleted', { origin: '肯尼亚', deletedAt: atLocal(2026, 7, 1) })
  ];
  const rows = [
    log('a1', atLocal(2026, 7, 1), { overallRating: 4 }),
    log('a2', atLocal(2026, 7, 2), { overallRating: 4 }),
    log('a3', atLocal(2026, 7, 3), { overallRating: 5 }),
    log('b1', atLocal(2026, 7, 4), { beanId: 'bean-b', overallRating: 5 }),
    log('b2', atLocal(2026, 7, 5), { beanId: 'bean-b', overallRating: 5 }),
    log('b3', atLocal(2026, 7, 6), { beanId: 'bean-b', overallRating: 5 }),
    log('gone', atLocal(2026, 7, 7), { beanId: 'bean-deleted', overallRating: 5 })
  ];
  const result = insights.preferenceGap(rows, beans, 'origin');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.groups.map((item) => item.label).sort(), ['哥伦比亚', '巴拿马'].sort());
  assert.match(result.data.conclusion, /巴拿马/);
  assert.equal(result.meta.excludedCount, 1);
});

test('时段与星期分布都在三条有效记录后解锁', () => {
  const rows = [
    log('1', atLocal(2026, 7, 13, 7)),
    log('2', atLocal(2026, 7, 13, 15)),
    log('3', atLocal(2026, 7, 12, 21))
  ];
  assert.equal(insights.timeBuckets(rows.slice(0, 2)).reason, 'insufficient');
  assert.equal(insights.timeBuckets(rows).data.find((item) => item.key === 'morning').cups, 1);
  const weekdays = insights.weekdayStats(rows);
  assert.equal(weekdays.ok, true);
  assert.equal(weekdays.data.reduce((sum, item) => sum + item.cups, 0), 3);
});

test('monthlySpendSeries 不把未知价格当作零成本并返回缺失提示元数据', () => {
  const beans = [bean('bean-a'), bean('bean-b', { price: null })];
  const now = new Date(2026, 6, 13, 18);
  const rows = [
    log('a1', atLocal(2026, 7, 1)),
    log('a2', atLocal(2026, 7, 2)),
    log('a3', atLocal(2026, 6, 2)),
    log('outside', atLocal(2026, 7, 4), { source: 'external', beanId: null, grams: 0, price: 30 }),
    log('unknown', atLocal(2026, 7, 3), { beanId: 'bean-b' })
  ];
  const result = insights.monthlySpendSeries(rows, beans, now);
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 52.5);
  assert.equal(result.data.homeTotal, 22.5);
  assert.equal(result.data.externalTotal, 30);
  const july = result.data.series.find((row) => row.key === '2026-07');
  assert.deepEqual([july.amount, july.homeAmount, july.externalAmount], [45, 15, 30]);
  assert.equal(result.meta.excludedCount, 1);
  assert.equal(result.data.series.length, 12);
});

test('homeVsExternal 双方各三杯后才展示，成本缺失不影响杯数', () => {
  const beans = [bean('bean-a')];
  const home = [1, 2, 3].map((day) => log(`h${day}`, atLocal(2026, 7, day), { overallRating: 4 }));
  const external = [4, 5, 6].map((day) => log(`e${day}`, atLocal(2026, 7, day), { source: 'external', beanId: null, grams: 0, price: day === 6 ? null : 30, overallRating: 5 }));
  assert.equal(insights.homeVsExternal(home.concat(external.slice(0, 2)), beans).ok, false);
  const result = insights.homeVsExternal(home.concat(external), beans);
  assert.equal(result.ok, true);
  assert.equal(result.data.external.cups, 3);
  assert.equal(result.data.external.cost, 60);
  assert.equal(result.data.external.costSampleSize, 2);
  assert.equal(result.meta.excludedCount, 1);
  const unknownBeans = [bean('bean-a', { price: null })];
  const unknown = insights.homeVsExternal(home.concat(external), unknownBeans);
  assert.equal(unknown.data.home.cost, null);
  assert.equal(unknown.data.home.costSampleSize, 0);
});

test('beanValueRanking 每支豆至少三杯，并按评分与单杯成本标记高性价比', () => {
  const beans = [bean('bean-a', { name: '日常豆', price: 60 }), bean('bean-b', { name: '精品豆', price: 160 })];
  const rows = [];
  [1, 2, 3].forEach((day) => rows.push(log(`a${day}`, atLocal(2026, 7, day), { overallRating: 5 })));
  [4, 5, 6].forEach((day) => rows.push(log(`b${day}`, atLocal(2026, 7, day), { beanId: 'bean-b', overallRating: 3 })));
  const result = insights.beanValueRanking(rows, beans);
  assert.equal(result.ok, true);
  assert.equal(result.data[0].beanName, '日常豆');
  assert.equal(result.data[0].highValue, true);
  assert.equal(result.data[0].sampleSize, 3);
  const single = insights.beanValueRanking(rows.filter((item) => item.beanId === 'bean-a'), beans);
  assert.equal(single.data[0].highValue, false);
});

test('freshnessRatingGap 按每杯 consumedAt 判断期内与超期', () => {
  const beans = [bean('bean-a', { openedDate: '2026-07-01', bestFlavorDays: 5 })];
  const rows = [];
  [1, 2, 3].forEach((day) => rows.push(log(`in${day}`, atLocal(2026, 7, day), { overallRating: 5 })));
  [8, 9, 10].forEach((day) => rows.push(log(`out${day}`, atLocal(2026, 7, day), { overallRating: 3 })));
  const result = insights.freshnessRatingGap(rows, beans);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { fresh: { cups: 3, averageRating: 5 }, expired: { cups: 3, averageRating: 3 }, difference: 2 });
});

test('小样本提示只显示还需记录的杯数，不渲染统计数据', () => {
  const html = appInsights.emptyCard({ ok: false, reason: 'insufficient', meta: { sampleSize: 1, required: 3 } });
  assert.match(html, /再记录 2 杯/);
  assert.doesNotMatch(html, /sampleSize|1 杯/);
});

test('回顾 SVG 输出包含可访问说明并转义标签', () => {
  const radar = appInsights.buildRadar([
    { label: '<香气>', value: 4 }, { label: '酸质', value: 3 }, { label: '甜感', value: 5 }
  ]);
  assert.match(radar, /role="img"/);
  assert.match(radar, /&lt;香气&gt;/);
  assert.doesNotMatch(radar, /<香气>/);
});

test('回顾的每类统计都提供口径说明按钮', () => {
  const keys = ['dimensions', 'flavor', 'preference', 'time', 'weekday', 'spend', 'source', 'freshness', 'value'];
  assert.deepEqual(Object.keys(appInsights.HELP_CONTENT), keys);
  keys.forEach((key) => {
    assert.match(appInsights.helpButton(key), new RegExp(`data-insights-help="${key}"`));
    assert.ok(appInsights.HELP_CONTENT[key].body.length > 20);
  });
  assert.match(appInsights.HELP_CONTENT.spend.body, /不随上方回顾范围变化/);
});

test('近12个月花费折线图默认展示三组，也支持单独查看', () => {
  const series = [{ key: '2026-07', label: '7月', amount: 52, homeAmount: 22, externalAmount: 30 }];
  const all = appInsights.buildSpendLineChart(series, 'all');
  assert.match(all, /spend-series-total/);
  assert.match(all, /spend-series-home/);
  assert.match(all, /spend-series-external/);
  const home = appInsights.buildSpendLineChart(series, 'home');
  assert.match(home, /spend-series-home/);
  assert.doesNotMatch(home, /spend-series-total/);
  assert.doesNotMatch(home, /spend-series-external/);
});

test('回顾卡片使用清楚、日常的标题措辞', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'app-insights.js'), 'utf8');
  ['杯中常出现的风味', '常喝的，也更喜欢吗', '一天里什么时候喝得多', '一周里哪天喝得多', '近 12 个月的咖啡开销', '喜欢在家还是在外', '赏味期内，会更喜欢吗']
    .forEach((title) => assert.match(source, new RegExp(title)));
  ['你实际喝到的风味', '你喝得多，也真的喜欢吗', '通常在什么时候喝', '哪几天更常来一杯', '近 12 个月咖啡花费', '两种喝法的差别', '新鲜时真的更喜欢吗']
    .forEach((title) => assert.doesNotMatch(source, new RegExp(title)));
});
