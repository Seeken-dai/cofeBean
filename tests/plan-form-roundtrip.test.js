// 3.0.14 回归：AI 导入 → 打开编辑页 → 不改任何东西直接保存，方案所有字段必须原样不变。
// 模拟的是 app.js planToForm / savePlan 的真实取值链路，并按 index.html 里输入框的真实 type
// 复现浏览器对 <input type="number"> 的「非法值静默清空」，这正是 3.0.13 及以前水温丢失的那一步。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../www/data-core.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');

const PLAN_FORM_KEYS = ['name', 'dose', 'liquid', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket', 'targetYield', 'targetExtractionTime', 'pressTime', 'mokaPotSize', 'heatLevel', 'customMethod', 'notes'];

function inputType(key) {
  const tag = html.match(new RegExp(`<(input|textarea|select)[^>]*id="plan-${key}"[^>]*>`));
  if (!tag) return null;
  if (tag[1] !== 'input') return tag[1];
  const type = tag[0].match(/type="([^"]+)"/);
  return type ? type[1] : 'text';
}

// 浏览器对 number 输入的赋值净化：不是合法浮点数就变成空串。
function assignToInput(key, value) {
  const text = value == null ? '' : String(value);
  if (inputType(key) === 'number') return /^-?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(text.trim()) ? text : '';
  return text;
}

// 与 app.js planToForm 一致的回填。
function planToForm(plan) {
  const p = core.normalizeBrewPlan(plan, plan.updatedAt);
  const form = {};
  PLAN_FORM_KEYS.forEach((key) => {
    if (!inputType(key)) return;
    const value = key === 'waterTemp' ? core.waterTempInputValue(p.waterTemp) : (p[key] == null ? '' : String(p[key]));
    form[key] = assignToInput(key, value);
  });
  return { form, originalWaterTemp: form.waterTemp, storedWaterTemp: p.waterTemp || '' };
}

// 与 app.js savePlan 一致的保存（steps 由分段编辑器原样读回）。
function savePlan(old, opened, edits) {
  const fields = { ...opened.form, ...(edits || {}) };
  const temp = core.planWaterTempFromForm(fields.waterTemp, opened.originalWaterTemp, opened.storedWaterTemp);
  const cleaned = { ...fields, useHotWater: Boolean(old.useHotWater), waterTemp: temp.value };
  return core.normalizeBrewPlan(core.mergeBrewPlanOverlay(old, { ...cleaned, id: old.id, source: old.source, beanIds: old.beanIds, steps: old.steps }, { clear: temp.clear ? ['waterTemp'] : [] }));
}

function importPlan(json) {
  const { plan } = core.parseAiPlanJson(JSON.stringify(json));
  return core.normalizeBrewPlan(core.cloneBrewPlan(plan, { name: plan.name, source: 'user' }));
}

function assertUnchanged(before, after) {
  ['name', 'brewMethod', 'notes', ...PLAN_FORM_KEYS.filter((key) => key !== 'name' && key !== 'notes'), 'useHotWater'].forEach((key) => {
    assert.deepEqual(after[key], before[key], `field ${key} changed: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
  });
  assert.deepEqual(after.steps, before.steps);
  assert.deepEqual(after.beanIds, before.beanIds);
}

const SAMPLE = {"name":"V60·花果焦糖均衡","brewMethod":"手冲","dose":15,"totalWater":225,"ratio":"1:15","waterTemp":"91℃","grindSetting":"巫师2.0全能版建议从40格起步，中等偏细研磨，接近白砂糖颗粒感","targetDuration":"2:45","notes":"...","steps":[{"label":"焖蒸","water":35,"startTime":"0:00","endTime":"0:40","note":"..."},{"label":"第一段·花果萃取","water":100,"startTime":"0:40","endTime":"1:15","note":"..."},{"label":"第二段·甜感与醇厚","water":90,"startTime":"1:15","endTime":"2:45","note":"..."}]};

test('app.js really uses the shared helpers this test models', () => {
  assert.match(appJs, /key === 'waterTemp' \? BeanCore\.waterTempInputValue\(p\.waterTemp\)/);
  assert.match(appJs, /BeanCore\.planWaterTempFromForm\(fields\.waterTemp, \$\('#plan-waterTemp'\)\.dataset\.originalValue, \$\('#plan-waterTemp'\)\.dataset\.storedValue\)/);
  assert.match(appJs, /\{ clear: temp\.clear \? \['waterTemp'\] : \[\] \}/);
  assert.notEqual(inputType('waterTemp'), 'number', 'waterTemp must not be a number input, or ranges are wiped on open');
});

test('sample import → edit → save without changes leaves every field unchanged', () => {
  const imported = importPlan(SAMPLE);
  assert.equal(imported.waterTemp, '91°C');
  const opened = planToForm(imported);
  assert.equal(opened.form.waterTemp, '91');
  assertUnchanged(imported, savePlan(imported, opened));
});

for (const [label, waterTemp, expected, shown] of [
  ['℃ single', '91℃', '91°C', '91'],
  ['°C single', '91°C', '91°C', '91'],
  ['度 single', '91度', '91°C', '91'],
  ['spaced', '91 °C', '91°C', '91'],
  ['number', 91, '91°C', '91'],
  ['range', '90-92℃', '90-92°C', '90-92'],
  ['range with units', '90℃~92℃', '90-92°C', '90-92'],
  ['free text', '常温', '常温', '常温']
]) {
  test(`roundtrip keeps waterTemp: ${label}`, () => {
    const imported = importPlan({ ...SAMPLE, waterTemp });
    assert.equal(imported.waterTemp, expected);
    const opened = planToForm(imported);
    assert.equal(opened.form.waterTemp, shown);
    const saved = savePlan(imported, opened);
    assert.equal(saved.waterTemp, expected);
    assertUnchanged(imported, savePlan(saved, planToForm(saved)));
  });
}

test('edit form: changing the temperature saves the new value; clearing it really clears', () => {
  const imported = importPlan({ ...SAMPLE, waterTemp: '90-92℃' });
  const opened = planToForm(imported);
  assert.equal(savePlan(imported, opened, { waterTemp: '93' }).waterTemp, '93°C');
  assert.equal(savePlan(imported, opened, { waterTemp: '' }).waterTemp, '');
  const other = savePlan(imported, opened, { grindSetting: '42' });
  assert.equal(other.waterTemp, '90-92°C', 'editing another field keeps the range');
  assert.equal(other.grindSetting, '42');
});

test('aliased import (temperature / duration / step start,end,tip) also survives the roundtrip', () => {
  const json = { ...SAMPLE, waterTemp: undefined, targetDuration: undefined, temperature: '91℃', duration: '2:45', steps: SAMPLE.steps.map(({ startTime, endTime, note, ...rest }) => ({ ...rest, start: startTime, end: endTime, tip: note })) };
  const imported = importPlan(json);
  assert.equal(imported.waterTemp, '91°C');
  assert.equal(imported.targetDuration, '2:45');
  assert.equal(imported.steps[1].startTime, '0:40');
  assert.equal(imported.steps[1].note, '...');
  assertUnchanged(imported, savePlan(imported, planToForm(imported)));
});

test('quick 喝一杯: range carried into the drink form stays "90-92" (was 9092) and is saved back as a range', () => {
  assert.match(appJs, /key === 'waterTemp' \? BeanCore\.waterTempInputValue\(data\[key\]\) : data\[key\]/);
  assert.ok(!appJs.includes(".replace(/[^\\d.]/g, '')"), 'old digit-only strip must be gone');
  assert.match(appJs, /fields\.waterTemp = BeanCore\.normalizeWaterTemp\(fields\.waterTemp\)/);
  const drinkInput = html.match(/<input[^>]*id="drink-param-waterTemp"[^>]*>/)[0];
  assert.ok(!/type="number"/.test(drinkInput));
  assert.equal(core.waterTempInputValue('90-92°C'), '90-92');
  assert.equal(core.normalizeWaterTemp('90-92'), '90-92°C');
});
