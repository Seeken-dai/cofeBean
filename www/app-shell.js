// 豆仓 3.0 应用外壳：主导航、两档响应式布局、页面层分类与 Android 返回优先级。
// 纯函数可在 Node 中直接测试；DOM 控制器通过 create(deps) 注入业务导航回调。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDE_BREAKPOINT = 1100;
  // 手机壳左右滑切底栏：距离或速度达标即切；边缘避让 Android 返回手势。
  const TAB_SWIPE = {
    edgeGuard: 20,
    distance: 64,
    velocity: 0.5,
    axisRatio: 1.2,
    axisSlop: 10
  };
  const VIEW_META = {
    beans: { title: '豆仓', eyebrow: 'COFFEE VAULT' },
    drinks: { title: '饮用', eyebrow: 'BREW LOG' },
    plans: { title: '方案', eyebrow: 'BREW RECIPE' },
    personal: { title: '我的', eyebrow: 'PERSONAL BREW' }
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

  function adjacentNavigationView(current, direction, plansEnabled) {
    const items = navigationItems(plansEnabled);
    const index = items.indexOf(current);
    if (index < 0) return null;
    const next = items[index + Number(direction) || 0];
    return next || null;
  }

  function tabSwipeBlockedByLayers(flags) {
    const state = flags || {};
    return Boolean(state.hasPageLayer || state.hasQuickLayer || state.hasToolLayer || state.hasOpenDialog);
  }

  function tabSwipeFromEdge(clientX, viewportWidth, edgeGuard) {
    const guard = Number.isFinite(edgeGuard) ? edgeGuard : TAB_SWIPE.edgeGuard;
    const x = Number(clientX);
    const width = Number(viewportWidth);
    if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return true;
    return x < guard || x > width - guard;
  }

  function tabSwipeAxisDominant(dx, dy, ratio) {
    const axisRatio = Number.isFinite(ratio) ? ratio : TAB_SWIPE.axisRatio;
    return Math.abs(Number(dx) || 0) > Math.abs(Number(dy) || 0) * axisRatio;
  }

  function tabSwipeShouldSwitch(dx, dy, elapsedMs, thresholds) {
    const conf = Object.assign({}, TAB_SWIPE, thresholds || {});
    if (!tabSwipeAxisDominant(dx, dy, conf.axisRatio)) return false;
    const distance = Math.abs(Number(dx) || 0);
    const velocity = distance / Math.max(1, Number(elapsedMs) || 0);
    return distance >= conf.distance || velocity >= conf.velocity;
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

    function layersBlockTabSwipe() {
      return tabSwipeBlockedByLayers({
        hasPageLayer: body.classList.contains('has-page-layer'),
        hasQuickLayer: body.classList.contains('has-quick-layer'),
        hasToolLayer: body.classList.contains('has-tool-layer'),
        hasOpenDialog: Boolean(doc.querySelector('dialog[open]'))
      });
    }

    function isHorizontalScrollTarget(target) {
      const main = doc.querySelector('main');
      let node = target && target.nodeType === 1 ? target : target && target.parentElement;
      while (node && node !== main && node !== body && node !== rootNode) {
        if (node.nodeType === 1 && typeof win.getComputedStyle === 'function') {
          const style = win.getComputedStyle(node);
          const overflowX = style && style.overflowX;
          if ((overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
            && node.scrollWidth > node.clientWidth + 2) {
            return true;
          }
        }
        node = node.parentElement;
      }
      return false;
    }

    function bindTabSwipe() {
      const main = doc.querySelector('main');
      if (!main || main.dataset.shellTabSwipeBound === '1') return;
      main.dataset.shellTabSwipeBound = '1';
      let tracking = null;

      const clearTracking = () => { tracking = null; };

      main.addEventListener('pointerdown', (event) => {
        if (event.isPrimary === false) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (rootNode.dataset.shellLayout === 'wide') return;
        if (layersBlockTabSwipe()) return;
        if (event.target && event.target.closest
          && event.target.closest('input, textarea, select, button, a, label, [role="button"], [contenteditable="true"]')) return;
        if (isHorizontalScrollTarget(event.target)) return;
        if (tabSwipeFromEdge(event.clientX, win.innerWidth, TAB_SWIPE.edgeGuard)) return;
        tracking = {
          id: event.pointerId,
          x0: event.clientX,
          y0: event.clientY,
          t0: typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(),
          locked: false,
          horizontal: false
        };
      }, { passive: true });

      main.addEventListener('pointermove', (event) => {
        if (!tracking || event.pointerId !== tracking.id) return;
        if (rootNode.dataset.shellLayout === 'wide' || layersBlockTabSwipe()) {
          clearTracking();
          return;
        }
        const dx = event.clientX - tracking.x0;
        const dy = event.clientY - tracking.y0;
        if (!tracking.locked) {
          if (Math.abs(dx) < TAB_SWIPE.axisSlop && Math.abs(dy) < TAB_SWIPE.axisSlop) return;
          tracking.locked = true;
          tracking.horizontal = tabSwipeAxisDominant(dx, dy, TAB_SWIPE.axisRatio);
          if (!tracking.horizontal) clearTracking();
        }
      }, { passive: true });

      const finish = (event) => {
        if (!tracking || event.pointerId !== tracking.id) return;
        const dx = event.clientX - tracking.x0;
        const dy = event.clientY - tracking.y0;
        const started = tracking;
        clearTracking();
        if (rootNode.dataset.shellLayout === 'wide' || layersBlockTabSwipe()) return;
        const horizontal = started.horizontal
          || (!started.locked && tabSwipeAxisDominant(dx, dy, TAB_SWIPE.axisRatio));
        if (!horizontal) return;
        const elapsed = Math.max(1, (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - started.t0);
        if (!tabSwipeShouldSwitch(dx, dy, elapsed)) return;
        const direction = dx < 0 ? 1 : -1;
        const next = adjacentNavigationView(activeView, direction, plansEnabled);
        if (!next || typeof options.onView !== 'function') return;
        options.onView(next);
      };

      main.addEventListener('pointerup', finish, { passive: true });
      main.addEventListener('pointercancel', clearTracking, { passive: true });
      main.addEventListener('lostpointercapture', clearTracking, { passive: true });
    }

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
    bindTabSwipe();

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

  return {
    WIDE_BREAKPOINT,
    TAB_SWIPE,
    BACK_PRIORITY,
    layoutForWidth,
    navigationItems,
    adjacentNavigationView,
    tabSwipeBlockedByLayers,
    tabSwipeFromEdge,
    tabSwipeAxisDominant,
    tabSwipeShouldSwitch,
    layerKind,
    resolveBackLayer,
    updateLayerStack,
    create
  };
});
