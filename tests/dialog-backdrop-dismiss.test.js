'use strict';

// 2.4.2：详情/编辑弹窗左右两侧只剩 10px 空白，握着手机很容易蹭到，一蹭就退出。
// 这些行为都长在 app.js 的 DOM 层，没有可抽出的纯逻辑，所以照 app-dialog-image-regressions
// 的做法用源码级断言锁住不变量。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'styles.css'), 'utf8');

test('点背景关闭只认弹窗上下方的空白', () => {
  // 判定必须基于弹窗矩形的上下边界，而不是「只要 target 是 dialog 就关」。
  assert.match(appSource, /function backdropDismissPoint\(dialog, event\)/);
  assert.match(appSource, /event\.clientY < rect\.top - BACKDROP_EDGE_GUARD \|\| event\.clientY > rect\.bottom \+ BACKDROP_EDGE_GUARD/);
  // 不能再出现「target === dialog 就直接 close」的裸判定。
  assert.doesNotMatch(appSource, /if \(event\.target === dialog\) dialog === els\./);
  // 按下与抬起都要落在空白里，避免从弹窗内部滑出去松手被当成关闭。
  assert.match(appSource, /addEventListener\('pointerdown', \(event\) => \{ armed = backdropDismissPoint\(dialog, event\); \}\)/);
  assert.match(appSource, /const outside = armed && backdropDismissPoint\(dialog, event\);/);
});

test('编辑类弹窗与冲煮辅助完全不参与点背景关闭', () => {
  const bindings = appSource.slice(appSource.indexOf('.forEach((dialog) => bindBackdropDismiss'));
  const list = appSource.slice(appSource.indexOf('[els.personal, els.backup'), appSource.indexOf('.forEach((dialog) => bindBackdropDismiss'));
  assert.ok(list.length > 0 && bindings.length > 0, '应存在 bindBackdropDismiss 注册列表');
  // 填了一半的表单和正在跑的计时器不该被一次误触清掉。
  ['els.editor', 'els.planEditor', 'els.drink,', 'els.brewAssist', 'els.syncAuth'].forEach((name) => {
    assert.ok(!list.includes(name), `${name} 不应出现在点背景关闭列表里`);
  });
  // 轻量选择弹窗仍然可以点背景关闭。
  ['els.choice', 'els.datePicker', 'els.photoSource', 'els.imagePreview'].forEach((name) => {
    assert.ok(list.includes(name), `${name} 应保留点背景关闭`);
  });
});

test('手机上 sheet 贴底，左右空白只有 10px，所以横向不能当作关闭区', () => {
  // 这条断言是上面那条规则的前提：一旦 sheet 改成左右留大片空白，可以重新考虑横向关闭。
  assert.match(stylesSource, /\.sheet \{ width:min\(100% - 20px,620px\);/);
  assert.match(stylesSource, /\.sheet \{[^}]*margin:auto auto 0;/);
});
