'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dataCore = require('../www/data-core.js');
const insightsCore = require('../www/insights-core.js');
const insights = require('../www/app-insights.js');
const core = Object.assign({}, dataCore, insightsCore);

function fakeElement() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, checked: false,
    dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} },
    setAttribute() {}, click() {}, focus() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; }
  };
}

function createInsightsUi(overrides) {
  const dialog = fakeElement();
  const state = {
    insightsPage: 'home',
    insightsExitTo: null,
    insightsReportFromList: false,
    insightsReportType: null,
    insightsReportKey: null,
    drinkLogs: [],
    beans: [],
    settings: {}
  };

  let personalReopened = false;
  const deps = {
    dialog,
    state,
    core,
    setDialog: () => {},
    reopenPersonal: () => { personalReopened = true; },
    ...overrides
  };

  const ui = insights.create(deps);
  return { ui, state, getPersonalReopened: () => personalReopened };
}

test('insights navigation: openReports sets page to reports and exitTo to personal', () => {
  const { ui, state } = createInsightsUi();
  ui.openReports();
  assert.equal(state.insightsPage, 'reports');
  assert.equal(state.insightsExitTo, 'personal');
});

test('insights navigation: openReport -> handleBack returns to reports list first, then exits to personal', () => {
  const { ui, state, getPersonalReopened } = createInsightsUi();

  // 1. 从个人中心打开报告列表
  ui.openReports();
  assert.equal(state.insightsPage, 'reports');

  // 2. 点击进入具体月报
  ui.openReport('month', '2026-08', { fromList: true });
  assert.equal(state.insightsPage, 'report');
  assert.equal(state.insightsReportType, 'month');
  assert.equal(state.insightsReportKey, '2026-08');

  // 3. 在月报详情点击返回 -> 回退到报告列表
  const handledFirst = ui.handleBack();
  assert.equal(handledFirst, true);
  assert.equal(state.insightsPage, 'reports');
  assert.equal(state.insightsReportType, null);
  assert.equal(state.insightsReportKey, null);
  assert.equal(getPersonalReopened(), false);

  // 4. 在报告列表点击返回 -> 回退到个人中心
  const handledSecond = ui.handleBack();
  assert.equal(handledSecond, true);
  assert.equal(getPersonalReopened(), true);
});

test('insights navigation: direct report open from personal card returns to reports list on back', () => {
  const { ui, state, getPersonalReopened } = createInsightsUi();

  // 从个人中心卡片直接点击某个月报
  ui.openReport('month', '2026-08', { fromList: true, fromPersonal: true });
  assert.equal(state.insightsPage, 'report');
  assert.equal(state.insightsExitTo, 'personal');

  // 点击返回 -> 回退到报告列表
  const handled = ui.handleBack();
  assert.equal(handled, true);
  assert.equal(state.insightsPage, 'reports');
  assert.equal(getPersonalReopened(), false);

  // 再次返回 -> 退出回到个人中心
  ui.handleBack();
  assert.equal(getPersonalReopened(), true);
});

// --- 3.0.12：单豆评分页进入手冲回顾（临时范围「全部」，返回关掉回顾） ---
function createBrewReviewUi(stateOverrides) {
  const nodes = new Map();
  const dialog = fakeElement();
  dialog.querySelector = (selector) => { if (!nodes.has(selector)) nodes.set(selector, fakeElement()); return nodes.get(selector); };
  const harness = createInsightsUi({ dialog });
  Object.assign(harness.state, stateOverrides || {});
  return { ...harness, node: (selector) => dialog.querySelector(selector) };
}

function oldHandBrewLogs(beanId) {
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  return [40, 42, 45].map((n, i) => ({ id: `hb${i}`, beanId, source: 'home', brewMethod: '手冲', grams: 15, overallRating: 4 + (i % 2), consumedAt: daysAgo(n) }));
}

test('insights navigation: bean brew review opened with range all renders unlocked content, back closes without touching saved range', () => {
  const bean = { id: 'bean-old', name: 'Old Bean' };
  const { ui, state, node } = createBrewReviewUi({ beans: [bean], drinkLogs: oldHandBrewLogs('bean-old'), insightsRange: '30d' });
  // 默认 30 天范围：40 天前的记录不在范围里，应显示「还在积累」。
  ui.openBrewReview('bean-old');
  assert.match(node('#brewReviewContent').innerHTML, /insight-unlock/);
  ui.close();
  // 从评分页进入：临时范围 all → 已解锁。
  ui.openBeanReview('bean-old', { range: 'all', exitTo: 'beanRating' });
  assert.equal(state.insightsPage, 'brew');
  assert.equal(state.insightsRangeOverride, 'all');
  assert.doesNotMatch(node('#brewReviewContent').innerHTML, /insight-unlock/);
  assert.match(node('#brewReviewContent').innerHTML, /Old Bean/);
  assert.equal(ui.handleBack(), true);
  assert.equal(state.insightsPage, 'home');
  assert.equal(state.insightsExitTo, null);
  assert.equal(state.insightsRangeOverride, null);
  assert.equal(state.insightsRange, '30d');
});

test('insights navigation: bean brew review entered from the global page still steps back to the global page', () => {
  const bean = { id: 'bean-a', name: 'Bean A' };
  const { ui, state } = createBrewReviewUi({ beans: [bean], drinkLogs: oldHandBrewLogs('bean-a'), insightsRange: 'all' });
  ui.openBrewReview();
  ui.handleClick({ target: { closest: (selector) => (selector === '[data-insights-brew-bean]' ? { dataset: { insightsBrewBean: 'bean-a' } } : null) } });
  assert.equal(state.insightsBeanId, 'bean-a');
  assert.equal(state.insightsRangeOverride, null);
  assert.equal(ui.handleBack(), true);
  assert.equal(state.insightsPage, 'brew');
  assert.equal(state.insightsBeanId, null);
  assert.equal(ui.handleBack(), true);
  assert.equal(state.insightsPage, 'home');
});
