'use strict';

// 3.0.15：编辑页不再自己弹键盘。只有桌面浏览器（非原生 App、≥1100、pointer: fine、hover: hover）才自动聚焦文本框。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shell = require('../www/app-shell.js');

function media(features) {
  return (query) => {
    if (query === shell.wideMediaQuery()) return { matches: features.width >= shell.WIDE_BREAKPOINT };
    if (query === '(pointer: fine)') return { matches: features.pointer === 'fine' };
    if (query === '(hover: hover)') return { matches: Boolean(features.hover) };
    return { matches: false };
  };
}

test('canAutoFocusField：只有桌面浏览器返回 true', () => {
  const desktop = { width: 1440, pointer: 'fine', hover: true };
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media(desktop) }), true);
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ ...desktop, width: 1100 }) }), true, '断点本身算宽屏');
  assert.equal(shell.canAutoFocusField({ native: true, matchMedia: media(desktop) }), false, 'Android App（含平板横屏）不自动聚焦');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ ...desktop, width: 1099 }) }), false, '窄于 1100');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ width: 390, pointer: 'coarse', hover: false }) }), false, '手机');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ width: 1366, pointer: 'coarse', hover: false }) }), false, '横屏平板浏览器');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ width: 1366, pointer: 'fine', hover: false }) }), false, '不支持 hover');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: media({ width: 1366, pointer: 'coarse', hover: true }) }), false, '主指针为触屏');
  assert.equal(shell.canAutoFocusField({ native: false }), false, '无 matchMedia 时保守不聚焦');
  assert.equal(shell.canAutoFocusField({ native: false, matchMedia: () => { throw new Error('boom'); } }), false);
  assert.equal(shell.canAutoFocusField(), false);
});

test('三处延时自动聚焦都经过 focusFieldIfDesktop，不再直接 .focus()', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');
  const syncUi = fs.readFileSync(path.join(__dirname, '..', 'www', 'app-sync-ui.js'), 'utf8');
  assert.match(app, /setDialog\(els\.editor, true\); focusFieldIfDesktop\('#field-name', 120\);/);
  assert.match(app, /setDialog\(els\.planEditor, true\); focusFieldIfDesktop\('#plan-name', 120\);/);
  assert.match(syncUi, /setDialog\(els\.syncAuth, true\);\s*focusFieldIfDesktop\('#syncAuthEmail', 80\);/);
  for (const id of ['field-name', 'plan-name', 'syncAuthEmail']) {
    assert.doesNotMatch(app + syncUi, new RegExp(`\\$\\('#${id}'\\)\\.focus\\(`), `#${id} 不应再被直接 focus()`);
  }
  assert.match(app, /focusFieldIfDesktop,/, 'AppSyncUi.create 注入 focusFieldIfDesktop');
  const setDialog = app.slice(app.indexOf('function setDialog('), app.indexOf('// 只有落在 sheet 上方'));
  assert.match(setDialog, /if \(!canAutoFocusField\(\)\) focusDialogTitle\(dialog\);/, 'setDialog：触屏一律改聚焦标题（不论首个焦点是文本框还是删除按钮）');
  const target = app.slice(app.indexOf('function dialogFocusTarget('), app.indexOf('function focusDialogTitle('));
  assert.match(target, /aria-labelledby/);
  assert.match(target, /title\.tagName === 'H2' && dialog\.contains\(title\)/, '只聚焦本对话框内的 h2 标题');
  assert.match(target, /return dialog;/, '没有 h2 标题时退回对话框容器');
  assert.doesNotMatch(setDialog, /isKeyboardField/, '不再只在文本框时才兜底');
});

test('每个 dialog 及其 h2 标题都可程序聚焦（tabindex=-1），并以标题命名（aria-labelledby）', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(dialogs.length >= 30);
  for (const tag of dialogs) {
    assert.match(tag, /tabindex="-1"/, tag);
    const label = (tag.match(/aria-labelledby="([^"]+)"/) || [])[1];
    assert.ok(label, tag);
    assert.match(html, new RegExp(`<h2[^>]*id="${label}"[^>]*tabindex="-1"`), `${label} 应指向 tabindex=-1 的 h2 标题`);
  }
  const css = fs.readFileSync(path.join(__dirname, '..', 'www', 'styles.css'), 'utf8');
  const rule = (css.match(/([^}\n]*)\{ outline:none; \}/g) || []).find((line) => line.includes('dialog h2[tabindex="-1"]')) || '';
  for (const selector of ['dialog[tabindex="-1"]:focus', 'dialog[tabindex="-1"]:focus-visible', 'dialog h2[tabindex="-1"]:focus', 'dialog h2[tabindex="-1"]:focus-visible']) {
    assert.ok(rule.includes(selector), `${selector} 应无焦点框（:focus 与 :focus-visible 都要写）`);
  }
});
