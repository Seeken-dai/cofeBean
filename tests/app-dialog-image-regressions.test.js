'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 2.3.12 修的两个遗留问题都在 app.js 的 DOM/生命周期层，没有可抽出的纯逻辑，
// 因此用源码级断言锁住三条不变量，避免以后重构时又踩回去。
const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'styles.css'), 'utf8');

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

test('任意层级弹窗打开时锁定底层页面滚动', () => {
  // 锁定状态由所有 dialog 的统一查询驱动：关闭最上层弹窗时，只要下面仍有 dialog，
  // documentElement 就必须继续保持锁定。
  assert.match(appSource, /const hasOpenDialog = Boolean\(document\.querySelector\('dialog\[open\]'\)\);[\s\S]{0,140}?document\.documentElement\.classList\.toggle\('dialog-scroll-locked', hasOpenDialog\)/);
  assert.match(stylesSource, /html\.dialog-scroll-locked,html\.dialog-scroll-locked body\s*\{\s*overflow:hidden;\s*overscroll-behavior:none;\s*\}/);
  // 弹窗自身仍可滚动，但到达边缘后不能把滚轮/触摸滚动继续传给底层。
  assert.match(stylesSource, /\.sheet\s*\{[^}]*overflow:auto;\s*overscroll-behavior:contain;/);
});

test('编辑页的删除收在标题栏图标里，底栏只留正向操作且一行放得下', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
  // 2.4.2：底栏原来要摆四个按钮（删除记录 / 取消 / 冲煮辅助 / 保存并扣量），375px 宽只有
  // 296px 可用、自然宽度要 438px，每个按钮的中文都被挤成竖排。删除挪到 ✕ 旁边、取消交还给 ✕。
  ['deleteBean', 'planEditorDelete', 'deleteDrink'].forEach((id) => {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(button, `${id} 应存在`);
    // 必须是标题栏的红色图标按钮，且默认隐藏（新建时没有可删对象，由 JS 按场景放出来）。
    assert.match(button[0], /class="icon-button is-danger"/, `${id} 应使用标题栏红色图标样式`);
    assert.match(button[0], /aria-label="[^"]+"/, `${id} 图标按钮必须有 aria-label`);
    assert.match(button[0], /\shidden\b/, `${id} 默认应隐藏`);
    // 位置：在 header-actions 里，而不是 sheet-footer 里。
    const scope = html.slice(Math.max(0, html.indexOf(button[0]) - 400), html.indexOf(button[0]));
    assert.match(scope, /class="header-actions"/, `${id} 应放在 header-actions 里`);
  });
  // 底栏不能再出现 danger-button（删除已经不在底栏），取消按钮也从喝一杯里移除。
  ['deleteBean', 'planEditorDelete', 'deleteDrink'].forEach((id) => {
    assert.doesNotMatch(html, new RegExp(`class="danger-button" id="${id}"`), `${id} 不应留在底栏`);
  });
  // 三个编辑页的「取消」都由标题栏 ✕ 接管（原本绑的就是同一套关闭逻辑）。
  ['drinkCancel', 'editorCancel', 'planEditorCancel'].forEach((id) => {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} 应由标题栏 ✕ 接管`);
    assert.doesNotMatch(appSource, new RegExp(`#${id}`), `${id} 移除后不应残留监听或文案切换`);
  });
  // 旧的 tasting-mode 两列网格补丁不该复活。
  assert.doesNotMatch(stylesSource, /\.tasting-mode \.sheet-footer>div\{display:grid/);
  // 兜底：底栏按钮组允许折行，避免以后文案变长又被挤成竖排。
  assert.match(stylesSource, /\.sheet-footer > div \{ display:flex; flex-wrap:wrap;/);
  assert.match(stylesSource, /\.icon-button\.is-danger \{ color:var\(--danger\); \}/);
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

test('Android 相机回收进程后会恢复外饮表单和照片结果', () => {
  assert.match(appSource, /const DRINK_CAMERA_DRAFT_KEY = 'coffee-vault:drink-camera-draft:v1'/);
  assert.match(appSource, /source === 'camera' && saveDrinkCameraDraft\(\)/);
  assert.match(appSource, /appRestoredResult[\s\S]{0,260}?result\.pluginId !== 'Camera'[\s\S]{0,100}?result\.methodName !== 'getPhoto'/);
  assert.match(appSource, /pendingRestoredCameraResult[\s\S]{0,300}?restoreDrinkCameraDraft\(result\)/);
  assert.match(appSource, /restoreDrinkCameraDraft[\s\S]{0,1400}?state\.pendingDrinkPhotos\.push\(\{ path \}\)[\s\S]{0,120}?state\.drinkPhotoDraft\.push\(path\)/);
});
