const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

// UI 第二期（2.0.9）纯逻辑：赏味度档位 + 饮用近 N 天序列。

const TODAY = '2026-07-04T12:00:00.000Z';
function bean(openedDate, bestFlavorDays) {
  return core.normalizeBean({ name: 'x', openedDate, bestFlavorDays }, TODAY);
}

test('beanFreshness 缺开封日期或赏味期天数时返回 null', () => {
  assert.equal(core.beanFreshness(bean('', 30), TODAY), null);
  assert.equal(core.beanFreshness(bean('2026-07-01', null), TODAY), null);
});

test('beanFreshness 按剩余天数分档', () => {
  // 开封 2026-07-01，赏味 30 天 → 到期 2026-07-31，距 2026-07-04 还有 27 天
  assert.deepEqual(core.beanFreshness(bean('2026-07-01', 30), TODAY), { daysLeft: 27, level: 'fresh', label: '27天' });
  // 还剩 10 天 → good
  assert.equal(core.beanFreshness(bean('2026-06-24', 20), TODAY).level, 'good');
  // 还剩 2 天 → soon
  assert.equal(core.beanFreshness(bean('2026-06-20', 16), TODAY).level, 'soon');
  // 今天到期 → soon / 今天
  assert.deepEqual(core.beanFreshness(bean('2026-06-04', 30), TODAY), { daysLeft: 0, level: 'soon', label: '今天' });
  // 已过期 → expired
  const past = core.beanFreshness(bean('2026-05-01', 30), TODAY);
  assert.equal(past.level, 'expired');
  assert.equal(past.label, '已过期');
  assert.ok(past.daysLeft < 0);
});

test('recentDrinkSeries 返回定长日序列且按日聚合', () => {
  // 用本地时间字符串（无 Z），避免测试机时区跨午夜导致归日漂移；聚合按本地日，与日历一致。
  const localToday = '2026-07-04T12:00:00';
  const logs = [
    { id: 'a', consumedAt: '2026-07-04T09:00:00', grams: 15, overallRating: 4 },
    { id: 'b', consumedAt: '2026-07-04T20:00:00', grams: 12, overallRating: 2 },
    { id: 'c', consumedAt: '2026-07-02T08:00:00', grams: 18, overallRating: 5 },
    { id: 'd', consumedAt: '2026-07-04T07:00:00', grams: 10, overallRating: 0, deletedAt: '2026-07-04T07:30:00' }
  ];
  const series = core.recentDrinkSeries(logs, 7, localToday);
  assert.equal(series.length, 7);
  const last = series[series.length - 1];
  assert.equal(last.date, core.dateKey(new Date(localToday)));
  assert.equal(last.cups, 2);            // 删除的 d 不计
  assert.equal(last.grams, 27);
  assert.equal(last.averageRating, 3);   // (4+2)/2
  const day2 = series.find((s) => s.cups === 1);
  assert.equal(day2.averageRating, 5);
  assert.equal(series[0].cups, 0);       // 序列头部空天
});

test('recentDrinkSeries 空输入返回定长全零序列', () => {
  const s = core.recentDrinkSeries([], 30, TODAY);
  assert.equal(s.length, 30);
  assert.ok(s.every((d) => d.cups === 0 && d.grams === 0 && d.averageRating === null));
});

test('beanProcessKind 归类处理法，优先级正确，未知/空返回 null', () => {
  assert.equal(core.beanProcessKind('日晒'), 'natural');
  assert.equal(core.beanProcessKind('水洗'), 'washed');
  assert.equal(core.beanProcessKind('红蜜处理'), 'honey');
  assert.equal(core.beanProcessKind('厌氧日晒'), 'anaerobic'); // 厌氧优先于日晒
  assert.equal(core.beanProcessKind('半水洗'), 'washed');
  assert.equal(core.beanProcessKind(''), null);
  assert.equal(core.beanProcessKind('湿刨'), 'washed');
  assert.equal(core.beanProcessKind('某种新处理法'), null);
});
