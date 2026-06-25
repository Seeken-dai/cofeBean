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

test('filterAndSort searches multiple fields and sorts remaining weight', () => {
  const beans = [
    core.normalizeBean({ name: 'A', origin: '埃塞俄比亚', remainingWeight: 80, status: '饮用中' }),
    core.normalizeBean({ name: 'B', origin: '哥伦比亚', remainingWeight: 120, status: '未开封' })
  ];
  assert.equal(core.filterAndSort(beans, { query: '埃塞' }).length, 1);
  assert.equal(core.filterAndSort(beans, { sort: 'remainingWeight', direction: 'desc' })[0].name, 'B');
});

test('backup round trip validates schema and duplicate ids', () => {
  const beans = [core.normalizeBean({ id: 'one', name: '豆一', labelImagePath: 'file:///label.jpg' })];
  const logs = [core.normalizeDrinkLog({ id: 'cup-one', beanId: 'one', beanName: '豆一', grams: 15, brewMethod: '手冲' })];
  const backup = core.createBackup(beans, logs, { quickGrams: 18 }, '2026-01-01T00:00:00.000Z');
  const imported = core.validateImport(backup);
  assert.equal(imported.beans[0].name, '豆一');
  assert.equal(imported.beans[0].labelImagePath, 'file:///label.jpg');
  assert.equal(imported.drinkLogs[0].grams, 15);
  assert.equal(imported.settings.quickGrams, 18);
  const legacy = core.validateImport({ schemaVersion: 1, beans });
  assert.equal(legacy.beans.length, 1);
  assert.deepEqual(legacy.drinkLogs, []);
  assert.throws(() => core.validateImport({ schemaVersion: 99, beans: [] }), /备份版本/);
  assert.throws(() => core.validateImport({ schemaVersion: 1, beans: [{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }] }), /重复/);
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
  assert.deepEqual(settings.enabledDimensions, ['aroma']);
  assert.equal(core.normalizeSettings({ priceUnit: 'bad' }).priceUnit, 'g');
});

test('summarize totals active beans and remaining grams', () => {
  const stats = core.summarize([
    core.normalizeBean({ name: 'A', status: '饮用中', remainingWeight: 100 }),
    core.normalizeBean({ name: 'B', status: '未开封', remainingWeight: 250 })
  ]);
  assert.deepEqual(stats, { total: 2, active: 1, remaining: 350 });
});
