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
