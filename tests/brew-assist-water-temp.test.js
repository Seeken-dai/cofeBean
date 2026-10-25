// 3.0.14：冲煮辅助（跑马灯 + 开始前参数卡）水温展示——单值 / 区间都只带一次 °C，绝不出现「℃°C」。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../www/data-core.js');
const fmt = require('../www/app-format.js');
const brewAssist = require('../www/app-brew-assist.js');

function fakeElement() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, checked: false,
    dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: { setProperty() {} },
    setAttribute() {}, removeAttribute() {}, click() {}, focus() {}, querySelector() { return null; }, querySelectorAll() { return []; }
  };
}

function openAssistFor(waterTemp) {
  const nodes = new Map();
  const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, fakeElement()); return nodes.get(selector); };
  const plan = core.normalizeBrewPlan({ id: 'p1', name: '测试', brewMethod: '手冲', dose: 15, totalWater: 225, ratio: '1:15', waterTemp, steps: [{ label: '焖蒸', water: 35, startTime: '0:00', endTime: '0:40' }, { label: '一段', water: 190, startTime: '0:40', endTime: '2:00' }] });
  const state = { brewAssist: null, beans: [], brewPlans: [plan], viewingPlanId: 'p1' };
  const api = brewAssist.create({
    $, $$: () => [], state, els: { drink: {}, planDetail: {}, brewAssist: {}, drinkForm: {} }, core,
    toast: () => {}, setDialog: () => {}, esc: fmt.esc, formatWeight: fmt.formatWeight, durationText: fmt.durationText, secondsFromText: fmt.secondsFromText,
    setDurationControl: () => {}, syncRatioValue: () => {}, syncDurationField: () => {},
    currentDrinkMethod: () => '手冲', selectedDrinkPlan: () => null, drinkParamSnapshot: () => null, openPlanDetail: () => {}
  });
  const raf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0;
  try { api.openPlanBrewAssist(); } finally { globalThis.requestAnimationFrame = raf; }
  return { ticker: $('#brewAssistTickerTrack').innerHTML, context: $('#brewAssistContext').innerHTML };
}

for (const [input, expected] of [['91℃', '91°C'], ['91°C', '91°C'], ['91度', '91°C'], [91, '91°C'], ['90-92℃', '90-92°C'], ['90℃~92℃', '90-92°C']]) {
  test(`brew assist shows ${JSON.stringify(input)} as ${expected}`, () => {
    const { ticker, context } = openAssistFor(input);
    assert.ok(ticker.includes(`<em>${expected}</em>`), ticker);
    assert.ok(context.includes(expected), context);
    assert.ok(!/℃°C|°C°C|度°C/.test(ticker + context));
  });
}

test('brew assist: missing water temperature shows 未记录 in the context card and is skipped in the ticker', () => {
  const { ticker, context } = openAssistFor('');
  assert.ok(!ticker.includes('水温'));
  assert.ok(context.includes('未记录'));
});

test('app-brew-assist formats water temperature only through BeanCore.formatWaterTemp', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'app-brew-assist.js'), 'utf8');
  assert.equal((source.match(/core\.formatWaterTemp\(plan\.waterTemp\)/g) || []).length, 2);
  assert.ok(!/replace\(\/°\?C\$\/i/.test(source));
});
