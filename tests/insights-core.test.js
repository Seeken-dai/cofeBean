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

function brewSnapshot(extra) {
  return {
    name: '手填参数', dose: 15, ratio: '1:15', totalWater: 225, waterTemp: 92,
    grinder: 'C40', grindSetting: '24', targetDuration: '2:30', steps: [{ water: 50, time: '0:30' }],
    ...(extra || {})
  };
}

function handLog(id, consumedAt, extra) {
  const options = extra || {};
  const { brewPlanSnapshot: rawSnapshot, ...rest } = options;
  return log(id, consumedAt, { brewMethod: '手冲', brewPlanId: null, brewPlanSnapshot: brewSnapshot(rawSnapshot), ...rest });
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

test('回顾雷达图将苦感反向绘制但保留原始分值文案', () => {
  const radar = appInsights.buildRadar([
    { key: 'bitterness', label: '苦感', value: 5 },
    { key: 'aroma', label: '香气', value: 4 },
    { key: 'sweetness', label: '甜感', value: 3 }
  ]);
  assert.match(radar, /<polygon class="radar-shape" points="150\.0,107\.6/);
  assert.match(radar, /苦感5分/);
});

test('乳脂奶香风味可进入回顾统计', () => {
  const rows = [
    log('dairy-1', atLocal(2026, 7, 1), { notes: '酸奶、柑橘' }),
    log('dairy-2', atLocal(2026, 7, 2), { notes: '牛奶、焦糖' }),
    log('dairy-3', atLocal(2026, 7, 3), { notes: '酸奶、牛奶巧克力' })
  ];
  const result = insights.flavorProfile(rows);
  assert.equal(result.ok, true);
  assert.equal(result.data.categories.find((item) => item.category === 'dairy').label, '乳脂奶香');
  assert.equal(result.data.tags.some((item) => item.label === '酸奶'), true);
});

test('回顾的每类统计都提供口径说明按钮', () => {
  const keys = ['dimensions', 'flavor', 'preference', 'time', 'weekday', 'spend', 'source', 'freshness', 'value', 'handBrew', 'report'];
  assert.deepEqual(Object.keys(appInsights.HELP_CONTENT), keys);
  keys.forEach((key) => {
    assert.match(appInsights.helpButton(key), new RegExp(`data-insights-help="${key}"`));
    assert.ok(appInsights.HELP_CONTENT[key].body.length > 20);
  });
  assert.match(appInsights.HELP_CONTENT.spend.body, /不随上方回顾范围变化/);
});

test('手冲回顾只收录自家手冲、排除已删除豆，但保留已喝完的豆', () => {
  const beans = [
    bean('bean-a'),
    bean('bean-finished', { status: '已喝完' }),
    bean('bean-deleted', { deletedAt: atLocal(2026, 7, 1) })
  ];
  const rows = [
    handLog('keep-a', atLocal(2026, 1, 10)),
    handLog('keep-finished', atLocal(2026, 2, 10), { beanId: 'bean-finished' }),
    handLog('smart', atLocal(2026, 3, 10), { brewMethod: '聪明杯' }),
    handLog('aeropress', atLocal(2026, 4, 10), { brewMethod: '爱乐压' }),
    handLog('external', atLocal(2026, 5, 10), { source: 'external', beanId: null }),
    handLog('deleted-bean', atLocal(2026, 6, 10), { beanId: 'bean-deleted' }),
    handLog('deleted-log', atLocal(2026, 6, 11), { deletedAt: atLocal(2026, 6, 12) })
  ];
  assert.deepEqual(insights.filterHandBrewLogs(rows, beans).map((item) => item.id), ['keep-a', 'keep-finished']);
});

test('手冲习惯使用全部历史，五杯解锁，缺失参数只影响对应统计项', () => {
  const now = new Date(2026, 6, 13, 18);
  const beans = [bean('bean-a'), bean('bean-b', { status: '已喝完' })];
  const rows = [
    handLog('old-1', atLocal(2026, 1, 10), { grams: 15, beanId: 'bean-a', brewPlanSnapshot: brewSnapshot({ ratio: '1:15', waterTemp: 90, targetDuration: '2:00' }) }),
    handLog('old-2', atLocal(2026, 2, 10), { grams: 17, beanId: 'bean-a', brewPlanSnapshot: brewSnapshot({ ratio: '1:16', waterTemp: 92, targetDuration: '3:00' }) }),
    handLog('old-3', atLocal(2026, 3, 10), { grams: 19, beanId: 'bean-b', brewPlanSnapshot: brewSnapshot({ ratio: '1:17', waterTemp: 94, targetDuration: '4:00' }) }),
    handLog('old-4', atLocal(2026, 4, 10), { grams: 21, beanId: 'bean-b', brewPlanSnapshot: brewSnapshot({ ratio: '1:18', waterTemp: null, targetDuration: null }) }),
    handLog('manual', atLocal(2026, 5, 10), { grams: 23, beanId: 'bean-a', brewPlanSnapshot: brewSnapshot({ ratio: null, totalWater: 460, waterTemp: 96, targetDuration: null }) })
  ];
  assert.equal(insights.filterLogsByRange(rows, '30d', now).length, 0);
  const result = insights.handBrewSummary(rows, beans, { now });
  assert.equal(result.ok, true);
  assert.equal(result.data.cups, 5);
  assert.equal(result.data.beanCount, 2);
  assert.deepEqual(result.data.dose, { median: 19, min: 15, max: 23, sampleSize: 5 });
  assert.deepEqual(result.data.ratio, { median: 17, min: 15, max: 20, sampleSize: 5 });
  assert.deepEqual(result.data.waterTemp, { median: 93, min: 90, max: 96, sampleSize: 4 });
  assert.deepEqual(result.data.duration, { median: 180, min: 120, max: 240, sampleSize: 3 });
  assert.equal(insights.handBrewSummary(rows.slice(0, 4), beans, { now }).reason, 'insufficient');
});

test('单豆手冲回顾需要三杯带总评分，评分同分按新日期，最多三条且排除无评分', () => {
  const beans = [
    bean('bean-a'),
    bean('bean-finished', { status: '已喝完' }),
    bean('bean-deleted', { deletedAt: atLocal(2026, 7, 1) })
  ];
  const rows = [
    handLog('a-old-five', atLocal(2026, 7, 1), { overallRating: 5, grams: 15, createdAt: atLocal(2026, 7, 1, 8) }),
    handLog('a-four-missing', atLocal(2026, 7, 2), { overallRating: 4, grams: null, brewPlanSnapshot: brewSnapshot({ dose: null, ratio: null, totalWater: null, liquid: null, waterTemp: null, grinder: '', grindSetting: '', targetDuration: '' }) }),
    handLog('a-new-five', atLocal(2026, 7, 3), { overallRating: 5, grams: 20, createdAt: atLocal(2026, 7, 3, 8) }),
    handLog('a-three', atLocal(2026, 7, 4), { overallRating: 3 }),
    handLog('a-no-score', atLocal(2026, 7, 5), { aroma: 5, acidity: 4, sweetness: 3 }),
    handLog('finished-1', atLocal(2026, 7, 1), { beanId: 'bean-finished', overallRating: 4 }),
    handLog('finished-2', atLocal(2026, 7, 2), { beanId: 'bean-finished', overallRating: 4 }),
    handLog('finished-3', atLocal(2026, 7, 3), { beanId: 'bean-finished', overallRating: 4 }),
    handLog('deleted-1', atLocal(2026, 7, 1), { beanId: 'bean-deleted', overallRating: 5 }),
    handLog('deleted-2', atLocal(2026, 7, 2), { beanId: 'bean-deleted', overallRating: 5 }),
    handLog('deleted-3', atLocal(2026, 7, 3), { beanId: 'bean-deleted', overallRating: 5 })
  ];
  const review = insights.handBrewBeanReview(rows, beans, 'bean-a', { advancedRatings: false, now: new Date(2026, 7, 13) });
  assert.equal(review.ok, true);
  assert.equal(review.data.ratedCount, 4);
  assert.equal(review.data.averageRating, 4.3);
  assert.deepEqual(review.data.records.map((item) => item.id), ['a-new-five', 'a-old-five', 'a-four-missing']);
  assert.equal(review.data.records.some((item) => item.id === 'a-no-score'), false);
  assert.deepEqual(review.data.ranges.dose, { median: 17.5, min: 15, max: 20, sampleSize: 2 });
  assert.equal(review.data.records[2].parameters.dose, null);
  assert.equal(insights.handBrewBeanReview(rows, beans, 'bean-deleted').reason, 'empty');
  assert.equal(insights.handBrewBeanReview(rows.slice(0, 2), beans, 'bean-a').reason, 'insufficient');
  assert.equal(insights.handBrewBeanReview(rows, beans, 'bean-finished').data.ratedCount, 3);
});

test('高级评价只解释已有维度，关闭时隐藏，少于三个共同维度不聚合', () => {
  const beans = [bean('bean-a')];
  const rows = [
    handLog('common-1', atLocal(2026, 7, 1), { overallRating: 5, aroma: 4, acidity: 3, sweetness: 4 }),
    handLog('common-2', atLocal(2026, 7, 2), { overallRating: 4, aroma: 5, acidity: 4, sweetness: null }),
    handLog('common-3', atLocal(2026, 7, 3), { overallRating: 4, aroma: 3, acidity: 5, sweetness: 4 })
  ];
  const off = insights.handBrewBeanReview(rows, beans, 'bean-a', { advancedRatings: false });
  assert.equal(off.data.advanced, null);
  const on = insights.handBrewBeanReview(rows, beans, 'bean-a', { advancedRatings: true, enabledDimensions: ['aroma', 'acidity', 'sweetness'] });
  assert.equal(on.data.advanced.commonDimensions, null);
  assert.deepEqual(on.data.records[0].dimensions.map((item) => item.key), ['aroma', 'acidity', 'sweetness']);
  assert.deepEqual(on.data.records.find((item) => item.id === 'common-2').dimensions.map((item) => item.key), ['aroma', 'acidity']);
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

test('手冲回顾首页归入第04类，单豆页面按层级返回', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'app-insights.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  assert.match(source, /handBrewHomeSection/);
  assert.match(source, /<span>04<\/span><div><h3>冲煮回顾<\/h3>/);
  assert.match(source, /if \(state\.insightsBeanId\) \{[\s\S]*?state\.insightsBeanId = null;[\s\S]*?return true;/);
  assert.match(source, /isBeanReview \? '返回手冲回顾' : isReportDetail \? '返回咖啡月报与年报' : '返回回顾首页'/);
  assert.doesNotMatch(html, /id="insightsBackLabel"/);
});

test('咖啡月报只统计完整自然月，五杯解锁并排除无效记录', () => {
  const beans = [
    bean('bean-a', { name: '日常豆' }),
    bean('bean-deleted', { name: '已删除豆', deletedAt: atLocal(2026, 7, 1) })
  ];
  const rows = [
    log('a1', atLocal(2026, 6, 1, 8), { overallRating: 4, notes: '柠檬、红茶' }),
    log('a2', atLocal(2026, 6, 2, 8), { overallRating: 5, notes: '柠檬、花香' }),
    log('deleted-bean', atLocal(2026, 6, 3, 9), { beanId: 'bean-deleted', overallRating: 3 }),
    log('external', atLocal(2026, 6, 4, 10), { source: 'external', beanId: null, grams: 0, drinkName: '店内手冲', price: 30, overallRating: 5 }),
    log('a3', atLocal(2026, 6, 5, 8), { overallRating: 4, notes: '柠檬、莓果' }),
    log('removed', atLocal(2026, 6, 6), { deletedAt: atLocal(2026, 6, 7) }),
    log('july', atLocal(2026, 7, 1))
  ];
  const report = insights.coffeePeriodReport(rows, beans, { type: 'month', key: '2026-06', now: new Date(2026, 6, 3, 12) });
  assert.equal(report.ok, true);
  assert.equal(report.data.cups, 5);
  assert.equal(report.data.days, 5);
  assert.equal(report.data.beanCount, 1);
  assert.deepEqual([report.data.homeCups, report.data.externalCups], [4, 1]);
  assert.equal(report.data.topBean.beanName, '日常豆');
  assert.equal(report.data.topRated.id, 'external');
  assert.equal(report.data.estimatedSpend, 52.5);
  assert.equal(report.data.unknownCostCount, 1);
  assert.equal(report.data.flavors[0].label, '柠檬');
  assert.equal(insights.coffeePeriodReport(rows.slice(0, 4), beans, { type: 'month', key: '2026-06', now: new Date(2026, 6, 3) }).reason, 'insufficient');
  assert.equal(insights.coffeePeriodReport(rows, beans, { type: 'month', key: '2026-07', now: new Date(2026, 6, 3) }).reason, 'incompletePeriod');
});

test('咖啡年报提供十二月节奏，报告列表与首页提醒只使用已完成周期', () => {
  const rows = [
    log('d1', atLocal(2025, 12, 1)), log('d2', atLocal(2025, 12, 2)), log('d3', atLocal(2025, 12, 3)),
    log('d4', atLocal(2025, 12, 4)), log('d5', atLocal(2025, 12, 5)),
    log('current', atLocal(2026, 1, 2))
  ];
  const now = new Date(2026, 0, 3, 12);
  const periods = insights.availableCoffeeReports(rows, now);
  assert.deepEqual(periods.map((item) => `${item.type}:${item.key}`), ['year:2025', 'month:2025-12']);
  const annual = insights.coffeePeriodReport(rows, [bean('bean-a')], { type: 'year', key: '2025', now });
  assert.equal(annual.ok, true);
  assert.equal(annual.data.monthlyRhythm.length, 12);
  assert.deepEqual(annual.data.activeMonth, { key: '2025-12', label: '12月', cups: 5 });
  const reminders = insights.coffeeReportReminders(rows, now);
  assert.deepEqual(reminders.map((item) => item.type), ['reportYear', 'reportMonth']);
  assert.ok(reminders[0].priority > reminders[1].priority);
  assert.equal(insights.coffeeReportReminders(rows, new Date(2026, 0, 9)).length, 0);
  const payload = insights.buildCoffeeReportSharePayload(annual.data);
  assert.equal(payload.eyebrow, '咖啡年报');
  assert.equal(payload.style, 'report');
  assert.equal(payload.badge.big, '2025');
  assert.equal(payload.rhythm.length, 12);
  assert.equal(payload.hero.length, 4);
  const monthRows = [
    log('m1', atLocal(2026, 6, 1)), log('m2', atLocal(2026, 6, 2)), log('m3', atLocal(2026, 6, 3)),
    log('m4', atLocal(2026, 6, 4)), log('m5', atLocal(2026, 6, 5))
  ];
  const monthReport = insights.coffeePeriodReport(monthRows, [bean('bean-a')], { type: 'month', key: '2026-06', now: new Date(2026, 6, 3) });
  const monthPayload = insights.buildCoffeeReportSharePayload(monthReport.data);
  assert.equal(monthPayload.badge.big, '6月');
  assert.equal(monthPayload.rhythm.length, 0);
});

test('回顾提供第05类咖啡月报与年报，并按报告列表返回', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'app-insights.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  assert.match(source, /<span>05<\/span><div><h3>咖啡月报 \/ 咖啡年报<\/h3>/);
  assert.match(source, /if \(state\.insightsPage === 'report'\)[\s\S]*?state\.insightsPage = 'reports'/);
  assert.match(source, /if \(state\.insightsPage === 'reports'\)[\s\S]*?state\.insightsPage = 'home'/);
  assert.match(html, /id="reportReviewPage"/);
  assert.match(html, /id="calendarReportOpen"/);
  assert.doesNotMatch(source + html, /时光报告/);
});
