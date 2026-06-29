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
  const bean = core.normalizeBean({ id: 'bean-one', name: '豆一', initialWeight: 100, remainingWeight: 100 });
  await repo.save(bean);
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
