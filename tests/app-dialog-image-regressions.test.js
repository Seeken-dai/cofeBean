'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 2.3.12 修的两个遗留问题都在 app.js 的 DOM/生命周期层，没有可抽出的纯逻辑，
// 因此用源码级断言锁住三条不变量，避免以后重构时又踩回去。
const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');

test('setDialog 重新打开同一个 dialog 时会撤销挂起的关闭', () => {
  // 关闭是异步的（等 sheet-out 动画，期间 dialog.open 仍为 true）。「记一杯 → 从豆仓记一杯」
  // 会先关闭 choice 再复用它显示豆子列表；若不撤销挂起的关闭，260ms 后弹窗会自己关掉。
  assert.match(appSource, /function cancelDialogClose\(dialog\)/);
  // 打开分支必须先撤销挂起的关闭，且不能再用 `open && !dialog.open` 把已打开（正在关闭）的 dialog 挡在门外。
  assert.match(appSource, /function setDialog\(dialog, open\) \{\s*if \(open\) \{\s*cancelDialogClose\(dialog\);/);
  assert.doesNotMatch(appSource, /if \(open && !dialog\.open\)/);
  // 挂起的关闭必须可撤销：定时器与 animationend 监听都要存下来。
  assert.match(appSource, /pendingDialogCloses\.set\(dialog, \{ timer: setTimeout\(finish, 260\), onEnd \}\)/);
});

test('自动同步的 reload 带 keepForm，不覆盖正在编辑的表单', () => {
  // reload() 默认会在编辑页开着且 editingId 非空时 fillForm(bean)，
  // 用库里的旧值覆盖用户尚未保存的输入（含刚添加的咖啡袋图片）。
  // 自动同步是后台行为，必须传 keepForm；Android 从后台恢复的那条路径本来就是这么做的。
  assert.match(appSource, /await cloudSync\.sync\(\);[\s\S]{0,120}?await reload\(\{ keepForm: true \}\)/);
  assert.match(appSource, /appStateChange[\s\S]{0,200}?await reload\(\{ keepForm: true \}\)/);
  // keepForm 的语义本身不能被删掉。
  assert.match(appSource, /if \(!\(options && options\.keepForm\) && els\.editor\.open && state\.editingId\)/);
});

test('resolveWebImages 保留编辑中未保存图片的 objectURL', () => {
  // refs 只从已保存的 beans/drinkLogs 收集；待保存草稿不在其中，
  // 漏掉就会在 reload 时被 revokeObjectURL 回收，编辑页图片随即变空白。
  assert.match(appSource, /\(state\.pendingImages \|\| \[\]\)\.forEach\(\(item\) => addRef\(item && item\.ref\)\)/);
  assert.match(appSource, /\(state\.drinkPhotoDraft \|\| \[\]\)\.forEach\(addRef\)/);
  // 回收仍然要发生（否则就是内存泄漏），只是要在补齐草稿引用之后。
  const resolveBody = appSource.slice(appSource.indexOf('async function resolveWebImages'), appSource.indexOf('async function compressImageFile'));
  const draftIndex = resolveBody.indexOf('state.pendingImages');
  const revokeIndex = resolveBody.indexOf('URL.revokeObjectURL');
  assert.ok(draftIndex > -1 && revokeIndex > -1, '草稿补齐与回收都应存在');
  assert.ok(draftIndex < revokeIndex, '草稿引用必须在 revokeObjectURL 之前补进 refs');
});
