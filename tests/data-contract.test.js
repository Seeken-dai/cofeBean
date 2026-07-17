'use strict';

// 跨端数据契约（Web 同步演进 · 阶段 0 冻结）。
// 目的：把 bean / drinkLog / brewPlan / settings 经 normalize* 后的「字段集合、默认值、取值范围」钉死，
// 保证 Android(SQLite) 与未来 Web(IndexedDB) 通过同一套 data-core 产出一致语义，防止两端悄悄分叉。
// 若下列断言因「有意的字段变更」失败：请先同步更新本地 privateDocs/plan/doneThings/2.0.0_DATA_CONTRACT.md、两端存储层与备份/同步逻辑，最后再改本测试。

const test = require('node:test');
const assert = require('node:assert');
const core = require('../www/data-core.js');

function assertKeys(obj, expected, label) {
  assert.deepEqual(Object.keys(obj).sort(), expected.slice().sort(), `${label} 字段集合已变动`);
}

const BEAN_FIELDS = [
  'name', 'roaster', 'origin', 'process', 'roastDate', 'openedDate', 'purchaseDate',
  'purchaseUrl', 'tastingNotes', 'status', 'roastLevel', 'bagImagePath', 'bagCutoutImagePath', 'labelImagePath',
  'initialWeight', 'remainingWeight', 'price', 'bestFlavorDays',
  'favorite', 'id', 'createdAt', 'updatedAt',
  'revision', 'deviceId', 'deletedAt'
];
const DRINK_LOG_FIELDS = [
  'id', 'beanId', 'beanName', 'coffeeType', 'grams', 'brewMethod', 'brewPlanId', 'brewPlanVersion',
  'brewPlanName', 'brewPlanSnapshot', 'photos', 'source', 'cafeName', 'drinkName', 'price', 'location', 'tastingStatus',
  'overallRating', 'notes', 'consumedAt', 'createdAt', 'updatedAt',
  'aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness',
  'revision', 'deviceId', 'deletedAt'
];
const BREW_PLAN_FIELDS = [
  'id', 'name', 'brewMethod', 'version', 'source', 'beanIds', 'steps', 'notes', 'createdAt', 'updatedAt',
  'dose', 'liquid', 'waterTemp', 'grinder', 'grindSetting', 'ratio', 'totalWater',
  'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket', 'targetYield',
  'targetExtractionTime', 'pressTime', 'mokaPotSize', 'useHotWater', 'heatLevel', 'customMethod',
  'revision', 'deviceId', 'deletedAt'
];
const SETTINGS_FIELDS = [
  'quickGrams', 'enableBrewPlans', 'advancedRatings', 'enabledDimensions',
  'lastBrewMethod', 'lastCoffeeType', 'defaultView', 'priceUnit', 'theme', 'showBeanPhotosInList', 'photoJournal', 'flavorReminderDays', 'lowStockCups'
];

test('contract: 各实体字段集合稳定', () => {
  assertKeys(core.normalizeBean({}), BEAN_FIELDS, 'bean');
  assertKeys(core.normalizeDrinkLog({}), DRINK_LOG_FIELDS, 'drinkLog');
  assertKeys(core.normalizeBrewPlan({}), BREW_PLAN_FIELDS, 'brewPlan');
  assertKeys(core.normalizeSettings({}), SETTINGS_FIELDS, 'settings');
});

test('contract: bean 默认值与取值范围', () => {
  const bean = core.normalizeBean({});
  assert.equal(bean.status, '未开封');
  assert.equal(bean.roastLevel, '');
  assert.equal(bean.favorite, false);
  assert.equal(bean.bestFlavorDays, null);
  assert.ok(bean.id && typeof bean.id === 'string');
  assert.ok(bean.createdAt && bean.updatedAt);

  // 枚举字段：非法值回落到默认
  assert.equal(core.normalizeBean({ status: '乱写' }).status, '未开封');
  assert.equal(core.normalizeBean({ roastLevel: '超深烘' }).roastLevel, '');
  assert.equal(core.normalizeBean({ roastLevel: '中深烘' }).roastLevel, '中深烘');

  // favorite 宽松布尔归一
  assert.equal(core.normalizeBean({ favorite: 1 }).favorite, true);
  assert.equal(core.normalizeBean({ favorite: '1' }).favorite, true);
  assert.equal(core.normalizeBean({ favorite: 0 }).favorite, false);

  // bestFlavorDays 夹在 [1, 3650]
  assert.equal(core.normalizeBean({ bestFlavorDays: 5000 }).bestFlavorDays, 3650);
  assert.equal(core.normalizeBean({ bestFlavorDays: 14 }).bestFlavorDays, 14);

  // 文本长度上限（name ≤ 120）
  assert.ok(core.normalizeBean({ name: 'x'.repeat(500) }).name.length <= 120);

  // 传入的 id / 时间戳被保留
  assert.equal(core.normalizeBean({ id: 'keep-me' }).id, 'keep-me');
});

test('contract: drinkLog 默认值与评分范围', () => {
  const log = core.normalizeDrinkLog({});
  assert.equal(log.beanId, null);
  assert.equal(log.beanName, '已删除的咖啡豆');
  assert.equal(log.source, 'bean');
  assert.deepEqual(log.photos, []);
  assert.equal(log.brewMethod, '手冲');
  assert.equal(log.coffeeType, '黑咖');
  assert.equal(log.tastingStatus, 'completed');
  assert.equal(log.overallRating, null);
  assert.equal(log.aroma, null);

  // 评分夹在 [1, 5]，越界或非法为 null
  assert.equal(core.normalizeDrinkLog({ overallRating: 3 }).overallRating, 3);
  assert.equal(core.normalizeDrinkLog({ overallRating: 6 }).overallRating, null);
  assert.equal(core.normalizeDrinkLog({ overallRating: 0 }).overallRating, null);
  assert.equal(core.normalizeDrinkLog({ aroma: 4 }).aroma, 4);
  assert.equal(core.normalizeDrinkLog({ tastingStatus: 'pending' }).tastingStatus, 'pending');
  assert.equal(core.normalizeDrinkLog({ tastingStatus: 'unknown' }).tastingStatus, 'completed');

  // coffeeType 白名单；外饮同样保留类型，不随 source 清零
  assert.equal(core.normalizeDrinkLog({ coffeeType: '奶咖' }).coffeeType, '奶咖');
  assert.equal(core.normalizeDrinkLog({ coffeeType: '乱写' }).coffeeType, '黑咖');
  assert.equal(core.normalizeDrinkLog({ source: 'external', coffeeType: '特调' }).coffeeType, '特调');
  assert.equal(core.hasTastingContent({}), false);
  assert.equal(core.hasTastingContent({ notes: '柑橘' }), true);
  assert.equal(core.hasTastingContent({ photos: ['idb:cup'] }), true);
  assert.equal(core.hasTastingContent({ sweetness: 4 }), true);
  assert.equal(core.resolveTastingStatus({}, { isNew: true }), 'completed', '最简单记录不应产生待评分');
  assert.equal(core.resolveTastingStatus({ brewPlanId: 'p1' }, { isNew: true }), 'pending', '引用方案且评分内容为空时应提醒');
  assert.equal(core.resolveTastingStatus({ brewPlanId: 'p1', notes: '花香' }, { isNew: true }), 'completed');
  assert.equal(core.resolveTastingStatus({}, { forcePending: true }), 'pending', '冲煮辅助强制进入待评分');
  assert.equal(core.resolveTastingStatus({}, { existingStatus: 'pending' }), 'pending');
  assert.equal(core.resolveTastingStatus({}, { completing: true, existingStatus: 'pending' }), 'completed', '允许空白完成评分');

  const external = core.normalizeDrinkLog({ source: 'external', beanId: 'b1', grams: 18, brewMethod: '手冲', cafeName: '街角店', drinkName: 'Flat White', price: 28, photos: ['a', 'b', 'c', 'd'] });
  assert.equal(external.beanId, null);
  assert.equal(external.grams, 0);
  assert.equal(external.brewMethod, '');
  assert.equal(external.beanName, 'Flat White');
  assert.deepEqual(external.photos, ['a', 'b', 'c']);
});

test('contract: brewPlan 默认值、beanIds 去重、totalWater 推导', () => {
  const plan = core.normalizeBrewPlan({});
  assert.equal(plan.name, '未命名方案');
  assert.equal(plan.brewMethod, '手冲');
  assert.equal(plan.version, 1);
  assert.equal(plan.source, 'user');
  assert.deepEqual(plan.beanIds, []);
  assert.deepEqual(plan.steps, []);

  // version 最小为 1；source 非法回落 user
  assert.equal(core.normalizeBrewPlan({ version: 0 }).version, 1);
  assert.equal(core.normalizeBrewPlan({ version: 5 }).version, 5);
  assert.equal(core.normalizeBrewPlan({ source: '乱写' }).source, 'user');
  assert.equal(core.normalizeBrewPlan({ source: 'preset' }).source, 'preset');

  // beanIds 去重并清掉空值
  assert.deepEqual(core.normalizeBrewPlan({ beanIds: ['a', 'a', '', 'b'] }).beanIds, ['a', 'b']);

  // 有 dose+ratio、缺 totalWater 时推导
  assert.equal(core.normalizeBrewPlan({ dose: 20, ratio: '1:15' }).totalWater, 300);
});

test('contract: settings 默认值与取值范围', () => {
  const s = core.normalizeSettings({});
  assert.equal(s.quickGrams, 15);
  assert.equal(s.enableBrewPlans, false);
  assert.equal(s.priceUnit, 'g');
  assert.equal(s.theme, 'dark-roast');
  assert.equal(s.showBeanPhotosInList, false);
  assert.equal(s.photoJournal, false);
  assert.equal(s.flavorReminderDays, 7);
  assert.equal(s.lowStockCups, 4);
  assert.deepEqual(s.enabledDimensions, ['aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness']);

  // 范围夹取
  assert.equal(core.normalizeSettings({ quickGrams: 500 }).quickGrams, 100);
  assert.equal(core.normalizeSettings({ quickGrams: 0 }).quickGrams, 1);
  assert.equal(core.normalizeSettings({ flavorReminderDays: 100 }).flavorReminderDays, 60);
  assert.equal(core.normalizeSettings({ lowStockCups: 50 }).lowStockCups, 20);

  // 枚举白名单
  assert.equal(core.normalizeSettings({ priceUnit: '两' }).priceUnit, 'g');
  assert.equal(core.normalizeSettings({ theme: '彩虹' }).theme, 'dark-roast');
  assert.equal(core.normalizeSettings({ priceUnit: 'jin' }).priceUnit, 'jin');
  assert.equal(core.normalizeSettings({ defaultView: '方案库' }).defaultView, 'beans');
  assert.equal(core.normalizeSettings({ defaultView: 'drinks' }).defaultView, 'drinks');
  assert.equal(core.normalizeSettings({ lastCoffeeType: '乱写' }).lastCoffeeType, '黑咖');
  assert.equal(core.normalizeSettings({ lastCoffeeType: '特调' }).lastCoffeeType, '特调');
  assert.equal(core.normalizeSettings({ showBeanPhotosInList: '1' }).showBeanPhotosInList, true);
  assert.equal(core.normalizeSettings({ photoJournal: '1' }).photoJournal, true);

  // enabledDimensions 过滤非法维度
  assert.deepEqual(core.normalizeSettings({ enabledDimensions: ['aroma', '假维度'] }).enabledDimensions, ['aroma']);
});

test('contract: 同步元字段默认值与携带（阶段 4）', () => {
  ['normalizeBean', 'normalizeDrinkLog', 'normalizeBrewPlan'].forEach((fn) => {
    const r = core[fn]({});
    assert.equal(r.deletedAt, null, `${fn} deletedAt 默认 null`);
    assert.equal(r.revision, 1, `${fn} revision 默认 1`);
    assert.equal(r.deviceId, '', `${fn} deviceId 默认 ''`);
  });
  // 传入值被携带；revision 至少为 1
  assert.equal(core.normalizeBean({ revision: 5 }).revision, 5);
  assert.equal(core.normalizeBean({ revision: 0 }).revision, 1);
  assert.equal(core.normalizeBean({ deviceId: 'dev-1' }).deviceId, 'dev-1');
  assert.equal(core.normalizeBean({ deletedAt: '2026-07-01T00:00:00.000Z' }).deletedAt, '2026-07-01T00:00:00.000Z');
});

test('contract: 备份 exportScope 白名单（经公开 createBackup）', () => {
  const scopeOf = (scope) => core.createBackup([], [], {}, '2026-01-01T00:00:00.000Z', [], { scope }).exportScope;
  assert.equal(scopeOf('乱写'), 'all');
  assert.equal(scopeOf('library'), 'library');
  assert.equal(scopeOf('brewPlans'), 'brewPlans');
});
