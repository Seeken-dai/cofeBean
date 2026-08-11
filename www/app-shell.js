// 豆仓 3.0 应用外壳：主导航、两档响应式布局、页面层分类与 Android 返回优先级。
// 纯函数可在 Node 中直接测试；DOM 控制器通过 create(deps) 注入业务导航回调。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDE_BREAKPOINT = 1100;
  const VIEW_META = {
    beans: { title: '豆仓', eyebrow: 'COFFEE VAULT' },
    drinks: { title: '饮用记录', eyebrow: 'DRINK LOG' },
    plans: { title: '冲煮方案', eyebrow: 'BREW RECIPES' },
    personal: { title: '我的', eyebrow: 'MY COFFEE' }
  };
  const PAGE_LAYERS = new Set([
    'dataBackupDialog', 'coffeeCalendarDialog', 'insightsDialog',
    'detailDialog', 'drinkDetailDialog', 'planDetailDialog', 'planEditorDialog',
    'editorDialog', 'drinkDialog', 'settingsDialog', 'syncDialog', 'aboutDialog',
    'migrationDialog'
  ]);
  const TOOL_LAYERS = new Set(['brewAssistDialog']);
  const PERSONAL_LAYERS = new Set([
    'dataBackupDialog', 'coffeeCalendarDialog', 'insightsDialog',
    'settingsDialog', 'syncDialog', 'syncAuthDialog', 'aboutDialog', 'smartManagerDialog'
  ]);
  // 必须与业务上的“最上层先关闭”一致。数字滚轮由 AppNumberInput 在进入这里前单独处理。
  const BACK_PRIORITY = [
    'confirmDialog', 'sharePreviewDialog', 'drinkShareChoiceDialog', 'planShareChoiceDialog',
    'shareImageChoiceDialog', 'planImportDialog', 'beanFilterDialog', 'choiceDialog', 'datePickerDialog',
    'photoSourceDialog', 'scanImageDialog', 'imagePreviewDialog', 'brewAssistDialog',
    'drinkDialog', 'planEditorDialog', 'syncAuthDialog', 'syncDialog', 'dataBackupDialog',
    'insightsDialog', 'coffeeCalendarDialog', 'drinkDetailDialog', 'planDetailDialog',
    'aboutDialog', 'smartManagerDialog', 'settingsDialog', 'editorDialog',
    'detailDialog', 'migrationDialog'
  ];

  function layoutForWidth(width) {
    return Number(width) >= WIDE_BREAKPOINT ? 'wide' : 'mobile';
  }

  function navigationItems(plansEnabled) {
    return ['beans', 'drinks', ...(plansEnabled ? ['plans'] : []), 'personal'];
  }

  function layerKind(id) {
    if (TOOL_LAYERS.has(String(id || ''))) return 'tool';
    if (PAGE_LAYERS.has(String(id || ''))) return 'page';
    return 'quick';
  }

  function resolveBackLayer(openIds) {
    const open = new Set(Array.from(openIds || [], (id) => String(id || '')));
    return BACK_PRIORITY.find((id) => open.has(id)) || null;
  }

  function updateLayerStack(stack, id, open) {
    const next = Array.from(stack || [], (item) => String(item || '')).filter(Boolean);
    const key = String(id || '');
    if (!key) return next;
    let index = next.indexOf(key);
    while (index >= 0) { next.splice(index, 1); index = next.indexOf(key); }
    if (open) next.push(key);
    return next;
  }

  function create(deps) {
    const options = deps || {};
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    if (!doc || !win) return null;
    const rootNode = doc.documentElement;
    const body = doc.body;
    const title = doc.querySelector('#shellTitle');
    const eyebrow = doc.querySelector('#shellEyebrow');
    const stack = [];
    let activeView = 'beans';
    let plansEnabled = false;

    function setLayout() {
      const layout = layoutForWidth(win.innerWidth);
      rootNode.dataset.shellLayout = layout;
      body.classList.toggle('wide-shell', layout === 'wide');
      return layout;
    }

    function syncNavigationContext() {
      const topId = stack.length ? stack[stack.length - 1] : '';
      const personalLayer = PERSONAL_LAYERS.has(topId);
      doc.querySelectorAll('[data-shell-view]').forEach((button) => {
        const isPersonal = button.dataset.shellView === 'personal';
        const selected = isPersonal ? activeView === 'personal' || personalLayer : !personalLayer && button.dataset.shellView === activeView;
        button.classList.toggle('active', selected);
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      doc.querySelectorAll('[data-shell-action]').forEach((button) => {
        const action = button.dataset.shellAction;
        const selected = action === 'calendar' && topId === 'coffeeCalendarDialog'
          || action === 'insights' && topId === 'insightsDialog'
          || action === 'settings' && topId === 'settingsDialog'
          || action === 'sync' && ['syncDialog', 'syncAuthDialog'].includes(topId);
        button.classList.toggle('active', Boolean(selected));
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
    }

    function setView(view) {
      const next = VIEW_META[view] ? view : 'beans';
      activeView = !plansEnabled && next === 'plans' ? 'beans' : next;
      const meta = VIEW_META[activeView];
      if (title) title.textContent = meta.title;
      if (eyebrow) eyebrow.textContent = meta.eyebrow;
      body.dataset.shellView = activeView;
      syncNavigationContext();
      return activeView;
    }

    function setPlansEnabled(enabled) {
      plansEnabled = Boolean(enabled);
      doc.querySelectorAll('[data-shell-plan-item]').forEach((item) => { item.hidden = !plansEnabled; });
      body.classList.toggle('plans-enabled', plansEnabled);
      if (!plansEnabled && activeView === 'plans') setView('beans');
      return navigationItems(plansEnabled);
    }

    function classifyLayer(dialog) {
      if (!dialog || !dialog.id) return 'quick';
      const kind = dialog.id === 'drinkDialog' && dialog.classList.contains('quick-mode') ? 'quick' : layerKind(dialog.id);
      dialog.dataset.layerKind = kind;
      return kind;
    }

    function currentLayerKind(id) {
      const dialog = doc.getElementById(id);
      return dialog && dialog.dataset.layerKind || layerKind(id);
    }

    function syncLayerState() {
      const topId = stack.length ? stack[stack.length - 1] : '';
      body.dataset.appLayerDepth = String(stack.length);
      body.classList.toggle('has-page-layer', stack.some((id) => currentLayerKind(id) === 'page'));
      body.classList.toggle('has-tool-layer', stack.some((id) => currentLayerKind(id) === 'tool'));
      body.classList.toggle('has-quick-layer', stack.some((id) => currentLayerKind(id) === 'quick'));
      body.classList.toggle('has-context-detail', ['detailDialog', 'drinkDetailDialog', 'planDetailDialog'].includes(topId));
      body.dataset.contextDetail = topId === 'detailDialog' ? 'beans' : topId === 'drinkDetailDialog' ? 'drinks' : topId === 'planDetailDialog' ? 'plans' : '';
      syncNavigationContext();
    }

    function layerOpened(dialog) {
      if (!dialog || !dialog.id) return;
      classifyLayer(dialog);
      stack.splice(0, stack.length, ...updateLayerStack(stack, dialog.id, true));
      syncLayerState();
    }

    function layerClosed(dialog) {
      if (!dialog || !dialog.id) return;
      stack.splice(0, stack.length, ...updateLayerStack(stack, dialog.id, false));
      syncLayerState();
    }

    function refreshLayer(dialog) {
      if (!dialog || !dialog.id) return 'quick';
      const kind = classifyLayer(dialog);
      if (stack.includes(dialog.id)) syncLayerState();
      return kind;
    }

    function topLayer() { return stack.length ? stack[stack.length - 1] : null; }

    doc.querySelectorAll('dialog').forEach((dialog) => {
      classifyLayer(dialog);
      dialog.addEventListener('close', () => layerClosed(dialog));
    });
    doc.querySelectorAll('[data-shell-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.shellView;
        if (view === 'plans' && !plansEnabled) return;
        if (typeof options.onView === 'function') options.onView(view);
      });
    });
    doc.querySelectorAll('[data-shell-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof options.onAction === 'function') options.onAction(button.dataset.shellAction);
      });
    });
    win.addEventListener('resize', setLayout, { passive: true });
    setLayout();
    setPlansEnabled(false);
    setView('beans');

    return {
      setLayout,
      setView,
      setPlansEnabled,
      classifyLayer,
      layerOpened,
      layerClosed,
      refreshLayer,
      topLayer,
      resolveBackLayer,
      isWide: () => rootNode.dataset.shellLayout === 'wide'
    };
  }

  return { WIDE_BREAKPOINT, BACK_PRIORITY, layoutForWidth, navigationItems, layerKind, resolveBackLayer, updateLayerStack, create };
});
