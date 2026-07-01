'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../www/data-core.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

async function loadRepository(storage) {
  global.localStorage = storage || memoryStorage();
  global.window = { BeanCore: core };
  const modulePath = path.resolve(__dirname, '../www/repository.js');
  delete require.cache[modulePath];
  require(modulePath);
  const repo = global.window.BeanRepository;
  await repo.init();
  return repo;
}

function cleanupRepository() {
  delete global.window;
  delete global.localStorage;
}

const PUBLIC_METHODS = [
  'deleteBrewPlan', 'deleteDrinkLog', 'deleteSmartValue', 'deleteWebImage',
  'duplicateBrewPlan', 'getAll', 'getBrewPlans', 'getDrinkLogs', 'getSettings',
  'getWebImage', 'importData', 'init', 'isNative', 'legacyData', 'remove',
  'renameSmartValue', 'replaceAll', 'replaceAllData', 'save', 'saveBrewPlan',
  'saveDrinkLog', 'saveSettings', 'saveWebImage', 'smartValues'
];

test('repository contract: public interface remains stable', async () => {
  const repo = await loadRepository();
  assert.deepEqual(Object.keys(repo).sort(), PUBLIC_METHODS);
  assert.equal(repo.isNative(), false);
  cleanupRepository();
});

test('repository contract: web adapter normalizes writes and persists across reload', async () => {
  const storage = memoryStorage();
  let repo = await loadRepository(storage);

  const saved = await repo.save({
    id: 'contract-bean',
    name: '契约豆',
    status: '乱写',
    favorite: '1',
    bestFlavorDays: 5000,
    initialWeight: '200',
    remainingWeight: '180'
  });
  await repo.saveSettings({ quickGrams: 0, theme: 'frost', priceUnit: 'jin' });

  assert.equal(saved.status, '未开封');
  assert.equal(saved.favorite, true);
  assert.equal(saved.bestFlavorDays, 3650);

  cleanupRepository();
  repo = await loadRepository(storage);

  const [bean] = await repo.getAll();
  const settings = await repo.getSettings();
  assert.equal(bean.id, 'contract-bean');
  assert.equal(bean.status, '未开封');
  assert.equal(bean.favorite, true);
  assert.equal(bean.bestFlavorDays, 3650);
  assert.equal(bean.initialWeight, 200);
  assert.equal(bean.remainingWeight, 180);
  assert.equal(settings.quickGrams, 1);
  assert.equal(settings.theme, 'frost');
  assert.equal(settings.priceUnit, 'jin');
  cleanupRepository();
});

test('repository contract: smart values update through the repository boundary', async () => {
  const repo = await loadRepository();
  await repo.replaceAllData([
    core.normalizeBean({ id: 'bean-a', name: 'A', roaster: '旧烘焙商', origin: '云南' }),
    core.normalizeBean({ id: 'bean-b', name: 'B', roaster: '旧烘焙商', process: '水洗' })
  ], [], core.normalizeSettings({}), []);

  assert.deepEqual(await repo.smartValues('roaster'), ['旧烘焙商']);
  await repo.renameSmartValue('roaster', '旧烘焙商', '新烘焙商');
  assert.deepEqual(await repo.smartValues('roaster'), ['新烘焙商']);
  await repo.deleteSmartValue('roaster', '新烘焙商');
  assert.deepEqual(await repo.smartValues('roaster'), []);

  const beans = await repo.getAll();
  assert.equal(beans.every((bean) => bean.roaster === ''), true);
  cleanupRepository();
});
