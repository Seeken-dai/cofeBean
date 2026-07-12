'use strict';

// app.js 拆分第三批模块的 Node 测试(冲煮辅助/备份/更新检查)。
// 用真 BeanCore + 假 DOM/插件驱动,覆盖入口守卫、状态机与用户交互分支。

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const fmt = require('../www/app-format.js');
const brewAssist = require('../www/app-brew-assist.js');
const backup = require('../www/app-backup.js');
const update = require('../www/app-update.js');

function fakeElement() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, checked: false,
    dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} },
    setAttribute() {}, click() {}, focus() {}
  };
}
function fakeDom() {
  const nodes = new Map();
  const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, fakeElement()); return nodes.get(selector); };
  return { $, nodes };
}

// ---- app-brew-assist ----

function createAssist(overrides) {
  const { $ } = fakeDom();
  const state = { brewAssist: null, beans: [], brewPlans: [], viewingPlanId: null };
  const toasts = [];
  const deps = {
    $, $$: () => [], state, els: { drink: {}, planDetail: {}, brewAssist: {}, drinkForm: {} }, core,
    toast: (message) => toasts.push(message),
    setDialog: () => {}, esc: fmt.esc, formatWeight: fmt.formatWeight, durationText: fmt.durationText,
    setDurationControl: () => {}, syncRatioValue: () => {}, syncDurationField: () => {},
    currentDrinkMethod: () => '手冲', selectedDrinkPlan: () => null, drinkParamSnapshot: () => null, openPlanDetail: () => {},
    ...overrides
  };
  return { api: brewAssist.create(deps), state, toasts, $ };
}

test('brew-assist: create 校验依赖', () => {
  assert.throws(() => brewAssist.create({}), /缺少依赖/);
});

test('brew-assist: assistClock 分:秒换算', () => {
  const { api } = createAssist();
  assert.equal(api.assistClock(0), '00:00');
  assert.equal(api.assistClock(65), '01:05');
  assert.equal(api.assistClock(-5), '00:00');
  assert.equal(api.assistClock('x'), '00:00');
});

test('brew-assist: assistElapsed 完成/暂停/运行三种语义', () => {
  const { api, state } = createAssist();
  assert.equal(api.assistElapsed(), 0);
  state.brewAssist = { completed: true, completedElapsed: 42 };
  assert.equal(api.assistElapsed(), 42);
  state.brewAssist = { completed: false, paused: true, elapsed: 10, startedAt: Date.now() - 5000 };
  assert.equal(api.assistElapsed(), 10);
  state.brewAssist = { completed: false, paused: false, elapsed: 10, startedAt: Date.now() - 2000 };
  const running = api.assistElapsed();
  assert.ok(running > 11.5 && running < 13, `运行中应累计墙钟时间,得到 ${running}`);
});

test('brew-assist: 非手冲方案与无分段方案被入口拦下', () => {
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  try {
    const espresso = createAssist({ currentDrinkMethod: () => '意式' });
    espresso.api.openDrinkBrewAssist(); // 喝一杯入口先按当前冲煮方式拦截
    assert.equal(espresso.toasts[0], '第一版冲煮辅助仅支持手冲');
    const { api, state, toasts } = createAssist({ drinkParamSnapshot: () => ({ brewMethod: '手冲', steps: [] }) });
    api.openDrinkBrewAssist(); // 手冲但没有可计时步骤
    assert.equal(toasts[0], '这个方案还没有可计时的分段步骤');
    assert.equal(state.brewAssist, null);
  } finally { delete global.requestAnimationFrame; delete global.cancelAnimationFrame; }
});

test('brew-assist: 手冲含分段 → 建立进行态并进入 ready 阶段', () => {
  // Node 20+ 自带只读 navigator(无 wakeLock),requestWakeLock 的特性检测会安全跳过。
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  try {
    const plan = { brewMethod: '手冲', name: '测试方案', steps: [{ label: '闷蒸', water: 30, startTime: '0:00', endTime: '0:30' }, { label: '绕圈注水', water: 120, startTime: '0:45', endTime: '1:30' }] };
    const { api, state } = createAssist({ drinkParamSnapshot: () => plan });
    api.openDrinkBrewAssist();
    assert.ok(state.brewAssist, '应建立 brewAssist 进行态');
    assert.equal(state.brewAssist.phase, 'ready');
    assert.equal(state.brewAssist.steps.length, 2);
    api.pauseBrewAssist(); // ready → countdown
    assert.equal(state.brewAssist.phase, 'countdown');
    api.cancelBrewAssist();
    assert.equal(state.brewAssist, null);
  } finally { delete global.requestAnimationFrame; delete global.cancelAnimationFrame; }
});

test('brew-assist: 点结束后自动保存，并在同一完成页选择评分或先去喝', async () => {
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  try {
    const saved = [];
    const plan = { brewMethod: '手冲', name: '测试方案', steps: [{ label: '注水', water: 225, startTime: '0:00', endTime: '1:30' }] };
    const { api, state, $ } = createAssist({
      drinkParamSnapshot: () => plan,
      saveAssistDrink: async (elapsed) => { saved.push(elapsed); return { id: 'pending-log' }; }
    });
    api.openDrinkBrewAssist();
    state.brewAssist.phase = 'running'; state.brewAssist.startedAt = Date.now() - 90000;
    await api.finishBrewAssist();
    assert.equal(state.brewAssist.completed, true);
    assert.equal(saved.length, 1);
    assert.equal(state.brewAssist.savedLogId, 'pending-log');
    assert.equal($('#brewAssistFinish').textContent, '现在评分');
    assert.equal($('#brewAssistPause').textContent, '先去喝');
    assert.match($('#brewAssistConfetti').innerHTML, /class="left"/);
    assert.match($('#brewAssistConfetti').innerHTML, /class="right"/);
    api.pauseBrewAssist();
    assert.equal(state.brewAssist, null);
  } finally { delete global.requestAnimationFrame; delete global.cancelAnimationFrame; }
});

test('brew-assist: 自动保存失败时留在完成页并允许重试', async () => {
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  try {
    let attempts = 0;
    const plan = { brewMethod: '手冲', name: '测试方案', steps: [{ label: '注水', water: 225, startTime: '0:00', endTime: '1:30' }] };
    const { api, state, $ } = createAssist({
      drinkParamSnapshot: () => plan,
      saveAssistDrink: async () => { attempts += 1; return attempts === 1 ? null : { id: 'retry-log' }; }
    });
    api.openDrinkBrewAssist();
    state.brewAssist.phase = 'running'; state.brewAssist.startedAt = Date.now() - 90000;
    await api.finishBrewAssist();
    assert.equal($('#brewAssistFinish').textContent, '重试保存');
    assert.equal(state.brewAssist.savedLogId, null);
    await api.finishBrewAssist();
    assert.equal(attempts, 2);
    assert.equal(state.brewAssist.savedLogId, 'retry-log');
    assert.equal($('#brewAssistFinish').textContent, '现在评分');
  } finally { delete global.requestAnimationFrame; delete global.cancelAnimationFrame; }
});

// ---- app-backup ----

function createBackupApi(confirmAnswers, overrides) {
  const { $ } = fakeDom();
  const answers = confirmAnswers ? confirmAnswers.slice() : [];
  const state = { beans: [], drinkLogs: [], brewPlans: [], settings: core.normalizeSettings({}), importScope: 'all' };
  const toasts = [];
  const imported = [];
  const deps = {
    $, state, els: { backup: {}, settings: {}, personal: {}, migration: {} }, core,
    repository: { isNative: () => false, importData: async (data, mode) => imported.push({ data, mode }), legacyData: () => null, getWebImage: async () => null, saveWebImage: async () => 'idb:x', replaceAll: async () => {} },
    capPlugin: () => null,
    toast: (message) => toasts.push(message),
    setDialog: () => {}, reload: async () => {},
    confirmFn: () => { if (!answers.length) throw new Error('confirm 被意外调用'); return answers.shift(); },
    ...overrides
  };
  return { api: backup.create(deps), state, toasts, imported };
}

test('backup: create 校验依赖', () => {
  assert.throws(() => backup.create({}), /缺少依赖/);
});

test('backup: backupScope 未知范围回退 all,summary 按范围措辞', () => {
  const { api } = createBackupApi();
  assert.equal(api.backupScope('奇怪'), 'all');
  assert.equal(api.backupScope('brewPlans'), 'brewPlans');
  const data = { beans: [1], drinkLogs: [1, 2], brewPlans: [1, 2, 3] };
  assert.equal(api.backupSummary('library', data), '1 款豆子，2 杯记录');
  assert.equal(api.backupSummary('brewPlans', data), '3 个方案');
  assert.equal(api.backupSummary('all', data), '1 款豆子，2 杯记录，3 个方案');
});

test('backup: chooseImportMode 空库一次确认,有数据时合并/覆盖/取消三分支', () => {
  // 空库:confirm 一次,确定 → replace
  assert.equal(createBackupApi([true]).api.chooseImportMode('all', 'x'), 'replace');
  assert.equal(createBackupApi([false]).api.chooseImportMode('all', 'x'), null);
  // 有数据:第一问确定 → merge;第一问取消+第二问确定 → replace;两问都取消 → null
  const withData = (answers) => { const built = createBackupApi(answers); built.state.beans.push({ id: 'b' }); return built.api; };
  assert.equal(withData([true]).chooseImportMode('all', 'x'), 'merge');
  assert.equal(withData([false, true]).chooseImportMode('all', 'x'), 'replace');
  assert.equal(withData([false, false]).chooseImportMode('all', 'x'), null);
});

test('backup: importText 走 validateImport→importData 契约(真实备份 round-trip)', async () => {
  const beans = [core.normalizeBean({ name: '耶加雪菲', initialWeight: 250 })];
  const json = JSON.stringify(core.createBackup(beans, [], core.normalizeSettings({}), null, [], { scope: 'all' }));
  const { api, imported, toasts } = createBackupApi([true]); // 空库 → 一次确认 → replace
  await api.importText(json);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].mode, 'replace');
  assert.equal(imported[0].data.beans[0].name, '耶加雪菲');
  assert.match(toasts[0], /已导入/);
});

test('backup: base64 工具在 Node 环境可用且互逆', () => {
  const { api } = createBackupApi();
  assert.equal(api.decodeBase64(Buffer.from('{"a":1}').toString('base64')), '{"a":1}');
  const blob = api.base64ToBlob(Buffer.from('xyz').toString('base64'), 'image/webp');
  assert.equal(blob.type, 'image/webp');
  assert.equal(blob.size, 3);
});

test('backup: loadMockData 等待应用内异步确认后才覆盖浏览器数据', async () => {
  const previousLocation = global.location;
  const previousFetch = global.fetch;
  global.location = { hostname: 'localhost' };
  global.fetch = async () => ({ ok: true, json: async () => core.createBackup([core.normalizeBean({ name: 'Mock 豆' })], [], core.normalizeSettings({}), null, []) });
  try {
    let resolveConfirm;
    const confirmFn = () => new Promise((resolve) => { resolveConfirm = resolve; });
    const { api, imported } = createBackupApi([], { confirmFn });
    const loading = api.loadMockData();
    await Promise.resolve();
    assert.equal(imported.length, 0, '确认前不能覆盖数据');
    resolveConfirm(true);
    await loading;
    assert.equal(imported.length, 1);
    assert.equal(imported[0].mode, 'replace');
  } finally {
    global.location = previousLocation;
    global.fetch = previousFetch;
  }
});

// ---- app-update ----

function createUpdateApi(release, options) {
  const { $, nodes } = fakeDom();
  const state = { updateBusy: false, updateResult: null, appInfo: (options && options.appInfo) || null };
  const deps = {
    $, state, els: { about: {} }, core,
    capPlugin: () => null, setDialog: () => {},
    openExternalUrl: (url) => { state.openedUrl = url; }, esc: fmt.esc,
    fetchFn: async () => ({ ok: true, json: async () => release })
  };
  return { api: update.create(deps), state, $, nodes };
}

test('update: create 校验依赖', () => {
  assert.throws(() => update.create({}), /缺少依赖/);
});

test('update: formatDownloadSize 分档', () => {
  const { api } = createUpdateApi({});
  assert.equal(api.formatDownloadSize(0), '');
  assert.equal(api.formatDownloadSize(512), '512 B');
  assert.equal(api.formatDownloadSize(2048), '约 2 KB');
  assert.equal(api.formatDownloadSize(5 * 1024 * 1024), '约 5 MB');
});

test('update: releaseNotesHtml 转义并去掉列表/标题前缀', () => {
  const { api } = createUpdateApi({});
  assert.equal(api.releaseNotesHtml(''), '<p>这次发布没有填写更新说明，可打开发布页查看详情。</p>');
  assert.equal(api.releaseNotesHtml('- 修复 <bug>\n## 标题'), '<ul><li>修复 &lt;bug&gt;</li><li>标题</li></ul>');
});

test('update: 远端更新时给出 available,自带 APK 资产', async () => {
  const release = { tag_name: 'v9.9.9', html_url: 'https://x/rel', body: '- 新功能', assets: [{ name: 'coffee-vault-9.9.9-release.apk', size: 1024, browser_download_url: 'https://x/apk' }] };
  const { api, state } = createUpdateApi(release, { appInfo: { version: '2.2.1' } });
  await api.checkForUpdates();
  assert.equal(state.updateResult.state, 'available');
  assert.equal(state.updateResult.version, 'v9.9.9');
  assert.ok(state.updateResult.asset);
  assert.equal(state.updateBusy, false);
});

test('update: 本机已最新时给出 current', async () => {
  const release = { tag_name: 'v2.2.1', html_url: 'https://x/rel', assets: [] };
  const { api, state } = createUpdateApi(release, { appInfo: { version: '2.2.1' } });
  await api.checkForUpdates();
  assert.equal(state.updateResult.state, 'current');
});

test('update: 网络失败落到 error 且不留 busy 态', async () => {
  const { state } = createUpdateApi(null);
  const failing = update.create({
    $: fakeDom().$, state, els: { about: {} }, core, capPlugin: () => null, setDialog: () => {},
    openExternalUrl: () => {}, esc: fmt.esc, fetchFn: async () => { throw new Error('offline'); }
  });
  await failing.checkForUpdates();
  assert.equal(state.updateResult.state, 'error');
  assert.equal(state.updateBusy, false);
});
