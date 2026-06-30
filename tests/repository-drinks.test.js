const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../www/data-core.js');

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)) };
}

function loadRepository() {
  global.localStorage = memoryStorage();
  global.window = { BeanCore: core };
  const modulePath = path.resolve(__dirname, '../www/repository.js');
  delete require.cache[modulePath];
  require(modulePath);
  return global.window.BeanRepository;
}

test('drink save, edit and delete adjust inventory atomically in web fallback', async () => {
  const repo = loadRepository();
  const bean = core.normalizeBean({ id: 'bean-one', name: '豆一', initialWeight: 100, remainingWeight: 100, bestFlavorDays: 28 });
  await repo.save(bean);
  assert.equal((await repo.getAll())[0].bestFlavorDays, 28);
  const log = await repo.saveDrinkLog({ beanId: bean.id, beanName: bean.name, grams: 15, brewMethod: '手冲' });
  let current = (await repo.getAll())[0];
  assert.equal(current.remainingWeight, 85);
  assert.equal(current.status, '饮用中');
  await repo.saveDrinkLog({ ...log, grams: 20 });
  current = (await repo.getAll())[0];
  assert.equal(current.remainingWeight, 80);
  await repo.deleteDrinkLog(log.id);
  current = (await repo.getAll())[0];
  assert.equal(current.remainingWeight, 100);
  assert.equal((await repo.getDrinkLogs()).length, 0);
  delete global.window; delete global.localStorage;
});

test('insufficient inventory rolls back and deleting bean preserves snapshot history', async () => {
  const repo = loadRepository();
  const bean = core.normalizeBean({ id: 'bean-two', name: '豆二', initialWeight: 10, remainingWeight: 10 });
  await repo.save(bean);
  await assert.rejects(repo.saveDrinkLog({ beanId: bean.id, beanName: bean.name, grams: 11 }), /超过剩余/);
  assert.equal((await repo.getDrinkLogs()).length, 0);
  const log = await repo.saveDrinkLog({ beanId: bean.id, beanName: bean.name, grams: 10 });
  assert.equal((await repo.getAll())[0].status, '已喝完');
  await repo.remove(bean.id);
  const kept = (await repo.getDrinkLogs())[0];
  assert.equal(kept.id, log.id);
  assert.equal(kept.beanId, null);
  assert.equal(kept.beanName, '豆二');
  delete global.window; delete global.localStorage;
});

test('brew plans save, copy, bind and snapshot drink history in web fallback', async () => {
  const repo = loadRepository();
  const bean = core.normalizeBean({ id: 'bean-plan', name: '方案豆', initialWeight: 100, remainingWeight: 100 });
  await repo.save(bean);
  const plan = await repo.saveBrewPlan({ name: '三段式测试', brewMethod: '手冲', dose: 15, ratio: '1:15', beanIds: [bean.id] });
  assert.equal(plan.version, 1);
  const edited = await repo.saveBrewPlan({ ...plan, waterTemp: '92°C' });
  assert.equal(edited.version, 2);
  const copy = await repo.duplicateBrewPlan(edited.id);
  assert.equal(copy.version, 1);
  assert.match(copy.name, /副本/);
  const log = await repo.saveDrinkLog({ beanId: bean.id, beanName: bean.name, grams: 15, brewMethod: edited.brewMethod, brewPlanId: edited.id, brewPlanVersion: edited.version, brewPlanName: edited.name, brewPlanSnapshot: core.planSnapshot(edited) });
  await repo.saveBrewPlan({ ...edited, waterTemp: '94°C' });
  const kept = (await repo.getDrinkLogs())[0];
  assert.equal(kept.id, log.id);
  assert.equal(kept.brewPlanSnapshot.waterTemp, '92°C');
  await repo.deleteBrewPlan(edited.id);
  const unlinked = (await repo.getDrinkLogs())[0];
  assert.equal(unlinked.brewPlanId, null);
  assert.equal(unlinked.brewPlanSnapshot.waterTemp, '92°C');
  await repo.remove(bean.id);
  const plans = await repo.getBrewPlans();
  assert.equal(plans.some((item) => item.id === edited.id), false);
  assert.equal(plans.find((item) => item.id === copy.id).beanIds.includes(bean.id), false);
  delete global.window; delete global.localStorage;
});

test('library import replaces beans and drinks but preserves brew plans', async () => {
  const repo = loadRepository();
  const oldBean = core.normalizeBean({ id: 'old-bean', name: '旧豆', initialWeight: 100, remainingWeight: 100 });
  await repo.save(oldBean);
  await repo.saveDrinkLog({ beanId: oldBean.id, beanName: oldBean.name, grams: 12 });
  const plan = await repo.saveBrewPlan({ id: 'kept-plan', name: '保留方案', brewMethod: '手冲', beanIds: [oldBean.id] });
  await repo.saveSettings({ theme: 'frost', quickGrams: 22 });
  const newBean = core.normalizeBean({ id: 'new-bean', name: '新豆', initialWeight: 200, remainingWeight: 200 });
  const newLog = core.normalizeDrinkLog({ id: 'new-log', beanId: newBean.id, beanName: newBean.name, grams: 18 });
  const imported = core.validateImport(core.createBackup([newBean], [newLog], { theme: 'blaze', quickGrams: 8 }, '2026-01-01T00:00:00.000Z', [], { scope: 'library' }));
  await repo.importData(imported, 'replace');
  assert.deepEqual((await repo.getAll()).map((bean) => bean.id), ['new-bean']);
  assert.deepEqual((await repo.getDrinkLogs()).map((log) => log.id), ['new-log']);
  const plans = await repo.getBrewPlans();
  assert.equal(plans.some((item) => item.id === plan.id), true);
  assert.deepEqual(plans.find((item) => item.id === plan.id).beanIds, []);
  assert.equal((await repo.getSettings()).theme, 'frost');
  delete global.window; delete global.localStorage;
});

test('brew plan import replaces plans but keeps library data', async () => {
  const repo = loadRepository();
  const bean = core.normalizeBean({ id: 'bean-keep', name: '保留豆', initialWeight: 100, remainingWeight: 100 });
  await repo.save(bean);
  await repo.saveDrinkLog({ id: 'log-keep', beanId: bean.id, beanName: bean.name, grams: 16 });
  const oldPlan = await repo.saveBrewPlan({ id: 'old-plan', name: '旧方案', brewMethod: '手冲', beanIds: [bean.id] });
  const newPlan = core.normalizeBrewPlan({ id: 'new-plan', name: '新方案', brewMethod: '冰滴', beanIds: [bean.id] });
  const imported = core.validateImport(core.createBackup([], [], null, '2026-01-01T00:00:00.000Z', [newPlan], { scope: 'brewPlans' }));
  await repo.importData(imported, 'replace');
  assert.deepEqual((await repo.getAll()).map((item) => item.id), ['bean-keep']);
  assert.deepEqual((await repo.getDrinkLogs()).map((item) => item.id), ['log-keep']);
  const plans = await repo.getBrewPlans();
  assert.equal(plans.some((item) => item.id === oldPlan.id), false);
  assert.equal(plans.some((item) => item.id === 'new-plan'), true);
  assert.equal(plans.some((item) => item.source === 'preset'), true);
  delete global.window; delete global.localStorage;
});

test('merge import keeps newer records and preset plans', async () => {
  const repo = loadRepository();
  const older = core.normalizeBean({ id: 'same-bean', name: '旧名', updatedAt: '2026-01-01T00:00:00.000Z' }, '2026-01-01T00:00:00.000Z');
  await repo.replaceAllData([older], [], { theme: 'dark-roast' }, []);
  const newer = core.normalizeBean({ id: 'same-bean', name: '新名', updatedAt: '2026-02-01T00:00:00.000Z' }, '2026-02-01T00:00:00.000Z');
  const importedPlan = core.normalizeBrewPlan({ id: 'merge-plan', name: '合并方案', brewMethod: '手冲', updatedAt: '2026-02-01T00:00:00.000Z' }, '2026-02-01T00:00:00.000Z');
  const imported = core.validateImport(core.createBackup([newer], [], { theme: 'obsidian' }, '2026-02-01T00:00:00.000Z', [importedPlan]));
  await repo.importData(imported, 'merge');
  assert.equal((await repo.getAll())[0].name, '新名');
  assert.equal((await repo.getSettings()).theme, 'obsidian');
  const plans = await repo.getBrewPlans();
  assert.equal(plans.some((item) => item.id === 'merge-plan'), true);
  assert.equal(plans.some((item) => item.source === 'preset'), true);
  delete global.window; delete global.localStorage;
});
