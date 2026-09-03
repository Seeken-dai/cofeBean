'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AppShell = require('../www/app-shell.js');

test('1100px 是移动外壳与宽屏工作台的唯一断点', () => {
  assert.equal(AppShell.layoutForWidth(360), 'mobile');
  assert.equal(AppShell.layoutForWidth(1099), 'mobile');
  assert.equal(AppShell.layoutForWidth(1100), 'wide');
  assert.equal(AppShell.layoutForWidth(1440), 'wide');
});

test('计划入口随功能开关显隐且我的始终保留', () => {
  assert.deepEqual(AppShell.navigationItems(false), ['beans', 'drinks', 'personal']);
  assert.deepEqual(AppShell.navigationItems(true), ['beans', 'drinks', 'plans', 'personal']);
});

test('3.0.5 左右滑相邻 Tab：宽屏断点一致、方案关闭跳过 plans', () => {
  assert.equal(AppShell.WIDE_BREAKPOINT, 1100);
  assert.equal(AppShell.layoutForWidth(AppShell.WIDE_BREAKPOINT - 1), 'mobile');
  assert.equal(AppShell.layoutForWidth(AppShell.WIDE_BREAKPOINT), 'wide');
  assert.equal(AppShell.adjacentNavigationView('beans', 1, true), 'drinks');
  assert.equal(AppShell.adjacentNavigationView('drinks', 1, true), 'plans');
  assert.equal(AppShell.adjacentNavigationView('plans', 1, true), 'personal');
  assert.equal(AppShell.adjacentNavigationView('personal', 1, true), null);
  assert.equal(AppShell.adjacentNavigationView('drinks', 1, false), 'personal');
  assert.equal(AppShell.adjacentNavigationView('personal', -1, false), 'drinks');
  assert.equal(AppShell.adjacentNavigationView('drinks', -1, false), 'beans');
  assert.equal(AppShell.adjacentNavigationView('beans', -1, false), null);
});

test('3.0.5 左右滑手势：弹层/边缘/纵向优先禁用，阈值可触发', () => {
  assert.equal(AppShell.tabSwipeBlockedByLayers({ hasQuickLayer: true }), true);
  assert.equal(AppShell.tabSwipeBlockedByLayers({ hasPageLayer: true }), true);
  assert.equal(AppShell.tabSwipeBlockedByLayers({ hasToolLayer: true }), true);
  assert.equal(AppShell.tabSwipeBlockedByLayers({ hasOpenDialog: true }), true);
  assert.equal(AppShell.tabSwipeBlockedByLayers({}), false);
  assert.equal(AppShell.tabSwipeFromEdge(10, 390, 20), true);
  assert.equal(AppShell.tabSwipeFromEdge(380, 390, 20), true);
  assert.equal(AppShell.tabSwipeFromEdge(120, 390, 20), false);
  assert.equal(AppShell.tabSwipeAxisDominant(50, 20, 1.2), true);
  assert.equal(AppShell.tabSwipeAxisDominant(20, 50, 1.2), false);
  assert.equal(AppShell.tabSwipeShouldSwitch(70, 10, 200), true);
  assert.equal(AppShell.tabSwipeShouldSwitch(40, 10, 40), true);
  assert.equal(AppShell.tabSwipeShouldSwitch(40, 10, 200), false);
  assert.equal(AppShell.tabSwipeShouldSwitch(80, 90, 100), false);
  const source = fs.readFileSync(path.join(__dirname, '../www/app-shell.js'), 'utf8');
  assert.match(source, /bindTabSwipe/);
  assert.match(source, /shellLayout === 'wide'/);
  assert.match(source, /has-quick-layer/);
  assert.match(source, /TAB_SWIPE/);
  assert.match(source, /options\.onView\(next\)/);
});

test('我的使用主视图而不是返回栈中的页面层', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  assert.match(html, /<section\b[^>]*\bid="personalView"/);
  assert.match(html, /data-shell-view="personal"/);
  assert.doesNotMatch(html, /\bid="personalDialog"/);
});

test('豆仓首页保留状态与排序，高级筛选不再重复', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const dialog = html.match(/<dialog\b[^>]*\bid="beanFilterDialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(html, /\bid="statusFilters"/);
  assert.match(html, /class="sort-row"/);
  assert.match(dialog, /\bid="beanFilterRoast"/);
  assert.match(dialog, /\bid="beanFilterProcess"/);
  assert.match(dialog, /\bid="beanFilterOrigin"/);
  assert.doesNotMatch(dialog, /\bid="beanFilterStatus"/);
  assert.doesNotMatch(dialog, /\bid="beanFilterSort"/);
});

test('3.0.1 宽屏把我的、搜索、轻量筛选和新增操作放到主工作台', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../www/styles.css'), 'utf8');
  const sidebar = html.slice(html.indexOf('class="sidebar-nav"'), html.indexOf('class="sidebar-footer"'));
  assert.match(sidebar, /data-shell-view="personal"/);
  assert.doesNotMatch(sidebar, /data-shell-action="calendar"|data-shell-action="insights"/);
  assert.match(html, /id="widePrimaryAction"/);
  assert.match(css, /\.topbar-search\s*\{\s*z-index:30;\s*right:170px;/);
  assert.match(css, /body\[data-shell-view="personal"\] \.topbar-search\s*\{\s*right:24px;/);
  assert.match(css, /\.wide-bean-filters\s*\{\s*display:none!important;/);
  assert.match(css, /body\[data-shell-view="beans"\] \.topbar-filter-button\s*\{[\s\S]*?display:none!important;/);
  assert.match(css, /body\.has-context-detail \.topbar-filter-button\s*\{\s*display:none!important;/);
});

test('Web 端我的页隐藏累计统计，系统入口收进右侧工作区', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../www/styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../www/app.js'), 'utf8');
  const footer = html.slice(html.indexOf('class="sidebar-footer"'), html.indexOf('</aside>'));
  assert.doesNotMatch(footer, /data-shell-action="settings"/);
  assert.match(css, /body:not\(\.cap-native\) #personalLifetimeStats\s*\{\s*display:none!important;/);
  assert.match(app, /mountPersonalInlineNodes\(slot, section\)/);
  assert.match(app, /function openPersonalSection\(section\)/);
  assert.match(app, /data-personal-inline/);
  assert.match(app, /calendar: \(node\) => node\.classList\.contains\('coffee-calendar'\)/);
  assert.match(app, /isWideWorkspace\(\)/);
  assert.match(app, /handlePersonalNavigation\(section\)/);
  assert.match(app, /personal-rating-card/);
  assert.match(app, /personal-latest-card/);
  assert.match(css, /\.personal-inline-settings \.settings-layout\s*\{[\s\S]*?display:grid/);
  assert.match(css, /#personalView \.personal-subnav\s*\{[\s\S]*?align-self:start;[\s\S]*?height:max-content/);
  // 3.0.5 §5：宽屏设置内分类改顶栏横向 chip，不再占左侧竖列
  assert.match(css, /\.personal-inline-settings \.settings-subnav\s*\{[\s\S]*?display:flex/);
  assert.match(css, /\.personal-inline-settings \.settings-subnav\s*\{[\s\S]*?gap:8px/);
  assert.match(css, /\.personal-inline-settings \.settings-subnav > button\s*\{[\s\S]*?min-height:38px;[\s\S]*?padding:0 15px;[\s\S]*?font-size:13px/);
  assert.match(css, /#settingsDialog \.settings-subnav\s*\{[\s\S]*?display:flex/);
  assert.doesNotMatch(css, /\.personal-inline-settings \.settings-layout\s*\{[\s\S]*?grid-template-columns:190px/);
});

test('复杂页面、工具流程与快捷面板使用不同层级', () => {
  assert.equal(AppShell.layerKind('detailDialog'), 'page');
  assert.equal(AppShell.layerKind('settingsDialog'), 'page');
  assert.equal(AppShell.layerKind('brewAssistDialog'), 'tool');
  assert.equal(AppShell.layerKind('scanImageDialog'), 'quick');
  assert.equal(AppShell.layerKind('imagePreviewDialog'), 'quick');
  assert.equal(AppShell.layerKind('sharePreviewDialog'), 'quick');
  assert.equal(AppShell.layerKind('choiceDialog'), 'quick');
  assert.equal(AppShell.layerKind('beanFilterDialog'), 'quick');
  assert.equal(AppShell.layerKind('confirmDialog'), 'quick');
});

test('现有页面与筛选面板全部进入 3.0 页面覆盖矩阵', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const ids = Array.from(html.matchAll(/<dialog\b[^>]*\bid="([^"]+)"/g), (match) => match[1]);
  const expected = {
    page: ['dataBackupDialog', 'coffeeCalendarDialog', 'insightsDialog', 'detailDialog', 'drinkDetailDialog', 'planDetailDialog', 'planEditorDialog', 'editorDialog', 'drinkDialog', 'settingsDialog', 'syncDialog', 'aboutDialog', 'migrationDialog'],
    tool: ['brewAssistDialog'],
    quick: ['choiceDialog', 'datePickerDialog', 'photoSourceDialog', 'scanImageDialog', 'imagePreviewDialog', 'shareImageChoiceDialog', 'planShareChoiceDialog', 'drinkShareChoiceDialog', 'planImportDialog', 'sharePreviewDialog', 'smartManagerDialog', 'syncAuthDialog', 'confirmDialog', 'numberPickerDialog', 'beanFilterDialog']
  };
  assert.equal(ids.length, 29);
  assert.deepEqual(ids.slice().sort(), Object.values(expected).flat().sort());
  Object.entries(expected).forEach(([kind, dialogIds]) => {
    dialogIds.forEach((id) => assert.equal(AppShell.layerKind(id), kind, id));
  });
});

test('真机验收修正保持底部面板、精简我的并吸顶豆子详情', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../www/styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../www/app.js'), 'utf8');
  const personal = html.slice(html.indexOf('id="personalView"'), html.indexOf('class="bottom-nav"'));
  const settings = html.slice(html.indexOf('id="settingsDialog"'), html.indexOf('</dialog>', html.indexOf('id="settingsDialog"')));
  assert.doesNotMatch(personal, /personal-profile-card|personalSince|我的咖啡日常|personal-dashboard|personalDashboard|calendar-entry-card|profileHeatmap/);
  assert.match(settings, /id="settingsClose"[^>]*aria-label="关闭"/);
  assert.match(css, /#scanImageDialog,#imagePreviewDialog,#sharePreviewDialog\s*\{[^}]*inset:auto 0 0;/);
  assert.match(css, /#detailDialog \.detail-header\s*\{[^}]*position:sticky;/);
  assert.match(css, /#detailDialog \.detail-header\.is-condensed/);
  assert.match(css, /\.profile-hero\.journal-hero\s*\{\s*min-height:calc\(276px \+ var\(--native-safe-top/);
  assert.match(css, /\.profile-hero\.has-photo \.profile-hero-thumb\s*\{[^}]*top:calc\(78px \+ var\(--native-safe-top/);
  assert.match(css, /\.profile-hero\.has-cutout \.profile-hero-thumb\s*\{[^}]*top:calc\(78px \+ var\(--native-safe-top[^}]*bottom:auto;/);
  assert.match(css, /\.drink-entry \.drink-meta > span,\.drink-entry \.dimension-summary span \{ background:transparent; \}/);
  assert.match(css, /\.assist-ring strong \{ line-height:1\.14; padding-bottom:\.08em; \}/);
  assert.match(app, /els\.detail\.addEventListener\('scroll', syncBeanDetailHeader/);
  assert.match(app, /detailDrink\.hidden = !canDrink/);
});

test('页面栈重复打开时移到栈顶，关闭时完整移除', () => {
  let stack = AppShell.updateLayerStack([], 'insightsDialog', true);
  stack = AppShell.updateLayerStack(stack, 'settingsDialog', true);
  stack = AppShell.updateLayerStack(stack, 'insightsDialog', true);
  assert.deepEqual(stack, ['settingsDialog', 'insightsDialog']);
  stack = AppShell.updateLayerStack(stack, 'insightsDialog', false);
  assert.deepEqual(stack, ['settingsDialog']);
});

test('返回键优先关闭快捷层和工具层，再关闭复杂页面', () => {
  assert.equal(AppShell.resolveBackLayer(['detailDialog', 'choiceDialog']), 'choiceDialog');
  assert.equal(AppShell.resolveBackLayer(['detailDialog', 'beanFilterDialog']), 'beanFilterDialog');
  assert.equal(AppShell.resolveBackLayer(['settingsDialog', 'syncAuthDialog']), 'syncAuthDialog');
  assert.equal(AppShell.resolveBackLayer(['drinkDialog', 'brewAssistDialog']), 'brewAssistDialog');
  assert.equal(AppShell.resolveBackLayer(['detailDialog']), 'detailDialog');
  assert.equal(AppShell.resolveBackLayer([]), null);
});
