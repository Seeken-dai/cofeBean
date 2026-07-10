'use strict';

// app.js 拆分第二批模块的 Node 测试。
// app-share-card:用假 canvas ctx 验证文本截断/换行(纯逻辑,不需要真 canvas)。
// app-sync-ui:用假 $/state/els/cloudSync 验证模式切换、登录态渲染与开关守卫。

const test = require('node:test');
const assert = require('node:assert/strict');
const shareCard = require('../www/app-share-card.js');
const syncUi = require('../www/app-sync-ui.js');

// ---- app-share-card ----

// 假 ctx:每个字符宽 10px,足以驱动截断/换行分支。
const fakeCtx = { measureText: (text) => ({ width: [...String(text)].length * 10 }) };
function createShareCard() {
  return shareCard.create({ imageSrc: (path) => String(path), monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] });
}

test('share-card: create 校验依赖', () => {
  assert.throws(() => shareCard.create({}), /imageSrc/);
});

test('share-card: clipCanvasText 超宽截断加省略号', () => {
  const api = createShareCard();
  assert.equal(api.clipCanvasText(fakeCtx, 'abcdef', 100), 'abcdef');
  assert.equal(api.clipCanvasText(fakeCtx, 'abcdefghij', 50), 'abcd…');
  assert.equal(api.clipCanvasText(fakeCtx, '', 50), '');
});

test('share-card: wrapCanvasLines 按宽换行并限行', () => {
  const api = createShareCard();
  assert.deepEqual(api.wrapCanvasLines(fakeCtx, 'aaaa bbbb', 50), ['aaaa ', 'bbbb']);
  // 限行截断:多余行被丢弃;保留行本身不超宽,不追加省略号。
  const limited = api.wrapCanvasLines(fakeCtx, 'aaaaaaaaaaaaaaaaaaaa', 50, 2);
  assert.deepEqual(limited, ['aaaaa', 'aaaaa']);
});

// ---- app-sync-ui ----

function fakeElement() {
  return { value: '', textContent: '', hidden: false, disabled: false, checked: false, placeholder: '', dataset: {}, classList: { toggle() {} }, previousElementSibling: { textContent: '' }, focus() {} };
}
function createSyncUi(cloudSync) {
  const nodes = new Map();
  const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, fakeElement()); return nodes.get(selector); };
  const state = { syncBusy: false, syncAuthMode: 'login' };
  const els = { syncAuth: { open: false } };
  const toasts = [];
  const api = syncUi.create({
    $, state, els, cloudSync,
    toast: (message) => toasts.push(message),
    setDialog: (dialog, open) => { dialog.open = open; },
    askConfirm: async () => true,
    reload: async () => {},
    copyText: async () => {},
    formatDateTime: (value) => String(value)
  });
  return { api, $, state, els, toasts };
}

test('sync-ui: create 校验依赖', () => {
  assert.throws(() => syncUi.create({}), /缺少依赖/);
});

test('sync-ui: setSyncAuthMode 切换文案并隐藏恢复码框', () => {
  const { api, $, state } = createSyncUi(null);
  api.setSyncAuthMode('register');
  assert.equal(state.syncAuthMode, 'register');
  assert.equal($('#syncAuthTitle').textContent, '创建同步账号');
  assert.equal($('#syncRecoveryBox').hidden, true);
  api.setSyncAuthMode('不存在的模式');
  assert.equal(state.syncAuthMode, 'login');
});

test('sync-ui: renderSyncSettings 未登录/已登录两种状态', () => {
  const config = { token: '', enabled: false, email: '' };
  const cloudSync = { getConfig: () => config };
  const { api, $ } = createSyncUi(cloudSync);
  api.renderSyncSettings();
  assert.equal($('#syncStateText').textContent, '未登录');
  assert.equal($('#syncStatusBadge').dataset.state, 'offline');
  assert.equal($('#syncNow').disabled, true);
  config.token = 't'; config.enabled = true; config.email = 'a@b.c';
  api.renderSyncSettings();
  assert.equal($('#syncStateText').textContent, '同步已开启');
  assert.equal($('#syncAccountText').textContent, 'a@b.c');
  assert.equal($('#syncNow').disabled, false);
});

test('sync-ui: 未登录时 syncToggle 复位开关并提示', () => {
  const cloudSync = { getConfig: () => ({ token: '' }), setEnabled: () => { throw new Error('不该走到这里'); } };
  const { api, $, toasts } = createSyncUi(cloudSync);
  $('#syncEnabled').checked = true;
  api.syncToggle();
  assert.equal($('#syncEnabled').checked, false);
  assert.deepEqual(toasts, ['请先登录同步账号']);
});

test('sync-ui: generateRecoveryCode 格式为 4 位一组、共 20 字符', () => {
  const { api } = createSyncUi(null);
  const code = api.generateRecoveryCode();
  assert.match(code, /^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
});

test('sync-ui: cloudSync 缺失时操作只提示不崩溃', async () => {
  const { api, toasts } = createSyncUi(null);
  await api.syncNow();
  assert.deepEqual(toasts, ['同步模块未加载']);
});
