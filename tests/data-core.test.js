const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

test('normalizeBean applies safe defaults and numeric bounds', () => {
  const bean = core.normalizeBean({ name: '  花魁  ', status: '未知', remainingWeight: '-2', favorite: '1', bagImagePath: ' file:///bag.jpg ' }, '2026-01-01T00:00:00.000Z');
  assert.equal(bean.name, '花魁');
  assert.equal(bean.status, '未开封');
  assert.equal(bean.remainingWeight, null);
  assert.equal(bean.favorite, true);
  assert.equal(bean.bagImagePath, 'file:///bag.jpg');
});

test('filterAndSort searches multiple fields and sorts remaining weight or unit price', () => {
  const beans = [
    core.normalizeBean({ name: 'A', origin: '埃塞俄比亚', remainingWeight: 80, status: '饮用中', price: 100, initialWeight: 200 }),
    core.normalizeBean({ name: 'B', origin: '哥伦比亚', remainingWeight: 120, status: '未开封', price: 120, initialWeight: 100 }),
    core.normalizeBean({ name: 'C', origin: '肯尼亚', remainingWeight: 60, status: '未开封' })
  ];
  assert.equal(core.filterAndSort(beans, { query: '埃塞' }).length, 1);
  assert.equal(core.filterAndSort(beans, { sort: 'remainingWeight', direction: 'desc' })[0].name, 'B');
  assert.deepEqual(core.filterAndSort(beans, { sort: 'unitPrice', direction: 'asc' }).map((bean) => bean.name), ['A', 'B', 'C']);
  assert.deepEqual(core.filterAndSort(beans, { sort: 'unitPrice', direction: 'desc' }).map((bean) => bean.name), ['B', 'A', 'C']);
});

test('backup round trip validates schema and duplicate ids', () => {
  const beans = [core.normalizeBean({ id: 'one', name: '豆一', labelImagePath: 'file:///label.jpg' })];
  const logs = [core.normalizeDrinkLog({ id: 'cup-one', beanId: 'one', beanName: '豆一', grams: 15, brewMethod: '手冲' })];
  const plans = [core.normalizeBrewPlan({ id: 'plan-one', name: '三段式', brewMethod: '手冲', beanIds: ['one'], dose: 15 })];
  const backup = core.createBackup(beans, logs, { quickGrams: 18 }, '2026-01-01T00:00:00.000Z', plans);
  const imported = core.validateImport(backup);
  assert.equal(backup.appVersion, '1.4.6');
  assert.equal(imported.exportScope, 'all');
  assert.equal(imported.beans[0].name, '豆一');
  assert.equal(imported.beans[0].labelImagePath, 'file:///label.jpg');
  assert.equal(imported.drinkLogs[0].grams, 15);
  assert.equal(imported.brewPlans[0].name, '三段式');
  assert.equal(imported.settings.quickGrams, 18);
  const legacy = core.validateImport({ schemaVersion: 1, beans });
  assert.equal(legacy.beans.length, 1);
  assert.deepEqual(legacy.drinkLogs, []);
  assert.deepEqual(legacy.brewPlans, []);
  const crossVersion = core.validateImport({ schemaVersion: 2, beans, drinkLogs: logs, settings: { enableBrewPlans: true } });
  assert.equal(crossVersion.exportScope, 'all');
  assert.equal(crossVersion.drinkLogs[0].id, 'cup-one');
  assert.deepEqual(crossVersion.brewPlans, []);
  assert.equal(crossVersion.settings.enableBrewPlans, true);
  assert.throws(() => core.validateImport({ schemaVersion: 99, beans: [] }), /备份版本/);
  assert.throws(() => core.validateImport({ schemaVersion: 1, beans: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }] }), /重复/);
});

test('scoped backups include only selected data and keep old imports compatible', () => {
  const beans = [core.normalizeBean({ id: 'bean-scope', name: '范围豆' })];
  const logs = [core.normalizeDrinkLog({ id: 'log-scope', beanId: 'bean-scope', beanName: '范围豆', grams: 18 })];
  const plans = [core.normalizeBrewPlan({ id: 'plan-scope', name: '冰滴', brewMethod: '冰滴', beanIds: ['bean-scope'] })];
  const library = core.createBackup(beans, logs, { theme: 'obsidian' }, '2026-01-01T00:00:00.000Z', plans, { scope: 'library' });
  assert.equal(library.exportScope, 'library');
  assert.equal(Array.isArray(library.beans), true);
  assert.equal(Array.isArray(library.drinkLogs), true);
  assert.equal('brewPlans' in library, false);
  assert.equal('settings' in library, false);
  const importedLibrary = core.validateImport(library);
  assert.equal(importedLibrary.beans.length, 1);
  assert.equal(importedLibrary.drinkLogs.length, 1);
  assert.deepEqual(importedLibrary.brewPlans, []);
  assert.equal(importedLibrary.settings, null);

  const planOnly = core.createBackup(beans, logs, { theme: 'frost' }, '2026-01-01T00:00:00.000Z', plans, { scope: 'brewPlans' });
  assert.equal(planOnly.exportScope, 'brewPlans');
  assert.equal('beans' in planOnly, false);
  assert.equal('drinkLogs' in planOnly, false);
  assert.equal('settings' in planOnly, false);
  const importedPlans = core.validateImport(planOnly);
  assert.deepEqual(importedPlans.beans, []);
  assert.deepEqual(importedPlans.drinkLogs, []);
  assert.equal(importedPlans.brewPlans[0].name, '冰滴');
  assert.deepEqual(importedPlans.brewPlans[0].beanIds, ['bean-scope']);

  const legacyWithoutScope = core.validateImport({ schemaVersion: 3, beans, drinkLogs: logs, settings: { theme: 'blaze' } });
  assert.equal(legacyWithoutScope.exportScope, 'all');
  assert.equal(legacyWithoutScope.settings.theme, 'blaze');
});

test('brew plans normalize presets, snapshots and recommendations', () => {
  const presets = core.presetBrewPlans();
  assert.deepEqual(presets.map((plan) => plan.name), ['四六法', '一刀流', '三段式']);
  assert.deepEqual(presets[0].steps.map((step) => step.label), ['闷蒸', '第 1 段', '第 2 段', '第 3 段', '第 4 段']);
  assert.deepEqual(presets[1].steps.map((step) => step.label), ['闷蒸', '第 1 段']);
  assert.deepEqual(presets[2].steps.map((step) => step.label), ['闷蒸', '第 1 段', '第 2 段']);
  const plan = core.normalizeBrewPlan({ name: '冷萃 12h', brewMethod: '冷萃', dose: 30, ratio: '1:10', beanIds: ['b1', 'b1'], steps: [{ label: '浸泡', time: '12h' }] }, '2026-01-01T00:00:00.000Z');
  assert.equal(plan.totalWater, 300);
  assert.deepEqual(plan.beanIds, ['b1']);
  const snapshot = core.planSnapshot(plan);
  assert.equal(snapshot.name, '冷萃 12h');
  const plans = [
    core.normalizeBrewPlan({ id: 'other', name: '通用手冲', brewMethod: '手冲' }),
    core.normalizeBrewPlan({ id: 'bound', name: '绑定方案', brewMethod: '手冲', beanIds: ['b1'] }),
    core.normalizeBrewPlan({ id: 'press', name: '法压方案', brewMethod: '法压', beanIds: ['b1'] })
  ];
  assert.equal(core.recommendBrewPlans(plans, 'b1', '手冲')[0].id, 'bound');
  assert.deepEqual(core.recommendBrewPlans(plans, 'b1', '法压').map((item) => item.id), ['press']);
});

test('brew assist prepares pour-over steps and reports active stage', () => {
  const steps = core.prepareBrewAssistSteps([
    { label: '闷蒸', water: 30, time: '0:00-0:30' },
    { label: '连续注水', water: 135, time: '0:30-1:20' },
    { label: '等待滤完', water: 225, time: 'bad' }
  ]);
  assert.deepEqual(steps.map((step) => step.time), ['0:00-0:30', '0:30-1:20', '1:20-1:50']);
  assert.equal(steps[2].duration, 30);
  assert.equal(core.brewAssistStatus(steps, 29).index, 0);
  assert.equal(core.brewAssistStatus(steps, 30).current.label, '连续注水');
  assert.equal(core.brewAssistStatus(steps, 80).current.label, '等待滤完');
  assert.equal(core.brewAssistStatus(steps, 110).phase, 'done');
  assert.equal(core.brewAssistStatus([], 10).phase, 'empty');
});

test('consumption applies deltas with safe bounds', () => {
  assert.equal(core.consumptionResult(100, 250, 15), 85);
  assert.equal(core.consumptionResult(85, 100, -20), 100);
  assert.throws(() => core.consumptionResult(10, 250, 15), /超过剩余/);
});

test('drink log and settings normalization keep ratings optional', () => {
  const log = core.normalizeDrinkLog({ beanName: '豆一', grams: 15, overallRating: 6, aroma: 4 });
  assert.equal(log.overallRating, null);
  assert.equal(log.aroma, 4);
  const settings = core.normalizeSettings({ quickGrams: 200, advancedRatings: true, enabledDimensions: ['aroma', 'bad'], priceUnit: '100g' });
  assert.equal(settings.quickGrams, 100);
  assert.equal(settings.priceUnit, '100g');
  assert.equal(settings.enableBrewPlans, false);
  assert.deepEqual(settings.enabledDimensions, ['aroma']);
  assert.equal(core.normalizeSettings({ priceUnit: 'bad' }).priceUnit, 'g');
  assert.equal(core.normalizeSettings({ enableBrewPlans: '1' }).enableBrewPlans, true);
});

test('calendar day summaries estimate grams cost and average rating', () => {
  const beans = [
    core.normalizeBean({ id: 'b1', name: '花魁', initialWeight: 200, remainingWeight: 170, price: 98 }),
    core.normalizeBean({ id: 'b2', name: '无价格豆', initialWeight: 100, remainingWeight: 90 })
  ];
  const logs = [
    core.normalizeDrinkLog({ id: 'l1', beanId: 'b1', beanName: '花魁', grams: 15, overallRating: 5, consumedAt: '2026-06-25T01:30:00.000Z' }),
    core.normalizeDrinkLog({ id: 'l2', beanId: 'b1', beanName: '花魁', grams: 15, overallRating: 4, consumedAt: '2026-06-25T08:20:00.000Z' }),
    core.normalizeDrinkLog({ id: 'l3', beanId: 'b2', beanName: '无价格豆', grams: 10, consumedAt: '2026-06-26T08:20:00.000Z' })
  ];
  const days = core.summarizeDrinkDays(logs, beans);
  const firstKey = core.dateKey('2026-06-25T01:30:00.000Z');
  const secondKey = core.dateKey('2026-06-26T08:20:00.000Z');
  assert.equal(days[firstKey].cups, 2);
  assert.equal(days[firstKey].grams, 30);
  assert.equal(days[firstKey].cost, 14.7);
  assert.equal(days[firstKey].averageRating, 4.5);
  assert.equal(days[secondKey].cost, 0);
});

test('share payloads keep content separate from visual style', () => {
  const bean = core.normalizeBean({
    name: '花魁',
    roaster: '桃源烘焙',
    origin: '埃塞俄比亚',
    process: '日晒',
    roastLevel: '浅烘',
    price: 98,
    initialWeight: 200,
    bagImagePath: 'file:///bag.jpg',
    labelImagePath: 'file:///label.jpg',
    tastingNotes: '花香、柑橘、蜂蜜'
  });
  const beanPayload = core.buildSharePayload('bean', bean, { priceUnit: '100g', includeLabel: false, style: 'receipt' });
  assert.equal(beanPayload.style, 'receipt');
  assert.equal(beanPayload.title, '花魁');
  assert.equal(beanPayload.stats[1].value, '¥49.00 / 100g');
  assert.deepEqual(beanPayload.images.map((image) => image.role), ['bag']);

  const plan = core.normalizeBrewPlan({
    name: '四六法',
    brewMethod: '手冲',
    dose: 20,
    totalWater: 300,
    ratio: '1:15',
    waterTemp: '92°C',
    steps: [{ label: '闷蒸', water: 60, time: '0:00-0:45' }]
  });
  const planPayload = core.buildSharePayload('brewPlan', plan);
  assert.equal(planPayload.title, '四六法');
  assert.equal(planPayload.rows.find((row) => row.label === '粉量').value, '20g');
  assert.equal(planPayload.steps[0].value, '60g · 0:00-0:45');
});

test('calendar share payloads include month selection and year dots', () => {
  const beans = [core.normalizeBean({ id: 'b1', name: '花魁', initialWeight: 200, remainingWeight: 170, price: 98 })];
  const logs = [
    core.normalizeDrinkLog({ id: 'l1', beanId: 'b1', beanName: '花魁', grams: 15, overallRating: 5, brewMethod: '手冲', consumedAt: '2026-06-25T01:30:00.000Z' }),
    core.normalizeDrinkLog({ id: 'l2', beanId: 'b1', beanName: '花魁', grams: 15, overallRating: 4, brewMethod: '手冲', consumedAt: '2026-06-25T08:20:00.000Z' })
  ];
  const days = core.summarizeDrinkDays(logs, beans);
  const selectedDate = core.dateKey('2026-06-25T01:30:00.000Z');
  const monthPayload = core.buildSharePayload('calendar', { view: 'month', date: '2026-06-01T00:00:00.000Z', selectedDate, days });
  assert.equal(monthPayload.type, 'calendarMonth');
  assert.equal(monthPayload.stats[0].value, '30g');
  assert.equal(monthPayload.stats[1].value, '¥14.7');
  assert.equal(monthPayload.logs.length, 2);
  assert.equal(monthPayload.calendar.cells.filter((cell) => cell.selected).length, 1);

  const yearPayload = core.buildSharePayload('calendar', { view: 'year', date: '2026-06-01T00:00:00.000Z', selectedDate, days });
  assert.equal(yearPayload.type, 'calendarYear');
  assert.equal(yearPayload.stats[0].value, '2杯');
  assert.equal(yearPayload.calendar.days[0].level, 2);
});

test('summarize totals active beans and remaining grams', () => {
  const stats = core.summarize([
    core.normalizeBean({ name: 'A', status: '饮用中', remainingWeight: 100 }),
    core.normalizeBean({ name: 'B', status: '未开封', remainingWeight: 250 })
  ]);
  assert.deepEqual(stats, { total: 2, active: 1, remaining: 350 });
});
