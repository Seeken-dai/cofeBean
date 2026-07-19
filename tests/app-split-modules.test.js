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

test('share-card: 单图 contain 在横图、竖图和极端长图下都完整落入画框', () => {
  const api = createShareCard();
  const landscape = api.fitImageRect(1600, 900, 10, 20, 800, 500, 'contain');
  assert.deepEqual(
    { x: landscape.x, y: landscape.y, w: landscape.w, h: landscape.h, mode: landscape.mode },
    { x: 10, y: 45, w: 800, h: 450, mode: 'contain' }
  );
  const portrait = api.fitImageRect(900, 1600, 0, 0, 500, 500, 'contain');
  assert.equal(portrait.x, 109.375);
  assert.equal(portrait.y, 0);
  assert.equal(portrait.w, 281.25);
  assert.equal(portrait.h, 500);
  const extreme = api.fitImageRect(400, 2400, 0, 0, 600, 720, 'contain');
  assert.equal(extreme.x, 240);
  assert.equal(extreme.y, 0);
  assert.equal(extreme.w, 120);
  assert.equal(extreme.h, 720);
});

test('share-card: 多图 smart 仅在裁切不超过约 20% 时使用 cover', () => {
  const api = createShareCard();
  const closeAspect = api.fitImageRect(1200, 900, 0, 0, 400, 320, 'smart');
  assert.equal(closeAspect.mode, 'cover');
  assert.ok(closeAspect.cropRatio >= .8);
  const portraitInLandscape = api.fitImageRect(900, 1600, 0, 0, 400, 220, 'smart');
  assert.equal(portraitInLandscape.mode, 'contain');
  assert.ok(portraitInLandscape.cropRatio < .8);
  assert.ok(portraitInLandscape.x >= 0 && portraitInLandscape.y >= 0);
  assert.ok(portraitInLandscape.x + portraitInLandscape.w <= 400);
  assert.ok(portraitInLandscape.y + portraitInLandscape.h <= 220);
});

test('share-card: receipt 根据内容和照片方向选择自适应组合', () => {
  const api = createShareCard();
  const radar = [{ value: 4 }, { value: 3 }, { value: 5 }];
  const landscapeDrink = api.resolveReceiptComposition({ type: 'drink', radar }, [{ aspect: 1.6 }]);
  assert.equal(landscapeDrink.kind, 'drink-photo-radar');
  assert.equal(landscapeDrink.photoRatio, .56);
  const portraitDrink = api.resolveReceiptComposition({ type: 'drink', radar }, [{ aspect: .65 }]);
  assert.equal(portraitDrink.kind, 'drink-photo-radar');
  assert.equal(portraitDrink.photoRatio, .42);
  const radarWithNotes = api.resolveReceiptComposition({ type: 'drink', radar, notes: '花香、柑橘与白桃' }, []);
  assert.equal(radarWithNotes.kind, 'drink-radar-notes');
  assert.equal(radarWithNotes.radarRatio, .58);
  const radarOnly = api.resolveReceiptComposition({ type: 'drink', radar }, []);
  assert.equal(radarOnly.kind, 'drink-radar-compact');
  assert.equal(radarOnly.radarRatio, .66);
  assert.equal(api.resolveReceiptComposition({ type: 'bean' }, [{ aspect: .75 }]).kind, 'bean-photo-sidebar');
  assert.equal(api.resolveReceiptComposition({ type: 'bean' }, [{ aspect: 1.4 }]).kind, 'bean');
  assert.equal(api.resolveReceiptComposition({ type: 'brewPlan', steps: Array(8) }, []).stepColumns, 3);
  assert.equal(api.resolveReceiptComposition({ type: 'calendarMonth' }, []).kind, 'calendar-split');
});

test('share-card: 总评分只生成一个数值和一组星级', () => {
  const api = createShareCard();
  assert.deepEqual(api.receiptRatingPresentation({ value: 5, max: 5 }), { score: '5.0', stars: '★★★★★' });
  assert.deepEqual(api.receiptRatingPresentation({ value: 3.6, max: 5 }), { score: '3.6', stars: '★★★★☆' });
  assert.equal(api.receiptRatingPresentation({ value: 0, max: 5 }), null);
});

test('share-card: 空字段和加载失败图片仍返回稳定的默认布局', () => {
  const api = createShareCard();
  assert.deepEqual(api.fitImageRect(0, 0, 0, 0, 400, 300, 'smart'), { x: 0, y: 0, w: 0, h: 0, mode: 'contain', cropRatio: 0 });
  assert.equal(api.resolveReceiptComposition({}, []).kind, 'receipt');
  assert.equal(api.resolveReceiptComposition({ type: 'drink', radar: null }, [{ aspect: 1 }]).kind, 'drink');
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
