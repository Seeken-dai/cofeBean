const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const pkg = require('../package.json');

test('normalizeBean applies safe defaults and numeric bounds', () => {
  const bean = core.normalizeBean({ name: '  花魁  ', status: '未知', remainingWeight: '-2', favorite: '1', bagImagePath: ' file:///bag.jpg ' }, '2026-01-01T00:00:00.000Z');
  assert.equal(bean.name, '花魁');
  assert.equal(bean.status, '未开封');
  assert.equal(bean.remainingWeight, null);
  assert.equal(bean.favorite, true);
  assert.equal(bean.bagImagePath, 'file:///bag.jpg');
});

test('normalizeBean extracts generic purchase urls from links and share text', () => {
  assert.equal(core.normalizeBean({ name: '自营豆', purchaseUrl: 'https://shop.example.com/coffee?id=1' }).purchaseUrl, 'https://shop.example.com/coffee?id=1');
  assert.equal(core.normalizeBean({ name: '京东豆', purchaseUrl: '京东：[https://3.cn/2U0-jewC?jkl=@F0P4h3F9xmY@](https://3.cn/2U0-jewC?jkl=@F0P4h3F9xmY@) CZ154' }).purchaseUrl, 'https://3.cn/2U0-jewC?jkl=@F0P4h3F9xmY@');
  assert.equal(core.normalizeBean({ name: '拼多多豆', purchaseUrl: '拼多多：https://mobile.yangkeduo.com/goods2.html?ps=mg0SHbTJVw' }).purchaseUrl, 'https://mobile.yangkeduo.com/goods2.html?ps=mg0SHbTJVw');
  assert.equal(core.normalizeBean({ name: '淘宝豆', purchaseUrl: '27₤CcJbg93PSFV£ https://m.tb.cn/h.RuBrt5H MF278' }).purchaseUrl, 'https://m.tb.cn/h.RuBrt5H');
  assert.equal(core.normalizeBean({ name: '口令豆', purchaseUrl: '复制口令打开' }).purchaseUrl, '');
  assert.equal(core.normalizeBean({ name: '私有协议豆', purchaseUrl: 'taobao://item?id=1' }).purchaseUrl, '');
});

test('app version comparison handles semantic versions and invalid inputs safely', () => {
  assert.equal(core.isAppVersionNewer('2.1.4', '2.1.3'), true);
  assert.equal(core.isAppVersionNewer('2.1.10', '2.1.9'), true);
  assert.equal(core.isAppVersionNewer('2.1.4', '2.1.4'), false);
  assert.equal(core.isAppVersionNewer('v2.1.4', '2.1.4'), false);
  assert.equal(core.isAppVersionNewer('2.1.0', '2.1'), false);
  assert.equal(core.isAppVersionNewer('2.1.3', '2.1.4'), false);
  assert.equal(core.compareAppVersions('bad', '2.1.4'), null);
  assert.equal(core.isAppVersionNewer('2.1.4', 'bad'), false);
});

test('selectReleaseApkAsset prefers release apk and ignores debug artifacts', () => {
  const picked = core.selectReleaseApkAsset([
    { name: 'cofebean-v2.1.4-debug.apk', browser_download_url: 'https://example.com/debug.apk', size: 10 },
    { name: 'cofebean-v2.1.4-universal.apk', browser_download_url: 'https://example.com/universal.apk', size: 20 },
    { name: 'cofebean-v2.1.4-release.apk', browser_download_url: 'https://example.com/release.apk', size: 73400320 },
    { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt', size: 5 }
  ]);
  assert.deepEqual(picked, { name: 'cofebean-v2.1.4-release.apk', url: 'https://example.com/release.apk', size: 73400320 });
  assert.equal(core.selectReleaseApkAsset([{ name: 'only-debug.apk', browser_download_url: 'https://example.com/debug.apk' }]), null);
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
  const beans = [core.normalizeBean({ id: 'one', name: '豆一', labelImagePath: 'file:///label.jpg', purchaseUrl: 'https://shop.example.com/beans/one' })];
  const logs = [core.normalizeDrinkLog({ id: 'cup-one', beanId: 'one', beanName: '豆一', grams: 15, brewMethod: '手冲' })];
  const plans = [core.normalizeBrewPlan({ id: 'plan-one', name: '三段式', brewMethod: '手冲', beanIds: ['one'], dose: 15 })];
  const backup = core.createBackup(beans, logs, { quickGrams: 18 }, '2026-01-01T00:00:00.000Z', plans);
  const imported = core.validateImport(backup);
  assert.equal(backup.appVersion, pkg.version);
  assert.equal(backup.schemaVersion, 6);
  assert.equal(imported.exportScope, 'all');
  assert.equal(imported.beans[0].name, '豆一');
  assert.equal(imported.beans[0].labelImagePath, 'file:///label.jpg');
  assert.equal(imported.beans[0].purchaseUrl, 'https://shop.example.com/beans/one');
  assert.equal(imported.drinkLogs[0].grams, 15);
  assert.equal(imported.brewPlans[0].name, '三段式');
  assert.equal(imported.settings.quickGrams, 18);
  const legacy = core.validateImport({ schemaVersion: 1, beans });
  assert.equal(legacy.beans.length, 1);
  assert.equal(core.validateImport({ schemaVersion: 1, beans: [{ id: 'legacy', name: '旧豆' }] }).beans[0].purchaseUrl, '');
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

test('bean best flavor days and in-app reminders are normalized', () => {
  const bean = core.normalizeBean({ id: 'fresh', name: '新豆', openedDate: '2026-06-01', bestFlavorDays: 30, remainingWeight: 50, status: '饮用中' });
  assert.equal(bean.bestFlavorDays, 30);
  assert.equal(core.bestFlavorDaysLeft(bean, '2026-06-24T12:00:00.000Z'), 7);
  const reminders = core.beanReminders([bean], { quickGrams: 15, flavorReminderDays: 7, lowStockCups: 4 }, '2026-06-24T12:00:00.000Z');
  assert.deepEqual(reminders.map((item) => item.type), ['flavor', 'stock']);
  assert.equal(reminders[0].message, '最佳赏味期还有 7 天');
  assert.equal(core.normalizeSettings({ flavorReminderDays: 99, lowStockCups: 0 }).flavorReminderDays, 60);
  assert.equal(core.normalizeSettings({ flavorReminderDays: 99, lowStockCups: 0 }).lowStockCups, 1);
});

test('backup can include bean images when requested', () => {
  const beans = [core.normalizeBean({ id: 'image-bean', name: '图片豆', bagImagePath: 'file:///bag.jpg' })];
  const beanImages = { 'image-bean': { bag: { data: 'abc', extension: '.jpg', mimeType: 'image/jpeg' } } };
  const backup = core.createBackup(beans, [], {}, '2026-01-01T00:00:00.000Z', [], { scope: 'library', beanImages });
  assert.deepEqual(backup.beanImages, beanImages);
  const imported = core.validateImport(backup);
  assert.equal(imported.beanImages['image-bean'].bag.data, 'abc');
});

test('drink logs support external records and photos', () => {
  const external = core.normalizeDrinkLog({
    source: 'external',
    beanId: 'bean-ignored',
    beanName: '旧快照',
    grams: 18,
    brewMethod: '手冲',
    cafeName: '小巷咖啡',
    drinkName: 'Dirty',
    price: 32.567,
    location: '上海',
    photos: JSON.stringify(['file:///1.webp', 'idb:2', '', 'r2:3', 'too-many'])
  });
  assert.equal(external.source, 'external');
  assert.equal(external.beanId, null);
  assert.equal(external.grams, 0);
  assert.equal(external.brewMethod, '');
  assert.equal(external.beanName, 'Dirty');
  assert.deepEqual(external.photos, ['file:///1.webp', 'idb:2', 'r2:3']);
  assert.equal(core.estimateDrinkCost(external, []), 32.57);

  const imported = core.validateImport(core.createBackup([], [external], {}, '2026-01-01T00:00:00.000Z', [], { scope: 'library', drinkImages: { [external.id]: [{ data: 'abc', extension: '.webp', mimeType: 'image/webp' }] } }));
  assert.equal(imported.drinkLogs[0].source, 'external');
  assert.equal(imported.drinkImages[external.id][0].data, 'abc');
  assert.throws(() => core.validateImport({ schemaVersion: 6, beans: [], drinkLogs: [{ id: 'bad', source: 'bean', grams: 0 }] }), /克数/);
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
  // 小数秒不取整判定：29.6s 仍属第 1 段（圆环平滑填满），不提前切段造成跳切。
  assert.equal(core.brewAssistStatus(steps, 29.6).index, 0);
  assert.equal(core.brewAssistStatus(steps, 30.4).current.label, '连续注水');
  assert.equal(core.brewAssistStatus(steps, 109.9).phase, 'running');
  assert.equal(core.brewAssistStatus(steps, 29.6).elapsed, 30);
});

test('brew assist reports gap phase between non-contiguous stages', () => {
  const steps = core.prepareBrewAssistSteps([
    { label: '闷蒸', water: 30, startTime: '0:10', endTime: '0:40' },
    { label: '注水', water: 200, startTime: '1:00', endTime: '1:40' }
  ]);
  // 前置空档：0–10s
  const lead = core.brewAssistStatus(steps, 5);
  assert.equal(lead.phase, 'gap');
  assert.equal(lead.index, -1);
  assert.equal(lead.gapStart, 0);
  assert.equal(lead.gapEnd, 10);
  assert.equal(lead.next.label, '闷蒸');
  // 段间空档：40–60s
  const mid = core.brewAssistStatus(steps, 50);
  assert.equal(mid.phase, 'gap');
  assert.equal(mid.index, 0);
  assert.equal(mid.current.label, '闷蒸');
  assert.equal(mid.next.label, '注水');
  assert.equal(mid.gapStart, 40);
  assert.equal(mid.gapEnd, 60);
  // 段内仍为 running
  assert.equal(core.brewAssistStatus(steps, 20).phase, 'running');
  assert.equal(core.brewAssistStatus(steps, 70).current.label, '注水');
});

test('resolveOpenedDate backfills only when opened date is empty', () => {
  assert.equal(core.resolveOpenedDate({ openedDate: '' }, { consumedAt: '2026-07-04 08:30' }), '2026-07-04');
  assert.equal(core.resolveOpenedDate({ openedDate: '2026-01-01' }, { consumedAt: '2026-07-04 08:30' }), '2026-01-01');
  assert.equal(core.resolveOpenedDate({}, { consumedAt: '2026-07-04T08:30:00.000Z' }), '2026-07-04');
  assert.equal(core.resolveOpenedDate({}, {}), '');
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

test('encode/decode plan share round trips a full plan and strips local-only fields', () => {
  const plan = core.normalizeBrewPlan({
    id: 'plan-huakui-v60', name: '花魁 V60 三段式', brewMethod: '手冲', source: 'user',
    dose: 15, ratio: '1:15', totalWater: 225, waterTemp: '92°C', grinder: 'C40', grindSetting: '22 格',
    targetDuration: '2:30', notes: '不应进入分享码的长备注', beanIds: ['bean-huakui'],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
    steps: [
      { label: '闷蒸', water: 30, startTime: '0:00', endTime: '0:30' },
      { label: '第 1 段', water: 100, startTime: '0:30', endTime: '1:00' },
      { label: '结束萃取', water: 0, startTime: '2:00', endTime: '2:30' }
    ]
  });
  const code = core.encodePlanShare(plan);
  assert.ok(code.startsWith('DC1-'));
  const decoded = core.decodePlanShare(code);
  assert.equal(decoded.name, '花魁 V60 三段式');
  assert.equal(decoded.brewMethod, '手冲');
  assert.equal(decoded.dose, 15);
  assert.equal(decoded.grindSetting, '22 格');
  assert.equal(decoded.steps.length, 3);
  assert.equal(decoded.steps[0].label, '闷蒸');
  assert.equal(decoded.steps[2].startTime, '2:00');
  // 本机私有字段不得通过分享码迁移
  assert.notEqual(decoded.id, 'plan-huakui-v60');
  assert.deepEqual(decoded.beanIds, []);
  assert.notEqual(decoded.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(decoded.source, 'user');
});

test('decodePlanShare rejects malformed, truncated, and empty codes', () => {
  assert.throws(() => core.decodePlanShare('hello'), /有效的豆仓分享码/);
  assert.throws(() => core.decodePlanShare('DC1-abc'), /不完整或已损坏/);
  const good = core.encodePlanShare(core.normalizeBrewPlan({ name: '测试', brewMethod: '手冲' }));
  assert.throws(() => core.decodePlanShare(good.slice(0, good.length - 3)), /不完整或已损坏/);
  // 篡改 base64 正文，校验位不符
  assert.throws(() => core.decodePlanShare(good + 'XX'), /不完整或已损坏/);
});

test('decodePlanShare rejects a well-formed code that carries no known plan fields', () => {
  // 复刻实现里的 crc32，构造「校验位正确但只含未知字段」的码，验证不会兜底成空方案
  const crc32Hex = (text) => {
    let crc = 0xffffffff;
    for (let i = 0; i < text.length; i += 1) {
      crc ^= text.charCodeAt(i) & 0xff;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  };
  const body = Buffer.from(JSON.stringify({ zz: 1, qq: '未知' })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.throws(() => core.decodePlanShare('DC1-' + crc32Hex(body) + body), /没有有效的方案/);
});

test('decodePlanShare ignores unknown fields but keeps a valid plan', () => {
  const code = core.encodePlanShare(core.normalizeBrewPlan({ name: '兼容测试', brewMethod: '冷萃', dose: 20 }));
  const decoded = core.decodePlanShare(code);
  assert.equal(decoded.name, '兼容测试');
  assert.equal(decoded.brewMethod, '冷萃');
  assert.equal(decoded.dose, 20);
});
