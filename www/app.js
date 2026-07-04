(function () {
  'use strict';

  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));
  const SMART_FIELDS = ['roaster', 'origin', 'process'];
  const SMART_LABELS = { roaster: '烘焙商', origin: '产地', process: '处理法' };
  const FIELD_LABELS = { name: '豆名', roaster: '烘焙商', origin: '产地', process: '处理法', roastLevel: '烘焙度', roastDate: '烘焙日期', openedDate: '开封日期', purchaseUrl: '购买链接', bestFlavorDays: '最佳赏味期', initialWeight: '初始克重', remainingWeight: '剩余克重', tastingNotes: '风味笔记' };
  const PREDEFINED = { roaster: [], origin: [], process: ['日晒', '水洗', '蜜处理', '厌氧'] };
  const BREW_METHODS = BeanCore.BREW_METHODS || ['手冲', '冷萃', '冰滴', '意式', '法压', '摩卡壶', '爱乐压', '聪明杯', '虹吸', '自定义'];
  const DIMENSIONS = { aroma: '香气', acidity: '酸质', sweetness: '甜感', body: '醇厚度', aftertaste: '余韵', balance: '平衡度', bitterness: '苦涩感' };
  const PRICE_UNITS = { g: { label: '每克单价', grams: 1, suffix: '/ g' }, '50g': { label: '每 50g 单价', grams: 50, suffix: '/ 50g' }, '100g': { label: '每 100g 单价', grams: 100, suffix: '/ 100g' }, jin: { label: '每斤单价', grams: 500, suffix: '/ 斤' } };
  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const DRINK_PAGE_SIZE = 60;
  const themeColors = { 'dark-roast': '#1a1412', frost: '#f7f1e8', obsidian: '#1e2320', blaze: '#f5f3ea' };
  const state = { beans: [], drinkLogs: [], brewPlans: [], settings: BeanCore.normalizeSettings({}), view: 'beans', status: '全部', planMethod: '全部', query: '', sort: 'roastDate', direction: 'desc', drinkVisibleLimit: DRINK_PAGE_SIZE, editingId: null, editingDrinkId: null, viewingDrinkId: null, editingPlanId: null, viewingPlanId: null, managerField: null, choiceTarget: null, dateTarget: null, calendarDate: null, coffeeCalendarDate: new Date(), coffeeCalendarView: 'month', selectedCoffeeDay: BeanCore.dateKey(new Date()), activeDrinkStepIndex: -1, brewAssist: null, pendingImages: [], previewImage: null, shareBeanId: null, shareCardPreview: null, importScope: 'all', syncAuthMode: 'login', syncBusy: false, initialized: false, resuming: false };
  const cloudSync = window.BeanCloudSync ? window.BeanCloudSync.createSyncService() : null;
  let toastTimer = null;
  let confirmResolver = null;
  let assistTimer = null;
  let wakeLock = null;
  let cardPressTimer = null;
  let cardPressFired = false;
  let fabIdleTimer = null;
  let fabScrollTimer = null;
  let fabHintTimer = null;
  const els = { list: $('#beanList'), empty: $('#emptyState'), count: $('#recordCount'), searchPanel: $('#searchPanel'), search: $('#searchInput'), personal: $('#personalDialog'), backup: $('#dataBackupDialog'), calendar: $('#coffeeCalendarDialog'), detail: $('#detailDialog'), drinkDetail: $('#drinkDetailDialog'), planDetail: $('#planDetailDialog'), planEditor: $('#planEditorDialog'), editor: $('#editorDialog'), form: $('#beanForm'), planForm: $('#planForm'), drink: $('#drinkDialog'), drinkForm: $('#drinkForm'), brewAssist: $('#brewAssistDialog'), choice: $('#choiceDialog'), datePicker: $('#datePickerDialog'), photoSource: $('#photoSourceDialog'), scanImage: $('#scanImageDialog'), imagePreview: $('#imagePreviewDialog'), shareChoice: $('#shareImageChoiceDialog'), planShareChoice: $('#planShareChoiceDialog'), planImport: $('#planImportDialog'), manager: $('#smartManagerDialog'), settings: $('#settingsDialog'), sync: $('#syncDialog'), syncAuth: $('#syncAuthDialog'), about: $('#aboutDialog'), migration: $('#migrationDialog'), confirm: $('#confirmDialog'), exitConfirm: $('#exitConfirmDialog'), sharePreview: $('#sharePreviewDialog'), toast: $('#toast'), scanResult: $('#scanResult') };

  function capPlugin(name) { return window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; }
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) document.body.classList.add('cap-native');
  function toast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    if (els.toast.showPopover) {
      if (els.toast.parentElement !== document.body) document.body.appendChild(els.toast);
      if (!els.toast.matches(':popover-open')) els.toast.showPopover();
    } else {
      const openDialogs = document.querySelectorAll('dialog[open]');
      const host = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
      if (els.toast.parentElement !== host) host.appendChild(els.toast);
    }
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
      if (els.toast.hidePopover && els.toast.matches(':popover-open')) els.toast.hidePopover();
    }, 2600);
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
  function formatWeight(value) { const n = Number(value) || 0; return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}kg` : `${Math.round(n * 10) / 10}g`; }
  function formatPrice(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? `¥${Math.round(n * 100) / 100}` : '未记录'; }
  function unitPriceMeta() { return PRICE_UNITS[state.settings.priceUnit] || PRICE_UNITS.g; }
  function formatUnitPrice(bean) { const price = Number(bean.price); const grams = Number(bean.initialWeight); const unit = unitPriceMeta(); return Number.isFinite(price) && price > 0 && Number.isFinite(grams) && grams > 0 ? `¥${(price / grams * unit.grams).toFixed(2)} ${unit.suffix}` : '未记录'; }
  function formatDate(value) { if (!value) return '未记录'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date); }
  function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date); }
  function localDateTime(value) { const d = value ? new Date(value) : new Date(); const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return shifted.toISOString().slice(0, 16).replace('T', ' '); }
  function dateTimeValue(value) { return String(value || '').trim().replace(' ', 'T'); }
  function waterFromRatio(dose, ratio) { const match = String(ratio || '').match(/1\s*[:：]\s*(\d+(?:\.\d+)?)/); const n = match ? Number(match[1]) : null; return n && Number(dose) > 0 ? Math.round(Number(dose) * n * 10) / 10 : null; }
  function trimNumber(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace(/\.0$/, ''); }
  function ratioFromWater(dose, water) { const grams = Number(dose); const total = Number(water); return grams > 0 && total > 0 ? trimNumber(total / grams) : ''; }
  function brewPlansEnabled() { return Boolean(state.settings && state.settings.enableBrewPlans); }
  function parseRatio(value) { const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/); return match ? [match[1], match[2]] : ['1', '']; }
  function setRatioControls(prefix, ratio) { const [left, right] = parseRatio(ratio); $(`#${prefix}-ratio-left`).value = left || '1'; $(`#${prefix}-ratio-right`).value = right || ''; syncRatioValue(prefix); }
  function syncRatioValue(prefix) { const left = $(`#${prefix}-ratio-left`); const right = $(`#${prefix}-ratio-right`); const hidden = prefix === 'plan' ? $('#plan-ratio') : $('#drink-param-ratio'); if (hidden) hidden.value = right && right.value ? `${left.value || 1}:${right.value}` : ''; }
  function syncRatioFromTotal(prefix) {
    const dose = prefix === 'plan' ? $('#plan-dose').value : ($('#drink-param-dose').value || $('#drink-grams').value);
    const total = prefix === 'plan' ? $('#plan-totalWater').value : $('#drink-param-totalWater').value;
    const right = ratioFromWater(dose, total);
    if (!right) return;
    $(`#${prefix}-ratio-left`).value = '1';
    $(`#${prefix}-ratio-right`).value = right;
    syncRatioValue(prefix);
  }
  function secondsFromText(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const h = text.match(/(\d+(?:\.\d+)?)\s*h/i) || text.match(/(\d+(?:\.\d+)?)\s*时/);
    const m = text.match(/(\d+(?:\.\d+)?)\s*m(?!s)/i) || text.match(/(\d+(?:\.\d+)?)\s*分/);
    const s = text.match(/(\d+(?:\.\d+)?)\s*s/i) || text.match(/(\d+(?:\.\d+)?)\s*秒/);
    const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (colon) return (colon[3] ? Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]) : Number(colon[1]) * 60 + Number(colon[2]));
    if (h || m || s) return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  function durationText(seconds, mode) {
    if (!(seconds >= 0)) return '';
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.round(seconds % 60);
    if (mode === 'hour') return `${h}h${m ? `${m}m` : ''}`;
    return `${m + h * 60}:${String(s).padStart(2, '0')}`;
  }
  function setDurationControl(field, value) {
    const seconds = secondsFromText(value);
    field.querySelectorAll('input').forEach((input) => { input.value = ''; });
    if (seconds == null) return;
    const hour = field.querySelector('[data-duration-hour]'); const min = field.querySelector('[data-duration-min]'); const sec = field.querySelector('[data-duration-sec]');
    if (hour) { hour.value = Math.floor(seconds / 3600); if (min) min.value = Math.floor((seconds % 3600) / 60); }
    else { if (min) min.value = Math.floor(seconds / 60); if (sec) sec.value = Math.round(seconds % 60); }
  }
  function syncDurationField(field) {
    const target = $(`#${field.dataset.durationTarget}`);
    if (!target) return;
    const inputs = [...field.querySelectorAll('input')];
    if (field.hidden || inputs.every((input) => input.value === '')) { target.value = ''; return; }
    const hour = Number(field.querySelector('[data-duration-hour]')?.value || 0);
    const min = Number(field.querySelector('[data-duration-min]')?.value || 0);
    const sec = Number(field.querySelector('[data-duration-sec]')?.value || 0);
    target.value = durationText(hour * 3600 + min * 60 + sec, field.querySelector('[data-duration-hour]') ? 'hour' : 'minute');
  }
  function setDialog(dialog, open) { if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }
  function floatingActionsActive() { return ['beans', 'plans'].includes(state.view) && !(state.view === 'beans' && state.beans.length === 0); }
  function readLocalFlag(key) { try { return localStorage.getItem(key) === '1'; } catch (_) { return false; } }
  function writeLocalFlag(key) { try { localStorage.setItem(key, '1'); } catch (_) {} }
  function showFabHintOnce() {
    const key = 'coffee-vault-fab-hint-seen';
    if (readLocalFlag(key)) return;
    writeLocalFlag(key);
    clearTimeout(fabHintTimer);
    fabHintTimer = setTimeout(() => toast('右侧按钮可快速添加，空闲后会自动收起'), 700);
  }
  function collapseFloatingActions() {
    if (!floatingActionsActive()) return;
    document.body.classList.add('floating-actions-collapsed');
  }
  function scheduleFloatingActionCollapse(delay) {
    clearTimeout(fabIdleTimer);
    if (!floatingActionsActive()) return;
    fabIdleTimer = setTimeout(collapseFloatingActions, delay == null ? 4200 : delay);
  }
  function expandFloatingActions(options) {
    clearTimeout(fabIdleTimer);
    if (!floatingActionsActive()) return;
    document.body.classList.remove('floating-actions-collapsed');
    if (!options || options.autocollapse !== false) scheduleFloatingActionCollapse(options && options.delay);
  }
  function syncFloatingActions(options) {
    const active = floatingActionsActive();
    document.body.classList.toggle('has-floating-actions', active);
    if (!active) {
      clearTimeout(fabIdleTimer);
      document.body.classList.remove('floating-actions-collapsed');
      return;
    }
    expandFloatingActions({ delay: options && options.delay });
    if (options && options.showHint) showFabHintOnce();
  }
  function floatingActionClickGuard(event) {
    if (!document.body.classList.contains('floating-actions-collapsed')) return false;
    const button = event.target.closest('#addBean,#scanBean,#planImportFab');
    if (!button || button.hidden) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    expandFloatingActions();
    return true;
  }
  function resolveConfirm(ok) {
    const resolve = confirmResolver;
    confirmResolver = null;
    if (els.confirm.open) setDialog(els.confirm, false);
    if (resolve) resolve(Boolean(ok));
  }
  function askConfirm(options) {
    if (confirmResolver) resolveConfirm(false);
    const config = options || {};
    $('#confirmEyebrow').textContent = config.eyebrow || 'DELETE';
    $('#confirmTitle').textContent = config.title || '确认删除？';
    $('#confirmMessage').textContent = config.message || '此操作不可撤销。';
    $('#confirmAccept').textContent = config.confirmText || '删除';
    setDialog(els.confirm, true);
    setTimeout(() => $('#confirmCancel').focus(), 40);
    return new Promise((resolve) => { confirmResolver = resolve; });
  }
  function stars(value) { return value ? `<span class="stars" aria-label="${value} 星">${'★'.repeat(value)}${'☆'.repeat(5 - value)}</span>` : '<span class="unrated">未评分</span>'; }
  const webImageUrls = new Map(); // idb:<id> -> objectURL，渲染前由 resolveWebImages 预取
  function imageSrc(path) {
    if (path && String(path).indexOf('idb:') === 0) return webImageUrls.get(path) || '';
    return path && window.Capacitor && window.Capacitor.convertFileSrc ? window.Capacitor.convertFileSrc(path) : path;
  }
  async function resolveWebImages(beans) {
    if (BeanRepository.isNative()) return;
    const refs = new Set();
    (beans || []).forEach((bean) => ['bagImagePath', 'labelImagePath'].forEach((key) => { if (bean[key] && String(bean[key]).indexOf('idb:') === 0) refs.add(bean[key]); }));
    for (const [ref, url] of webImageUrls) { if (!refs.has(ref)) { URL.revokeObjectURL(url); webImageUrls.delete(ref); } }
    for (const ref of refs) {
      if (webImageUrls.has(ref)) continue;
      try { const blob = await BeanRepository.getWebImage(ref); if (blob) webImageUrls.set(ref, URL.createObjectURL(blob)); } catch (_) {}
    }
  }
  async function compressImageFile(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = long > 1600 ? 1600 / long : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('压缩失败')), 'image/webp', 0.8));
  }
  function pickWebImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }
  function imageCard(label, path, role, editable) { return path ? `<article class="vault-image-card" data-preview-image="${esc(path)}" data-preview-label="${esc(label)}" tabindex="0" role="button" aria-label="查看${esc(label)}大图"><img src="${esc(imageSrc(path))}" alt="${esc(label)}"><span>${esc(label)}</span>${editable ? `<div class="vault-image-actions"><button data-add-image-role="${role}" type="button">更换</button><button class="vault-image-remove" data-remove-image-role="${role}" type="button">删除</button></div>` : ''}</article>` : ''; }
  function imageSlot(label, path, role) { return path ? imageCard(label, path, role, true) : `<button class="vault-image-empty" data-add-image-role="${role}" type="button"><span>${esc(label)}</span><small>拍摄或读取图片</small></button>`; }
  function currentImageBean() { return { bagImagePath: $('#field-bagImagePath').value, labelImagePath: $('#field-labelImagePath').value }; }
  function renderImageVault(bean) { const source = bean || currentImageBean(); $('#editorImageVault').hidden = false; $('#editorImageVault').innerHTML = `<div class="section-heading"><div><span>袋子与标签</span><small>保存前可先预览，图片只留在本机</small></div></div>${imageSlot('咖啡袋', source.bagImagePath, 'bag')}${imageSlot('标签', source.labelImagePath, 'label')}`; }

  function render() { renderView(); renderBeans(); renderDrinks(); renderBrewPlans(); if (els.personal.open) renderPersonal(); if (els.calendar.open) renderCoffeeCalendar(); }
  function renderView() {
    if (!brewPlansEnabled() && state.view === 'plans') state.view = 'beans';
    $('#plansTab').hidden = !brewPlansEnabled();
    $('.view-tabs').classList.toggle('two-tabs', !brewPlansEnabled());
    $('#beansView').hidden = state.view !== 'beans'; $('#drinksView').hidden = state.view !== 'drinks'; $('#plansView').hidden = state.view !== 'plans';
    document.body.classList.toggle('empty-onboarding', state.view === 'beans' && state.beans.length === 0);
    $('#addBean').hidden = !floatingActionsActive(); $('#scanBean').hidden = state.view !== 'beans' || !floatingActionsActive(); $('#planImportFab').hidden = state.view !== 'plans';
    $('#addBean').setAttribute('aria-label', state.view === 'plans' ? '新增冲煮方案' : '新增咖啡豆');
    $('#addBean').textContent = '+';
    syncFloatingActions();
    els.search.placeholder = state.view === 'beans' ? '搜索豆名、产地或风味' : state.view === 'plans' ? '搜索方案、方式或备注' : '搜索豆名、冲煮方式或备注';
    $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    els.count.textContent = state.view === 'beans' ? `共 ${state.beans.length} 款咖啡豆` : state.view === 'plans' ? `共 ${state.brewPlans.length} 个方案` : `共记录 ${state.drinkLogs.length} 杯`;
  }
  function renderBeans() {
    const visible = BeanCore.filterAndSort(state.beans, state); const stats = BeanCore.summarize(state.beans);
    $('#statTotal').textContent = stats.total; $('#statActive').textContent = stats.active; $('#statRemaining').textContent = formatWeight(stats.remaining);
    renderBeanReminders();
    renderDrinkStarterHint();
    els.empty.hidden = visible.length > 0; els.list.hidden = visible.length === 0;
    renderBeanEmptyState(visible);
    els.list.innerHTML = visible.map((bean, index) => cardTemplate(bean, index)).join('');
    els.count.textContent = (state.query || state.status !== '全部') ? `显示 ${visible.length} / 共 ${state.beans.length} 款` : `共 ${state.beans.length} 款咖啡豆`;
  }
  function renderBeanEmptyState(visible) {
    if (visible.length) return;
    const isNewUser = state.beans.length === 0;
    els.empty.querySelector('h2').textContent = isNewUser ? '豆仓还是空的' : '没有匹配的豆子';
    els.empty.querySelector('p').textContent = isNewUser ? '先放入第一包咖啡豆，后面每一杯都会有迹可循。' : '换个关键词或筛选条件再试试。';
    const guide = $('#beanEmptyGuide');
    if (!guide) return;
    guide.hidden = !isNewUser;
    if (!isNewUser) { guide.innerHTML = ''; return; }
    guide.innerHTML = `
      <div class="empty-guide-actions">
        <button class="primary-button" type="button" data-empty-action="add">添加第一包</button>
        <button type="button" data-empty-action="scan">拍照识别</button>
        <button type="button" data-empty-action="backup">导入备份</button>
      </div>
      <div class="empty-guide-note"><b>默认离线</b><span>数据只保存在这台设备；卸载或换机前，记得从个人中心导出备份。</span></div>`;
  }
  function renderDrinkStarterHint() {
    const host = $('#drinkStarterHint');
    if (!host) return;
    const show = state.view === 'beans' && state.beans.length > 0 && state.drinkLogs.length === 0 && !readLocalFlag('coffee-vault-hint-first-drink');
    host.hidden = !show;
    if (!show) { host.innerHTML = ''; return; }
    host.innerHTML = '<b>记录第一杯</b><span>豆卡右侧的小杯子就是「喝一杯」，会自动扣减余量；也可以点进豆子详情再记录。</span><button type="button" data-drink-hint-dismiss>知道了</button>';
  }
  function bestFlavorText(bean) {
    const days = BeanCore.bestFlavorDaysLeft(bean);
    if (days == null) return '';
    if (days < 0) return `超过赏味期 ${Math.abs(days)} 天`;
    if (days === 0) return '今天到达赏味期';
    return `赏味期 ${days} 天`;
  }
  // 赏味期紧凑彩色标签（3b）：替代豆卡上冗长的「赏味期 X 天」文字 tag，省横向空间并加颜色档位。
  function freshPill(bean) {
    const fresh = BeanCore.beanFreshness(bean);
    if (!fresh) return '';
    if (bean.status === '已喝完' && fresh.daysLeft < 0) return '';
    const title = fresh.daysLeft < 0 ? `超过赏味期 ${Math.abs(fresh.daysLeft)} 天` : fresh.daysLeft === 0 ? '今天到达赏味期' : `赏味期还有 ${fresh.daysLeft} 天`;
    return `<span class="fresh-pill fresh-${fresh.level}" title="${esc(title)}"><i></i>${esc(fresh.label)}</span>`;
  }
  function renderBeanReminders() {
    const panel = $('#beanReminderPanel');
    const reminders = BeanCore.beanReminders(state.beans, state.settings).slice(0, 4);
    panel.hidden = reminders.length === 0 || state.view !== 'beans';
    if (panel.hidden) return;
    const counts = reminders.reduce((acc, item) => { acc[item.type] = (acc[item.type] || 0) + 1; return acc; }, {});
    panel.innerHTML = `<div><b>本机提醒</b><span>${counts.flavor || 0} 个赏味期 · ${counts.stock || 0} 个余量</span></div><div>${reminders.map((item) => `<button type="button" data-reminder-bean="${esc(item.beanId)}"><strong>${esc(item.beanName)}</strong><small>${esc(item.message)}</small></button>`).join('')}</div>`;
  }
  function thumbMotif(ph) {
    const y = 24 + (ph.shift % 56);
    const paths = [
      `M-8 ${y} Q 50 ${y - 34} 108 ${y}`,
      `M${20 + (ph.shift % 60)} -8 Q ${44 + (ph.shift % 40)} 50 ${20 + (ph.shift % 60)} 108`,
      `M-8 ${y} L 108 ${y - 24}`,
      `M50 50 m -42 0 a 42 42 0 1 0 84 0 a 42 42 0 1 0 -84 0`
    ];
    return `<svg class="bean-thumb-motif" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${paths[ph.variant] || paths[0]}" transform="rotate(${ph.angle} 50 50)"/></svg>`;
  }
  // 处理法角标（1.5 方案B 第二期）：生成封面左下角小图形，日晒/水洗/蜜处理/厌氧各一。
  const PROCESS_ICONS = {
    natural: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5"/>',
    washed: '<path d="M12 3.4c2.6 3.5 4.1 5.5 4.1 7.5a4.1 4.1 0 0 1-8.2 0c0-2 1.5-4 4.1-7.5Z"/>',
    honey: '<path d="M12 3l7 4v8l-7 4-7-4V7l7-4Z"/><path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8L12 8.2Z"/>',
    anaerobic: '<rect x="7.6" y="4" width="8.8" height="16" rx="3"/><path d="M10 9h4M10 12.5h4"/>'
  };
  function processBadge(bean) {
    const kind = BeanCore.beanProcessKind(bean.process);
    if (!kind) return '';
    return `<span class="bean-thumb-process" title="${esc(bean.process)}"><svg viewBox="0 0 24 24" aria-hidden="true">${PROCESS_ICONS[kind]}</svg></span>`;
  }
  // 缩略图容器：设置开启后列表展示封面；有袋图走照片，无袋图走生成式占位。A/B 共用同一 .bean-thumb 容器。
  function beanThumb(bean, options) {
    const config = options || {};
    const src = bean.bagImagePath ? imageSrc(bean.bagImagePath) : '';
    if (src && !config.forcePlaceholder) return `<div class="bean-thumb has-photo" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy"></div>`;
    const ph = BeanCore.beanPlaceholder(bean);
    const badge = bean.bagImagePath && config.markPhoto ? '<span class="bean-thumb-photo-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.5 6 10 4h4l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5Z"/><circle cx="12" cy="12.5" r="3.5"/></svg></span>' : '';
    return `<div class="bean-thumb generated bean-thumb--${esc(ph.roastKey)}${badge ? ' has-photo-badge' : ''}" aria-hidden="true">${thumbMotif(ph)}<span class="bean-thumb-glyph">${esc(ph.glyph)}</span>${processBadge(bean)}${badge}</div>`;
  }
  function remainingBar(bean, remaining) {
    const initial = Number(bean.initialWeight) || 0;
    if (!(initial > 0)) return '';
    const pct = Math.max(0, Math.min(100, Math.round(remaining / initial * 100)));
    const level = pct <= 12 ? ' is-low' : pct <= 30 ? ' is-mid' : '';
    return `<div class="remaining-bar${level}" role="presentation" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
  }
  function cardTemplate(bean, index) {
    const subtitle = [bean.roaster, bean.origin].filter(Boolean).join(' · ') || '等待补充烘焙商与产地';
    const tags = [bean.roastLevel, bean.process].filter(Boolean).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
    const remaining = Number(bean.remainingWeight) || 0; const grams = Math.min(state.settings.quickGrams, remaining);
    const showThumb = state.settings.showBeanPhotosInList;
    const thumb = showThumb ? `<div class="bean-thumb-wrap">${beanThumb(bean)}</div>` : '';
    return `<article class="bean-card ${showThumb ? 'has-thumb' : 'no-thumb'}" data-id="${esc(bean.id)}" data-status="${esc(bean.status)}" tabindex="0" role="button" aria-label="查看 ${esc(bean.name)}" style="animation-delay:${Math.min(index * 28, 180)}ms"><div class="status-rail"></div>${thumb}<div class="card-body"><div class="card-head"><div class="card-title-wrap"><h2 class="card-title">${esc(bean.name)}</h2><p class="card-subtitle">${esc(subtitle)}</p></div><div class="card-icons">${bean.favorite ? '<span class="favorite">◆</span>' : ''}<button class="quick-drink" data-drink-id="${esc(bean.id)}" type="button" aria-label="喝一杯 ${esc(formatWeight(grams))}" ${remaining <= 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 4c0 1 1 1 1 2M12 3c0 1 1 1 1 2"/></svg><span>${esc(formatWeight(grams))}</span></button></div></div><div class="card-bottom"><div class="tag-row"><span class="tag status">${esc(bean.status)}</span>${tags}${freshPill(bean)}</div><div class="compact-meta"><span>${esc(formatDate(bean.roastDate))}</span><strong>${esc(formatWeight(remaining))}</strong></div></div>${remainingBar(bean, remaining)}</div></article>`;
  }
  // 冲煮方式线性图标（20px 级，与 quick-drink 同风格）。时间线、方案卡、方案分组头共用。
  const BREW_ICONS = {
    '手冲': '<path d="M6 6h12l-2.4 6H8.4L6 6Z"/><path d="M12 15v2.5"/><path d="M12 20.5v.5"/>',
    '冷萃': '<rect x="7.5" y="7" width="9" height="13" rx="2"/><path d="M9.5 7V5h5v2"/><path d="M7.5 11h9"/>',
    '冰滴': '<path d="M12 3c2.2 3 3.5 4.6 3.5 6.2a3.5 3.5 0 0 1-7 0C8.5 7.6 9.8 6 12 3Z"/><path d="M8 16h8M9.5 19h5"/>',
    '意式': '<path d="M4 9h9l-1 3.2H5L4 9Z"/><path d="M13 10.2h6"/><path d="M8 13v3M10 13v3"/>',
    '法压': '<rect x="8" y="7.5" width="8" height="12.5" rx="1.5"/><path d="M12 7.5V3.5"/><path d="M9 5.5h6"/><path d="M8 12.5h8"/>',
    '摩卡壶': '<path d="M8 12l-1 8h10l-1-8"/><path d="M7.5 12h9l-1-4h-7l-1 4Z"/><path d="M16.5 9l2.5-1v3.2"/>',
    '爱乐压': '<path d="M9 9h6l-.6 11H9.6L9 9Z"/><path d="M12 9V4"/><path d="M9.6 6h4.8"/>',
    '聪明杯': '<path d="M6 7h12l-3 8.5H9L6 7Z"/><path d="M12 18.5v1"/>',
    '虹吸': '<circle cx="12" cy="7.5" r="3.5"/><path d="M12 11v2"/><path d="M8.5 20a3.5 3.5 0 0 0 7 0c0-2-3.5-7-3.5-7S8.5 18 8.5 20Z"/>',
    '自定义': '<path d="M12 5l1.7 4L18 10.5l-4.3 1.5L12 16l-1.7-4L6 10.5 10.3 9 12 5Z"/>'
  };
  function brewIcon(method) {
    const inner = BREW_ICONS[method] || BREW_ICONS['自定义'];
    return `<svg class="brew-icon" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  }
  // 风味笔记 → 彩色 chip；仅当能拆出 ≥2 个短词时才转标签，否则保留原文（避免把整句散文碎成标签）。
  function flavorChips(text) {
    const usable = BeanCore.flavorTags(text).filter((tag) => Array.from(tag.label).length <= 6);
    if (usable.length < 2) return '';
    return `<div class="flavor-chips">${usable.map((tag) => `<span class="flavor-chip flavor-${tag.category}">${esc(tag.label)}</span>`).join('')}</div>`;
  }
  function radarPoint(cx, cy, r, angleDeg) {
    const a = angleDeg * Math.PI / 180;
    return [Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10];
  }
  // 高级评价雷达图（苦度反向：外圈=更好，越苦越靠内）。坐标轴 = 该记录已评的维度，<3 维返回空串由调用方回退。
  function buildRatingRadar(log, options) {
    const opts = options || {};
    const keys = BeanCore.DIMENSION_KEYS.filter((key) => log[key]);
    if (keys.length < 3) return '';
    const labels = opts.labels !== false;
    const cx = 100, cy = 100, n = keys.length, maxR = labels ? 58 : 84;
    const angleAt = (i) => -90 + i * 360 / n;
    const plotR = (key) => { const raw = Math.max(1, Math.min(5, Number(log[key]) || 0)); return maxR * (key === 'bitterness' ? 6 - raw : raw) / 5; };
    const grid = [1, 2, 3, 4, 5].map((level) => {
      const pts = keys.map((_, i) => radarPoint(cx, cy, maxR * level / 5, angleAt(i)).join(',')).join(' ');
      return `<polygon points="${pts}" class="radar-grid"/>`;
    }).join('');
    const spokes = keys.map((_, i) => { const [x, y] = radarPoint(cx, cy, maxR, angleAt(i)); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis"/>`; }).join('');
    const shape = `<polygon points="${keys.map((key, i) => radarPoint(cx, cy, plotR(key), angleAt(i)).join(',')).join(' ')}" class="radar-shape"/>`;
    const dots = keys.map((key, i) => { const [x, y] = radarPoint(cx, cy, plotR(key), angleAt(i)); return `<circle cx="${x}" cy="${y}" r="2.6" class="radar-dot"/>`; }).join('');
    const labelSvg = labels ? keys.map((key, i) => {
      const [x, y] = radarPoint(cx, cy, maxR + 15, angleAt(i));
      const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label">${DIMENSIONS[key]}<tspan class="radar-label-val"> ${log[key]}${key === 'bitterness' ? '☹' : '☺'}</tspan></text>`;
    }).join('') : '';
    const cls = `rating-radar${labels ? '' : ' rating-radar--mini'}${opts.animate ? ' radar-enter' : ''}`;
    return `<svg class="${cls}" viewBox="0 0 200 200" role="img" aria-label="高级评价雷达图">${grid}${spokes}${shape}${dots}${labelSvg}</svg>`;
  }
  function logTemplate(log, compact) {
    const advancedKeys = BeanCore.DIMENSION_KEYS.filter((key) => log[key]);
    const radar = !compact && advancedKeys.length >= 3 ? buildRatingRadar(log, { labels: false }) : '';
    const tags = advancedKeys.map((key) => `<span>${DIMENSIONS[key]} ${key === 'bitterness' ? '☹' : '☺'}${log[key]}</span>`).join('');
    const advancedBlock = radar ? `<div class="dimension-radar-wrap">${radar}</div>` : (!compact && tags ? `<div class="dimension-summary">${tags}</div>` : '');
    return `<article class="drink-entry" data-log-id="${esc(log.id)}" tabindex="0" role="button"><div class="drink-dot"></div><div><div class="drink-head"><strong>${esc(log.beanName)}</strong><time>${esc(formatDateTime(log.consumedAt))}</time></div><p class="drink-meta"><span>${esc(formatWeight(log.grams))}</span><span class="method-label">${brewIcon(log.brewMethod)}${esc(log.brewMethod)}</span><span>${stars(log.overallRating)}</span></p>${log.notes ? `<p class="drink-notes">${esc(log.notes)}</p>` : ''}${advancedBlock}</div></article>`;
  }
  // 近 30 天饮用迷你条形图（3c）：每天一根柱，高度按杯数归一；今天高亮，空天留细基线。
  function renderDrinkTrend() {
    const host = $('#drinkTrend'); if (!host) return;
    const series = BeanCore.recentDrinkSeries(state.drinkLogs, 30);
    const total = series.reduce((sum, day) => sum + day.cups, 0);
    host.hidden = total === 0;
    if (host.hidden) { host.innerHTML = ''; return; }
    const max = Math.max(1, ...series.map((day) => day.cups));
    const todayKey = BeanCore.dateKey(new Date());
    const activeDays = series.filter((day) => day.cups).length;
    const bars = series.map((day) => {
      const cls = `${day.date === todayKey ? ' is-today' : ''}${day.cups ? '' : ' is-empty'}`;
      const style = day.cups ? ` style="height:${Math.max(14, Math.round(day.cups / max * 100))}%"` : '';
      return `<i class="${cls.trim()}"${style} title="${esc(`${day.date}：${day.cups} 杯${day.grams ? ' · ' + formatWeight(day.grams) : ''}`)}"></i>`;
    }).join('');
    host.innerHTML = `<div class="section-heading"><div><span>近 ${series.length} 天</span><small>${total} 杯 · ${activeDays} 天有记录</small></div></div><div class="drink-trend-bars">${bars}</div>`;
  }
  function renderDrinks() {
    const stats = BeanCore.summarizeDrinkLogs(state.drinkLogs); $('#drinkCups').textContent = stats.cups; $('#drinkGrams').textContent = formatWeight(stats.grams); $('#drinkAverage').textContent = stats.averageRating ? `${stats.averageRating}★` : '—';
    renderDrinkTrend();
    const q = String(state.query || '').trim().toLocaleLowerCase('zh-CN');
    const visible = q ? state.drinkLogs.filter((log) => [log.beanName, log.brewMethod, log.notes, formatWeight(log.grams), formatDateTime(log.consumedAt)].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(q))) : state.drinkLogs;
    $('#drinkEmpty').hidden = visible.length > 0;
    const pageSize = Math.max(DRINK_PAGE_SIZE, Number(state.drinkVisibleLimit) || DRINK_PAGE_SIZE);
    const paged = visible.slice(0, pageSize);
    if (state.view === 'drinks') els.count.textContent = q || paged.length < visible.length ? `显示 ${paged.length} / 共 ${visible.length} 杯` : `共记录 ${state.drinkLogs.length} 杯`;
    const groups = new Map(); paged.forEach((log) => { const key = new Date(log.consumedAt).toLocaleDateString('zh-CN'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(log); });
    const more = visible.length > paged.length ? `<button class="timeline-more" id="drinkLoadMore" type="button">再显示 ${Math.min(DRINK_PAGE_SIZE, visible.length - paged.length)} 杯</button>` : '';
    $('#globalDrinkList').innerHTML = [...groups.entries()].map(([date, logs]) => `<section class="timeline-group"><h2>${esc(date)}</h2>${logs.map((log) => logTemplate(log, false)).join('')}</section>`).join('') + more;
  }
  function renderBrewPlans() {
    const methods = new Set(state.brewPlans.map((plan) => plan.brewMethod).filter(Boolean));
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = new Map();
    state.drinkLogs.forEach((log) => { if (log.brewPlanName && new Date(log.consumedAt).getTime() >= cutoff) counts.set(log.brewPlanName, (counts.get(log.brewPlanName) || 0) + 1); });
    const popular = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    $('#planTotal').textContent = state.brewPlans.length;
    $('#planMethods').textContent = methods.size;
    $('#planPopular').textContent = popular ? popular[0].slice(0, 6) : '—';
    renderPlanMethodFilters([...methods]);
    const q = String(state.query || '').trim().toLocaleLowerCase('zh-CN');
    const methodFiltered = state.brewPlans.filter(planMatchesMethod);
    const visible = q ? methodFiltered.filter((plan) => [plan.name, plan.brewMethod, plan.notes, plan.grinder, plan.grindSetting].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(q))) : methodFiltered;
    $('#planEmpty').hidden = visible.length > 0; $('#brewPlanList').hidden = visible.length === 0;
    if (state.view === 'plans') els.count.textContent = (q || state.planMethod !== '全部') ? `显示 ${visible.length} / 共 ${state.brewPlans.length} 个方案` : `共 ${state.brewPlans.length} 个冲煮方案`;
    const groups = new Map();
    visible.forEach((plan) => { if (!groups.has(plan.brewMethod)) groups.set(plan.brewMethod, []); groups.get(plan.brewMethod).push(plan); });
    $('#brewPlanList').innerHTML = [...groups.entries()].map(([method, plans]) => `<section class="timeline-group plan-group"><h2>${brewIcon(method)}${esc(method)}</h2>${plans.map((plan) => planCardTemplate(plan)).join('')}</section>`).join('');
  }
  function renderPlanMethodFilters(methods) {
    const values = ['全部', ...methods.filter(Boolean).sort((a, b) => BREW_METHODS.indexOf(a) - BREW_METHODS.indexOf(b) || a.localeCompare(b, 'zh-CN'))];
    if (!values.includes(state.planMethod)) state.planMethod = '全部';
    $('#planMethodFilters').innerHTML = values.map((method) => `<button class="chip ${method === state.planMethod ? 'active' : ''}" data-value="${esc(method)}" type="button">${esc(method)}</button>`).join('');
  }
  function planMatchesMethod(plan) {
    return state.planMethod === '全部' || plan.brewMethod === state.planMethod;
  }
  function planCardTemplate(plan) {
    const bound = plan.beanIds.length ? `${plan.beanIds.length} 款豆` : '未绑定豆子';
    const facts = planFactList(plan).slice(0, 3).map((item) => `<span>${esc(item.label)} ${esc(item.value)}</span>`).join('');
    return `<article class="plan-card" data-plan-id="${esc(plan.id)}" tabindex="0" role="button" aria-label="查看 ${esc(plan.name)}"><div class="plan-card-head"><div><h3>${esc(plan.name)}</h3><p class="plan-card-meta"><span class="method-label">${brewIcon(plan.brewMethod)}${esc(plan.brewMethod)}</span><span>v${esc(plan.version)}</span><span>${esc(bound)}</span></p></div>${plan.source === 'preset' ? '<span class="tag status">预置</span>' : ''}</div><div class="dimension-summary">${facts || '<span>等待补充参数</span>'}</div></article>`;
  }
  function planFactList(plan, methodOverride) {
    const method = methodOverride || plan.brewMethod;
    const allowed = PLAN_METHOD_FIELDS[method] ? new Set(PLAN_METHOD_FIELDS[method]) : null;
    const items = [['dose', '粉量', plan.dose ? formatWeight(plan.dose) : ''], ['totalWater', '目标总水量', plan.totalWater ? formatWeight(plan.totalWater) : ''], ['ratio', '粉液比', plan.ratio], ['waterTemp', '水温', plan.waterTemp], ['grindSetting', '研磨', [plan.grinder, plan.grindSetting].filter(Boolean).join(' · ')], ['targetDuration', '总时长', plan.targetDuration], ['steepTime', '浸泡', plan.steepTime], ['steepEnvironment', '环境', plan.steepEnvironment], ['coffeeMachine', '咖啡机', plan.coffeeMachine], ['basket', '粉碗', plan.basket], ['targetYield', '目标出液', plan.targetYield ? formatWeight(plan.targetYield) : ''], ['targetExtractionTime', '萃取时间', plan.targetExtractionTime], ['pressTime', '下压时间', plan.pressTime], ['mokaPotSize', '规格', plan.mokaPotSize], ['useHotWater', '热水', plan.useHotWater ? '是' : ''], ['heatLevel', '火力', plan.heatLevel]];
    return items.filter(([key, , value]) => value && (!allowed || allowed.has(key))).map(([, label, value]) => ({ label, value }));
  }
  function beanNames(ids) { return (ids || []).map((id) => { const bean = state.beans.find((item) => item.id === id); return bean && bean.name; }).filter(Boolean); }
  function stepLines(plan) { return (plan.steps || []).map((step) => [step.label, step.water ? formatWeight(step.water) : '', step.time, step.note].filter(Boolean).join(' · ')); }
  function drinkParamSummary(snapshot, method) {
    const facts = planFactList(snapshot, method);
    const main = facts.slice(0, 4);
    const rest = facts.slice(4);
    const steps = (method || snapshot.brewMethod) === '手冲' ? (snapshot.steps || []).slice(0, 4) : [];
    return `<div class="brew-param-grid">${main.map((item) => `<div><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join('') || '<p class="compact-empty">已保存当时冲煮参数</p>'}</div>${rest.length ? `<div class="brew-param-tags">${rest.map((item) => `<span>${esc(item.label)} ${esc(item.value)}</span>`).join('')}</div>` : ''}${steps.length ? `<div class="brew-param-steps">${steps.map((step) => `<article><b>${esc(step.label || '步骤')}</b><span>${[step.water ? formatWeight(step.water) : '', step.time, step.note].filter(Boolean).map(esc).join(' · ')}</span></article>`).join('')}</div>` : ''}`;
  }
  const DRINK_PARAM_KEYS = ['dose', 'liquid', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket', 'targetYield', 'targetExtractionTime', 'pressTime', 'mokaPotSize', 'heatLevel', 'customMethod'];
  const PLAN_METHOD_FIELDS = {
    '手冲': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration'],
    '冷萃': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'steepTime', 'steepEnvironment'],
    '冰滴': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration'],
    '意式': ['dose', 'ratio', 'waterTemp', 'grinder', 'grindSetting', 'coffeeMachine', 'basket', 'targetYield', 'targetExtractionTime'],
    '法压': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'steepTime', 'pressTime'],
    '摩卡壶': ['dose', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'mokaPotSize', 'useHotWater', 'heatLevel'],
    '爱乐压': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration'],
    '聪明杯': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration'],
    '虹吸': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration'],
    '自定义': ['dose', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration', 'customMethod']
  };
  function daySummaries() { return BeanCore.summarizeDrinkDays(state.drinkLogs, state.beans); }
  function ymd(date) { return BeanCore.dateKey(date); }
  function dateFromKey(key) { const [y, m, d] = String(key || '').split('-').map(Number); return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1); }
  function money(value) { const n = Math.round((Number(value) || 0) * 100) / 100; return `¥${n % 1 ? n.toFixed(1) : n.toFixed(0)}`; }
  function dayLevel(day) { const grams = Number(day && day.grams) || 0; if (grams <= 0) return 0; if (grams <= 15) return 1; if (grams <= 30) return 2; if (grams <= 45) return 3; return 4; }
  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function statsForRange(days, predicate) { const values = Object.values(days).filter((day) => predicate(day.date)); const rated = values.filter((day) => day.averageRating); return { cups: values.reduce((sum, day) => sum + day.cups, 0), grams: Math.round(values.reduce((sum, day) => sum + day.grams, 0) * 10) / 10, cost: Math.round(values.reduce((sum, day) => sum + day.cost, 0) * 100) / 100, averageRating: rated.length ? Math.round(rated.reduce((sum, day) => sum + day.averageRating, 0) / rated.length * 10) / 10 : null }; }
  function continuousDays(days) { const keys = Object.keys(days).sort(); if (!keys.length) return 0; let cursor = dateFromKey(keys[keys.length - 1]); let count = 0; while (days[ymd(cursor)]) { count += 1; cursor.setDate(cursor.getDate() - 1); } return count; }
  function renderMiniHeatmap() { const days = daySummaries(); const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 41); const html = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const key = ymd(d); html.push(`<i class="heat-${dayLevel(days[key])}"></i>`); } $('#profileHeatmap').innerHTML = html.join(''); const stats = statsForRange(days, (key) => key.startsWith(monthKey(new Date()))); $('#profileCalendarStats').textContent = `本月 ${stats.cups} 杯 · ${formatWeight(stats.grams)} · ${money(stats.cost)}`; }
  function renderPersonal() { renderMiniHeatmap(); }
  function openPersonal() { renderPersonal(); setDialog(els.personal, true); }
  function openCoffeeCalendar(view) { state.coffeeCalendarView = view || state.coffeeCalendarView || 'month'; if (!state.selectedCoffeeDay) state.selectedCoffeeDay = ymd(new Date()); renderCoffeeCalendar(); setDialog(els.calendar, true); }
  function calendarSummary(stats, fourthLabel, fourthValue) { return `<article class="stat stat-primary"><strong>${esc(stats.cups)}</strong><span>${fourthLabel === '连续饮用' ? '杯数' : '本月杯数'}</span></article><div class="stat-divider"></div><article class="stat"><strong>${esc(formatWeight(stats.grams))}</strong><span>用豆</span></article><article class="stat"><strong>${esc(money(stats.cost))}</strong><span>估算花费</span></article><article class="stat"><strong>${esc(fourthValue)}</strong><span>${esc(fourthLabel)}</span></article>`; }
  function renderCoffeeCalendar() { const days = daySummaries(); const date = state.coffeeCalendarDate; const year = date.getFullYear(); const month = date.getMonth(); const monthStats = statsForRange(days, (key) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)); const yearStats = statsForRange(days, (key) => key.startsWith(`${year}-`)); const showingYear = state.coffeeCalendarView === 'year'; $('#monthCalendarView').hidden = showingYear; $('#yearCalendarView').hidden = !showingYear; $$('[data-calendar-view]').forEach((button) => button.classList.toggle('active', button.dataset.calendarView === state.coffeeCalendarView)); $('#calendarSummary').innerHTML = showingYear ? calendarSummary(yearStats, '连续饮用', `${continuousDays(days)} 天`) : calendarSummary(monthStats, '均分', monthStats.averageRating ? `${monthStats.averageRating}★` : '—'); renderMonthCalendar(days); renderYearCalendar(days); renderCalendarRecent(); }
  function renderMonthCalendar(days) { const date = state.coffeeCalendarDate; const year = date.getFullYear(); const month = date.getMonth(); const todayKey = ymd(new Date()); $('#monthCalendarTitle').textContent = `${year} 年 ${month + 1} 月`; const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7; const total = new Date(year, month + 1, 0).getDate(); let html = '<span></span>'.repeat(offset); for (let day = 1; day <= total; day += 1) { const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const selected = key === state.selectedCoffeeDay; const today = key === todayKey; html += `<button type="button" data-calendar-day="${key}" class="heat-${dayLevel(days[key])}${selected ? ' selected' : ''}${today ? ' today' : ''}">${day}</button>`; } $('#coffeeMonthGrid').innerHTML = html; renderSelectedDay(days[state.selectedCoffeeDay]); }
  function renderSelectedDay(day) { const host = $('#calendarDayDetail'); const key = day ? day.date : state.selectedCoffeeDay; const date = dateFromKey(key); const title = `${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}`; if (!day) { host.innerHTML = `<div class="day-detail-head"><div><h3>${esc(title)}</h3><span>没有饮用记录</span></div></div><p class="manager-empty">这一天还没有喝咖啡。</p>`; return; } host.innerHTML = `<div class="day-detail-head"><div><h3>${esc(title)}</h3><span>${day.cups} 杯记录</span></div><button id="calendarSeeLogs" type="button">去饮用记录</button></div><div class="day-stat-row"><span><b>${esc(formatWeight(day.grams))}</b><small>用豆</small></span><span><b>${esc(money(day.cost))}</b><small>估算花费</small></span><span><b>${day.averageRating ? `${day.averageRating}★` : '—'}</b><small>均分</small></span></div><div class="calendar-log-list">${day.logs.map((log) => `<article class="calendar-log" data-log-id="${esc(log.id)}"><b>${esc(log.beanName)}</b><span>${esc(log.brewMethod)} · ${esc(formatWeight(log.grams))} · ${esc(formatDateTime(log.consumedAt))}</span>${log.overallRating ? `<em>${stars(log.overallRating)}</em>` : ''}${log.notes ? `<p>${esc(log.notes)}</p>` : ''}</article>`).join('')}</div><p class="cost-note">花费根据咖啡豆价格估算，缺少价格的记录不会计入。</p>`; }
  function renderYearCalendar(days) { const year = state.coffeeCalendarDate.getFullYear(); const todayKey = ymd(new Date()); $('#yearCalendarTitle').textContent = `${year} 年历`; const start = new Date(year, 0, 1); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(year, 11, 31); end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7))); const weeks = []; const labels = []; let cursor = new Date(start); let weekIndex = 1; let lastMonth = -1; while (cursor <= end) { let cells = ''; for (let row = 0; row < 7; row += 1) { const inYear = cursor.getFullYear() === year; const key = ymd(cursor); if (inYear && cursor.getMonth() !== lastMonth) { lastMonth = cursor.getMonth(); labels.push(`<span style="grid-column:${weekIndex}">${MONTH_NAMES[lastMonth]}</span>`); } cells += inYear ? `<button type="button" data-year-day="${key}" class="heat-${dayLevel(days[key])}${key === state.selectedCoffeeDay ? ' selected' : ''}${key === todayKey ? ' today' : ''}" aria-label="${key}"></button>` : '<span></span>'; cursor.setDate(cursor.getDate() + 1); } weeks.push(`<div class="year-week">${cells}</div>`); weekIndex += 1; } const grid = $('#coffeeYearGrid'); grid.innerHTML = `<div class="year-month-labels" style="grid-template-columns:repeat(${weeks.length},10px)">${labels.join('')}</div><div class="year-weeks">${weeks.join('')}</div>`; renderYearPopover(days[state.selectedCoffeeDay]); if (state.coffeeCalendarView === 'year') requestAnimationFrame(() => { const selected = grid.querySelector(`[data-year-day="${state.selectedCoffeeDay}"]`); if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'center' }); requestAnimationFrame(() => renderYearPopover(days[state.selectedCoffeeDay], selected)); }); }
  function renderYearPopover(day, anchor) { const host = $('#yearPopover'); if (!day || state.coffeeCalendarView !== 'year') { host.hidden = true; return; } const date = dateFromKey(day.date); host.hidden = false; host.innerHTML = `<strong>${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}</strong><span>${money(day.cost)} · ${formatWeight(day.grams)} · ${day.averageRating ? `${day.averageRating}★` : '未评分'} · ${day.cups} 杯</span>`; if (!anchor) return; const wrap = host.closest('.year-heatmap-wrap'); const wrapRect = wrap.getBoundingClientRect(); const anchorRect = anchor.getBoundingClientRect(); const maxLeft = wrap.clientWidth - host.offsetWidth - 8; const left = Math.max(8, Math.min(maxLeft, anchorRect.left - wrapRect.left + anchorRect.width / 2 - host.offsetWidth / 2)); const above = anchorRect.top - wrapRect.top - host.offsetHeight - 8; const below = anchorRect.bottom - wrapRect.top + 8; host.classList.toggle('below', above < 8); host.style.left = `${left}px`; host.style.top = `${Math.max(8, above >= 8 ? above : below)}px`; }
  function renderCalendarRecent() { $('#calendarRecentList').innerHTML = state.drinkLogs.length ? state.drinkLogs.slice(0, 5).map((log) => logTemplate(log, true)).join('') : '<p class="manager-empty">还没有饮用记录。</p>'; }
  function shiftCoffeeMonth(delta) { state.coffeeCalendarDate.setMonth(state.coffeeCalendarDate.getMonth() + delta); state.selectedCoffeeDay = ymd(new Date(state.coffeeCalendarDate.getFullYear(), state.coffeeCalendarDate.getMonth(), 1)); renderCoffeeCalendar(); }
  function shiftCoffeeYear(delta) { const next = new Date(state.coffeeCalendarDate); next.setFullYear(next.getFullYear() + delta); state.coffeeCalendarDate = next; state.selectedCoffeeDay = ymd(next); renderCoffeeCalendar(); }
  // 详情页 hero（1.5 方案 C）：有图→模糊照片当氛围底 + 右上角清晰缩略图（点击进大图预览）；无图→烘焙度渐变兜底，结构不变。
  function renderDetailHero(bean) {
    const bg = $('#detailHeroBg'); const thumbHost = $('#detailHeroThumb');
    const src = bean.bagImagePath ? imageSrc(bean.bagImagePath) : '';
    if (src) {
      bg.className = 'profile-hero-bg has-photo'; bg.style.backgroundImage = `url("${src.replace(/["\\]/g, '\\$&')}")`;
      thumbHost.innerHTML = `<div class="bean-thumb has-photo" data-preview-image="${esc(bean.bagImagePath)}" data-preview-label="咖啡袋" role="button" tabindex="0" aria-label="查看咖啡袋大图"><img src="${esc(src)}" alt="" loading="lazy"></div>`;
    } else {
      const ph = BeanCore.beanPlaceholder(bean);
      bg.className = `profile-hero-bg bean-thumb--${ph.roastKey}`; bg.style.backgroundImage = '';
      thumbHost.innerHTML = beanThumb(bean);
    }
  }
  function detailFact(label, value, accent, attrs) { return `<div class="profile-fact${accent ? ' accent' : ''}"${attrs || ''}><span>${esc(label)}</span><strong>${esc(value || '未记录')}</strong></div>`; }
  function purchaseFact(bean) {
    return bean.purchaseUrl ? detailFact('购买链接', '点击打开', false, ` data-purchase-url="${esc(bean.purchaseUrl)}" role="button" tabindex="0" aria-label="打开购买链接"`) : '';
  }
  function openDetail(bean) {
    if (!bean) return; state.editingId = bean.id; const logs = state.drinkLogs.filter((log) => log.beanId === bean.id); const remaining = Number(bean.remainingWeight) || 0;
    renderDetailHero(bean);
    $('#detailName').textContent = bean.name; $('#detailTitle').textContent = bean.name; $('#detailStatus').textContent = bean.status; $('#detailStatus').dataset.status = bean.status;
    $('#detailSubtitle').textContent = [bean.roaster, bean.origin].filter(Boolean).join(' · ') || '尚未记录烘焙商与产地';
    $('#detailFacts').innerHTML = detailFact('剩余克重', formatWeight(remaining), true) + detailFact(unitPriceMeta().label, formatUnitPrice(bean), true) + purchaseFact(bean) + detailFact('最佳赏味期', bestFlavorText(bean) || (bean.bestFlavorDays ? `${bean.bestFlavorDays} 天 · 等待开封日期` : '未记录')) + detailFact('初始克重', bean.initialWeight == null ? '未记录' : formatWeight(bean.initialWeight)) + detailFact('烘焙日期', bean.roastDate) + detailFact('开封日期', bean.openedDate) + detailFact('处理法', bean.process) + detailFact('烘焙度', bean.roastLevel) + detailFact('价格', formatPrice(bean.price));
    const detailImages = imageCard('标签', bean.labelImagePath); const imageHint = bean.bagImagePath ? '咖啡袋正面已在顶部展示' : '本机留存图片';
    $('#detailImages').hidden = !detailImages; $('#detailImages').innerHTML = detailImages ? `<div class="section-heading"><div><span>标签图片</span><small>${imageHint}</small></div></div>${detailImages}` : '';
    const chips = flavorChips(bean.tastingNotes); $('#detailNotes').innerHTML = chips || esc(bean.tastingNotes || '还没有记录风味笔记。'); $('#detailNotesSection').classList.toggle('muted', !bean.tastingNotes);
    $('#detailDrink').dataset.beanId = bean.id; $('#detailDrink').disabled = remaining <= 0; $('#detailDrinkGrams').textContent = formatWeight(Math.min(state.settings.quickGrams, remaining));
    $('#detailHistorySummary').textContent = logs.length ? `${logs.length} 杯 · ${formatWeight(logs.reduce((sum, log) => sum + log.grams, 0))}` : '还没有饮用记录';
    $('#detailDrinkHistory').innerHTML = logs.length ? logs.map((log) => logTemplate(log, true)).join('') : '<p class="manager-empty">还没有喝过这款豆子。</p>';
    setDialog(els.detail, true);
  }
  function openDrinkDetail(log) {
    if (!log) return; state.viewingDrinkId = log.id; const bean = log.beanId ? state.beans.find((item) => item.id === log.beanId) : null;
    $('#drinkDetailTitle').textContent = log.beanName; $('#drinkDetailBean').textContent = log.beanName;
    $('#drinkDetailMeta').textContent = `${formatDateTime(log.consumedAt)} · ${log.brewMethod}`; $('#drinkDetailStars').innerHTML = stars(log.overallRating);
    $('#drinkDetailFacts').innerHTML = detailFact('本次用豆', formatWeight(log.grams), true) + detailFact('冲煮方式', log.brewMethod) + detailFact('饮用时间', formatDateTime(log.consumedAt)) + detailFact('整体评分', log.overallRating ? `${log.overallRating} / 5` : '未评分');
    const snapshot = log.brewPlanSnapshot;
    $('#drinkDetailPlanSection').hidden = !snapshot;
    $('#drinkSaveAsPlan').hidden = !(snapshot && brewPlansEnabled());
    if (snapshot) {
      $('#drinkDetailPlanSource').textContent = log.brewPlanId ? `${snapshot.name} · v${snapshot.version}` : '本次手填参数';
      $('#drinkDetailPlan').innerHTML = drinkParamSummary(snapshot, log.brewMethod);
    }
    $('#drinkDetailNotesSection').hidden = !log.notes;
    $('#drinkDetailNotes').textContent = log.notes || '';
    const dimensions = BeanCore.DIMENSION_KEYS.filter((key) => log[key]); $('#drinkDetailDimensions').hidden = !dimensions.length;
    const radar = buildRatingRadar(log, { labels: true, animate: true });
    $('#drinkDetailRadar').innerHTML = radar;
    // 画出雷达图时不再重复显示字段式维度列表（分值已标在雷达轴上）；不足 3 维回退到列表。
    $('#drinkDetailDimensionList').innerHTML = radar ? '' : dimensions.map((key) => `<div><span>${DIMENSIONS[key]}</span><strong>${key === 'bitterness' ? '☹' : '☺'} ${log[key]} / 5</strong></div>`).join('');
    $('#drinkDetailEdit').hidden = !bean; setDialog(els.drinkDetail, true);
  }

  function saveLogAsPlan() {
    const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId);
    if (!log || !log.brewPlanSnapshot) return;
    if (!brewPlansEnabled()) return toast('请先在设置中开启冲煮方案');
    const snap = log.brewPlanSnapshot;
    const draft = BeanCore.normalizeBrewPlan({ ...snap, version: 1, source: 'user', name: snap.name || `${log.beanName} ${log.brewMethod}`.trim(), brewMethod: log.brewMethod || snap.brewMethod, beanIds: log.beanId ? [log.beanId] : [] });
    draft.id = undefined;
    setDialog(els.drinkDetail, false);
    openPlanEditor(draft);
    $('#planEditorTitle').textContent = '存为新方案';
    toast('已带入本次参数，确认后保存');
  }
  function openPlanDetail(plan) {
    if (!plan) return; state.viewingPlanId = plan.id;
    $('#planDetailTitle').textContent = plan.name; $('#planDetailName').textContent = plan.name;
    $('#planDetailMeta').textContent = `${plan.brewMethod} · v${plan.version} · ${plan.source === 'preset' ? '预置方案' : '自定义方案'}`;
    $('#planAssistStart').hidden = plan.brewMethod !== '手冲' || !BeanCore.prepareBrewAssistSteps(plan.steps).length;
    $('#planDetailFacts').innerHTML = planFactList(plan).map((item, index) => detailFact(item.label, item.value, index === 0)).join('') || detailFact('参数', '未记录', true);
    const lines = stepLines(plan); $('#planDetailSteps').hidden = !lines.length;
    $('#planDetailStepList').innerHTML = lines.map((line) => `<div><span>步骤</span><strong>${esc(line)}</strong></div>`).join('');
    const names = beanNames(plan.beanIds); $('#planDetailBeans').textContent = names.length ? names.join('、') : '还没有绑定咖啡豆。';
    $('#planDetailNotes').textContent = plan.notes || '这个方案还没有备注。'; $('#planDetailNotesSection').classList.toggle('muted', !plan.notes);
    setDialog(els.planDetail, true);
  }

  function assistClock(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }
  function assistElapsed() {
    const assist = state.brewAssist;
    if (!assist || assist.completed) return assist ? assist.completedElapsed : 0;
    return assist.elapsed + (assist.paused || !assist.startedAt ? 0 : (Date.now() - assist.startedAt) / 1000);
  }
  function assistTotalWater(plan) {
    const total = Number(plan.totalWater) || BeanCore.prepareBrewAssistSteps(plan.steps).reduce((sum, step) => sum + (Number(step.water) || 0), 0);
    return total ? formatWeight(total) : '未记录';
  }
  function stopAssistTimer() {
    if (assistTimer) cancelAnimationFrame(assistTimer);
    assistTimer = null;
  }
  function showAssistComplete(elapsed) {
    const assist = state.brewAssist;
    if (!assist) return;
    assist.completed = true;
    assist.completedElapsed = Math.max(0, elapsed || assistElapsed());
    stopAssistTimer();
    $('#brewAssistRunning').hidden = true;
    $('#brewAssistComplete').hidden = false;
    $('#brewAssistResultMeta').textContent = assist.source === 'drink' ? '可回填到「喝一杯」继续评价。' : '本次辅助不会生成饮用记录。';
    $('#brewAssistResultDuration').textContent = durationText(assist.completedElapsed, 'minute');
    $('#brewAssistResultWater').textContent = assistTotalWater(assist.plan);
    $('#brewAssistResultPlan').textContent = assist.plan.name || '未命名方案';
    $('#brewAssistResultSteps').textContent = `${assist.steps.length} 段`;
    $('#brewAssistPause').hidden = true;
    $('#brewAssistSkip').hidden = true;
    $('#brewAssistFinish').textContent = assist.source === 'drink' ? '回填并继续记录' : '完成';
    $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
  }
  // 圆环中心突出「本段注水量」；无水量时回退显示占位。
  function setAssistWater(step) {
    const hasWater = step && step.water;
    $('#brewAssistWater').textContent = hasWater ? formatWeight(step.water) : (step ? '—' : '准备器具');
    $('#brewAssistWaterCaption').textContent = hasWater ? '本段目标注水' : (step ? '本段未记录水量' : '确认粉量、水量和器具后开始');
  }
  function assistNextBrief(step) {
    return `${step.label} · ${durationText(step.duration, 'minute')}${step.water ? ` · ${formatWeight(step.water)}` : ''}`;
  }
  // 圆环下方常驻「下一段」预览，避免临近换段时还要去列表里翻找。
  function setAssistNext(step, overtime) {
    const label = $('#brewAssistNextLabel');
    const text = $('#brewAssistNextText');
    if (overtime) { label.textContent = '手动结束'; text.textContent = '已到方案时间，点「结束」记录实际用时'; return; }
    if (step) { label.textContent = '下一段'; text.textContent = assistNextBrief(step); }
    else { label.textContent = '最后一段'; text.textContent = '完成后点「结束」记录用时'; }
  }
  function renderAssist() {
    const assist = state.brewAssist;
    if (!assist) return;
    const ring = $('#brewAssistRing');
    ring.classList.remove('assist-ring--gap');
    ring.setAttribute('aria-label', assist.phase === 'ready' ? '开始冲煮辅助' : '进入下一段');
    $('#brewAssistMeta').textContent = [assist.beanName, assist.plan.name, '手冲'].filter(Boolean).join(' · ');
    if (assist.phase === 'ready') {
      const first = assist.steps[0];
      $('#brewAssistPhase').textContent = `准备就绪 · 共 ${assist.steps.length} 段`;
      setAssistWater(first);
      $('#brewAssistTime').textContent = assistClock(0);
      $('#brewAssistStageMeta').textContent = first ? `${first.time} · 点圆环开始` : `全程 ${durationText(assist.total, 'minute')}`;
      $('#brewAssistRing').style.setProperty('--assist-progress', '0deg');
      setAssistNext(assist.steps[1], false);
      renderAssistSteps(-1);
      $('#brewAssistPause').textContent = '开始';
      $('#brewAssistSkip').hidden = true;
      $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
      return;
    }
    if (assist.phase === 'countdown') {
      const left = Math.max(0, 3 - (Date.now() - assist.countdownStartedAt) / 1000);
      $('#brewAssistPhase').textContent = '准备开始';
      setAssistWater(assist.steps[0]);
      $('#brewAssistTime').textContent = `00:0${Math.ceil(left) || 0}`;
      $('#brewAssistStageMeta').textContent = '倒计时结束进入第一段';
      $('#brewAssistRing').style.setProperty('--assist-progress', `${Math.min(360, (3 - left) / 3 * 360)}deg`);
      setAssistNext(assist.steps[1], false);
      renderAssistSteps(-1);
      $('#brewAssistPause').hidden = true;
      $('#brewAssistSkip').hidden = true;
      if (left <= 0) {
        assist.phase = 'running';
        assist.startedAt = Date.now();
        assist.elapsed = 0;
        renderAssist();
      }
      return;
    }
    const elapsed = assistElapsed();
    const status = BeanCore.brewAssistStatus(assist.steps, elapsed);
    // 两段之间的等待间奏：主圆环从满到空「回退」倒计时，提示用户此刻处于等待、准备下一段。
    if (status.phase === 'gap') {
      const remaining = Math.max(0, status.gapEnd - elapsed);
      const span = Math.max(1, status.gapEnd - status.gapStart);
      ring.classList.add('assist-ring--gap');
      $('#brewAssistPhase').textContent = '等待间奏 · 准备下一段';
      $('#brewAssistWater').textContent = String(Math.ceil(remaining));
      $('#brewAssistWaterCaption').textContent = '秒后进入下一段';
      $('#brewAssistTime').textContent = assistClock(remaining);
      $('#brewAssistStageMeta').textContent = status.next ? `下一段：${status.next.label}` : '';
      $('#brewAssistRing').style.setProperty('--assist-progress', `${Math.max(0, Math.min(360, remaining / span * 360))}deg`);
      setAssistNext(status.next, false);
      if (renderAssistSteps(status.index + 1)) scrollAssistToStage(status.index + 1);
      $('#brewAssistPause').hidden = false;
      $('#brewAssistSkip').hidden = false;
      $('#brewAssistPause').textContent = assist.paused ? '继续' : '暂停';
      $('#brewAssistFinish').textContent = '结束';
      $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
      return;
    }
    const current = status.current;
    // 到达方案总时长后不再自动结束：继续为最后一段计时（超时），由用户手动点「结束」记录实际用时。
    const overtime = status.phase === 'done';
    const next = assist.steps[status.index + 1];
    const stageElapsed = Math.max(0, elapsed - current.start);
    $('#brewAssistPhase').textContent = overtime ? `最后一段 · ${current.label}` : `第 ${status.index + 1}/${assist.steps.length} 段 · ${current.label}`;
    setAssistWater(current);
    $('#brewAssistTime').textContent = assistClock(stageElapsed);
    $('#brewAssistStageMeta').textContent = overtime ? `已超出方案 ${durationText(Math.max(0, elapsed - assist.total), 'minute')}` : current.time;
    $('#brewAssistRing').style.setProperty('--assist-progress', `${overtime ? 360 : Math.min(360, stageElapsed / current.duration * 360)}deg`);
    setAssistNext(next, overtime);
    if (renderAssistSteps(status.index)) scrollAssistToStage(status.index);
    $('#brewAssistPause').hidden = false;
    $('#brewAssistSkip').hidden = !next;
    $('#brewAssistPause').textContent = assist.paused ? '继续' : '暂停';
    $('#brewAssistFinish').textContent = overtime ? '结束记录' : '结束';
    $('#brewAssistFinish').classList.toggle('assist-finish-emphasis', overtime);
  }
  function renderAssistSteps(activeIndex) {
    const assist = state.brewAssist;
    if (!assist || assist.renderedStepIndex === activeIndex) return false;
    assist.renderedStepIndex = activeIndex;
    $('#brewAssistSteps').innerHTML = assist.steps.map((step, index) => assistStepTemplate(step, index, activeIndex)).join('');
    return true;
  }
  function scrollAssistToStage(activeIndex) {
    if (activeIndex < 0) return;
    const scroll = $('#brewAssistScroll');
    const active = $('#brewAssistSteps').children[activeIndex];
    if (!scroll || !active) return;
    const target = scroll.scrollTop + (active.getBoundingClientRect().top - scroll.getBoundingClientRect().top) - (scroll.clientHeight - active.offsetHeight) / 2;
    scroll.scrollTop = Math.max(0, target);
  }
  function assistStepTemplate(step, index, activeIndex) {
    const cls = index < activeIndex ? ' done' : index === activeIndex ? ' active' : '';
    return `<article class="assist-step${cls}"><b>${index < activeIndex ? '✓' : index + 1}</b><div><span>${esc(step.label)}</span><small>${esc(step.time)}</small></div><em>${step.water ? esc(formatWeight(step.water)) : '未记录'}</em></article>`;
  }
  function startAssistTimer() {
    stopAssistTimer();
    // 用 rAF 逐帧驱动，圆环进度由墙钟计算，做到 60fps 顺滑（进度精度不依赖帧率）。
    const loop = () => { renderAssist(); if (assistTimer) assistTimer = requestAnimationFrame(loop); };
    assistTimer = requestAnimationFrame(loop);
  }
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (_) { wakeLock = null; }
  }
  async function releaseWakeLock() {
    try { if (wakeLock) await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }
  function openBrewAssist(source, plan, beanName) {
    const normalized = BeanCore.normalizeBrewPlan(plan);
    const steps = BeanCore.prepareBrewAssistSteps(normalized.steps);
    if (normalized.brewMethod !== '手冲') return toast('第一版冲煮辅助仅支持手冲');
    if (!steps.length) return toast('这个方案还没有可计时的分段步骤');
    state.brewAssist = { source, plan: normalized, beanName: beanName || '', steps, total: steps[steps.length - 1].end, phase: 'ready', countdownStartedAt: null, startedAt: null, elapsed: 0, paused: false, completed: false, completedElapsed: 0, renderedStepIndex: null };
    $('#brewAssistRunning').hidden = false;
    $('#brewAssistComplete').hidden = true;
    $('#brewAssistPause').hidden = false;
    $('#brewAssistSkip').hidden = true;
    $('#brewAssistPause').textContent = '开始';
    $('#brewAssistFinish').textContent = '退出';
    $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
    if (source === 'drink') setDialog(els.drink, false);
    if (source === 'plan') setDialog(els.planDetail, false);
    renderAssist();
    startAssistTimer();
    setDialog(els.brewAssist, true);
    requestWakeLock();
  }
  function openDrinkBrewAssist() {
    if (currentDrinkMethod() !== '手冲') return toast('第一版冲煮辅助仅支持手冲');
    syncRatioValue('drink');
    $$('.duration-field', els.drinkForm).forEach(syncDurationField);
    const plan = selectedDrinkPlan();
    const snapshot = drinkParamSnapshot('手冲', plan);
    const bean = state.beans.find((item) => item.id === $('#drink-beanId').value);
    openBrewAssist('drink', snapshot, bean && bean.name);
  }
  function openPlanBrewAssist() {
    const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
    openBrewAssist('plan', plan, '');
  }
  function pauseBrewAssist() {
    const assist = state.brewAssist;
    if (!assist || assist.completed) return;
    if (assist.phase === 'ready') {
      assist.phase = 'countdown';
      assist.countdownStartedAt = Date.now();
      $('#brewAssistFinish').textContent = '结束';
      renderAssist();
      return;
    }
    if (assist.phase !== 'running') return;
    if (assist.paused) { assist.paused = false; assist.startedAt = Date.now(); }
    else { assist.elapsed = assistElapsed(); assist.paused = true; assist.startedAt = null; }
    renderAssist();
  }
  // 冲煮中点圆环 = 进入下一阶段（暂停改由底部按钮）；准备阶段点圆环仍是开始。
  function tapBrewAssistRing() {
    const assist = state.brewAssist;
    if (!assist || assist.completed) return;
    if (assist.phase === 'ready') return pauseBrewAssist();
    if (assist.phase !== 'running') return;
    skipBrewAssistStage();
  }
  function skipBrewAssistStage() {
    const assist = state.brewAssist;
    if (!assist || assist.completed || assist.phase !== 'running') return;
    const status = BeanCore.brewAssistStatus(assist.steps, assistElapsed());
    const next = assist.steps[status.index + 1];
    if (!next) return showAssistComplete(assistElapsed());
    assist.elapsed = next.start;
    assist.startedAt = assist.paused ? null : Date.now();
    renderAssist();
  }
  function finishBrewAssist() {
    const assist = state.brewAssist;
    if (!assist) return;
    if (assist.phase === 'ready') return cancelBrewAssist();
    if (!assist.completed) return showAssistComplete(assistElapsed());
    setDialog(els.brewAssist, false);
    stopAssistTimer();
    releaseWakeLock();
    if (assist.source === 'drink') {
      $('#drink-param-targetDuration').value = durationText(assist.completedElapsed, 'minute');
      const durationField = $('[data-duration-target="drink-param-targetDuration"]', els.drinkForm);
      if (durationField) setDurationControl(durationField, $('#drink-param-targetDuration').value);
      toast('已回填冲煮时长，可继续评价');
      setDialog(els.drink, true);
    } else {
      const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
      if (plan) openPlanDetail(plan);
    }
    state.brewAssist = null;
  }
  function cancelBrewAssist() {
    const assist = state.brewAssist;
    setDialog(els.brewAssist, false);
    stopAssistTimer();
    releaseWakeLock();
    if (assist && assist.source === 'drink') setDialog(els.drink, true);
    if (assist && assist.source === 'plan') {
      const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
      if (plan) openPlanDetail(plan);
    }
    state.brewAssist = null;
  }

  async function reload(options) {
    try { const [beans, logs, plans, settings] = await Promise.all([BeanRepository.getAll(), BeanRepository.getDrinkLogs(), BeanRepository.getBrewPlans(), BeanRepository.getSettings()]); state.beans = beans; state.drinkLogs = logs; state.brewPlans = plans; state.settings = settings; await resolveWebImages(beans); applyTheme(settings.theme, false); render(); if (els.detail.open && state.editingId) { const bean = state.beans.find((item) => item.id === state.editingId); if (bean) openDetail(bean); } if (els.drinkDetail.open && state.viewingDrinkId) { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); if (log) openDrinkDetail(log); } if (els.planDetail.open && state.viewingPlanId) { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); if (plan) openPlanDetail(plan); } if (!(options && options.keepForm) && els.editor.open && state.editingId) { const bean = state.beans.find((item) => item.id === state.editingId); if (bean) fillForm(bean); } }
    catch (error) { console.error(error); toast('读取豆仓失败，请重试'); }
  }

  async function openEditor(bean, scanResult) {
    state.editingId = bean ? bean.id : null; if (!scanResult) clearPendingImages(true); $('#editorTitle').textContent = bean ? '编辑咖啡豆' : '新增咖啡豆'; $('#deleteBean').hidden = !bean; els.form.reset(); $$('.field', els.form).forEach((field) => field.classList.remove('needs-review')); els.scanResult.hidden = true; els.scanResult.innerHTML = ''; SMART_FIELDS.forEach((field) => { $(`#field-${field}`).value = ''; });
    $('#field-remainingWeight').dataset.userEdited = bean ? '1' : '';
    if (bean) fillForm(bean); else if (scanResult) { fillForm(scanResult.fields); $('#field-remainingWeight').dataset.userEdited = $('#field-remainingWeight').value ? '1' : ''; syncInitialWeightToRemaining(); } else { $('#field-status').value = '未开封'; renderImageVault(); } await initSmartSelects(); syncAllChoiceTriggers(); if (scanResult) showScanResult(scanResult); setDialog(els.editor, true); setTimeout(() => $('#field-name').focus(), 120);
  }
  function fillForm(bean) { Object.entries(bean).forEach(([key, value]) => { const control = els.form.elements[key]; if (!control) return; if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value == null ? '' : value; }); SMART_FIELDS.forEach((field) => { $(`#field-${field}`).value = bean[field] || ''; }); renderImageVault(bean); }
  function syncInitialWeightToRemaining() { const remaining = $('#field-remainingWeight'); if (state.editingId || remaining.dataset.userEdited || remaining.value) return; remaining.value = $('#field-initialWeight').value; }
  function markRemainingWeightEdited() { if (!state.editingId) $('#field-remainingWeight').dataset.userEdited = '1'; }
  function showScanResult(result) { const count = result.recognizedFields.length; const low = result.lowConfidenceFields.map((field) => FIELD_LABELS[field] || field); els.scanResult.innerHTML = `<strong>${count ? `已离线识别 ${count} 个字段` : '没有识别出可靠字段'}</strong>${count ? '请核对后再保存。' : '可以重新拍摄，或继续手动填写。'}${low.length ? ` 黄色字段需要重点确认：${esc(low.join('、'))}` : ''}`; els.scanResult.hidden = false; result.lowConfidenceFields.forEach((field) => { const control = els.form.elements[field]; if (control && control.closest('.field')) control.closest('.field').classList.add('needs-review'); }); }
  async function askPhotoSource(options) { return new Promise((resolve) => { $('#photoSourceEyebrow').textContent = (options && options.eyebrow) || 'PHOTO'; $('#photoSourceTitle').textContent = (options && options.title) || '选择图片来源'; $('#photoSourceIntro').textContent = (options && options.intro) || '选择拍摄新照片，或从系统图片选择器读取已有照片。'; const finish = (source) => { cleanup(); setDialog(els.photoSource, false); resolve(source); }; const choose = (event) => { const button = event.target.closest('[data-photo-source]'); if (button) finish(button.dataset.photoSource); }; const skip = () => finish(null); const cleanup = () => { $('#photoSourceClose').removeEventListener('click', skip); els.photoSource.removeEventListener('close', skip); els.photoSource.removeEventListener('click', choose); }; $('#photoSourceClose').addEventListener('click', skip); els.photoSource.addEventListener('click', choose); els.photoSource.addEventListener('close', skip); setDialog(els.photoSource, true); }); }
  async function pickCoffeePhoto(options) { const camera = capPlugin('Camera'); if (!BeanRepository.isNative() || !camera) throw new Error('图片功能仅在 Android App 中可用'); const source = await askPhotoSource(options); if (!source) return null; return camera.getPhoto({ quality: 92, width: 2200, correctOrientation: true, allowEditing: false, resultType: 'uri', source: source === 'camera' ? 'CAMERA' : 'PHOTOS', saveToGallery: false }); }
  async function askScanImageRole(path, preview) { return new Promise((resolve) => { $('#scanImagePreview').src = imageSrc(preview || path); const finish = (role) => { cleanup(); setDialog(els.scanImage, false); resolve(role); }; const choose = (event) => { const button = event.target.closest('[data-image-role]'); if (button) finish(button.dataset.imageRole); }; const skip = () => finish(null); const cleanup = () => { $('#scanImageClose').removeEventListener('click', skip); $('#scanImageSkip').removeEventListener('click', skip); els.scanImage.removeEventListener('close', skip); els.scanImage.removeEventListener('click', choose); }; $('#scanImageClose').addEventListener('click', skip); $('#scanImageSkip').addEventListener('click', skip); els.scanImage.addEventListener('click', choose); els.scanImage.addEventListener('close', skip); setDialog(els.scanImage, true); }); }
  async function clearPendingImages(discard) {
    const pending = state.pendingImages.slice(); state.pendingImages = [];
    if (!discard || !pending.length) return;
    const scanner = capPlugin('CoffeeLabelScanner');
    pending.forEach((item) => {
      if (item.web) BeanRepository.deleteWebImage(item.ref);
      else if (scanner && scanner.discardImage) scanner.discardImage({ path: item.path }).catch(() => {});
    });
  }
  async function scanCoffeeLabel() { const button = $('#scanBean'); const scanner = capPlugin('CoffeeLabelScanner'); if (!BeanRepository.isNative() || !scanner) return toast('拍照识别仅在 Android App 中可用'); button.disabled = true; try { const photo = await pickCoffeePhoto({ eyebrow: 'OCR', title: '识别咖啡包装', intro: '选择拍摄包装，或读取已有咖啡袋/标签图片。' }); if (!photo) return; const path = photo.path || photo.webPath; if (!path) throw new Error('没有取得照片路径'); toast('正在离线识别包装文字…'); const scan = await scanner.recognize({ path, deleteSource: false }); const parsed = CoffeeParser.parse(scan, { knownRoasters: [...new Set(state.beans.map((bean) => bean.roaster).filter(Boolean))] }); const role = scanner.archiveImage ? await askScanImageRole(path, photo.webPath || path) : null; if (role) { state.pendingImages.push({ path, role }); parsed.fields[role === 'bag' ? 'bagImagePath' : 'labelImagePath'] = path; } else if (scanner.discardImage) await scanner.discardImage({ path }).catch(() => {}); await openEditor(null, parsed); } catch (error) { const message = String(error && error.message || error || ''); if (!/cancel|取消/i.test(message)) { console.error(error); toast(/permission|权限/i.test(message) ? '需要相机权限才能拍照或读取图片' : '识别失败，请重新拍摄'); } } finally { button.disabled = false; } }
  function setImageField(role, value) { $(`#field-${role === 'bag' ? 'bagImagePath' : 'labelImagePath'}`).value = value; }
  async function addBeanImageWeb(role) {
    const file = await pickWebImageFile();
    if (!file) return;
    const blob = await compressImageFile(file);
    const ref = await BeanRepository.saveWebImage(blob);
    webImageUrls.set(ref, URL.createObjectURL(blob));
    state.pendingImages.filter((item) => item.role === role && item.web).forEach((item) => BeanRepository.deleteWebImage(item.ref));
    state.pendingImages = state.pendingImages.filter((item) => item.role !== role);
    state.pendingImages.push({ ref, role, web: true });
    setImageField(role, ref);
    renderImageVault();
    toast(role === 'bag' ? '已添加咖啡袋图片' : '已添加标签图片');
  }
  async function addBeanImage(role) {
    if (!BeanRepository.isNative()) {
      try { await addBeanImageWeb(role); } catch (error) { console.error(error); toast('添加图片失败'); }
      return;
    }
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner) return toast('图片留存仅在 Android App 中可用');
    try { const photo = await pickCoffeePhoto({ eyebrow: 'BEAN PHOTO', title: role === 'bag' ? '添加咖啡袋图片' : '添加标签图片', intro: '图片会先显示在编辑页，保存咖啡豆后才正式归档。' }); if (!photo) return; const path = photo.path || photo.webPath; if (!path) throw new Error('没有取得照片路径'); state.pendingImages = state.pendingImages.filter((item) => item.role !== role); state.pendingImages.push({ path, role }); setImageField(role, path); renderImageVault(); toast(role === 'bag' ? '已添加咖啡袋图片' : '已添加标签图片'); } catch (error) { const message = String(error && error.message || error || ''); if (!/cancel|取消/i.test(message)) { console.error(error); toast(/permission|权限/i.test(message) ? '需要相机权限才能拍照或读取图片' : '添加图片失败'); } }
  }
  function removeBeanImage(role) {
    const scanner = capPlugin('CoffeeLabelScanner');
    state.pendingImages.filter((item) => item.role === role).forEach((item) => {
      if (item.web) BeanRepository.deleteWebImage(item.ref);
      else if (scanner && scanner.discardImage) scanner.discardImage({ path: item.path }).catch(() => {});
    });
    state.pendingImages = state.pendingImages.filter((item) => item.role !== role);
    setImageField(role, '');
    renderImageVault();
    toast(role === 'bag' ? '已移除咖啡袋图片' : '已移除标签图片');
  }
  async function archivePendingImages(fields) { if (!state.pendingImages.length) return fields; if (!BeanRepository.isNative()) { state.pendingImages = []; return fields; } const scanner = capPlugin('CoffeeLabelScanner'); if (!scanner || !scanner.archiveImage) return fields; let next = { ...fields }; for (const item of state.pendingImages) { const result = await scanner.archiveImage({ path: item.path, role: item.role, deleteSource: true }); next[item.role === 'bag' ? 'bagImagePath' : 'labelImagePath'] = result.path || result.uri || next[item.role === 'bag' ? 'bagImagePath' : 'labelImagePath'] || ''; } state.pendingImages = []; return next; }
  async function openPurchaseUrl(url) {
    if (!url) return;
    try {
      const opener = capPlugin('ExternalLinkOpener');
      if (BeanRepository.isNative() && opener) await opener.open({ url });
      else window.open(url, '_blank', 'noopener');
    } catch (error) {
      console.error(error);
      toast('无法打开购买链接');
    }
  }
  async function saveForm(event) { event.preventDefault(); const fd = new FormData(els.form); const old = state.editingId ? state.beans.find((bean) => bean.id === state.editingId) : null; const stamp = new Date().toISOString(); if (!String(fd.get('name') || '').trim()) return toast('请先填写豆名'); try { const fields = await archivePendingImages(Object.fromEntries(fd.entries())); const payload = BeanCore.normalizeBean({ ...(old || {}), ...fields, id: state.editingId || undefined, favorite: $('#field-favorite').checked, createdAt: old ? old.createdAt : stamp, updatedAt: stamp }, stamp); await BeanRepository.save(payload); setDialog(els.editor, false); state.editingId = null; await reload(); let savedMsg = old ? '记录已更新' : '咖啡豆已入仓'; const nudgeKey = `coffee-vault-photo-nudge:${payload.id}`; if (state.settings.showBeanPhotosInList && !payload.bagImagePath && !readLocalFlag(nudgeKey)) { savedMsg += ' · 拍张袋子照，列表更好认'; writeLocalFlag(nudgeKey); } toast(savedMsg); } catch (error) { console.error(error); toast('保存失败，请稍后重试'); } }
  async function removeCurrent() {
    if (!state.editingId) return;
    const bean = state.beans.find((item) => item.id === state.editingId);
    const ok = await askConfirm({ title: bean ? `删除「${bean.name}」？` : '删除咖啡豆？', message: '饮用历史会保留，只从豆仓列表隐藏这包豆子。' });
    if (!ok) return;
    try { await BeanRepository.remove(state.editingId); setDialog(els.editor, false); state.editingId = null; await reload(); toast('豆子已删除，饮用历史已保留'); } catch (error) { console.error(error); toast('删除失败'); }
  }

  function fillPlanMethodOptions() { $('#plan-method').innerHTML = BREW_METHODS.map((method) => `<option>${esc(method)}</option>`).join(''); }
  function renderPlanBeanBind(selected) {
    const ids = new Set(selected || []);
    $('#planBeanBind').innerHTML = `<div class="section-heading"><div><span>绑定咖啡豆</span><small>新增饮用记录时优先推荐绑定方案</small></div></div><div class="bean-bind-grid">${state.beans.length ? state.beans.map((bean) => `<label><input type="checkbox" value="${esc(bean.id)}" ${ids.has(bean.id) ? 'checked' : ''}><span>${esc(bean.name)}</span></label>`).join('') : '<p class="manager-empty">豆仓暂无咖啡豆，可先保存方案。</p>'}</div>`;
  }
  function planToForm(plan) {
    els.planForm.reset(); fillPlanMethodOptions();
    const p = plan ? BeanCore.normalizeBrewPlan(plan, plan.updatedAt) : BeanCore.normalizeBrewPlan({ brewMethod: '手冲', dose: state.settings.quickGrams });
    $('#plan-id').value = p.id || ''; $('#plan-version').value = p.version || 1; $('#plan-source').value = p.source || 'user';
    ['name', 'dose', 'liquid', 'ratio', 'totalWater', 'waterTemp', 'grinder', 'grindSetting', 'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket', 'targetYield', 'targetExtractionTime', 'pressTime', 'mokaPotSize', 'heatLevel', 'customMethod', 'notes'].forEach((key) => { const el = $(`#plan-${key}`); if (el) el.value = p[key] == null ? '' : String(p[key]).replace('°C', ''); });
    setRatioControls('plan', p.ratio);
    $('#plan-method').value = p.brewMethod || '手冲'; $('#plan-useHotWater').checked = Boolean(p.useHotWater);
    $('#plan-steps').value = (p.steps || []).map((step) => [step.label, step.water || '', step.time, step.note].filter(Boolean).join(' | ')).join('\n');
    renderPourSteps(p.steps); renderPlanBeanBind(p.beanIds); syncPlanMethodFields(); syncDurationControls(els.planForm); syncPlanTotalWater(); initPlanSmartSelects(); syncAllChoiceTriggers();
  }
  function syncPlanMethodFields() {
    const method = $('#plan-method').value;
    $$('.method-field', els.planForm).forEach((field) => { field.hidden = !String(field.dataset.methods || '').split(' ').includes(method); });
    $('#planStepsTextField').hidden = method === '手冲';
  }
  function syncPlanTotalWater() {
    const total = waterFromRatio($('#plan-dose').value, $('#plan-ratio').value);
    if (total != null && !$('#plan-totalWater').closest('.field').hidden) $('#plan-totalWater').value = total;
  }
  function syncPlanRatioFromWater() {
    if ($('#plan-totalWater').closest('.field').hidden) return;
    syncRatioFromTotal('plan');
  }
  function pourStageName(index) { return index === 0 ? '闷蒸' : `第 ${index} 段`; }
  function timeParts(value) {
    const text = String(value || '').trim();
    const match = text.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})$/) || text.match(/^(\d+):(\d{1,2})$/);
    if (!match) return { min: '', sec: '' };
    if (match.length === 4) return { min: String(Number(match[1] || 0) * 60 + Number(match[2] || 0)), sec: String(Number(match[3] || 0)) };
    return { min: String(Number(match[1] || 0)), sec: String(Number(match[2] || 0)) };
  }
  function pourTimeControl(prefix, value) {
    const parts = timeParts(value);
    return `<div class="pour-time-control"><input data-pour-${prefix}-min type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${esc(parts.min)}" placeholder="0"><b>分</b><input data-pour-${prefix}-sec type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${esc(parts.sec)}" placeholder="30"><b>秒</b></div>`;
  }
  function pourTimeValue(row, prefix) {
    const min = Number($(`[data-pour-${prefix}-min]`, row).value || 0);
    const secInput = $(`[data-pour-${prefix}-sec]`, row).value;
    const sec = Number(secInput || 0);
    return min || secInput !== '' ? `${min}:${pad(Math.min(59, Math.max(0, sec)))}` : '';
  }
  function cleanPlanFieldsForMethod(fields) {
    const allowed = new Set(PLAN_METHOD_FIELDS[fields.brewMethod] || PLAN_METHOD_FIELDS['自定义']);
    ['liquid', 'totalWater', 'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket', 'targetYield', 'targetExtractionTime', 'pressTime', 'mokaPotSize', 'heatLevel', 'customMethod'].forEach((key) => {
      if (!allowed.has(key)) fields[key] = '';
    });
    if (!allowed.has('useHotWater')) fields.useHotWater = false;
    return fields;
  }
  function parsePlanSteps(value) {
    return String(value || '').split(/\n+/).map((line) => {
      const [label, water, time, note] = line.split('|').map((part) => part.trim());
      return { label, water, time, note };
    }).filter((step) => step.label || step.water || step.time || step.note);
  }
  function renderPourSteps(steps) {
    const rows = steps && steps.length ? steps : [{ label: '闷蒸', water: 30, startTime: '0:00', endTime: '0:30' }];
    let previousEnd = '';
    $('#pourStepList').innerHTML = rows.map((step, index) => {
      const stage = pourStageName(index);
      const parts = String(step.time || '').split('-');
      const start = step.startTime || parts[0] || previousEnd || '';
      const end = step.endTime || parts[1] || '';
      previousEnd = end || previousEnd;
      return `<article class="pour-step" data-step-index="${index}"><div class="pour-step-head"><strong>${esc(stage)}</strong><button type="button" data-remove-pour-step="${index}" aria-label="删除这一段">×</button></div><div class="pour-step-grid"><label><span>名称</span><input data-pour-label type="text" maxlength="80" value="${esc(step.label || stage)}" placeholder="${esc(stage)}"></label><label><span>水量</span><div class="input-unit"><input data-pour-water type="number" min="0" step="0.1" inputmode="decimal" value="${step.water == null ? '' : esc(step.water)}"><em>g</em></div></label><label><span>开始</span>${pourTimeControl('start', start)}</label><label><span>结束</span>${pourTimeControl('end', end)}</label><label class="full"><span>备注</span><input data-pour-note type="text" maxlength="200" value="${esc(step.note || '')}" placeholder="可选"></label></div></article>`;
    }).join('');
  }
  function readPourSteps() {
    return $$('.pour-step', $('#pourStepList')).map((row) => {
      const startTime = pourTimeValue(row, 'start');
      const endTime = pourTimeValue(row, 'end');
      return { label: $('[data-pour-label]', row).value.trim(), water: $('[data-pour-water]', row).value, startTime, endTime, time: [startTime, endTime].filter(Boolean).join('-'), note: $('[data-pour-note]', row).value.trim() };
    }).filter((step) => step.label || step.water || step.startTime || step.endTime || step.note);
  }
  function addPourStepFromLast() {
    const rows = readPourSteps();
    const last = rows[rows.length - 1];
    rows.push({ label: pourStageName(rows.length), water: '', startTime: last ? last.endTime : '', endTime: '' });
    renderPourSteps(rows);
  }
  function syncDurationControls(scope) { $$('.duration-field', scope || document).forEach((field) => setDurationControl(field, $(`#${field.dataset.durationTarget}`)?.value)); }
  function fillTemplateOptions(method) {
    const select = $('#plan-template');
    const current = select.value;
    const source = state.brewPlans.filter((plan) => !method || plan.brewMethod === method);
    select.innerHTML = '<option value="">不使用模板</option>' + source.map((plan) => `<option value="${esc(plan.id)}">${esc(plan.name)} · ${esc(plan.brewMethod)}${plan.source === 'preset' ? ' · 预置' : ''}</option>`).join('');
    select.value = source.some((plan) => plan.id === current) ? current : '';
    syncAllChoiceTriggers();
  }
  function applySelectedTemplate() {
    const id = $('#plan-template').value; const source = state.brewPlans.find((plan) => plan.id === id);
    if (!source) return;
    const copy = BeanCore.cloneBrewPlan(source, { name: source.source === 'preset' ? source.name : `${source.name} 副本`, source: source.source === 'preset' ? 'user' : 'copy' });
    planToForm(copy); fillTemplateOptions(source.brewMethod); $('#plan-template').value = id; syncAllChoiceTriggers();
  }
  function openPlanEditor(plan) {
    const editingPreset = plan && plan.source === 'preset';
    state.editingPlanId = plan && !editingPreset ? plan.id : null;
    $('#planEditorTitle').textContent = plan ? editingPreset ? '复制预置方案' : '编辑冲煮方案' : '新增冲煮方案';
    $('#planEditorDelete').hidden = !state.editingPlanId;
    planToForm(editingPreset ? BeanCore.cloneBrewPlan(plan, { name: plan.name, source: 'user' }) : plan);
    $('#plan-template').disabled = Boolean(plan);
    $('#plan-template').closest('.field').hidden = Boolean(plan);
    fillTemplateOptions($('#plan-method').value); setDialog(els.planEditor, true); setTimeout(() => $('#plan-name').focus(), 120);
  }
  async function savePlan(event) {
    event.preventDefault(); const old = state.editingPlanId ? state.brewPlans.find((plan) => plan.id === state.editingPlanId) : null;
    syncRatioValue('plan'); $$('.duration-field', els.planForm).forEach(syncDurationField);
    const fd = new FormData(els.planForm);
    const fields = Object.fromEntries(fd.entries()); const selectedBeans = $$('#planBeanBind input:checked').map((input) => input.value);
    if (!String(fields.name || '').trim()) return toast('请填写方案名称');
    const cleaned = cleanPlanFieldsForMethod({ ...fields, useHotWater: $('#plan-useHotWater').checked, waterTemp: fields.waterTemp ? `${fields.waterTemp}°C` : '' });
    const steps = $('#plan-method').value === '手冲' ? readPourSteps() : parsePlanSteps($('#plan-steps').value);
    const payload = BeanCore.normalizeBrewPlan({ ...(old || {}), ...cleaned, id: state.editingPlanId || fields.id || undefined, source: old ? old.source : ($('#plan-source').value || 'user'), beanIds: selectedBeans, steps });
    try { await BeanRepository.saveBrewPlan(payload); setDialog(els.planEditor, false); state.editingPlanId = null; await reload(); toast(old ? '方案已更新' : '方案已保存'); } catch (error) { console.error(error); toast(error.message || '方案保存失败'); }
  }
  async function duplicateCurrentPlan() {
    const id = state.viewingPlanId; if (!id) return;
    try { const copy = await BeanRepository.duplicateBrewPlan(id); await reload(); openPlanDetail(copy); toast('已复制方案'); } catch (error) { console.error(error); toast(error.message || '复制失败'); }
  }
  async function deleteCurrentPlan() {
    const id = state.editingPlanId || state.viewingPlanId; const plan = state.brewPlans.find((item) => item.id === id);
    if (!plan) return;
    if (plan.source === 'preset') return toast('预置方案不能删除，可复制后编辑');
    if (!await askConfirm({ title: `删除「${plan.name}」？`, message: '历史饮用记录会保留当时的冲煮参数快照。' })) return;
    try { await BeanRepository.deleteBrewPlan(id); setDialog(els.planDetail, false); setDialog(els.planEditor, false); state.viewingPlanId = null; state.editingPlanId = null; await reload(); toast('方案已删除'); } catch (error) { console.error(error); toast(error.message || '删除失败'); }
  }

  function selectLabel(select) { const field = select.closest('.field'); const label = field && field.querySelector('.field-heading label, :scope > span'); return label ? label.textContent.trim() : '选择选项'; }
  function syncChoiceTrigger(select) { const trigger = select.nextElementSibling && select.nextElementSibling.classList.contains('select-trigger') ? select.nextElementSibling : null; if (!trigger) return; const option = select.options[select.selectedIndex]; trigger.querySelector('span').textContent = option && option.value ? option.textContent : '请选择'; trigger.classList.toggle('has-value', Boolean(option && option.value)); }
  function enhanceSelect(select) { if (select.nextElementSibling && select.nextElementSibling.classList.contains('select-trigger')) return syncChoiceTrigger(select); select.classList.add('native-control-hidden'); const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'select-trigger'; trigger.innerHTML = '<span>请选择</span><b aria-hidden="true"></b>'; trigger.addEventListener('click', () => openChoicePicker(select)); select.insertAdjacentElement('afterend', trigger); syncChoiceTrigger(select); }
  function syncAllChoiceTriggers() { $$('.field select').forEach((select) => { enhanceSelect(select); syncChoiceTrigger(select); }); }
  function openChoicePicker(select) { state.choiceTarget = select; $('#choiceTitle').textContent = selectLabel(select); $('#choiceList').innerHTML = Array.from(select.options).map((option) => `<button type="button" data-choice="${esc(option.value)}" class="${option.value === select.value ? 'active' : ''}"><span>${esc(option.textContent)}</span><i>${option.value === select.value ? '✓' : ''}</i></button>`).join(''); setDialog(els.choice, true); }
  function chooseOption(event) { const button = event.target.closest('[data-choice]'); if (!button || !state.choiceTarget) return; state.choiceTarget.value = button.dataset.choice; state.choiceTarget.dispatchEvent(new Event('change', { bubbles: true })); syncChoiceTrigger(state.choiceTarget); setDialog(els.choice, false); }
  function pad(value) { return String(value).padStart(2, '0'); }
  function parsePickerValue(value) { if (!value) return new Date(); const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0)) : new Date(); }
  function openDatePicker(input) { state.dateTarget = input; state.calendarDate = parsePickerValue(input.value); $('#datePickerTitle').textContent = input.dataset.pickerKind === 'datetime' ? '选择饮用时间' : selectLabel(input); $('#calendarTime').hidden = input.dataset.pickerKind !== 'datetime'; $('#datePickerClear').hidden = input.required; $('#calendarHour').value = pad(state.calendarDate.getHours()); $('#calendarMinute').value = pad(state.calendarDate.getMinutes()); renderCalendar(); setDialog(els.datePicker, true); }
  function renderCalendar() { const date = state.calendarDate; const year = date.getFullYear(); const month = date.getMonth(); $('#calendarMonth').textContent = `${year} 年 ${month + 1} 月`; const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate(); let html = '<span></span>'.repeat(offset); for (let day = 1; day <= days; day += 1) { const selected = day === date.getDate(); const today = new Date(); const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear(); html += `<button type="button" data-day="${day}" class="${selected ? 'selected ' : ''}${isToday ? 'today' : ''}">${day}</button>`; } $('#calendarDays').innerHTML = html; }
  function shiftCalendar(delta) { const day = state.calendarDate.getDate(); state.calendarDate.setDate(1); state.calendarDate.setMonth(state.calendarDate.getMonth() + delta); state.calendarDate.setDate(Math.min(day, new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 0).getDate())); renderCalendar(); }
  function chooseCalendarDay(event) { const button = event.target.closest('[data-day]'); if (!button) return; state.calendarDate.setDate(Number(button.dataset.day)); renderCalendar(); }
  function confirmDatePicker() { if (!state.dateTarget) return; const date = state.calendarDate; if (state.dateTarget.dataset.pickerKind === 'datetime') { const hour = Math.min(23, Math.max(0, Number($('#calendarHour').value) || 0)); const minute = Math.min(59, Math.max(0, Number($('#calendarMinute').value) || 0)); state.dateTarget.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hour)}:${pad(minute)}`; } else state.dateTarget.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; state.dateTarget.dispatchEvent(new Event('change', { bubbles: true })); setDialog(els.datePicker, false); }
  function clearDatePicker() { if (state.dateTarget) { state.dateTarget.value = ''; state.dateTarget.dispatchEvent(new Event('change', { bubbles: true })); } setDialog(els.datePicker, false); }
  function renderRating(container, name, value, negative) { container.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-rate="${n}" class="${n <= (value || 0) ? 'active' : ''}" aria-label="${n} 分">${negative ? '☹' : name === 'overallRating' ? '★' : '☺'}</button>`).join(''); container.dataset.value = value || ''; }
  function renderDimensionRatings(log) { const enabled = state.settings.enabledDimensions; $('#advancedRatingSection').hidden = !state.settings.advancedRatings; $('#dimensionRatings').innerHTML = enabled.map((key) => `<fieldset class="dimension-rating"><legend>${DIMENSIONS[key]}</legend><div class="rating-row faces" data-rating-name="${key}"></div></fieldset>`).join(''); enabled.forEach((key) => renderRating($(`[data-rating-name="${key}"]`), key, log && log[key], key === 'bitterness')); }
  function renderDrinkFeatureHint(log) {
    const host = $('#drinkFeatureHint');
    if (!host) return;
    const hints = [];
    if (!state.settings.advancedRatings) hints.push('高级评价可记录香气、酸质、甜感、醇厚度等维度');
    if (!brewPlansEnabled()) hints.push('冲煮方案可保存常用参数，下次喝同款豆子时直接复用');
    host.hidden = Boolean(log) || hints.length === 0 || readLocalFlag('coffee-vault-hint-drink-features');
    if (host.hidden) { host.innerHTML = ''; return; }
    host.innerHTML = `<b>进阶记录</b><span>${esc(hints.join('；'))}，可在个人中心的设置里开启。</span><button type="button" data-drink-feature-dismiss>知道了</button>`;
  }
  function methodOptions(current) { const values = [...new Set([...BREW_METHODS, state.settings.lastBrewMethod, current].filter(Boolean))]; $('#drink-method').innerHTML = values.map((method) => `<option value="${esc(method)}">${esc(method)}</option>`).join('') + '<option value="__custom__">＋ 自定义</option>'; $('#drink-method').value = current || state.settings.lastBrewMethod || '手冲'; $('#drink-method-custom').hidden = true; enhanceSelect($('#drink-method')); syncChoiceTrigger($('#drink-method')); }
  function selectedDrinkPlan() { const id = $('#drink-plan-id').value; return id ? state.brewPlans.find((plan) => plan.id === id) : null; }
  function currentDrinkMethod() { const value = $('#drink-method').value; return value === '__custom__' ? $('#drink-method-custom').value.trim() : value; }
  function lastBeanLog(beanId, currentId) { return state.drinkLogs.find((log) => log.beanId === beanId && log.id !== currentId) || null; }
  function syncDrinkParamFields() {
    const method = currentDrinkMethod();
    $$('.drink-param-field', els.drinkForm).forEach((field) => { field.hidden = !String(field.dataset.methods || '').split(' ').includes(method); });
  }
  function setDrinkParam(key, value) {
    const el = $(`#drink-param-${key}`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value == null ? '' : value;
  }
  function fillDrinkParams(source) {
    const data = source || {};
    // 方案里的水温存为文本（可能带 °C，如预置的 "92°C"）；喝一杯的水温是 number 输入，
    // 必须先净化成纯数字再赋值，否则带单位的字符串会被 number 输入静默丢弃、无法带入。
    DRINK_PARAM_KEYS.forEach((key) => setDrinkParam(key, key === 'waterTemp' ? String(data[key] == null ? '' : data[key]).replace(/[^\d.]/g, '') : data[key]));
    setRatioControls('drink', data.ratio);
    setDrinkParam('useHotWater', data.useHotWater);
    $('#drink-param-dose').value = $('#drink-grams').value || data.dose || '';
    state.activeDrinkStepIndex = -1;
    renderDrinkSteps(data.steps || []);
    syncDrinkParamFields(); syncDurationControls(els.drinkForm); syncDrinkTotalWater();
  }
  function syncDrinkTotalWater() {
    const total = waterFromRatio($('#drink-param-dose').value || $('#drink-grams').value, $('#drink-param-ratio').value);
    if (total != null && !$('#drink-param-totalWater').closest('.field').hidden) $('#drink-param-totalWater').value = total;
  }
  function syncDrinkRatioFromWater() {
    if ($('#drink-param-totalWater').closest('.field').hidden) return;
    syncRatioFromTotal('drink');
  }
  function splitStepTime(step) {
    const parts = String(step.time || '').split('-');
    return { startTime: step.startTime || parts[0] || '', endTime: step.endTime || parts[1] || '' };
  }
  function drinkStepTimeControl(prefix, value) {
    const parts = timeParts(value);
    return `<div class="pour-time-control"><input data-drink-${prefix}-min type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${esc(parts.min)}" placeholder="0"><b>分</b><input data-drink-${prefix}-sec type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${esc(parts.sec)}" placeholder="30"><b>秒</b></div>`;
  }
  function drinkStepTimeValue(row, prefix) {
    const min = Number($(`[data-drink-${prefix}-min]`, row)?.value || 0);
    const secInput = $(`[data-drink-${prefix}-sec]`, row)?.value || '';
    const sec = Number(secInput || 0);
    return min || secInput !== '' ? `${min}:${pad(Math.min(59, Math.max(0, sec)))}` : '';
  }
  function drinkStepSummary(step) {
    const time = [step.startTime, step.endTime].filter(Boolean).join('-');
    return [step.water ? formatWeight(step.water) : '', time, step.note].filter(Boolean).join(' · ') || '未填写细节';
  }
  function normalizedDrinkStepRows(steps) {
    return (steps || []).map((step, index) => {
      const times = splitStepTime(step);
      return { label: step.label || pourStageName(index), water: step.water || '', startTime: times.startTime, endTime: times.endTime, time: [times.startTime, times.endTime].filter(Boolean).join('-'), note: step.note || '' };
    });
  }
  function renderDrinkSteps(steps) {
    const rows = normalizedDrinkStepRows(steps);
    state.activeDrinkStepIndex = rows.length && state.activeDrinkStepIndex >= 0 ? Math.min(state.activeDrinkStepIndex, rows.length - 1) : -1;
    $('#drinkStepCount').textContent = rows.length ? `${rows.length} 段 · 只保存到本次饮用记录` : '可从方案带入，也可只调整本次记录';
    $('#drinkStepList').innerHTML = rows.length ? rows.map((step, index) => {
      const active = index === state.activeDrinkStepIndex;
      const stage = pourStageName(index);
      const data = `data-step-label="${esc(step.label)}" data-step-water="${esc(step.water)}" data-step-start="${esc(step.startTime)}" data-step-end="${esc(step.endTime)}" data-step-note="${esc(step.note)}"`;
      const collapsed = `<button class="drink-step-summary" type="button" data-drink-step-open="${index}"><span><b>${esc(step.label || stage)}</b><small>${esc(drinkStepSummary(step))}</small></span><i>编辑</i></button>`;
      const editor = `<div class="drink-step-head"><button type="button" data-drink-step-open="${index}"><span><b>${esc(stage)}</b><small>正在编辑</small></span></button><button type="button" data-remove-drink-step="${index}" aria-label="删除这一段">×</button></div><div class="drink-step-grid"><label><span>名称</span><input data-drink-step-label type="text" maxlength="80" value="${esc(step.label || stage)}" placeholder="${esc(stage)}"></label><label><span>水量</span><div class="input-unit"><input data-drink-step-water type="number" min="0" step="0.1" inputmode="decimal" value="${step.water == null ? '' : esc(step.water)}"><em>g</em></div></label><label><span>开始</span>${drinkStepTimeControl('start', step.startTime)}</label><label><span>结束</span>${drinkStepTimeControl('end', step.endTime)}</label><label class="full"><span>备注</span><input data-drink-step-note type="text" maxlength="200" value="${esc(step.note)}" placeholder="可选"></label></div>`;
      return `<article class="drink-step-card${active ? ' active' : ''}" data-drink-step-index="${index}" ${data}>${active ? editor : collapsed}</article>`;
    }).join('') : '<p class="manager-empty compact-empty">当前没有注水步骤，可以从方案带入或手动添加。</p>';
    updateDrinkAssistEntry();
  }
  function readDrinkSteps() {
    return $$('.drink-step-card', $('#drinkStepList')).map((row, index) => {
      const active = row.classList.contains('active');
      const label = active ? $('[data-drink-step-label]', row).value.trim() : row.dataset.stepLabel;
      const water = active ? $('[data-drink-step-water]', row).value : row.dataset.stepWater;
      const startTime = active ? drinkStepTimeValue(row, 'start') : row.dataset.stepStart;
      const endTime = active ? drinkStepTimeValue(row, 'end') : row.dataset.stepEnd;
      const note = active ? $('[data-drink-step-note]', row).value.trim() : row.dataset.stepNote;
      return { label: label || pourStageName(index), water, startTime, endTime, time: [startTime, endTime].filter(Boolean).join('-'), note };
    }).filter((step) => step.label || step.water || step.startTime || step.endTime || step.note);
  }
  function addDrinkStep() {
    const rows = readDrinkSteps();
    const last = rows[rows.length - 1];
    rows.push({ label: pourStageName(rows.length), water: '', startTime: last ? last.endTime : '', endTime: '' });
    state.activeDrinkStepIndex = rows.length - 1;
    renderDrinkSteps(rows);
  }
  function drinkParamSnapshot(method, plan) {
    const fields = {};
    DRINK_PARAM_KEYS.forEach((key) => {
      const el = $(`#drink-param-${key}`);
      const field = el && el.closest('.field');
      if (el && !(field && field.hidden) && el.value !== '') fields[key] = el.value;
    });
    if (fields.waterTemp) fields.waterTemp = `${fields.waterTemp}°C`;
    const hotWaterField = $('#drink-param-useHotWater').closest('.drink-param-field');
    fields.useHotWater = !hotWaterField.hidden && $('#drink-param-useHotWater').checked;
    return BeanCore.normalizeBrewPlan({
      ...(plan || {}),
      ...cleanPlanFieldsForMethod({ ...fields, brewMethod: method }),
      id: plan ? plan.id : undefined,
      name: plan ? plan.name : '本次记录参数',
      brewMethod: method,
      source: plan ? plan.source : 'user',
      version: plan ? plan.version : 1,
      dose: fields.dose || $('#drink-grams').value,
      steps: currentDrinkMethod() === '手冲' ? readDrinkSteps() : []
    });
  }
  function renderDrinkPlanPicker(bean, log) {
    if (!brewPlansEnabled()) { $('#drinkPlanPicker').hidden = true; return; }
    $('#drinkPlanPicker').hidden = false;
    const currentMethod = log && log.brewMethod || currentDrinkMethod() || state.settings.lastBrewMethod;
    const last = bean ? lastBeanLog(bean.id, log && log.id) : null;
    const plans = bean ? BeanCore.recommendBrewPlans(state.brewPlans, bean.id, currentMethod).slice(0, 8) : [];
    let currentId = log && log.brewPlanId || $('#drink-plan-id').value;
    if (currentId && !plans.some((plan) => plan.id === currentId)) { currentId = ''; $('#drink-plan-id').value = ''; }
    const lastManual = last && !last.brewPlanId && last.brewMethod === currentMethod;
    const planButtons = plans.map((plan) => {
      const tags = [];
      if (last && last.brewPlanId === plan.id) tags.push('上次');
      if (bean && plan.beanIds.includes(bean.id)) tags.push('已绑定');
      if (plan.source === 'preset') tags.push('预置');
      const tagHtml = tags.map((tag) => `<i>${esc(tag)}</i>`).join('');
      return `<button type="button" data-drink-plan="${esc(plan.id)}" class="${plan.id === currentId ? 'active' : ''}"><span>${esc(plan.name)}${tagHtml ? `<em>${tagHtml}</em>` : ''}</span><small>${esc(plan.brewMethod)} · v${esc(plan.version)}</small></button>`;
    }).join('');
    const lastManualButton = lastManual ? `<button type="button" data-use-last-brew="${esc(last.id)}"><span>上次手填参数<em><i>上次</i></em></span><small>${esc(formatDateTime(last.consumedAt))}</small></button>` : '';
    const hints = [currentMethod || '当前方式'];
    if (last) hints.push('当前豆子的上次使用');
    hints.push('已绑定方案优先');
    $('#drinkPlanPicker').innerHTML = `<div class="section-heading"><div><span>方案选择</span><small>${esc(hints.join(' · '))}</small></div></div><div class="drink-plan-options"><button type="button" data-drink-plan="" class="${!currentId ? 'active' : ''}"><span>不使用方案</span><small>手填本次参数</small></button>${lastManualButton}${planButtons}${plans.length || lastManual ? '' : '<p class="manager-empty compact-empty">当前冲煮方式暂无方案。</p>'}</div>`;
    updateDrinkAssistEntry();
  }
  // 冲煮辅助入口移动到底部工具栏：手冲方式且本次有可计时的分段步骤时显示。
  function updateDrinkAssistEntry() {
    const button = $('#drinkStartAssist');
    if (!button) return;
    const available = brewPlansEnabled() && !$('#saveDrink').hidden && currentDrinkMethod() === '手冲'
      && BeanCore.prepareBrewAssistSteps(readDrinkSteps()).length > 0;
    button.hidden = !available;
  }
  function applyLastBrew(log, bean) {
    if (!log) return;
    methodOptions(log.brewMethod); $('#drink-method').value = log.brewMethod; syncChoiceTrigger($('#drink-method'));
    $('#drink-plan-id').value = log.brewPlanId || '';
    fillDrinkParams(log.brewPlanSnapshot || { brewMethod: log.brewMethod, dose: $('#drink-grams').value });
    renderDrinkPlanPicker(bean, log);
  }
  function chooseDrinkPlan(id, bean) {
    const plan = state.brewPlans.find((item) => item.id === id); $('#drink-plan-id').value = plan ? plan.id : '';
    if (plan) {
      methodOptions(plan.brewMethod);
      $('#drink-method').value = plan.brewMethod; syncChoiceTrigger($('#drink-method'));
      fillDrinkParams(plan);
    } else {
      fillDrinkParams({ brewMethod: currentDrinkMethod(), dose: $('#drink-grams').value });
    }
    renderDrinkPlanPicker(bean, null);
  }
  function openDrinkDialog(bean, log) { if (!bean && log && log.beanId) bean = state.beans.find((item) => item.id === log.beanId); const orphaned = !bean && Boolean(log); if (!bean && !log) return; state.editingDrinkId = log ? log.id : null; els.drinkForm.reset(); const remaining = bean ? Number(bean.remainingWeight) || 0 : 0; const grams = log ? log.grams : Math.min(state.settings.quickGrams, remaining); const last = bean && !log ? lastBeanLog(bean.id) : null; const lastPlanEnabled = brewPlansEnabled() && last; const lastMethod = !log && last ? last.brewMethod : '手冲'; $('#drink-id').value = log ? log.id : ''; $('#drink-beanId').value = bean ? bean.id : ''; $('#drink-plan-id').value = log && log.brewPlanId || lastPlanEnabled && last.brewPlanId || ''; $('#drink-grams').value = grams; $('#drink-grams').max = remaining + (log ? Number(log.grams) : 0); $('#drink-time').value = localDateTime(log && log.consumedAt); $('#drink-notes').value = log ? log.notes : ''; $('#drinkTitle').textContent = orphaned ? '历史饮用记录' : log ? '编辑饮用记录' : '喝一杯'; $('#drinkBeanMeta').textContent = orphaned ? `${log.beanName} · 原豆子已删除` : `${bean.name} · 当前剩余 ${formatWeight(remaining)}`; $('#deleteDrink').hidden = !log; $('#saveDrink').hidden = orphaned; methodOptions(log && log.brewMethod || lastMethod); renderDrinkPlanPicker(bean, log); const source = log && log.brewPlanSnapshot || lastPlanEnabled && last.brewPlanSnapshot || selectedDrinkPlan() || { brewMethod: currentDrinkMethod(), dose: grams }; fillDrinkParams(source); $('#drinkParamPanel').hidden = !brewPlansEnabled(); renderRating($('#overallRating'), 'overallRating', log && log.overallRating, false); renderDimensionRatings(log); renderDrinkFeatureHint(log); $$('#drinkForm input, #drinkForm select, #drinkForm textarea, #drinkForm [data-rate], #drinkForm .select-trigger, #drinkForm [data-drink-plan], #drinkForm [data-use-last-brew], #drinkForm [data-drink-step-open], #drinkForm [data-remove-drink-step], #addDrinkStep').forEach((control) => { if (!['drinkCancel', 'deleteDrink'].includes(control.id)) control.disabled = orphaned; }); setDialog(els.drink, true); }
  function ratingPayload() { const result = {}; $$('[data-rating-name]', els.drinkForm).forEach((node) => { result[node.dataset.ratingName] = node.dataset.value || null; }); return result; }
  async function saveDrink(event) { event.preventDefault(); syncRatioValue('drink'); $$('.duration-field', els.drinkForm).forEach(syncDurationField); const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); if (!bean) return toast('找不到对应的咖啡豆'); const old = state.drinkLogs.find((item) => item.id === state.editingDrinkId); let method = $('#drink-method').value; if (method === '__custom__') method = $('#drink-method-custom').value.trim(); if (!method) return toast('请填写冲煮方式'); const consumed = new Date(dateTimeValue($('#drink-time').value)); if (Number.isNaN(consumed.getTime())) return toast('请选择饮用时间'); const plan = brewPlansEnabled() ? selectedDrinkPlan() : null; const snapshot = brewPlansEnabled() ? drinkParamSnapshot(method, plan) : null; const payload = { ...(old || {}), id: state.editingDrinkId || undefined, beanId: bean.id, beanName: bean.name, grams: $('#drink-grams').value, brewMethod: method, brewPlanId: plan ? plan.id : null, brewPlanVersion: plan ? plan.version : null, brewPlanName: plan ? plan.name : '', brewPlanSnapshot: snapshot, consumedAt: consumed.toISOString(), notes: $('#drink-notes').value, ...ratingPayload() }; try { await BeanRepository.saveDrinkLog(payload); state.settings.lastBrewMethod = method; await BeanRepository.saveSettings(state.settings); setDialog(els.drink, false); state.editingDrinkId = null; await reload(); toast(old ? '饮用记录已更新' : '已记录这一杯'); } catch (error) { console.error(error); toast(error.message || '保存失败'); } }
  async function removeDrink() {
    if (!state.editingDrinkId) return;
    if (!await askConfirm({ title: '删除饮用记录？', message: '这杯记录会移除，并把用掉的咖啡豆克数归还。', confirmText: '删除记录' })) return;
    try { await BeanRepository.deleteDrinkLog(state.editingDrinkId); setDialog(els.drink, false); state.editingDrinkId = null; await reload(); if (els.detail.open && state.editingId) openDetail(state.beans.find((bean) => bean.id === state.editingId)); toast('记录已删除，克数已归还'); } catch (error) { console.error(error); toast('删除失败'); }
  }

  async function initSmartSelects() { await Promise.all(SMART_FIELDS.map(async (field) => { const values = [...new Set([...(PREDEFINED[field] || []), ...(await BeanRepository.smartValues(field))])]; const select = $(`#field-${field}-select`); const hidden = $(`#field-${field}`); const custom = $(`#field-${field}-custom`); const current = hidden.value; select.innerHTML = '<option value="">请选择或新建</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('') + '<option value="__custom__">＋ 新建选项</option>'; if (current && values.includes(current)) { select.value = current; custom.hidden = true; } else if (current) { select.value = '__custom__'; custom.hidden = false; custom.value = current; } else { select.value = ''; custom.hidden = true; } })); syncAllChoiceTriggers(); }
  function setupSmartSelects() { SMART_FIELDS.forEach((field) => { const select = $(`#field-${field}-select`); const hidden = $(`#field-${field}`); const custom = $(`#field-${field}-custom`); select.addEventListener('change', () => { if (select.value === '__custom__') { hidden.value = ''; custom.value = ''; custom.hidden = false; custom.focus(); } else { hidden.value = select.value; custom.hidden = true; } }); custom.addEventListener('input', () => { hidden.value = custom.value.trimStart(); }); }); }
  const PLAN_SMART_FIELDS = ['grinder', 'coffeeMachine'];
  function planSmartValues(field) { return [...new Set(state.brewPlans.map((plan) => plan[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')); }
  function setupPlanSmartSelects() { PLAN_SMART_FIELDS.forEach((field) => { const select = $(`#plan-${field}-select`); const hidden = $(`#plan-${field}`); const custom = $(`#plan-${field}-custom`); if (!select || !hidden || !custom) return; select.addEventListener('change', () => { if (select.value === '__custom__') { hidden.value = ''; custom.value = ''; custom.hidden = false; custom.focus(); } else { hidden.value = select.value; custom.hidden = true; } }); custom.addEventListener('input', () => { hidden.value = custom.value.trimStart(); }); }); }
  function initPlanSmartSelects() { PLAN_SMART_FIELDS.forEach((field) => { const select = $(`#plan-${field}-select`); const hidden = $(`#plan-${field}`); const custom = $(`#plan-${field}-custom`); if (!select || !hidden || !custom) return; const values = planSmartValues(field); const current = hidden.value; select.innerHTML = '<option value="">请选择或新建</option>' + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('') + '<option value="__custom__">＋ 新建选项</option>'; if (current && values.includes(current)) { select.value = current; custom.hidden = true; } else if (current) { select.value = '__custom__'; custom.hidden = false; custom.value = current; } else { select.value = ''; custom.hidden = true; } }); }
  async function openManager(field) { state.managerField = field; $('#managerTitle').textContent = `管理${SMART_LABELS[field]}`; await renderManager(); setDialog(els.manager, true); }
  async function renderManager() { const values = await BeanRepository.smartValues(state.managerField); $('#managerList').innerHTML = values.length ? values.map((value) => `<div class="manager-item" data-value="${esc(value)}"><span>${esc(value)}</span><button data-action="rename" type="button">改名</button><button class="remove" data-action="remove" type="button">删除</button></div>`).join('') : '<p class="manager-empty">暂无历史选项</p>'; }
  async function managerAction(event) { const button = event.target.closest('button[data-action]'); if (!button) return; const oldValue = button.closest('.manager-item').dataset.value; try { if (button.dataset.action === 'rename') { const next = prompt(`将“${oldValue}”改为：`, oldValue); if (next == null || next.trim() === oldValue) return; await BeanRepository.renameSmartValue(state.managerField, oldValue, next); } else { if (!await askConfirm({ title: `删除「${oldValue}」？`, message: '所有使用它的记录会清空这个字段，咖啡豆本身不会删除。' })) return; await BeanRepository.deleteSmartValue(state.managerField, oldValue); } await reload({ keepForm: true }); await renderManager(); await initSmartSelects(); toast('已批量更新'); } catch (error) { toast(error.message || '操作失败'); } }

  function applyTheme(theme, persist) { if (!themeColors[theme]) theme = 'dark-roast'; document.documentElement.dataset.theme = theme; state.settings.theme = theme; localStorage.setItem('coffee-vault-theme', theme); $$('[data-theme-value]').forEach((button) => button.classList.toggle('active', button.dataset.themeValue === theme)); const statusBar = capPlugin('StatusBar'); if (statusBar) { if (statusBar.setOverlaysWebView) statusBar.setOverlaysWebView({ overlay: false }).catch(() => {}); statusBar.setBackgroundColor({ color: themeColors[theme] }).catch(() => {}); statusBar.setStyle({ style: ['frost', 'blaze'].includes(theme) ? 'LIGHT' : 'DARK' }).catch(() => {}); } if (persist && state.initialized) BeanRepository.saveSettings(state.settings).catch(() => toast('主题保存失败')); }
  function syncBackupDialog() { $$('[data-requires-brew-plans]').forEach((button) => { button.hidden = !brewPlansEnabled(); }); }
  function renderSyncSettings() {
    if (!cloudSync) return;
    const config = cloudSync.getConfig();
    const loggedIn = Boolean(config.token);
    const errorAt = config.lastSyncErrorAt ? formatDateTime(config.lastSyncErrorAt) : '';
    const errorText = config.lastSyncError ? `最近失败${errorAt ? ' ' + errorAt : ''}：${config.lastSyncError}` : '';
    const lastText = config.lastSyncAt ? `上次同步 ${formatDateTime(config.lastSyncAt)}` : (loggedIn ? '点击后同步这台设备的数据' : '登录后可同步这台设备的数据');
    $('#syncStateText').textContent = state.syncBusy ? '正在同步' : (loggedIn ? (config.enabled ? '同步已开启' : '同步已暂停') : '未登录');
    $('#syncAccountText').textContent = loggedIn ? (config.email || '同步账号') : '本机离线使用中';
    $('#syncAccountHint').textContent = loggedIn ? (errorText || (config.lastSyncAt ? `上次同步 ${formatDateTime(config.lastSyncAt)}` : '还没有完成过同步')) : '登录后可在 Android 与 Web 间同步豆子、饮用记录、方案和图片。';
    $('#syncStatusBadge').textContent = loggedIn ? (config.enabled ? '在线' : '暂停') : '离线';
    $('#syncStatusBadge').dataset.state = loggedIn ? (config.enabled ? 'enabled' : 'paused') : 'offline';
    $('#syncEnabled').checked = Boolean(config.enabled && loggedIn);
    $('#syncEnabled').disabled = !loggedIn || state.syncBusy;
    $('#syncNow').disabled = !loggedIn || state.syncBusy;
    $('#syncNow').classList.toggle('is-syncing', state.syncBusy);
    $('#syncLoginOpen').hidden = loggedIn;
    $('#syncLogout').hidden = !loggedIn;
    $('#syncDeleteAccount').disabled = !loggedIn || state.syncBusy;
    $('#syncLastText').textContent = errorText || lastText;
  }
  function renderSettings() { $('#settingQuickGrams').value = state.settings.quickGrams; $('#settingFlavorReminderDays').value = state.settings.flavorReminderDays; $('#settingLowStockCups').value = state.settings.lowStockCups; $('#settingBrewPlans').checked = brewPlansEnabled(); $('#settingBeanPhotos').checked = state.settings.showBeanPhotosInList; $('#settingPriceUnit').value = state.settings.priceUnit || 'g'; enhanceSelect($('#settingPriceUnit')); syncChoiceTrigger($('#settingPriceUnit')); $('#settingAdvanced').checked = state.settings.advancedRatings; $('#dimensionSettings').innerHTML = BeanCore.DIMENSION_KEYS.map((key) => `<label><input type="checkbox" data-dimension="${key}" ${state.settings.enabledDimensions.includes(key) ? 'checked' : ''}><span>${DIMENSIONS[key]} ${key === 'bitterness' ? '☹' : '☺'}</span></label>`).join(''); $('#dimensionSection').hidden = !state.settings.advancedRatings; }
  async function saveSettingsFromUi() { state.settings = BeanCore.normalizeSettings({ ...state.settings, quickGrams: $('#settingQuickGrams').value, flavorReminderDays: $('#settingFlavorReminderDays').value, lowStockCups: $('#settingLowStockCups').value, enableBrewPlans: $('#settingBrewPlans').checked, showBeanPhotosInList: $('#settingBeanPhotos').checked, priceUnit: $('#settingPriceUnit').value, advancedRatings: $('#settingAdvanced').checked, enabledDimensions: $$('[data-dimension]:checked').map((node) => node.dataset.dimension) }); syncBackupDialog(); await BeanRepository.saveSettings(state.settings); render(); if (els.detail.open && state.editingId) openDetail(state.beans.find((bean) => bean.id === state.editingId)); }
  async function showAbout() { setDialog(els.about, true); const app = capPlugin('App'); if (app && app.getInfo) { try { const info = await app.getInfo(); $('#aboutVersion').textContent = `版本 ${info.version} · 构建 ${info.build}`; } catch (_) {} } }
  function openImagePreview(path, label) { if (!path) return; state.previewImage = { path, label: label || '图片预览' }; $('#imagePreviewTitle').textContent = state.previewImage.label; $('#imagePreviewPhoto').src = imageSrc(path); setDialog(els.imagePreview, true); }
  async function sharePreviewImage() { if (!state.previewImage) return; try { const share = capPlugin('Share'); if (BeanRepository.isNative() && share) { await share.share({ title: state.previewImage.label, text: `${state.previewImage.label} · 豆仓`, files: [state.previewImage.path], dialogTitle: '保存或分享图片' }); } else { const link = document.createElement('a'); link.href = imageSrc(state.previewImage.path); link.download = `${state.previewImage.label || '豆仓图片'}.jpg`; link.click(); } toast('已打开保存面板'); } catch (error) { console.error(error); toast('保存图片失败'); } }
  function shareFilename(payload) { return `豆仓-${String(payload.title || '分享卡片').replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || '分享卡片'}-${Date.now()}.png`; }
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand && document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('copy failed');
  }
  function generateRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(20);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes); else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('').replace(/(.{4})/g, '$1-').replace(/-$/, '');
  }
  function readSyncCredentials() {
    const email = $('#syncAuthEmail').value.trim();
    const password = $('#syncAuthPassword').value;
    if (!email || !email.includes('@')) throw new Error('请填写邮箱');
    if (!password || password.length < 8) throw new Error('密码至少 8 位');
    return { email, password };
  }
  function setSyncBusy(busy) {
    state.syncBusy = Boolean(busy);
    ['syncAuthSubmit', 'syncAuthModeLogin', 'syncAuthModeRegister', 'syncAuthForgot', 'syncLoginOpen', 'syncLogout', 'syncCopyRecovery'].forEach((id) => { const el = $(`#${id}`); if (el) el.disabled = state.syncBusy; });
    renderSyncAuth();
    renderSyncSettings();
  }
  function renderSyncAuth() {
    const mode = state.syncAuthMode;
    const copy = {
      login: ['登录同步账号', '登录后再决定是否开启同步。', '密码', '至少 8 位', '登录'],
      register: ['创建同步账号', '注册后会生成一次性恢复码，请先保存。', '设置密码', '至少 8 位', '创建账号'],
      recover: ['恢复同步账号', '用注册时保存的恢复码重设密码。', '新密码', '至少 8 位', '重设并登录']
    }[mode];
    $('#syncAuthTitle').textContent = copy[0];
    $('#syncAuthSubtitle').textContent = copy[1];
    $('#syncAuthPassword').previousElementSibling.textContent = copy[2];
    $('#syncAuthPassword').placeholder = copy[3];
    $('#syncAuthSubmit').textContent = state.syncBusy ? '请稍候…' : copy[4];
    $('#syncRecoveryField').hidden = mode !== 'recover';
    $('#syncAuthSwitch').hidden = mode !== 'login';
    $('#syncAuthModeLogin').hidden = mode === 'login';
    $('#syncAuthForgot').hidden = mode === 'recover';
  }
  function setSyncAuthMode(mode) {
    state.syncAuthMode = ['login', 'register', 'recover'].includes(mode) ? mode : 'login';
    $('#syncRecoveryBox').hidden = true;
    renderSyncAuth();
  }
  function openSyncAuth(mode) {
    const config = cloudSync ? cloudSync.getConfig() : {};
    setSyncAuthMode(mode || 'login');
    $('#syncAuthEmail').value = config.email || $('#syncAuthEmail').value || '';
    $('#syncAuthPassword').value = '';
    $('#syncAuthRecovery').value = '';
    setDialog(els.syncAuth, true);
    setTimeout(() => $('#syncAuthEmail').focus(), 80);
  }
  function syncAuthBack() { if (state.syncAuthMode !== 'login') return setSyncAuthMode('login'); setDialog(els.syncAuth, false); }
  async function syncAuthSubmit() {
    if (state.syncAuthMode === 'login') return syncLogin();
    if (state.syncAuthMode === 'register') return syncRegister();
    return syncRecover();
  }
  async function syncLogin() {
    if (!cloudSync) return toast('同步模块未加载');
    let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
    setSyncBusy(true); toast('正在登录…');
    try { await cloudSync.login(body); $('#syncRecoveryBox').hidden = true; setDialog(els.syncAuth, false); renderSyncSettings(); toast('已登录同步账号'); }
    catch (error) { console.error(error); toast(error.message || '登录失败'); }
    finally { setSyncBusy(false); }
  }
  async function syncRegister() {
    if (!cloudSync) return toast('同步模块未加载');
    let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
    setSyncBusy(true); toast('正在注册…');
    try {
      const recoveryCode = generateRecoveryCode();
      await cloudSync.register({ ...body, recoveryCode });
      $('#syncRecoveryCode').textContent = recoveryCode;
      $('#syncRecoveryBox').hidden = false;
      renderSyncSettings();
      toast('注册成功，请先保存恢复码');
    } catch (error) { console.error(error); toast(error.message || '注册失败'); }
    finally { setSyncBusy(false); }
  }
  async function syncRecover() {
    if (!cloudSync) return toast('同步模块未加载');
    let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
    const recoveryCode = $('#syncAuthRecovery').value.trim();
    if (!recoveryCode) return toast('请填写恢复码');
    setSyncBusy(true); toast('正在恢复账号…');
    try { await cloudSync.recover({ ...body, recoveryCode }); $('#syncRecoveryBox').hidden = true; setDialog(els.syncAuth, false); renderSyncSettings(); toast('已恢复并登录'); }
    catch (error) { console.error(error); toast(error.message || '恢复失败'); }
    finally { setSyncBusy(false); }
  }
  function syncLogout() { if (!cloudSync) return; cloudSync.logout(); $('#syncRecoveryBox').hidden = true; renderSyncSettings(); toast('已退出同步账号'); }
  async function syncDeleteAccount() {
    if (!cloudSync) return toast('同步模块未加载');
    if (!cloudSync.getConfig().token) return toast('未登录');
    if (!await askConfirm({ eyebrow: 'CLOUD DELETE', title: '删除云端账号？', message: '服务器上的账号与所有云端数据会被永久删除，且不可恢复；本机数据不受影响。', confirmText: '删除云端账号' })) return;
    setSyncBusy(true);
    try { await cloudSync.deleteAccount(); $('#syncRecoveryBox').hidden = true; renderSyncSettings(); toast('云端账号已删除'); }
    catch (error) { console.error(error); toast(error.message || '删除失败'); }
    finally { setSyncBusy(false); }
  }
  function syncToggle() {
    if (!cloudSync) return;
    const config = cloudSync.getConfig();
    if (!config.token) { $('#syncEnabled').checked = false; return toast('请先登录同步账号'); }
    cloudSync.setEnabled($('#syncEnabled').checked);
    renderSyncSettings();
    toast($('#syncEnabled').checked ? '同步已开启' : '同步已关闭');
  }
  async function syncNow() {
    if (!cloudSync) return toast('同步模块未加载');
    setSyncBusy(true);
    try {
      toast('正在同步…');
      const result = await cloudSync.sync({ force: true });
      if (result.skipped) return toast(result.reason === 'not-authenticated' ? '请先登录同步账号' : '同步暂不可用');
      await reload();
      renderSyncSettings();
      toast('同步完成');
    } catch (error) { console.error(error); toast(error.message || '同步失败'); }
    finally { setSyncBusy(false); renderSyncSettings(); }
  }
  async function copyRecoveryCode() { try { await copyText($('#syncRecoveryCode').textContent); toast('恢复码已复制'); } catch (_) { toast('复制失败，请手动保存'); } }
  async function copyCurrentPlanShareCode() {
    const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
    if (!plan) return;
    setDialog(els.planShareChoice, false);
    try { await copyText(BeanCore.encodePlanShare(plan)); toast('分享码已复制'); } catch (error) { console.error(error); toast('复制失败，请用分享卡片二维码'); }
  }
  function canvasToBlob(canvas) { return new Promise((resolve) => canvas.toBlob(resolve, 'image/png')); }
  function loadCanvasImage(path) { return new Promise((resolve) => { if (!path) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = imageSrc(path); }); }
  function roundRect(ctx, x, y, w, h, r) { const radius = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath(); }
  function fillRound(ctx, x, y, w, h, r, fill, stroke) { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }
  function setCanvasFont(ctx, size, weight, serif) { ctx.font = `${weight || 500} ${size}px ${serif ? '"Noto Serif SC","Songti SC",serif' : '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'}`; }
  function clipCanvasText(ctx, text, maxWidth) { const source = String(text || ''); if (ctx.measureText(source).width <= maxWidth) return source; let result = source; while (result && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1); return `${result || source.slice(0, 1)}…`; }
  function wrapCanvasLines(ctx, text, maxWidth, maxLines) { const lines = []; let line = ''; [...String(text || '').replace(/\s+/g, ' ').trim()].forEach((char) => { const next = line + char; if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = char; } else line = next; }); if (line) lines.push(line); if (maxLines && lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[kept.length - 1] = clipCanvasText(ctx, kept[kept.length - 1], maxWidth); return kept; } return lines; }
  function drawCanvasTextBlock(ctx, text, x, y, maxWidth, lineHeight, maxLines) { const lines = wrapCanvasLines(ctx, text, maxWidth, maxLines); lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight)); return y + lines.length * lineHeight; }
  function drawReceiptHeader(ctx, payload, palette, x, y, w) {
    setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.accent; ctx.fillText('豆仓 COFFEE VAULT', x, y);
    setCanvasFont(ctx, 70, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, payload.title, w), x, y + 88);
    setCanvasFont(ctx, 28, 500, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, payload.subtitle, w), x, y + 132);
    fillRound(ctx, x, y + 162, w, 54, 18, palette.ink);
    setCanvasFont(ctx, 24, 700, false); ctx.fillStyle = palette.paper; ctx.fillText(clipCanvasText(ctx, `${payload.eyebrow || '分享'} · ${(payload.meta || []).join(' · ')}`, w - 44), x + 22, y + 198);
    return y + 246;
  }
  function drawReceiptDivider(ctx, palette, x, y, w) { ctx.strokeStyle = palette.line; ctx.lineWidth = 2; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); ctx.setLineDash([]); }
  function drawReceiptStats(ctx, stats, palette, x, y, w) {
    if (!stats || !stats.length) return y;
    const gap = 16; const cols = stats.length <= 4 ? stats.length : 3; const cardW = (w - gap * (cols - 1)) / cols;
    stats.slice(0, 6).forEach((stat, index) => { const col = index % cols; const row = Math.floor(index / cols); const px = x + col * (cardW + gap); const py = y + row * 110; fillRound(ctx, px, py, cardW, 94, 20, palette.surface, palette.border); setCanvasFont(ctx, 22, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(stat.label, px + 20, py + 32); setCanvasFont(ctx, 34, 800, false); ctx.fillStyle = index === 0 ? palette.accent : palette.ink; ctx.fillText(clipCanvasText(ctx, stat.value, cardW - 40), px + 20, py + 74); });
    return y + Math.ceil(Math.min(stats.length, 6) / cols) * 110;
  }
  function drawReceiptRows(ctx, rows, palette, x, y, w) {
    (rows || []).slice(0, 12).forEach((row) => { setCanvasFont(ctx, 24, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(row.label, x, y); setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, row.value, w * .62), x + w * .38, y); ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x + w, y + 20); ctx.stroke(); y += 58; });
    return y + 8;
  }
  async function drawReceiptImages(ctx, images, palette, x, y, w) {
    if (!images || !images.length) return y;
    if (images.length === 1) {
      const item = images[0]; const boxH = 760; const img = await loadCanvasImage(item.path);
      fillRound(ctx, x, y, w, boxH, 26, palette.surface, palette.border);
      if (img) { ctx.save(); roundRect(ctx, x + 16, y + 16, w - 32, boxH - 32, 20); ctx.clip(); const scale = Math.min((w - 32) / img.width, (boxH - 32) / img.height); const iw = img.width * scale; const ih = img.height * scale; ctx.drawImage(img, x + (w - iw) / 2, y + (boxH - ih) / 2, iw, ih); ctx.restore(); }
      fillRound(ctx, x + 22, y + boxH - 58, 128, 38, 19, palette.ink); setCanvasFont(ctx, 22, 800, false); ctx.fillStyle = palette.paper; ctx.fillText(item.label, x + 44, y + boxH - 32);
      return y + boxH + 30;
    }
    const gap = 18; const itemW = (w - gap) / 2; const itemH = 210;
    for (let index = 0; index < images.slice(0, 2).length; index += 1) {
      const item = images[index]; const px = x + index * (itemW + gap); const img = await loadCanvasImage(item.path);
      fillRound(ctx, px, y, itemW, itemH, 22, palette.surface, palette.border);
      if (img) { ctx.save(); roundRect(ctx, px + 10, y + 10, itemW - 20, itemH - 20, 18); ctx.clip(); const scale = Math.max((itemW - 20) / img.width, (itemH - 20) / img.height); const iw = img.width * scale; const ih = img.height * scale; ctx.drawImage(img, px + 10 + (itemW - 20 - iw) / 2, y + 10 + (itemH - 20 - ih) / 2, iw, ih); ctx.restore(); }
      fillRound(ctx, px + 18, y + itemH - 54, 112, 34, 17, palette.ink); setCanvasFont(ctx, 20, 800, false); ctx.fillStyle = palette.paper; ctx.fillText(item.label, px + 38, y + itemH - 31);
    }
    return y + itemH + 30;
  }
  function drawReceiptSteps(ctx, steps, palette, x, y, w) {
    if (!steps || !steps.length) return y;
    setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.ink; ctx.fillText('分段步骤', x, y); y += 44;
    steps.slice(0, 8).forEach((step, index) => { fillRound(ctx, x, y, w, 70, 18, palette.surface, palette.border); fillRound(ctx, x + 18, y + 16, 38, 38, 19, palette.paper, palette.line); setCanvasFont(ctx, 20, 800, false); ctx.fillStyle = palette.muted; ctx.fillText(String(index + 1), x + 31, y + 42); setCanvasFont(ctx, 26, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, step.label, 210), x + 74, y + 30); setCanvasFont(ctx, 22, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, step.value, w - 92), x + 74, y + 56); y += 84; });
    return y + 10;
  }
  function drawReceiptQr(ctx, qr, palette, x, y, w) {
    if (!qr || !qr.code || typeof qrcode === 'undefined') return y;
    let model;
    try { model = qrcode(0, 'M'); model.addData(qr.code); model.make(); } catch (error) { console.error(error); return y; }
    const count = model.getModuleCount();
    const pad = 28; const tile = 252; const quiet = 18; const boxH = tile + pad * 2;
    fillRound(ctx, x, y, w, boxH, 24, palette.surface, palette.border);
    const tileX = x + pad; const tileY = y + pad;
    fillRound(ctx, tileX, tileY, tile, tile, 16, palette.paper, palette.line);
    const cell = (tile - quiet * 2) / count; const originX = tileX + quiet; const originY = tileY + quiet;
    ctx.fillStyle = palette.ink;
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (model.isDark(row, col)) ctx.fillRect(originX + col * cell, originY + row * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    const textX = tileX + tile + 34; const textW = w - (tile + pad + 34) - pad;
    setCanvasFont(ctx, 30, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, qr.title || '扫码导入此方案', textW), textX, tileY + 50);
    setCanvasFont(ctx, 23, 600, false); ctx.fillStyle = palette.muted; drawCanvasTextBlock(ctx, qr.hint || '', textX, tileY + 96, textW, 34, 4);
    return y + boxH + 30;
  }
  function drawReceiptMonth(ctx, calendar, palette, x, y, w) {
    const cell = Math.floor((w - 6 * 10) / 7); ['一', '二', '三', '四', '五', '六', '日'].forEach((day, index) => { setCanvasFont(ctx, 20, 800, false); ctx.fillStyle = palette.muted; ctx.fillText(day, x + index * (cell + 10) + 12, y); }); y += 26;
    (calendar.cells || []).forEach((item, index) => { const col = index % 7; const row = Math.floor(index / 7); const px = x + col * (cell + 10); const py = y + row * (cell + 10); if (item.empty) return; fillRound(ctx, px, py, cell, cell, 12, palette.heat[item.level || 0], item.selected ? palette.ink : palette.border); setCanvasFont(ctx, 22, 800, false); ctx.fillStyle = item.level >= 3 ? palette.paper : palette.ink; ctx.fillText(String(item.day), px + 12, py + 29); });
    return y + Math.ceil((calendar.cells || []).length / 7) * (cell + 10) + 28;
  }
  function drawReceiptYear(ctx, calendar, palette, x, y, w) {
    const levels = new Map((calendar.days || []).map((day) => [day.date, day.level || 0]));
    const labelW = 64; const areaW = w - labelW; const cell = areaW / 31; const dot = Math.min(cell * 0.64, 16); const rowH = 44;
    for (let month = 0; month < 12; month += 1) {
      const cy = y + month * rowH;
      setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = palette.muted; ctx.fillText(MONTH_NAMES[month], x, cy + dot / 2 + 8);
      const total = new Date(calendar.year, month + 1, 0).getDate();
      for (let day = 1; day <= total; day += 1) {
        const key = `${calendar.year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cx = x + labelW + (day - 1) * cell + cell / 2;
        ctx.beginPath(); ctx.arc(cx, cy + dot / 2, dot / 2, 0, Math.PI * 2); ctx.fillStyle = palette.heat[levels.get(key) || 0]; ctx.fill();
      }
    }
    return y + 12 * rowH + 14;
  }
  function drawReceiptLogs(ctx, logs, palette, x, y, w) {
    if (!logs || !logs.length) return y;
    setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.ink; ctx.fillText('当日记录', x, y); y += 42;
    logs.slice(0, 4).forEach((log) => { fillRound(ctx, x, y, w, 70, 18, palette.surface, palette.border); setCanvasFont(ctx, 25, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, log.title, w - 40), x + 20, y + 30); setCanvasFont(ctx, 21, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, log.meta, w - 40), x + 20, y + 56); y += 84; });
    return y + 8;
  }
  async function renderReceiptShareCard(payload) {
    const palette = { bg: '#1a1412', paper: '#f4eadc', surface: '#eadcc8', ink: '#251811', muted: '#806b59', accent: '#b7783d', border: '#d9c6ac', line: '#d5b58e', heat: ['#e2d6c5', '#d5bd96', '#cda66b', '#bd8345', '#8f542d'] };
    const width = 1080; const maxHeight = 2400;
    const content = document.createElement('canvas'); content.width = width; content.height = maxHeight; const ctx = content.getContext('2d');
    const x = 96; const w = width - x * 2; let y = 132;
    y = drawReceiptHeader(ctx, payload, palette, x, y, w); y = drawReceiptStats(ctx, payload.stats, palette, x, y, w); drawReceiptDivider(ctx, palette, x, y + 10, w); y += 52;
    if (payload.calendar && payload.calendar.view === 'month') y = drawReceiptMonth(ctx, payload.calendar, palette, x, y, w);
    if (payload.calendar && payload.calendar.view === 'year') y = drawReceiptYear(ctx, payload.calendar, palette, x, y, w);
    y = drawReceiptRows(ctx, payload.rows, palette, x, y, w); y = drawReceiptSteps(ctx, payload.steps, palette, x, y, w);
    if (payload.notes) { fillRound(ctx, x, y, w, 140, 22, palette.surface, palette.border); setCanvasFont(ctx, 23, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('风味 / 备注', x + 22, y + 38); setCanvasFont(ctx, 27, 600, false); ctx.fillStyle = palette.ink; drawCanvasTextBlock(ctx, payload.notes, x + 22, y + 78, w - 44, 34, 2); y += 166; }
    y = await drawReceiptImages(ctx, payload.images, palette, x, y, w); y = drawReceiptLogs(ctx, payload.logs, palette, x, y, w);
    y = drawReceiptQr(ctx, payload.qr, palette, x, y, w);
    drawReceiptDivider(ctx, palette, x, y + 8, w); y += 58; setCanvasFont(ctx, 24, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(payload.footer || '本地记录 · 私人豆仓', x, y);
    const cardHeight = Math.min(Math.max(Math.round(y + 116), 560), maxHeight);
    const out = document.createElement('canvas'); out.width = width; out.height = cardHeight; const octx = out.getContext('2d');
    octx.fillStyle = palette.bg; octx.fillRect(0, 0, width, cardHeight);
    fillRound(octx, 54, 54, width - 108, cardHeight - 108, 42, palette.paper, '#6f4d33');
    for (let dy = 170; dy <= cardHeight - 150; dy += 190) { octx.fillStyle = palette.bg; octx.beginPath(); octx.arc(54, dy, 16, 0, Math.PI * 2); octx.arc(width - 54, dy, 16, 0, Math.PI * 2); octx.fill(); }
    octx.drawImage(content, 0, 0);
    return out;
  }
  const SHARE_CARD_RENDERERS = { receipt: renderReceiptShareCard };
  async function renderShareCard(payload, style) { const renderer = SHARE_CARD_RENDERERS[style || payload.style] || SHARE_CARD_RENDERERS.receipt; return renderer({ ...payload, style: style || payload.style || 'receipt' }); }
  async function shareCanvas(payload) {
    const canvas = await renderShareCard(payload, payload.style);
    state.shareCardPreview = { canvas, payload };
    $('#sharePreviewImage').src = canvas.toDataURL('image/png');
    setDialog(els.sharePreview, true);
  }
  function closeSharePreview() { setDialog(els.sharePreview, false); state.shareCardPreview = null; }
  async function confirmShareCard() {
    const preview = state.shareCardPreview; if (!preview) return;
    const { canvas, payload } = preview; const filename = shareFilename(payload); const share = capPlugin('Share'); const filesystem = capPlugin('Filesystem');
    try {
      if (BeanRepository.isNative() && share && filesystem) { const data = canvas.toDataURL('image/png').split(',')[1]; const result = await filesystem.writeFile({ path: `share-cards/${filename}`, data, directory: 'CACHE', recursive: true }); await share.share({ title: payload.title, text: `${payload.title} · 豆仓`, files: [result.uri], dialogTitle: '分享豆仓卡片' }); }
      else { const blob = await canvasToBlob(canvas); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      closeSharePreview(); toast('分享卡片已生成');
    } catch (error) { console.error(error); toast('分享失败'); }
  }
  async function saveShareCard() {
    const preview = state.shareCardPreview; if (!preview) return;
    const { canvas, payload } = preview; const filename = shareFilename(payload); const scanner = capPlugin('CoffeeLabelScanner'); const filesystem = capPlugin('Filesystem');
    try {
      if (BeanRepository.isNative() && scanner && scanner.saveShareImage) { const data = canvas.toDataURL('image/png').split(',')[1]; await scanner.saveShareImage({ data, filename }); toast('已保存到相册「豆仓分享卡」'); }
      else if (BeanRepository.isNative() && filesystem) { const data = canvas.toDataURL('image/png').split(',')[1]; await filesystem.writeFile({ path: `Pictures/豆仓分享卡/${filename}`, data, directory: 'EXTERNAL_STORAGE', recursive: true }); toast('已保存到 Pictures/豆仓分享卡'); }
      else { const blob = await canvasToBlob(canvas); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('图片已下载'); }
      closeSharePreview();
    } catch (error) { console.error(error); toast('保存失败'); }
  }
  async function shareBeanCard(options) { const bean = state.beans.find((item) => item.id === ((options && options.beanId) || state.editingId)); if (!bean) return; const payload = BeanCore.buildSharePayload('bean', bean, { priceUnit: state.settings.priceUnit, includeBag: Boolean(options && options.includeBag), style: 'receipt' }); await shareCanvas(payload); }
  function openBeanShareChoice() {
    const bean = state.beans.find((item) => item.id === state.editingId); if (!bean) return;
    if (!bean.bagImagePath) return shareBeanCard({ beanId: bean.id, includeBag: false }).catch((error) => { console.error(error); toast('分享失败'); });
    state.shareBeanId = bean.id; $('#shareIncludeBag').checked = true; setDialog(els.shareChoice, true);
  }
  async function confirmBeanShareChoice() { const beanId = state.shareBeanId; setDialog(els.shareChoice, false); try { await shareBeanCard({ beanId, includeBag: $('#shareIncludeBag').checked }); } catch (error) { console.error(error); toast('分享失败'); } }
  function sharePlanCard() { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); if (!plan) return; state.sharePlanId = plan.id; $('#planShareIncludeQr').checked = false; setDialog(els.planShareChoice, true); }
  async function confirmPlanShareChoice() {
    const plan = state.brewPlans.find((item) => item.id === state.sharePlanId); const includeQr = $('#planShareIncludeQr').checked; setDialog(els.planShareChoice, false);
    if (!plan) return;
    try { await shareCanvas(BeanCore.buildSharePayload('brewPlan', plan, { style: 'receipt', includeQr })); } catch (error) { console.error(error); toast('分享失败'); }
  }
  function setImportStatus(message, isError) { const el = $('#planImportStatus'); el.textContent = message || ''; el.classList.toggle('error', Boolean(isError)); }
  function clearImportSummary() { state.importPlanDraft = null; $('#planImportSummary').hidden = true; $('#planImportConfirm').disabled = true; }
  function openPlanImport() { clearImportSummary(); $('#planImportCode').value = ''; setImportStatus(''); setDialog(els.planImport, true); }
  async function getPhotoForQr(source) { const camera = capPlugin('Camera'); if (!BeanRepository.isNative() || !camera) throw new Error('扫码功能仅在 Android App 中可用'); return camera.getPhoto({ quality: 92, width: 2200, correctOrientation: true, allowEditing: false, resultType: 'uri', source: source === 'camera' ? 'CAMERA' : 'PHOTOS', saveToGallery: false }); }
  function runJsQr(img, w, h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return typeof jsQR === 'function' ? jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' }) : null;
  }
  async function decodeQrFromImage(path) {
    const img = await loadCanvasImage(path); if (!img) throw new Error('无法读取图片');
    const ow = img.naturalWidth || img.width; const oh = img.naturalHeight || img.height;
    let result = runJsQr(img, ow, oh);
    // 相机拍摄的大图 jsQR 容易因二值化失败，缩到 ~1000px 再试一次更稳。
    if ((!result || !result.data) && Math.max(ow, oh) > 1000) {
      const scale = 1000 / Math.max(ow, oh);
      result = runJsQr(img, Math.max(1, Math.round(ow * scale)), Math.max(1, Math.round(oh * scale)));
    }
    if (!result || !result.data) throw new Error('未在图片中识别到二维码，请让二维码更清晰、居中后重试');
    return result.data;
  }
  async function importQrFromSource(source) {
    let objectUrl = null;
    try {
      setImportStatus('正在识别二维码…');
      let path;
      if (!BeanRepository.isNative()) {
        const file = await pickWebImageFile(); // web：相册选图 → 文件选择，jsQR 本地解码
        if (!file) { setImportStatus(''); return; }
        path = objectUrl = URL.createObjectURL(file);
      } else {
        const photo = await getPhotoForQr(source);
        if (!photo) { setImportStatus(''); return; }
        path = photo.path || photo.webPath;
      }
      const code = await decodeQrFromImage(path);
      previewImportedPlan(code);
    } catch (error) { console.error(error); clearImportSummary(); setImportStatus(error.message || '扫码失败', true); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }
  function parsePastedImportCode() { const code = $('#planImportCode').value.trim(); if (!code) { setImportStatus('请先粘贴分享码', true); return; } previewImportedPlan(code); }
  function previewImportedPlan(code) {
    let plan;
    try { plan = BeanCore.decodePlanShare(code); }
    catch (error) { clearImportSummary(); setImportStatus(error.message || '分享码无法解析', true); return; }
    state.importPlanDraft = plan;
    $('#planImportName').textContent = plan.name;
    $('#planImportMeta').textContent = [plan.brewMethod, plan.dose ? plan.dose + 'g' : '', plan.ratio, plan.waterTemp].filter(Boolean).join(' · ');
    $('#planImportSteps').textContent = plan.steps && plan.steps.length ? `${plan.steps.length} 段步骤` : '无分段步骤';
    $('#planImportSummary').hidden = false; $('#planImportConfirm').disabled = false; setImportStatus('已识别方案，确认后导入');
  }
  async function confirmImportPlan() {
    const draft = state.importPlanDraft; if (!draft) return;
    try {
      const saved = await BeanRepository.saveBrewPlan(BeanCore.cloneBrewPlan(draft, { name: draft.name, source: 'user' }));
      if (!brewPlansEnabled()) await BeanRepository.saveSettings({ ...state.settings, enableBrewPlans: true });
      setDialog(els.planImport, false); state.importPlanDraft = null;
      await reload(); state.view = 'plans'; render();
      const fresh = state.brewPlans.find((item) => item.id === saved.id) || saved; if (fresh) openPlanDetail(fresh);
      toast('已导入方案');
    } catch (error) { console.error(error); toast(error.message || '导入失败'); }
  }
  async function shareCalendarCard() { try { const payload = BeanCore.buildSharePayload('calendar', { view: state.coffeeCalendarView, date: state.coffeeCalendarDate, selectedDate: state.selectedCoffeeDay, days: daySummaries() }, { style: 'receipt' }); await shareCanvas(payload); } catch (error) { console.error(error); toast('分享失败'); } }
  const backupScopes = { all: { title: '完整备份', file: '全部备份' }, library: { title: '豆仓与饮用记录', file: '豆仓记录备份' }, brewPlans: { title: '冲煮方案', file: '冲煮方案备份' } };
  function backupScope(scope) { return backupScopes[scope] ? scope : 'all'; }
  function userPlanCount(plans) { return (plans || []).filter((plan) => plan.source !== 'preset').length; }
  function backupSummary(scope, data) {
    if (scope === 'library') return `${data.beans.length} 款豆子，${data.drinkLogs.length} 杯记录`;
    if (scope === 'brewPlans') return `${data.brewPlans.length} 个方案`;
    return `${data.beans.length} 款豆子，${data.drinkLogs.length} 杯记录，${data.brewPlans.length} 个方案`;
  }
  function hasCurrentImportTarget(scope) {
    if (scope === 'library') return state.beans.length > 0 || state.drinkLogs.length > 0;
    if (scope === 'brewPlans') return userPlanCount(state.brewPlans) > 0;
    return state.beans.length > 0 || state.drinkLogs.length > 0 || userPlanCount(state.brewPlans) > 0;
  }
  function chooseImportMode(scope, summary) {
    const label = backupScopes[scope].title;
    if (!hasCurrentImportTarget(scope)) return confirm(`备份包含 ${summary}。导入「${label}」吗？`) ? 'replace' : null;
    if (confirm(`本机已有「${label}」数据。\n备份包含 ${summary}。\n\n点击“确定”合并数据；点击“取消”后可选择覆盖。`)) return 'merge';
    return confirm(`覆盖本机「${label}」数据？此操作只覆盖本次备份包含的范围。`) ? 'replace' : null;
  }
  function backupIncludesLibrary(scope) { return scope === 'all' || scope === 'library'; }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function base64ToBlob(data, mime) {
    const bytes = atob(data); const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime || 'image/webp' });
  }
  // Web 备份图片：与安卓同一 base64 格式（data/extension/mimeType），因此备份可在两端互相迁移图片。
  async function collectWebBackupImages() {
    const images = {};
    for (const bean of state.beans) {
      const entry = {};
      for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
        const ref = bean[key];
        if (!ref || String(ref).indexOf('idb:') !== 0) continue;
        try { const blob = await BeanRepository.getWebImage(ref); if (blob) entry[role] = { data: await blobToBase64(blob), extension: '.webp', mimeType: blob.type || 'image/webp' }; } catch (_) {}
      }
      if (entry.bag || entry.label) images[bean.id] = entry;
    }
    return Object.keys(images).length ? images : null;
  }
  async function restoreWebBackupImages(imported) {
    const beans = imported.beans.map((bean) => ({ ...bean }));
    for (const bean of beans) {
      const entry = imported.beanImages[bean.id];
      if (!entry) continue;
      for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
        if (!entry[role] || !entry[role].data) continue;
        try { const blob = base64ToBlob(entry[role].data, entry[role].mimeType); bean[key] = await BeanRepository.saveWebImage(blob); } catch (_) {}
      }
    }
    return { ...imported, beans };
  }
  async function collectBackupImages(scope) {
    if (!backupIncludesLibrary(scope) || !$('#exportBeanImages').checked) return null;
    if (!BeanRepository.isNative()) return collectWebBackupImages();
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner || !scanner.readArchivedImage) { toast('当前环境无法导出图片，仅导出数据'); return null; }
    const images = {};
    for (const bean of state.beans) {
      const entry = {};
      for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
        if (!bean[key]) continue;
        try { entry[role] = await scanner.readArchivedImage({ path: bean[key] }); } catch (_) {}
      }
      if (entry.bag || entry.label) images[bean.id] = entry;
    }
    return Object.keys(images).length ? images : null;
  }
  async function restoreBackupImages(imported) {
    if (!imported.beanImages || !Object.keys(imported.beanImages).length) return imported;
    if (!BeanRepository.isNative()) return restoreWebBackupImages(imported);
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner || !scanner.restoreArchivedImage) { toast('备份含图片，当前环境仅恢复数据'); return imported; }
    const beans = imported.beans.map((bean) => ({ ...bean }));
    for (const bean of beans) {
      const entry = imported.beanImages[bean.id];
      if (!entry) continue;
      for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
        if (!entry[role]) continue;
        try {
          const restored = await scanner.restoreArchivedImage({ role, data: entry[role].data, extension: entry[role].extension });
          bean[key] = restored.path || restored.uri || bean[key];
        } catch (_) {}
      }
    }
    return { ...imported, beans };
  }
  async function exportBackup(scope) { try { const exportScope = backupScope(scope); const beanImages = await collectBackupImages(exportScope); const backup = BeanCore.createBackup(state.beans, state.drinkLogs, state.settings, null, state.brewPlans, { scope: exportScope, beanImages }); const json = JSON.stringify(backup, null, 2); const filename = `豆仓${backupScopes[exportScope].file}-${new Date().toISOString().slice(0, 10)}.json`; const filesystem = capPlugin('Filesystem'); const share = capPlugin('Share'); if (BeanRepository.isNative() && filesystem && share) { const result = await filesystem.writeFile({ path: filename, data: json, directory: 'CACHE', encoding: 'utf8', recursive: true }); await share.share({ title: `豆仓${backupScopes[exportScope].title}`, text: `${backupSummary(exportScope, backup)}${beanImages ? '，含图片' : ''}`, files: [result.uri], dialogTitle: '保存或分享豆仓备份' }); } else { const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } toast('备份已生成'); } catch (error) { console.error(error); toast('导出失败'); } }
  function decodeBase64(data) { return new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))); }
  async function pickNativeBackup() { const picker = capPlugin('FilePicker'); const filesystem = capPlugin('Filesystem'); if (!picker) throw new Error('文件选择器没有加载'); const result = await picker.pickFiles({ types: ['application/json'], limit: 1, readData: true }); const file = result.files && result.files[0]; if (!file) return null; if (file.data) return decodeBase64(file.data); if (file.path && filesystem) { const content = await filesystem.readFile({ path: file.path }); return content.data.includes('{') ? content.data : decodeBase64(content.data); } throw new Error('无法读取所选文件'); }
  async function importText(text) { const imported = BeanCore.validateImport(JSON.parse(text)); const scope = backupScope(imported.exportScope); const summary = backupSummary(scope, imported); const mode = chooseImportMode(scope, summary); if (!mode) return; const restored = await restoreBackupImages(imported); await BeanRepository.importData(restored, mode); await reload(); setDialog(els.backup, false); setDialog(els.settings, false); setDialog(els.personal, false); toast(`${mode === 'merge' ? '已合并' : '已导入'}${backupScopes[scope].title}`); }
  async function startImport(scope) { try { state.importScope = backupScope(scope); if (BeanRepository.isNative()) { const text = await pickNativeBackup(); if (text) await importText(text); } else $('#webImportInput').click(); } catch (error) { console.error(error); toast(error.message || '导入失败，文件格式不正确'); } }
  async function webImport(event) { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { await importText(await file.text()); } catch (error) { toast(error.message || '导入失败，文件格式不正确'); } }
  async function offerMigration() { if (state.beans.length) return; const legacy = BeanRepository.legacyData(); if (!legacy) return; $('#migrationMessage').textContent = `发现 ${legacy.beans.length} 条旧版浏览器记录。是否迁移到 SQLite？原数据不会被删除。`; setDialog(els.migration, true); }
  async function migrateLegacy() { const legacy = BeanRepository.legacyData(); if (!legacy) return setDialog(els.migration, false); try { await BeanRepository.replaceAll(legacy.beans); await reload(); setDialog(els.migration, false); toast(`已迁移 ${legacy.beans.length} 条记录`); } catch (_) { toast('迁移失败，旧数据仍保持不变'); } }

  function exitApp() { const app = capPlugin('App'); if (app) app.exitApp(); }
  function closeTopLayerOrExit() { if (els.confirm.open) return resolveConfirm(false); if (els.exitConfirm.open) return exitApp(); if (els.sharePreview.open) return closeSharePreview(); if (els.choice.open) return els.choice.close(); if (els.datePicker.open) return els.datePicker.close(); if (els.photoSource.open) return els.photoSource.close(); if (els.scanImage.open) return els.scanImage.close(); if (els.imagePreview.open) return els.imagePreview.close(); if (els.shareChoice.open) return els.shareChoice.close(); if (els.brewAssist.open) return cancelBrewAssist(); if (els.drink.open) return els.drink.close(); if (els.planEditor.open) return els.planEditor.close(); if (els.syncAuth.open) return syncAuthBack(); if (els.sync.open) return els.sync.close(); if (els.backup.open) return els.backup.close(); if (els.calendar.open) return els.calendar.close(); if (els.drinkDetail.open) return els.drinkDetail.close(); if (els.planDetail.open) return els.planDetail.close(); if (els.about.open) return els.about.close(); if (els.manager.open) return els.manager.close(); if (els.settings.open) return els.settings.close(); if (els.personal.open) return els.personal.close(); if (els.editor.open) { clearPendingImages(true); return els.editor.close(); } if (els.detail.open) return els.detail.close(); if (els.migration.open) return els.migration.close(); setDialog(els.exitConfirm, true); }
  function attachLongPress(container, selector, onLongPress) {
    if (!container) return;
    let startX = 0, startY = 0;
    const cancel = () => { clearTimeout(cardPressTimer); cardPressTimer = null; };
    container.addEventListener('pointerdown', (event) => {
      const card = event.target.closest(selector);
      if (!card || event.target.closest('button')) return;
      startX = event.clientX; startY = event.clientY; cardPressFired = false;
      clearTimeout(cardPressTimer);
      cardPressTimer = setTimeout(() => { cardPressFired = true; onLongPress(card); }, 550);
    });
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointermove', (event) => { if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) cancel(); });
  }
  async function longPressDeleteBean(card) {
    const bean = state.beans.find((item) => item.id === card.dataset.id);
    if (!bean || !await askConfirm({ title: `删除「${bean.name}」？`, message: '饮用历史会保留，只从豆仓列表隐藏这包豆子。' })) return;
    try { await BeanRepository.remove(bean.id); if (els.detail.open) setDialog(els.detail, false); await reload(); toast('已删除，饮用历史保留'); } catch (error) { console.error(error); toast('删除失败'); }
  }
  async function longPressDeletePlan(card) {
    const plan = state.brewPlans.find((item) => item.id === card.dataset.planId);
    if (!plan) return;
    if (plan.source === 'preset') return toast('预置方案不能删除，可复制后编辑');
    if (!await askConfirm({ title: `删除方案「${plan.name}」？`, message: '历史饮用记录会保留当时的冲煮参数快照。' })) return;
    try { await BeanRepository.deleteBrewPlan(plan.id); if (els.planDetail.open) setDialog(els.planDetail, false); await reload(); toast('方案已删除'); } catch (error) { console.error(error); toast(error.message || '删除失败'); }
  }
  async function longPressDeleteDrink(card) {
    const log = state.drinkLogs.find((item) => item.id === card.dataset.logId);
    if (!log) return;
    if (!await askConfirm({ title: '删除这条饮用记录？', message: '这杯记录会移除，并把用掉的咖啡豆克数归还。', confirmText: '删除记录' })) return;
    try {
      await BeanRepository.deleteDrinkLog(log.id);
      if (state.editingDrinkId === log.id) state.editingDrinkId = null;
      if (els.drinkDetail.open && state.viewingDrinkId === log.id) { state.viewingDrinkId = null; setDialog(els.drinkDetail, false); }
      if (els.drink.open && !state.editingDrinkId) setDialog(els.drink, false);
      await reload();
      toast('记录已删除，克数已归还');
    } catch (error) { console.error(error); toast('删除失败'); }
  }
  function bindEvents() {
    ['addBean', 'scanBean', 'planImportFab'].forEach((id) => $(`#${id}`).addEventListener('click', floatingActionClickGuard, true));
    $('#addBean').addEventListener('click', () => { expandFloatingActions(); return state.view === 'plans' ? openPlanEditor(null) : openEditor(null); }); $('#scanBean').addEventListener('click', () => { expandFloatingActions(); scanCoffeeLabel(); }); $('#editorClose').addEventListener('click', () => { clearPendingImages(true); setDialog(els.editor, false); }); $('#editorCancel').addEventListener('click', () => { clearPendingImages(true); setDialog(els.editor, false); }); $('#deleteBean').addEventListener('click', removeCurrent); els.form.addEventListener('submit', saveForm); $('#field-initialWeight').addEventListener('input', syncInitialWeightToRemaining); $('#field-remainingWeight').addEventListener('input', markRemainingWeightEdited); $('#editorImageVault').addEventListener('click', (event) => { const remove = event.target.closest('[data-remove-image-role]'); if (remove) return removeBeanImage(remove.dataset.removeImageRole); const button = event.target.closest('[data-add-image-role]'); if (button) return addBeanImage(button.dataset.addImageRole); const card = event.target.closest('[data-preview-image]'); if (card) openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); });
    els.empty.addEventListener('click', (event) => {
      const button = event.target.closest('[data-empty-action]');
      if (!button) return;
      if (button.dataset.emptyAction === 'add') return openEditor(null);
      if (button.dataset.emptyAction === 'scan') return scanCoffeeLabel();
      if (button.dataset.emptyAction === 'backup') { syncBackupDialog(); setDialog(els.backup, true); }
    });
    $('#drinkStarterHint').addEventListener('click', (event) => { if (!event.target.closest('[data-drink-hint-dismiss]')) return; writeLocalFlag('coffee-vault-hint-first-drink'); renderDrinkStarterHint(); });
    els.list.addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const quick = event.target.closest('[data-drink-id]'); if (quick) { event.stopPropagation(); return openDrinkDialog(state.beans.find((bean) => bean.id === quick.dataset.drinkId)); } const card = event.target.closest('.bean-card'); if (card) openDetail(state.beans.find((bean) => bean.id === card.dataset.id)); });
    attachLongPress(els.list, '.bean-card', longPressDeleteBean);
    els.list.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return; const card = event.target.closest('.bean-card'); if (card) { event.preventDefault(); openDetail(state.beans.find((bean) => bean.id === card.dataset.id)); } });
    $('#beanReminderPanel').addEventListener('click', (event) => { const button = event.target.closest('[data-reminder-bean]'); if (button) openDetail(state.beans.find((bean) => bean.id === button.dataset.reminderBean)); });
    $('#globalDrinkList').addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } if (event.target.closest('#drinkLoadMore')) { state.drinkVisibleLimit += DRINK_PAGE_SIZE; return renderDrinks(); } const item = event.target.closest('[data-log-id]'); if (item) openDrinkDetail(state.drinkLogs.find((entry) => entry.id === item.dataset.logId)); }); $('#detailDrinkHistory').addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const item = event.target.closest('[data-log-id]'); if (item) openDrinkDetail(state.drinkLogs.find((log) => log.id === item.dataset.logId)); });
    attachLongPress($('#globalDrinkList'), '[data-log-id]', longPressDeleteDrink);
    attachLongPress($('#detailDrinkHistory'), '[data-log-id]', longPressDeleteDrink);
    attachLongPress(els.calendar, '[data-log-id]', longPressDeleteDrink);
    $('#brewPlanList').addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const card = event.target.closest('[data-plan-id]'); if (card) openPlanDetail(state.brewPlans.find((plan) => plan.id === card.dataset.planId)); });
    attachLongPress($('#brewPlanList'), '.plan-card', longPressDeletePlan);
    $('#brewPlanList').addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const card = event.target.closest('[data-plan-id]'); if (card) { event.preventDefault(); openPlanDetail(state.brewPlans.find((plan) => plan.id === card.dataset.planId)); } });
    $('#detailImages').addEventListener('click', (event) => { const card = event.target.closest('[data-preview-image]'); if (card) openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); });
    $('#detailHero').addEventListener('click', (event) => { const thumb = event.target.closest('[data-preview-image]'); if (thumb) openImagePreview(thumb.dataset.previewImage, thumb.dataset.previewLabel); });
    $('#detailHero').addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const thumb = event.target.closest('[data-preview-image]'); if (thumb) { event.preventDefault(); openImagePreview(thumb.dataset.previewImage, thumb.dataset.previewLabel); } });
    $('#detailFacts').addEventListener('click', (event) => { const item = event.target.closest('[data-purchase-url]'); if (item) openPurchaseUrl(item.dataset.purchaseUrl); });
    $('#detailFacts').addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const item = event.target.closest('[data-purchase-url]'); if (item) { event.preventDefault(); openPurchaseUrl(item.dataset.purchaseUrl); } });
    $('#imagePreviewClose').addEventListener('click', () => setDialog(els.imagePreview, false)); $('#imagePreviewCancel').addEventListener('click', () => setDialog(els.imagePreview, false)); $('#imagePreviewSave').addEventListener('click', sharePreviewImage); $('#shareImageChoiceClose').addEventListener('click', () => setDialog(els.shareChoice, false)); $('#shareImageChoiceCancel').addEventListener('click', () => setDialog(els.shareChoice, false)); $('#shareImageChoiceConfirm').addEventListener('click', confirmBeanShareChoice); $('#planShareChoiceClose').addEventListener('click', () => setDialog(els.planShareChoice, false)); $('#planShareChoiceCancel').addEventListener('click', () => setDialog(els.planShareChoice, false)); $('#planShareChoiceConfirm').addEventListener('click', confirmPlanShareChoice); $('#planImportFab').addEventListener('click', () => { expandFloatingActions(); openPlanImport(); }); $('#settingsImportPlan').addEventListener('click', () => { setDialog(els.settings, false); openPlanImport(); }); $('#planImportClose').addEventListener('click', () => setDialog(els.planImport, false)); $('#planImportCancel').addEventListener('click', () => setDialog(els.planImport, false)); $('#planImportCamera').addEventListener('click', () => importQrFromSource('camera')); $('#planImportGallery').addEventListener('click', () => importQrFromSource('photos')); $('#planImportParse').addEventListener('click', parsePastedImportCode); $('#planImportConfirm').addEventListener('click', confirmImportPlan);
    $('#detailClose').addEventListener('click', () => setDialog(els.detail, false)); $('#detailShare').addEventListener('click', openBeanShareChoice); $('#detailEdit').addEventListener('click', () => { const bean = state.beans.find((item) => item.id === state.editingId); setDialog(els.detail, false); openEditor(bean); }); $('#detailDrink').addEventListener('click', () => openDrinkDialog(state.beans.find((bean) => bean.id === $('#detailDrink').dataset.beanId)));
    $('#drinkDetailClose').addEventListener('click', () => setDialog(els.drinkDetail, false)); $('#drinkSaveAsPlan').addEventListener('click', saveLogAsPlan); $('#drinkDetailEdit').addEventListener('click', () => { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); const bean = log && state.beans.find((item) => item.id === log.beanId); if (!log || !bean) return; setDialog(els.drinkDetail, false); openDrinkDialog(bean, log); });
    $$('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; if (state.view === 'drinks') state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); }));
    $('#planDetailClose').addEventListener('click', () => setDialog(els.planDetail, false)); $('#planShare').addEventListener('click', sharePlanCard); $('#planShareCopyCode').addEventListener('click', copyCurrentPlanShareCode); $('#planAssistStart').addEventListener('click', openPlanBrewAssist);
    $('#planDetailEdit').addEventListener('click', () => { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); setDialog(els.planDetail, false); openPlanEditor(plan); }); $('#planDuplicate').addEventListener('click', duplicateCurrentPlan); $('#planEditorDelete').addEventListener('click', deleteCurrentPlan); $('#planEditorClose').addEventListener('click', () => setDialog(els.planEditor, false)); $('#planEditorCancel').addEventListener('click', () => setDialog(els.planEditor, false)); els.planForm.addEventListener('submit', savePlan); $('#plan-method').addEventListener('change', () => { syncPlanMethodFields(); syncPlanTotalWater(); fillTemplateOptions($('#plan-method').value); syncChoiceTrigger($('#plan-method')); }); $('#plan-dose').addEventListener('input', syncPlanTotalWater); $('#plan-totalWater').addEventListener('input', syncPlanRatioFromWater); ['plan-ratio-left', 'plan-ratio-right'].forEach((id) => $(`#${id}`).addEventListener('input', () => { syncRatioValue('plan'); syncPlanTotalWater(); })); $$('.duration-field', els.planForm).forEach((field) => field.addEventListener('input', () => syncDurationField(field))); $('#addPourStep').addEventListener('click', addPourStepFromLast); $('#pourStepList').addEventListener('click', (event) => { const remove = event.target.closest('[data-remove-pour-step]'); if (!remove) return; const rows = readPourSteps(); rows.splice(Number(remove.dataset.removePourStep), 1); renderPourSteps(rows); }); $('#plan-template').addEventListener('change', applySelectedTemplate);
    $('#drinkClose').addEventListener('click', () => setDialog(els.drink, false)); $('#drinkCancel').addEventListener('click', () => setDialog(els.drink, false)); $('#drinkStartAssist').addEventListener('click', openDrinkBrewAssist); $('#deleteDrink').addEventListener('click', removeDrink); els.drinkForm.addEventListener('submit', saveDrink); els.drinkForm.addEventListener('click', (event) => { if (event.target.closest('[data-drink-feature-dismiss]')) { writeLocalFlag('coffee-vault-hint-drink-features'); return renderDrinkFeatureHint(state.editingDrinkId ? state.drinkLogs.find((item) => item.id === state.editingDrinkId) : null); } const assistButton = event.target.closest('[data-start-brew-assist]'); if (assistButton) return openDrinkBrewAssist(); const lastButton = event.target.closest('[data-use-last-brew]'); if (lastButton) { const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); return applyLastBrew(state.drinkLogs.find((log) => log.id === lastButton.dataset.useLastBrew), bean); } const planButton = event.target.closest('[data-drink-plan]'); if (planButton) { const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); return chooseDrinkPlan(planButton.dataset.drinkPlan, bean); } const openStep = event.target.closest('[data-drink-step-open]'); if (openStep) { state.activeDrinkStepIndex = Number(openStep.dataset.drinkStepOpen); return renderDrinkSteps(readDrinkSteps()); } const removeStep = event.target.closest('[data-remove-drink-step]'); if (removeStep) { const rows = readDrinkSteps(); rows.splice(Number(removeStep.dataset.removeDrinkStep), 1); state.activeDrinkStepIndex = Math.max(0, Math.min(state.activeDrinkStepIndex, rows.length - 1)); return renderDrinkSteps(rows); } const button = event.target.closest('[data-rate]'); if (!button) return; const row = button.parentElement; const clicked = Number(button.dataset.rate); const next = Number(row.dataset.value) === clicked ? null : clicked; renderRating(row, row.dataset.ratingName, next, row.dataset.ratingName === 'bitterness'); }); $('#addDrinkStep').addEventListener('click', addDrinkStep); $('#drink-grams').addEventListener('input', () => { $('#drink-param-dose').value = $('#drink-grams').value; syncDrinkTotalWater(); }); $('#drink-param-dose').addEventListener('input', syncDrinkTotalWater); $('#drink-param-totalWater').addEventListener('input', syncDrinkRatioFromWater); ['drink-ratio-left', 'drink-ratio-right'].forEach((id) => $(`#${id}`).addEventListener('input', () => { syncRatioValue('drink'); syncDrinkTotalWater(); })); $$('.duration-field', els.drinkForm).forEach((field) => field.addEventListener('input', () => syncDurationField(field))); $('#drink-method').addEventListener('change', () => { const custom = $('#drink-method-custom'); custom.hidden = $('#drink-method').value !== '__custom__'; if (!custom.hidden) custom.focus(); syncChoiceTrigger($('#drink-method')); $('#drink-plan-id').value = ''; syncDrinkParamFields(); syncDrinkTotalWater(); const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); if (bean) renderDrinkPlanPicker(bean, null); });
    $('#statusFilters').addEventListener('click', (event) => { const chip = event.target.closest('.chip'); if (!chip) return; $$('.chip', $('#statusFilters')).forEach((node) => node.classList.remove('active')); chip.classList.add('active'); state.status = chip.dataset.value; renderBeans(); }); $('#planMethodFilters').addEventListener('click', (event) => { const chip = event.target.closest('.chip'); if (!chip) return; state.planMethod = chip.dataset.value; renderBrewPlans(); }); $$('.sort-button').forEach((button) => button.addEventListener('click', () => { $$('.sort-button').forEach((node) => node.classList.remove('active')); button.classList.add('active'); state.sort = button.dataset.sort; renderBeans(); })); $('#sortDirection').addEventListener('click', () => { state.direction = state.direction === 'desc' ? 'asc' : 'desc'; $('#sortDirection').textContent = state.direction === 'desc' ? '↓' : '↑'; renderBeans(); }); $('#searchToggle').addEventListener('click', () => { els.searchPanel.hidden = !els.searchPanel.hidden; if (!els.searchPanel.hidden) els.search.focus(); }); els.search.addEventListener('input', () => { state.query = els.search.value; state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); }); $('#searchClear').addEventListener('click', () => { els.search.value = ''; state.query = ''; state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); });
    setupSmartSelects(); setupPlanSmartSelects(); syncAllChoiceTriggers(); $$('.picker-control').forEach((input) => input.addEventListener('click', () => openDatePicker(input))); $('#choiceList').addEventListener('click', chooseOption); $('#choiceClose').addEventListener('click', () => setDialog(els.choice, false)); $('#datePickerClose').addEventListener('click', () => setDialog(els.datePicker, false)); $('#datePickerCancel').addEventListener('click', () => setDialog(els.datePicker, false)); $('#datePickerConfirm').addEventListener('click', confirmDatePicker); $('#datePickerClear').addEventListener('click', clearDatePicker); $('#calendarPrev').addEventListener('click', () => shiftCalendar(-1)); $('#calendarNext').addEventListener('click', () => shiftCalendar(1)); $('#calendarDays').addEventListener('click', chooseCalendarDay); $$('[data-manage]').forEach((button) => button.addEventListener('click', () => openManager(button.dataset.manage))); $('#managerClose').addEventListener('click', () => setDialog(els.manager, false)); $('#managerList').addEventListener('click', managerAction);
    $('#profileOpen').addEventListener('click', openPersonal); $('#personalClose').addEventListener('click', () => setDialog(els.personal, false)); $('#coffeeCalendarOpen').addEventListener('click', () => openCoffeeCalendar('month')); $('#personalSettingsOpen').addEventListener('click', () => { renderSettings(); setDialog(els.settings, true); }); $('#personalSyncOpen').addEventListener('click', () => { renderSyncSettings(); setDialog(els.sync, true); }); $('#dataBackupOpen').addEventListener('click', () => { syncBackupDialog(); setDialog(els.backup, true); }); $('#dataBackupClose').addEventListener('click', () => setDialog(els.backup, false));
    $('#calendarClose').addEventListener('click', () => setDialog(els.calendar, false)); $('#calendarShare').addEventListener('click', shareCalendarCard); $$('[data-calendar-view]').forEach((button) => button.addEventListener('click', () => { state.coffeeCalendarView = button.dataset.calendarView; renderCoffeeCalendar(); })); $('#calendarPrevMonth').addEventListener('click', () => shiftCoffeeMonth(-1)); $('#calendarNextMonth').addEventListener('click', () => shiftCoffeeMonth(1)); $('#calendarPrevYear').addEventListener('click', () => shiftCoffeeYear(-1)); $('#calendarNextYear').addEventListener('click', () => shiftCoffeeYear(1)); els.calendar.addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const day = event.target.closest('[data-calendar-day]'); if (day) { state.selectedCoffeeDay = day.dataset.calendarDay; state.coffeeCalendarDate = dateFromKey(state.selectedCoffeeDay); renderCoffeeCalendar(); return; } const yearDay = event.target.closest('[data-year-day]'); if (yearDay) { state.selectedCoffeeDay = yearDay.dataset.yearDay; state.coffeeCalendarDate = dateFromKey(state.selectedCoffeeDay); renderCoffeeCalendar(); return; } const logItem = event.target.closest('[data-log-id]'); if (logItem) openDrinkDetail(state.drinkLogs.find((log) => log.id === logItem.dataset.logId)); if (event.target.closest('#calendarSeeLogs')) { setDialog(els.calendar, false); state.view = 'drinks'; state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); } });
    $('#settingsClose').addEventListener('click', () => setDialog(els.settings, false)); $$('[data-theme-value]').forEach((button) => button.addEventListener('click', () => applyTheme(button.datasetThemeValue || button.dataset.themeValue, true))); $('#settingQuickGrams').addEventListener('change', saveSettingsFromUi); $('#settingFlavorReminderDays').addEventListener('change', saveSettingsFromUi); $('#settingLowStockCups').addEventListener('change', saveSettingsFromUi); $('#settingBrewPlans').addEventListener('change', saveSettingsFromUi); $('#settingBeanPhotos').addEventListener('change', saveSettingsFromUi); $('#settingPriceUnit').addEventListener('change', () => { syncChoiceTrigger($('#settingPriceUnit')); saveSettingsFromUi(); }); $('#settingAdvanced').addEventListener('change', () => { $('#dimensionSection').hidden = !$('#settingAdvanced').checked; saveSettingsFromUi(); }); $('#dimensionSettings').addEventListener('change', saveSettingsFromUi); $('#syncClose').addEventListener('click', () => setDialog(els.sync, false)); $('#syncLoginOpen').addEventListener('click', () => openSyncAuth('login')); $('#syncAuthClose').addEventListener('click', syncAuthBack); $$('[data-sync-auth-mode]').forEach((button) => button.addEventListener('click', () => setSyncAuthMode(button.dataset.syncAuthMode))); $('#syncAuthSubmit').addEventListener('click', syncAuthSubmit); $('#syncLogout').addEventListener('click', syncLogout); $('#syncDeleteAccount').addEventListener('click', syncDeleteAccount); $('#syncEnabled').addEventListener('change', syncToggle); $('#syncNow').addEventListener('click', syncNow); $('#syncCopyRecovery').addEventListener('click', copyRecoveryCode); $('#aboutOpen').addEventListener('click', showAbout); $('#aboutClose').addEventListener('click', () => setDialog(els.about, false)); $$('[data-export-scope]').forEach((button) => button.addEventListener('click', () => exportBackup(button.dataset.exportScope))); $$('[data-import-scope]').forEach((button) => button.addEventListener('click', () => startImport(button.dataset.importScope))); $('#webImportInput').addEventListener('change', webImport); $('#migrationLater').addEventListener('click', () => setDialog(els.migration, false)); $('#migrationNow').addEventListener('click', migrateLegacy);
    $('#brewAssistStop').addEventListener('click', cancelBrewAssist); $('#brewAssistPause').addEventListener('click', pauseBrewAssist); $('#brewAssistRing').addEventListener('click', tapBrewAssistRing); $('#brewAssistRing').addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); tapBrewAssistRing(); } }); $('#brewAssistSkip').addEventListener('click', skipBrewAssistStage); $('#brewAssistFinish').addEventListener('click', finishBrewAssist);
    $('#sharePreviewClose').addEventListener('click', closeSharePreview); $('#sharePreviewCancel').addEventListener('click', closeSharePreview); $('#sharePreviewSave').addEventListener('click', saveShareCard); $('#sharePreviewShare').addEventListener('click', confirmShareCard);
    $('#confirmCancel').addEventListener('click', () => resolveConfirm(false)); $('#confirmAccept').addEventListener('click', () => resolveConfirm(true)); els.confirm.addEventListener('close', () => resolveConfirm(false));
    $('#exitCancel').addEventListener('click', () => setDialog(els.exitConfirm, false)); $('#exitConfirm').addEventListener('click', exitApp);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (els.brewAssist.open && state.brewAssist && !state.brewAssist.completed) requestWakeLock(); scheduleAutoSync(); syncFloatingActions({ delay: 1800 }); });
    window.addEventListener('scroll', () => { if (!floatingActionsActive()) return; expandFloatingActions({ delay: 1600 }); clearTimeout(fabScrollTimer); fabScrollTimer = setTimeout(() => scheduleFloatingActionCollapse(900), 160); }, { passive: true });
    [els.personal, els.backup, els.calendar, els.detail, els.drinkDetail, els.planDetail, els.planEditor, els.editor, els.drink, els.brewAssist, els.choice, els.datePicker, els.photoSource, els.scanImage, els.imagePreview, els.shareChoice, els.sharePreview, els.confirm, els.exitConfirm, els.manager, els.settings, els.sync, els.syncAuth, els.about].forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog === els.brewAssist ? cancelBrewAssist() : dialog === els.sharePreview ? closeSharePreview() : dialog.close(); }));
    $('#photoSourceClose').addEventListener('click', () => setDialog(els.photoSource, false));
    els.editor.addEventListener('close', () => clearPendingImages(true));
  }
  let syncTimer = null;
  let autoSyncing = false;
  async function autoSync() {
    if (!cloudSync || autoSyncing) return;
    const config = cloudSync.getConfig();
    if (!config.loggedIn || !config.enabled) return; // 未登录/未开启：零网络
    autoSyncing = true;
    state.syncBusy = true;
    if (els.sync.open) renderSyncSettings();
    try { const result = await cloudSync.sync(); if (result && !result.skipped) { await reload(); if (els.sync.open) renderSyncSettings(); } }
    catch (error) { console.error(error); }
    finally { autoSyncing = false; state.syncBusy = false; if (els.sync.open) renderSyncSettings(); }
  }
  function scheduleAutoSync(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(autoSync, delay == null ? 800 : delay); }
  function bindNativeLifecycle() { const app = capPlugin('App'); if (!app) return; app.addListener('backButton', closeTopLayerOrExit); app.addListener('appStateChange', async ({ isActive }) => { if (!isActive || state.resuming) return; state.resuming = true; await reload({ keepForm: true }); state.resuming = false; scheduleAutoSync(); }); }
  async function boot() { applyTheme(localStorage.getItem('coffee-vault-theme') || 'dark-roast', false); bindEvents(); try { await BeanRepository.init(); await reload(); bindNativeLifecycle(); await offerMigration(); state.initialized = true; syncFloatingActions({ showHint: true }); scheduleAutoSync(1500); } catch (error) { console.error(error); els.count.textContent = '豆仓启动失败'; toast(error.message || '数据库初始化失败'); } finally { const splash = capPlugin('SplashScreen'); if (splash) splash.hide().catch(() => {}); } }
  boot();
})();
