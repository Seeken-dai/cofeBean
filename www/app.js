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
  // 各维度的通俗说明：这个维度指什么、怎么打分。点「?」浮窗显示。
  const DIMENSION_INFO = {
    aroma: '干香与湿香的丰富度和愉悦度。闻起来越迷人、层次越多，笑脸越多。',
    acidity: '明亮活泼的酸，像柑橘、莓果那种。酸得干净讨喜为好，笑脸越多越明亮。',
    sweetness: '入口到回甘的甜度。越甜、越持久，笑脸越多。',
    body: '口感的重量与厚实感，从轻盈如茶到饱满如奶。越醇厚顺滑，笑脸越多。',
    aftertaste: '咽下后风味停留的长度与舒适度。余韵越干净悠长，笑脸越多。',
    balance: '各种风味是否协调，没有哪一味突兀或缺失。越协调，笑脸越多。',
    bitterness: '苦味与涩感的强弱（反向维度）。越苦越涩体验越差，所以哭脸越多代表越明显。'
  };
  // 列表小雷达的单字轴标签。
  const DIMENSION_SHORT = { aroma: '香', acidity: '酸', sweetness: '甜', body: '醇', aftertaste: '余', balance: '衡', bitterness: '苦' };
  const PRICE_UNITS = { g: { label: '每克单价', grams: 1, suffix: '/ g' }, '50g': { label: '每 50g 单价', grams: 50, suffix: '/ 50g' }, '100g': { label: '每 100g 单价', grams: 100, suffix: '/ 100g' }, jin: { label: '每斤单价', grams: 500, suffix: '/ 斤' } };
  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const DRINK_PAGE_SIZE = 60;
  const themeColors = { 'dark-roast': '#1a1412', frost: '#f7f1e8', obsidian: '#1e2320', blaze: '#f5f3ea' };
  const state = { beans: [], drinkLogs: [], brewPlans: [], settings: BeanCore.normalizeSettings({}), view: 'beans', status: '全部', drinkSource: '全部', planMethod: '全部', query: '', sort: 'roastDate', direction: 'desc', drinkVisibleLimit: DRINK_PAGE_SIZE, editingId: null, editingDrinkId: null, drinkMode: 'full', viewingDrinkId: null, editingPlanId: null, viewingPlanId: null, managerField: null, choiceTarget: null, dateTarget: null, calendarDate: null, coffeeCalendarDate: new Date(), coffeeCalendarView: 'month', selectedCoffeeDay: BeanCore.dateKey(new Date()), insightsPage: 'home', insightsCatalogTab: 'home', insightsRange: 'all', insightsPreference: 'origin', insightsReportType: null, insightsReportKey: null, activeDrinkStepIndex: -1, activePourStepIndex: -1, drinkDoseRef: null, brewAssist: null, pendingImages: [], pendingDrinkPhotos: [], drinkPhotoDraft: [], drinkPhotosToDelete: [], previewImage: null, shareBeanId: null, shareCardPreview: null, importScope: 'all', syncAuthMode: 'login', syncBusy: false, updateBusy: false, updateResult: null, appInfo: null, initialized: false, resuming: false };
  const cloudSync = window.BeanCloudSync ? window.BeanCloudSync.createSyncService() : null;
  let toastTimer = null;
  let confirmResolver = null;
  let cardPressTimer = null;
  let cardPressFired = false;
  let fabIdleTimer = null;
  let fabScrollTimer = null;
  let fabHintTimer = null;
  let previousView = state.view;
  let suppressListEnter = false;
  let activeQuickDrinkButton = null;
  let dialogScrimTimer = null;
  let subjectCropStatus = '';
  let subjectCropBusy = false;
  let subjectCropJob = 0;
  let beanImagesToDelete = [];
  const previousStats = new Map();
  const els = { list: $('#beanList'), empty: $('#emptyState'), count: $('#recordCount'), searchPanel: $('#searchPanel'), search: $('#searchInput'), personal: $('#personalDialog'), backup: $('#dataBackupDialog'), calendar: $('#coffeeCalendarDialog'), insights: $('#insightsDialog'), detail: $('#detailDialog'), drinkDetail: $('#drinkDetailDialog'), planDetail: $('#planDetailDialog'), planEditor: $('#planEditorDialog'), editor: $('#editorDialog'), form: $('#beanForm'), planForm: $('#planForm'), drink: $('#drinkDialog'), drinkForm: $('#drinkForm'), brewAssist: $('#brewAssistDialog'), choice: $('#choiceDialog'), datePicker: $('#datePickerDialog'), photoSource: $('#photoSourceDialog'), scanImage: $('#scanImageDialog'), imagePreview: $('#imagePreviewDialog'), shareChoice: $('#shareImageChoiceDialog'), drinkShareChoice: $('#drinkShareChoiceDialog'), planShareChoice: $('#planShareChoiceDialog'), planImport: $('#planImportDialog'), manager: $('#smartManagerDialog'), settings: $('#settingsDialog'), sync: $('#syncDialog'), syncAuth: $('#syncAuthDialog'), about: $('#aboutDialog'), migration: $('#migrationDialog'), confirm: $('#confirmDialog'), sharePreview: $('#sharePreviewDialog'), toast: $('#toast'), scanResult: $('#scanResult') };

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
  // 无状态格式化/解析工具在 app-format.js(app.js 拆分第一批,便于 Node 单测)。
  const { esc, formatWeight, formatPrice, formatDate, formatDateTime, localDateTime, dateTimeValue, waterFromRatio, ratioFromWater, parseRatio, secondsFromText, durationText, stars } = window.AppFormat;
  function unitPriceMeta() { return PRICE_UNITS[state.settings.priceUnit] || PRICE_UNITS.g; }
  function formatUnitPrice(bean) { const price = Number(bean.price); const grams = Number(bean.initialWeight); const unit = unitPriceMeta(); return Number.isFinite(price) && price > 0 && Number.isFinite(grams) && grams > 0 ? `¥${(price / grams * unit.grams).toFixed(2)} ${unit.suffix}` : '未记录'; }
  function brewPlansEnabled() { return Boolean(state.settings && state.settings.enableBrewPlans); }
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
  const MOKA_SIZES = ['1 杯份', '2 杯份', '3 杯份', '4 杯份', '6 杯份', '9 杯份'];
  function setMokaSize(prefix, value) {
    const hidden = $(`#${prefix}-mokaPotSize`); const choice = $(`#${prefix}-mokaPotSize-choice`); const custom = $(`#${prefix}-mokaPotSize-custom`);
    if (!hidden || !choice || !custom) return;
    const text = String(value || ''); const common = MOKA_SIZES.includes(text);
    choice.value = common ? text : text ? '__custom__' : '';
    custom.hidden = common || !text; custom.value = common ? '' : text; hidden.value = text;
    syncChoiceTrigger(choice);
  }
  function syncMokaSize(prefix) {
    const hidden = $(`#${prefix}-mokaPotSize`); const choice = $(`#${prefix}-mokaPotSize-choice`); const custom = $(`#${prefix}-mokaPotSize-custom`);
    if (!hidden || !choice || !custom) return;
    const isCustom = choice.value === '__custom__'; custom.hidden = !isCustom;
    hidden.value = isCustom ? custom.value.trim() : choice.value;
    if (isCustom && document.activeElement !== custom) setTimeout(() => custom.focus(), 0);
  }
  function numericValue(value) { const number = Number(String(value == null ? '' : value).replace(/[^\d.-]/g, '')); return Number.isFinite(number) ? number : null; }
  function datedCandidate(value, date, priority) { const number = numericValue(value); return number == null ? null : { value: number, timestamp: date, priority: priority || 20 }; }
  function snapshotCandidates(key) {
    const rows = [];
    state.drinkLogs.forEach((log) => { const source = log.brewPlanSnapshot || {}; const value = key === 'grams' ? log.grams : source[key]; const row = datedCandidate(value, log.consumedAt || log.updatedAt); if (row) rows.push(row); });
    state.brewPlans.forEach((plan) => { const row = datedCandidate(plan[key], plan.updatedAt); if (row) rows.push(row); });
    return rows;
  }
  function beanWeightCandidates() { return state.beans.flatMap((bean) => [datedCandidate(bean.initialWeight, bean.updatedAt), datedCandidate(bean.remainingWeight, bean.updatedAt)]).filter(Boolean); }
  function ratioCandidates() {
    const rows = [];
    state.drinkLogs.forEach((log) => { const row = datedCandidate(parseRatio(log.brewPlanSnapshot && log.brewPlanSnapshot.ratio)[1], log.consumedAt || log.updatedAt); if (row) rows.push(row); });
    state.brewPlans.forEach((plan) => { const row = datedCandidate(parseRatio(plan.ratio)[1], plan.updatedAt); if (row) rows.push(row); });
    return rows;
  }
  function gramCandidates() {
    const beanId = $('#drink-beanId').value; const rows = [{ value: state.settings.quickGrams, priority: 90, label: '快捷设置' }];
    state.drinkLogs.forEach((log) => { const row = datedCandidate(log.grams, log.consumedAt || log.updatedAt, log.beanId === beanId ? 70 : 20); if (row) rows.push(row); });
    return rows;
  }
  function waterCandidates() {
    const rows = [...snapshotCandidates('totalWater'), ...snapshotCandidates('liquid')];
    state.brewPlans.forEach((plan) => (plan.steps || []).forEach((step) => { const row = datedCandidate(step.water, plan.updatedAt); if (row) rows.push(row); }));
    state.drinkLogs.forEach((log) => ((log.brewPlanSnapshot && log.brewPlanSnapshot.steps) || []).forEach((step) => { const row = datedCandidate(step.water, log.consumedAt || log.updatedAt); if (row) rows.push(row); }));
    return rows;
  }
  function durationCandidates(input) {
    const field = input.closest('.duration-field'); const target = field && field.dataset.durationTarget || '';
    const key = target.replace(/^plan-|^drink-param-/, ''); const raw = [];
    state.drinkLogs.forEach((log) => { const value = log.brewPlanSnapshot && log.brewPlanSnapshot[key]; if (value) raw.push(value); });
    state.brewPlans.forEach((plan) => { if (plan[key]) raw.push(plan[key]); });
    const hourMode = Boolean(field && field.querySelector('[data-duration-hour]')); const single = Boolean(field && field.querySelectorAll('input').length === 1);
    return raw.map((value) => {
      const seconds = secondsFromText(value); if (seconds == null) return null;
      const values = hourMode ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60)] : single ? [seconds] : [Math.floor(seconds / 60), Math.round(seconds % 60)];
      return { values, label: durationText(seconds, hourMode ? 'hour' : 'minute') };
    }).filter(Boolean).slice(0, 4);
  }
  function setupNumberInputs() {
    const columnProfile = (input) => {
      const attributeNames = [...input.attributes].map((attr) => attr.name);
      if (input.hasAttribute('data-duration-hour')) return { columnLabel: '小时', unit: '时', step: 1, min: 0, max: Number(input.max || 72) };
      if (input.hasAttribute('data-duration-min') || attributeNames.some((name) => /-min$/.test(name))) return { columnLabel: '分钟', unit: '分', step: 1, min: 0, max: Number(input.max || 999) };
      return { columnLabel: '秒', unit: '秒', step: input.closest('.duration-control') && input.closest('.duration-control').querySelectorAll('input').length === 1 ? 1 : 5, min: 0, max: Number(input.max || 59) };
    };
    AppNumberInput.enhance(document, [
      { selector: '#field-initialWeight, #field-remainingWeight', mode: 'wheel', label: '咖啡豆克重', unit: 'g', step: 1, min: 0, max: 10000, defaultValue: 200, defaults: [100, 200, 250, 500], suggestions: beanWeightCandidates },
      { selector: '#drink-grams', mode: 'wheel', label: '本次用豆', unit: 'g', step: 0.5, min: 0.1, max: (input) => Number(input.max || 1000), defaults: [15, 18, 20], suggestions: gramCandidates },
      { selector: '#plan-dose, #drink-param-dose, #plan-targetYield, #drink-param-targetYield', mode: 'wheel', unit: 'g', step: 0.5, min: 0, max: 1000, defaults: [15, 18, 20], suggestions: () => snapshotCandidates('dose') },
      { selector: '#plan-liquid, #drink-param-liquid, #plan-totalWater, #drink-param-totalWater, [data-pour-water], [data-drink-step-water]', mode: 'wheel', unit: 'g', step: 5, min: 0, max: 5000, suggestions: waterCandidates },
      { selector: '#plan-ratio-right, #drink-ratio-right', mode: 'wheel', label: '粉水比', step: 0.5, min: 1, max: 40, defaults: [15, 16, 17], suggestions: ratioCandidates },
      { selector: '#plan-waterTemp, #drink-param-waterTemp', mode: 'wheel', label: '水温', unit: '°C', step: 1, min: 0, max: 100, defaults: [88, 90, 92, 94], suggestions: () => snapshotCandidates('waterTemp') },
      { selector: '.duration-control', mode: 'group', column: columnProfile, suggestions: durationCandidates },
      { selector: '.pour-time-control', mode: 'group', label: '注水节点时间', column: columnProfile },
      { selector: '#calendarTime', mode: 'group', label: '饮用时间', column: (input) => input.id === 'calendarHour' ? { columnLabel: '小时', unit: '时', step: 1, min: 0, max: 23 } : { columnLabel: '分钟', unit: '分', step: 5, min: 0, max: 59 } },
      { selector: '#field-price, #drink-price', mode: 'stepper', label: '价格', step: 1, min: 0, max: 999999 },
      { selector: '#field-bestFlavorDays', mode: 'stepper', label: '赏味期', step: 1, min: 1, max: 3650 },
      { selector: '#settingQuickGrams', mode: 'stepper', label: '快捷喝一杯', step: 0.5, min: 1, max: 100 },
      { selector: '#settingFlavorReminderDays', mode: 'stepper', label: '赏味期提醒', step: 1, min: 0, max: 60 },
      { selector: '#settingLowStockCups', mode: 'stepper', label: '余量提醒', step: 1, min: 1, max: 20 }
    ]);
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
  function motionReduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, motionReduced() ? 0 : ms)); }
  async function haptic(kind) {
    const native = capPlugin('Haptics');
    try {
      if (native) {
        if (kind === 'success' && native.notification) return await native.notification({ type: 'SUCCESS' });
        if (native.impact) return await native.impact({ style: 'LIGHT' });
      }
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [20, 45, 30] : 12);
  }
  function syncDialogScrim() {
    clearTimeout(dialogScrimTimer);
    const hasOpenDialog = Boolean(document.querySelector('dialog[open]'));
    if (hasOpenDialog) {
      document.body.classList.add('dialog-scrim-active'); document.body.classList.remove('dialog-scrim-closing');
      return;
    }
    document.body.classList.remove('dialog-scrim-active'); document.body.classList.add('dialog-scrim-closing');
    dialogScrimTimer = setTimeout(() => document.body.classList.remove('dialog-scrim-closing'), motionReduced() ? 0 : 180);
  }
  // 关闭是异步的（等 sheet-out 动画），期间 dialog.open 仍为 true。若此时同一个 dialog 又被打开
  // （如「记一杯」先关选择弹窗再复用它显示豆子列表），必须撤销挂起的关闭，否则它会在 260ms 后把刚打开的弹窗关掉。
  const pendingDialogCloses = new WeakMap();
  function cancelDialogClose(dialog) {
    const pending = pendingDialogCloses.get(dialog);
    if (pending) { clearTimeout(pending.timer); dialog.removeEventListener('animationend', pending.onEnd); pendingDialogCloses.delete(dialog); }
    dialog.classList.remove('sheet-closing');
  }
  function setDialog(dialog, open) {
    if (open) {
      cancelDialogClose(dialog);
      if (!dialog.open) dialog.showModal();
      syncDialogScrim();
      return;
    }
    if (dialog.open && !dialog.classList.contains('sheet-closing')) {
      if (motionReduced()) { dialog.close(); return; }
      dialog.classList.add('sheet-closing');
      let onEnd;
      const finish = () => { cancelDialogClose(dialog); if (dialog.open) dialog.close(); };
      onEnd = (event) => { if (event.target !== dialog || event.animationName !== 'sheet-out') return; finish(); };
      dialog.addEventListener('animationend', onEnd);
      pendingDialogCloses.set(dialog, { timer: setTimeout(finish, 260), onEnd });
    }
  }
  function animateNumber(el, value, format) {
    const to = Number(value) || 0; const from = previousStats.get(el.id);
    previousStats.set(el.id, to);
    if (from == null || from === to || motionReduced()) { el.textContent = format(to); return; }
    const started = performance.now();
    const tick = (now) => { const p = Math.min(1, (now - started) / 400); const eased = 1 - Math.pow(1 - p, 3); el.textContent = format(from + (to - from) * eased); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function animateCardExit(el) {
    if (!el || motionReduced()) return Promise.resolve();
    el.style.setProperty('--card-height', `${el.offsetHeight}px`); el.classList.add('card-leaving');
    return new Promise((resolve) => { el.addEventListener('animationend', resolve, { once: true }); setTimeout(resolve, 340); });
  }
  async function animateQuickDrink(button) {
    if (!button || button.disabled) return;
    const bean = state.beans.find((item) => item.id === button.dataset.drinkId); if (!bean) return;
    const grams = Math.min(state.settings.quickGrams, Number(bean.remainingWeight) || 0);
    resetQuickDrinkFeedback(); activeQuickDrinkButton = button;
    const label = button.querySelector('span'); button.dataset.originalLabel = label.textContent;
    button.classList.add('is-drinking'); label.textContent = '✓'; haptic('light');
    const float = document.createElement('span'); float.className = 'drink-float'; float.textContent = `-${formatWeight(grams)}`; button.appendChild(float);
    await wait(450); openDrinkDialog(bean);
  }
  function resetQuickDrinkFeedback() {
    const button = activeQuickDrinkButton; activeQuickDrinkButton = null;
    if (!button || !button.isConnected) return;
    button.classList.remove('is-drinking'); button.querySelectorAll('.drink-float').forEach((node) => node.remove());
    const label = button.querySelector('span'); if (label) label.textContent = button.dataset.originalLabel || label.textContent;
    delete button.dataset.originalLabel;
  }
  function floatingActionsActive() { return ['beans', 'plans', 'drinks'].includes(state.view) && !(state.view === 'beans' && state.beans.length === 0); }
  function readLocalFlag(key) { try { return localStorage.getItem(key) === '1'; } catch (_) { return false; } }
  function writeLocalFlag(key) { try { localStorage.setItem(key, '1'); } catch (_) {} }
  const REMINDER_ACK_KEY = 'coffee-vault-reminder-ack-v1';
  function readReminderAcks() { try { const value = JSON.parse(localStorage.getItem(REMINDER_ACK_KEY) || '[]'); return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []); } catch (_) { return new Set(); } }
  function writeReminderAcks(ids) { try { localStorage.setItem(REMINDER_ACK_KEY, JSON.stringify(Array.from(ids))); } catch (_) {} }
  function currentHomeReminders() { return BeanInsights.coffeeReportReminders(state.drinkLogs).concat(BeanCore.beanReminders(state.beans, state.settings)); }
  function activeReminderAcks(reminders) { const active = new Set((reminders || []).map((item) => item.id)); const next = new Set(Array.from(readReminderAcks()).filter((id) => active.has(id))); writeReminderAcks(next); return next; }
  function acknowledgeReminder(id) { if (!id) return; const ids = readReminderAcks(); ids.add(id); writeReminderAcks(ids); }
  function showFabHintOnce() {
    const key = 'coffee-vault-fab-hint-seen';
    if (readLocalFlag(key)) return;
    writeLocalFlag(key);
    clearTimeout(fabHintTimer);
    fabHintTimer = setTimeout(() => toast('右侧按钮可快速添加，空闲后会自动收起'), 700);
  }
  // 该机 window.innerHeight 会无事件地在多值间跳动（含系统栏区域），fixed 元素若用 bottom 锚定它就会
  // 随之位移。documentElement.clientHeight（可视视口高度）稳定，故浮动按钮改用它从顶部（top）锚定，
  // 屏幕位置恒定不跳。clientHeight 偶尔无事件变化，除事件外再以低频轮询兜住（仅在变化时写入）。
  let visibleHApplied = -1;
  let visibleWApplied = -1;
  function updateFabInset() {
    const de = document.documentElement;
    const h = de.clientHeight;
    if (h !== visibleHApplied) { visibleHApplied = h; de.style.setProperty('--visible-h', `${h}px`); }
    const w = de.clientWidth;
    if (w !== visibleWApplied) { visibleWApplied = w; de.style.setProperty('--visible-w', `${w}px`); }
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
  const webImageUrls = new Map(); // idb:<id> -> objectURL，渲染前由 resolveWebImages 预取
  function imageSrc(path) {
    if (path && String(path).indexOf('idb:') === 0) return webImageUrls.get(path) || '';
    return path && window.Capacitor && window.Capacitor.convertFileSrc ? window.Capacitor.convertFileSrc(path) : path;
  }
  const subjectCropUi = window.AppSubjectCrop.create({ core: window.SubjectCropCore });
  async function resolveWebImages(beans, drinkLogs) {
    if (BeanRepository.isNative()) return;
    const refs = new Set();
    (beans || []).forEach((bean) => ['bagImagePath', 'bagCutoutImagePath', 'labelImagePath'].forEach((key) => { if (bean[key] && String(bean[key]).indexOf('idb:') === 0) refs.add(bean[key]); }));
    (drinkLogs || []).forEach((log) => (log.photos || []).forEach((ref) => { if (ref && String(ref).indexOf('idb:') === 0) refs.add(ref); }));
    // 编辑中尚未保存的图片不属于任何已存记录，但它们的 objectURL 正被编辑页引用；漏掉就会在 reload 时被回收，图片随即消失。
    const addRef = (ref) => { if (ref && String(ref).indexOf('idb:') === 0) refs.add(ref); };
    (state.pendingImages || []).forEach((item) => addRef(item && item.ref));
    (state.drinkPhotoDraft || []).forEach(addRef);
    (state.pendingDrinkPhotos || []).forEach((item) => addRef(typeof item === 'string' ? item : item && item.ref));
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('压缩失败')), 'image/webp', 0.8));
  }
  function pickWebImageFile() {
    return pickWebImageFiles(1).then((files) => files[0] || null);
  }
  function pickWebImageFiles(limit) {
    const max = Math.max(1, Math.min(3, Math.round(Number(limit) || 1)));
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (max > 1) input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []).filter((file) => file && file.type && file.type.startsWith('image/'));
        resolve(files.slice(0, max));
      };
      input.click();
    });
  }
  function imageCard(label, path, role, editable) { return path ? `<article class="vault-image-card" data-preview-image="${esc(path)}" data-preview-label="${esc(label)}" tabindex="0" role="button" aria-label="查看${esc(label)}大图"><img src="${esc(imageSrc(path))}" alt="${esc(label)}"><span>${esc(label)}</span>${editable ? `<div class="vault-image-actions"><button data-add-image-role="${role}" type="button">更换</button><button class="vault-image-remove" data-remove-image-role="${role}" type="button">删除</button></div>` : ''}</article>` : ''; }
  function imageSlot(label, path, role) { return path ? imageCard(label, path, role, true) : `<button class="vault-image-empty" data-add-image-role="${role}" type="button"><span>${esc(label)}</span><small>拍摄或读取图片</small></button>`; }
  function currentImageBean() { return { bagImagePath: $('#field-bagImagePath').value, bagCutoutImagePath: $('#field-bagCutoutImagePath').value, labelImagePath: $('#field-labelImagePath').value }; }
  function cropDraftState(source) {
    if (!state.settings.photoJournal || !source.bagImagePath) return '';
    if (subjectCropBusy) return '<div class="subject-crop-draft is-working"><i aria-hidden="true"></i><span><b>正在生成手账封面</b><small>本地识别中，完成后即可保存</small></span></div>';
    if (source.bagCutoutImagePath) return `<div class="subject-crop-draft is-ready"><i aria-hidden="true">✓</i><span><b>手账封面已生成</b><small>详情页会优先展示撕纸风主体</small></span><div><button data-preview-cutout type="button">查看</button><button data-remove-cutout type="button">删除</button></div></div>`;
    const failed = subjectCropStatus === 'error';
    return `<div class="subject-crop-draft${failed ? ' is-error' : ''}"><i aria-hidden="true">${failed ? '!' : '○'}</i><span><b>${failed ? '手账封面生成失败' : '还没有手账封面'}</b><small>${failed ? '原图仍可正常保存和展示' : '可以为这张原图生成撕纸风封面'}</small></span><button data-regenerate-cutout type="button">${failed ? '重试' : '生成'}</button></div>`;
  }
  function renderImageVault(bean) { const source = bean || currentImageBean(); $('#editorImageVault').hidden = false; $('#editorImageVault').innerHTML = `<div class="section-heading"><div><span>袋子与标签</span><small>编辑页始终显示原图，手账封面只用于展示</small></div></div>${imageSlot('咖啡袋原图', source.bagImagePath, 'bag')}${imageSlot('标签', source.labelImagePath, 'label')}${cropDraftState(source)}`; }
  function renderDrinkPhotoVault() {
    const photos = (state.drinkPhotoDraft || []).slice(0, 3);
    const remain = Math.max(0, 3 - photos.length);
    const cards = photos.map((path, index) => `<article class="vault-image-card drink-photo-card" data-preview-image="${esc(path)}" data-preview-label="饮用照片 ${index + 1}" tabindex="0" role="button" aria-label="查看饮用照片 ${index + 1}"><img src="${esc(imageSrc(path))}" alt="饮用照片 ${index + 1}"><span>照片 ${index + 1}</span><div class="vault-image-actions"><button class="vault-image-remove" data-remove-drink-photo="${index}" type="button">删除</button></div></article>`).join('');
    const add = remain ? `<button class="vault-image-empty" data-add-drink-photo type="button"><span>添加照片</span><small>还可 ${remain} 张，相册可一次多选</small></button>` : '';
    $('#drinkPhotoVault').innerHTML = `<div class="section-heading"><div><span>照片贴图</span><small>${photos.length}/3 · 可记录成品、拉花或店内杯照</small></div></div>${cards}${add}`;
  }
  async function deleteImageRef(ref, archived) {
    if (!ref) return;
    if (!BeanRepository.isNative()) return BeanRepository.deleteWebImage(ref);
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner) return;
    if (archived && scanner.deleteArchivedImage) return scanner.deleteArchivedImage({ path: ref }).catch(() => {});
    if (!archived && scanner.discardImage) return scanner.discardImage({ path: ref }).catch(() => {});
  }

  function render() { renderView(); renderBeans(); renderDrinks(); renderBrewPlans(); if (els.personal.open) renderPersonal(); if (els.calendar.open) renderCoffeeCalendar(); if (els.insights.open) insightsUi.render(); }
  function renderView() {
    if (!brewPlansEnabled() && state.view === 'plans') state.view = 'beans';
    $('#plansTab').hidden = !brewPlansEnabled();
    $('.view-tabs').classList.toggle('two-tabs', !brewPlansEnabled());
    $('#beansView').hidden = state.view !== 'beans'; $('#drinksView').hidden = state.view !== 'drinks'; $('#plansView').hidden = state.view !== 'plans';
    const order = { beans: 0, drinks: 1, plans: 2 }; const activeView = $(`#${state.view}View`);
    if (activeView && previousView !== state.view) { activeView.classList.remove('slide-from-left', 'slide-from-right'); void activeView.offsetWidth; activeView.classList.add(order[state.view] > order[previousView] ? 'slide-from-right' : 'slide-from-left'); previousView = state.view; }
    document.body.classList.toggle('empty-onboarding', state.view === 'beans' && state.beans.length === 0);
    $('#addBean').hidden = !floatingActionsActive(); $('#scanBean').hidden = state.view !== 'beans' || !floatingActionsActive(); $('#planImportFab').hidden = state.view !== 'plans';
    $('#addBean').setAttribute('aria-label', state.view === 'plans' ? '新增冲煮方案' : state.view === 'drinks' ? '记一杯' : '新增咖啡豆');
    $('#addBean').textContent = '+';
    syncFloatingActions();
    els.search.placeholder = state.view === 'beans' ? '搜索豆名、产地或风味' : state.view === 'plans' ? '搜索方案、方式或备注' : '搜索豆名、冲煮方式或备注';
    $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
    els.count.textContent = state.view === 'beans' ? `共 ${state.beans.length} 款咖啡豆` : state.view === 'plans' ? `共 ${state.brewPlans.length} 个方案` : `共记录 ${state.drinkLogs.length} 杯`;
  }
  function renderBeans() {
    const visible = BeanCore.filterAndSort(state.beans, state); const stats = BeanCore.summarize(state.beans);
    animateNumber($('#statTotal'), stats.total, (value) => String(Math.round(value))); animateNumber($('#statActive'), stats.active, (value) => String(Math.round(value))); animateNumber($('#statRemaining'), stats.remaining, (value) => formatWeight(Math.round(value * 10) / 10));
    renderBeanReminders();
    renderDrinkStarterHint();
    els.empty.hidden = visible.length > 0; els.list.hidden = visible.length === 0;
    renderBeanEmptyState(visible);
    els.list.classList.toggle('suppress-enter', suppressListEnter); els.list.innerHTML = visible.map((bean, index) => cardTemplate(bean, index)).join('');
    els.count.textContent = (state.query || state.status !== '全部') ? `显示 ${visible.length} / 共 ${state.beans.length} 款` : `共 ${state.beans.length} 款咖啡豆`;
  }
  function renderBeanEmptyState(visible) {
    if (visible.length) return;
    const isNewUser = state.beans.length === 0;
    els.empty.querySelector('h2').textContent = isNewUser ? '一包豆子，故事从这里开始' : '没有匹配的豆子';
    els.empty.querySelector('p').textContent = isNewUser ? '放入第一包咖啡豆，记下它的来处、风味与变化。' : '换个关键词或筛选条件再试试。';
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
    const reminders = currentHomeReminders();
    const reminder = BeanCore.selectHomeReminder(reminders, activeReminderAcks(reminders));
    panel.hidden = !reminder || state.view !== 'beans';
    if (panel.hidden) return;
    const kind = reminder.type === 'reportYear' ? '年报' : reminder.type === 'reportMonth' ? '月报' : reminder.type === 'flavor' ? '赏味期' : '余量';
    panel.innerHTML = `<button type="button" data-reminder-id="${esc(reminder.id)}"${reminder.beanId ? ` data-reminder-bean="${esc(reminder.beanId)}"` : ''}${reminder.reportType ? ` data-reminder-report-type="${esc(reminder.reportType)}" data-reminder-report-key="${esc(reminder.reportKey)}"` : ''}><span class="reminder-label">${esc(kind)}</span><span class="reminder-copy"><strong>${esc(reminder.title || reminder.beanName)}</strong><small>${esc(reminder.message)}</small></span><i aria-hidden="true">›</i></button>`;
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
    const cutout = state.settings.photoJournal && bean.bagCutoutImagePath ? imageSrc(bean.bagCutoutImagePath) : '';
    const src = cutout || (bean.bagImagePath ? imageSrc(bean.bagImagePath) : '');
    if (src && !config.forcePlaceholder) return `<div class="bean-thumb has-photo${cutout ? ' journal-cutout' : ''}" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy"></div>`;
    const ph = BeanCore.beanPlaceholder(bean);
    const badge = bean.bagImagePath && config.markPhoto ? '<span class="bean-thumb-photo-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.5 6 10 4h4l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5Z"/><circle cx="12" cy="12.5" r="3.5"/></svg></span>' : '';
    return `<div class="bean-thumb generated bean-thumb--${esc(ph.roastKey)}${badge ? ' has-photo-badge' : ''}" aria-hidden="true">${thumbMotif(ph)}<span class="bean-thumb-glyph">${esc(ph.glyph)}</span>${processBadge(bean)}${badge}</div>`;
  }
  function remainingBar(bean, remaining) {
    const initial = Number(bean.initialWeight) || 0;
    if (!(initial > 0)) return '';
    const pct = Math.max(0, Math.min(100, Math.round(remaining / initial * 100)));
    const level = pct <= 12 ? ' is-low' : pct <= 30 ? ' is-mid' : '';
    return `<div class="remaining-bar${level}" role="presentation" aria-hidden="true" style="--w:${pct}%"><i></i></div>`;
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
  // labels：'full' 详情大图（维度名+分值），'short' 列表小图（单字标签），其它为无标签。
  function buildRatingRadar(log, options) {
    const opts = options || {};
    const compare = opts.compare || null;
    const currentKeys = BeanCore.DIMENSION_KEYS.filter((key) => log[key]);
    const sharedKeys = compare ? currentKeys.filter((key) => compare[key]) : [];
    const keys = sharedKeys.length >= 3 ? sharedKeys : currentKeys;
    const comparison = sharedKeys.length >= 3 ? compare : null;
    if (keys.length < 3) return '';
    const mode = opts.labels === true ? 'full' : opts.labels || false;
    const short = mode === 'short';
    const cx = 100, cy = 100, n = keys.length, maxR = mode === 'full' ? 58 : short ? 66 : 84;
    const angleAt = (i) => -90 + i * 360 / n;
    const plotR = (source, key) => { const raw = Math.max(1, Math.min(5, Number(source[key]) || 0)); return maxR * (key === 'bitterness' ? 6 - raw : raw) / 5; };
    const grid = [1, 2, 3, 4, 5].map((level) => {
      const pts = keys.map((_, i) => radarPoint(cx, cy, maxR * level / 5, angleAt(i)).join(',')).join(' ');
      return `<polygon points="${pts}" class="radar-grid"${opts.animate ? ` style="animation-delay:${level * 45}ms"` : ''}/>`;
    }).join('');
    const spokes = keys.map((_, i) => { const [x, y] = radarPoint(cx, cy, maxR, angleAt(i)); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis"/>`; }).join('');
    const previousShape = comparison ? `<polygon points="${keys.map((key, i) => radarPoint(cx, cy, plotR(comparison, key), angleAt(i)).join(',')).join(' ')}" class="radar-shape radar-shape--previous"/>` : '';
    const previousDots = comparison ? keys.map((key, i) => { const [x, y] = radarPoint(cx, cy, plotR(comparison, key), angleAt(i)); return `<circle cx="${x}" cy="${y}" r="2.3" class="radar-dot radar-dot--previous"/>`; }).join('') : '';
    const shape = `<polygon points="${keys.map((key, i) => radarPoint(cx, cy, plotR(log, key), angleAt(i)).join(',')).join(' ')}" class="radar-shape"${opts.animate ? ' style="animation-delay:250ms"' : ''}/>`;
    const dots = keys.map((key, i) => { const [x, y] = radarPoint(cx, cy, plotR(log, key), angleAt(i)); const delay = 330 + i * 55; return `${opts.animate ? `<circle cx="${x}" cy="${y}" r="${short ? 2.2 : 2.6}" class="radar-dot-ripple" style="animation-delay:${delay}ms"/>` : ''}<circle cx="${x}" cy="${y}" r="${short ? 2.2 : 2.6}" class="radar-dot"${opts.animate ? ` style="animation-delay:${delay}ms"` : ''}/>`; }).join('');
    const labelSvg = mode ? keys.map((key, i) => {
      const [x, y] = radarPoint(cx, cy, maxR + (short ? 12 : 15), angleAt(i));
      const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
      const delay = opts.animate ? ' style="animation-delay:600ms"' : '';
      if (short) return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label radar-label--short"${delay}>${DIMENSION_SHORT[key]}</text>`;
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label"${delay}>${DIMENSIONS[key]}<tspan class="radar-label-val"> ${log[key]}${key === 'bitterness' ? '☹' : '☺'}</tspan></text>`;
    }).join('') : '';
    const cls = `rating-radar${short ? ' rating-radar--mini' : ''}${opts.animate ? ' radar-enter' : ''}`;
    return `<svg class="${cls}" viewBox="0 0 200 200" role="img" aria-label="${comparison ? '本次与上次高级评价对比雷达图' : '高级评价雷达图'}">${grid}${spokes}${previousShape}${previousDots}${shape}${dots}${labelSvg}</svg>`;
  }
  function logTemplate(log, compact) {
    const advancedKeys = BeanCore.DIMENSION_KEYS.filter((key) => log[key]);
    const radar = !compact && advancedKeys.length >= 3 ? buildRatingRadar(log, { labels: 'short' }) : '';
    const tags = advancedKeys.map((key) => `<span>${DIMENSIONS[key]} ${key === 'bitterness' ? '☹' : '☺'}${log[key]}</span>`).join('');
    // 雷达图放到卡片右侧（填满原本的空白）；不足 3 维回退为左侧标签行。
    const tagBlock = !radar && !compact && tags ? `<div class="dimension-summary">${tags}</div>` : '';
    const radarCol = radar ? `<div class="dimension-radar-wrap">${radar}</div>` : '';
    const external = log.source === 'external';
    const title = external ? (log.drinkName || log.cafeName || log.beanName) : log.beanName;
    const meta = external ? ['外饮', log.cafeName, log.price > 0 ? formatPrice(log.price) : '', log.location, stars(log.overallRating)] : [formatWeight(log.grams), `<span class="method-label">${brewIcon(log.brewMethod)}${esc(log.brewMethod)}</span>`, stars(log.overallRating)];
    const photos = log.photos && log.photos.length && !compact ? `<div class="drink-photo-strip">${log.photos.slice(0, 3).map((path, index) => `<span data-preview-image="${esc(path)}" data-preview-label="饮用照片 ${index + 1}"><img src="${esc(imageSrc(path))}" alt=""></span>`).join('')}</div>` : '';
    const pending = log.tastingStatus === 'pending' ? `<button class="pending-inline-badge" data-continue-tasting="${esc(log.id)}" type="button">待补感受</button>` : '';
    return `<article class="drink-entry${radar ? ' has-radar' : ''}${external ? ' is-external' : ''}" data-log-id="${esc(log.id)}" data-tasting-status="${esc(log.tastingStatus)}" tabindex="0" role="button"><div class="drink-dot"></div><div class="drink-entry-main"><div class="drink-head"><strong>${esc(title)}${pending}</strong><time>${esc(formatDateTime(log.consumedAt))}</time></div><p class="drink-meta">${meta.filter(Boolean).map((item) => String(item).startsWith('<span') ? item : `<span>${esc(item)}</span>`).join('')}</p>${log.notes ? `<p class="drink-notes">${esc(log.notes)}</p>` : ''}${photos}${tagBlock}</div>${radarCol}</article>`;
  }
  // 近 30 天饮用迷你条形图（3c）：每天一根柱，高度按杯数归一；今天高亮，空天留细基线。
  function renderDrinkTrend() {
    const host = $('#drinkTrend'); if (!host) return;
    const summaryOpen = $('#insightsOpen');
    const series = BeanCore.recentDrinkSeries(state.drinkLogs, 30);
    const total = series.reduce((sum, day) => sum + day.cups, 0);
    host.hidden = total === 0;
    if (summaryOpen) summaryOpen.hidden = host.hidden;
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
    $$('.chip', $('#drinkSourceFilters')).forEach((chip) => chip.classList.toggle('active', chip.dataset.value === state.drinkSource));
    const q = String(state.query || '').trim().toLocaleLowerCase('zh-CN');
    const sourceFiltered = state.drinkLogs.filter((log) => state.drinkSource === '全部' || (state.drinkSource === '外饮' ? log.source === 'external' : log.source !== 'external'));
    const visible = q ? sourceFiltered.filter((log) => [log.beanName, log.brewMethod, log.cafeName, log.drinkName, log.location, log.notes, log.source === 'external' ? '外饮' : formatWeight(log.grams), formatDateTime(log.consumedAt)].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(q))) : sourceFiltered;
    const drinkEmpty = $('#drinkEmpty'); const hasDrinkLogs = state.drinkLogs.length > 0;
    drinkEmpty.hidden = visible.length > 0;
    drinkEmpty.querySelector('h2').textContent = hasDrinkLogs ? '没有符合筛选的饮用记录' : '一页日常，留住每一次相遇';
    drinkEmpty.querySelector('p').textContent = hasDrinkLogs ? (q ? '换个关键词或类型再试试。' : '切换到“全部”看看其他记录。') : '家里冲的、咖啡馆喝的，都可以从这一杯开始。';
    const drinkEmptyActions = drinkEmpty.querySelector('.empty-actions'); if (drinkEmptyActions) drinkEmptyActions.hidden = hasDrinkLogs;
    const pageSize = Math.max(DRINK_PAGE_SIZE, Number(state.drinkVisibleLimit) || DRINK_PAGE_SIZE);
    const paged = visible.slice(0, pageSize);
    if (state.view === 'drinks') els.count.textContent = q || state.drinkSource !== '全部' || paged.length < visible.length ? `显示 ${paged.length} / 共 ${state.drinkLogs.length} 杯` : `共记录 ${state.drinkLogs.length} 杯`;
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
    const planEmpty = $('#planEmpty'); const hasPlans = state.brewPlans.length > 0;
    planEmpty.hidden = visible.length > 0; $('#brewPlanList').hidden = visible.length === 0;
    planEmpty.querySelector('h2').textContent = hasPlans ? '没有匹配的冲煮方案' : '一段风味，值得反复回味';
    planEmpty.querySelector('p').textContent = hasPlans ? '换个关键词或冲煮方式再试试。' : '记下冲煮参数，让喜欢的风味下次还能找到。';
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
  function dayLevel(day) { const grams = Number(day && day.grams) || 0; const cups = Number(day && day.cups) || 0; if (grams <= 0) { if (cups <= 0) return 0; if (cups <= 1) return 1; if (cups <= 2) return 2; if (cups <= 3) return 3; return 4; } if (grams <= 15) return 1; if (grams <= 30) return 2; if (grams <= 45) return 3; return 4; }
  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function statsForRange(days, predicate) { const values = Object.values(days).filter((day) => predicate(day.date)); const rated = values.filter((day) => day.averageRating); return { cups: values.reduce((sum, day) => sum + day.cups, 0), grams: Math.round(values.reduce((sum, day) => sum + day.grams, 0) * 10) / 10, cost: Math.round(values.reduce((sum, day) => sum + day.cost, 0) * 100) / 100, averageRating: rated.length ? Math.round(rated.reduce((sum, day) => sum + day.averageRating, 0) / rated.length * 10) / 10 : null }; }
  function continuousDays(days) { const keys = Object.keys(days).sort(); if (!keys.length) return 0; let cursor = dateFromKey(keys[keys.length - 1]); let count = 0; while (days[ymd(cursor)]) { count += 1; cursor.setDate(cursor.getDate() - 1); } return count; }
  function renderMiniHeatmap() { const days = daySummaries(); const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 41); const html = []; for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const key = ymd(d); html.push(`<i class="heat-${dayLevel(days[key])}"></i>`); } $('#profileHeatmap').innerHTML = html.join(''); const stats = statsForRange(days, (key) => key.startsWith(monthKey(new Date()))); $('#profileCalendarStats').textContent = `本月 ${stats.cups} 杯 · ${formatWeight(stats.grams)} · ${money(stats.cost)}`; }
  function renderPersonal() { renderMiniHeatmap(); }
  function openPersonal() { renderPersonal(); setDialog(els.personal, true); }
  function openCoffeeCalendar(view) { state.coffeeCalendarView = view || state.coffeeCalendarView || 'month'; if (!state.selectedCoffeeDay) state.selectedCoffeeDay = ymd(new Date()); renderCoffeeCalendar(); setDialog(els.calendar, true); }
  function calendarSummary(stats, fourthLabel, fourthValue) { return `<article class="stat stat-primary"><strong>${esc(stats.cups)}</strong><span>${fourthLabel === '连续饮用' ? '杯数' : '本月杯数'}</span></article><div class="stat-divider"></div><article class="stat"><strong>${esc(formatWeight(stats.grams))}</strong><span>用豆</span></article><article class="stat"><strong>${esc(money(stats.cost))}</strong><span>估算花费</span></article><article class="stat"><strong>${esc(fourthValue)}</strong><span>${esc(fourthLabel)}</span></article>`; }
  function renderCoffeeCalendar() { const days = daySummaries(); const date = state.coffeeCalendarDate; const year = date.getFullYear(); const month = date.getMonth(); const monthStats = statsForRange(days, (key) => key.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)); const yearStats = statsForRange(days, (key) => key.startsWith(`${year}-`)); const showingYear = state.coffeeCalendarView === 'year'; $('#monthCalendarView').hidden = showingYear; $('#yearCalendarView').hidden = !showingYear; $$('[data-calendar-view]').forEach((button) => button.classList.toggle('active', button.dataset.calendarView === state.coffeeCalendarView)); $('#calendarSummary').innerHTML = showingYear ? calendarSummary(yearStats, '连续饮用', `${continuousDays(days)} 天`) : calendarSummary(monthStats, '均分', monthStats.averageRating ? `${monthStats.averageRating}★` : '—'); renderCalendarReportEntry(); renderMonthCalendar(days); renderYearCalendar(days); renderCalendarRecent(); }
  function renderCalendarReportEntry() { const date = state.coffeeCalendarDate; const type = state.coffeeCalendarView === 'year' ? 'year' : 'month'; const key = type === 'year' ? String(date.getFullYear()) : monthKey(date); const reports = BeanInsights.availableCoffeeReports(state.drinkLogs); const report = reports.find((item) => item.type === type && item.key === key); const button = $('#calendarReportOpen'); button.hidden = !report; if (!report) return; button.dataset.reportType = report.type; button.dataset.reportKey = report.key; button.querySelector('b').textContent = report.type === 'year' ? '查看咖啡年报' : '查看咖啡月报'; $('#calendarReportSummary').textContent = `${report.label} · ${report.cups} 杯记录`; }
  function renderMonthCalendar(days) { const date = state.coffeeCalendarDate; const year = date.getFullYear(); const month = date.getMonth(); const todayKey = ymd(new Date()); $('#monthCalendarTitle').textContent = `${year} 年 ${month + 1} 月`; const first = new Date(year, month, 1); const offset = (first.getDay() + 6) % 7; const total = new Date(year, month + 1, 0).getDate(); let html = '<span></span>'.repeat(offset); for (let day = 1; day <= total; day += 1) { const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const selected = key === state.selectedCoffeeDay; const today = key === todayKey; html += `<button type="button" data-calendar-day="${key}" class="heat-${dayLevel(days[key])}${selected ? ' selected' : ''}${today ? ' today' : ''}">${day}</button>`; } $('#coffeeMonthGrid').innerHTML = html; renderSelectedDay(days[state.selectedCoffeeDay]); }
  function calendarLogMeta(log) { return log.source === 'external' ? ['外饮', log.price > 0 ? formatPrice(log.price) : '', log.location, formatDateTime(log.consumedAt)].filter(Boolean).join(' · ') : [log.brewMethod, formatWeight(log.grams), formatDateTime(log.consumedAt)].filter(Boolean).join(' · '); }
  function renderSelectedDay(day) { const host = $('#calendarDayDetail'); const key = day ? day.date : state.selectedCoffeeDay; const date = dateFromKey(key); const title = `${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}`; if (!day) { host.innerHTML = `<div class="day-detail-head"><div><h3>${esc(title)}</h3><span>没有饮用记录</span></div></div><p class="manager-empty">这一天还没有喝咖啡。</p>`; return; } host.innerHTML = `<div class="day-detail-head"><div><h3>${esc(title)}</h3><span>${day.cups} 杯记录</span></div><button id="calendarSeeLogs" type="button">去饮用记录</button></div><div class="day-stat-row"><span><b>${esc(formatWeight(day.grams))}</b><small>用豆</small></span><span><b>${esc(money(day.cost))}</b><small>估算花费</small></span><span><b>${day.averageRating ? `${day.averageRating}★` : '—'}</b><small>均分</small></span></div><div class="calendar-log-list">${day.logs.map((log) => `<article class="calendar-log" data-log-id="${esc(log.id)}"><b>${esc(log.source === 'external' ? (log.drinkName || log.cafeName || log.beanName) : log.beanName)}</b><span>${esc(calendarLogMeta(log))}</span>${log.overallRating ? `<em>${stars(log.overallRating)}</em>` : ''}${log.notes ? `<p>${esc(log.notes)}</p>` : ''}</article>`).join('')}</div><p class="cost-note">花费根据咖啡豆价格估算，外饮按记录价格计入。</p>`; }
  function renderYearCalendar(days) { const year = state.coffeeCalendarDate.getFullYear(); const todayKey = ymd(new Date()); $('#yearCalendarTitle').textContent = `${year} 年历`; const start = new Date(year, 0, 1); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const end = new Date(year, 11, 31); end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7))); const weeks = []; const labels = []; let cursor = new Date(start); let weekIndex = 1; let lastMonth = -1; while (cursor <= end) { let cells = ''; for (let row = 0; row < 7; row += 1) { const inYear = cursor.getFullYear() === year; const key = ymd(cursor); if (inYear && cursor.getMonth() !== lastMonth) { lastMonth = cursor.getMonth(); labels.push(`<span style="grid-column:${weekIndex}">${MONTH_NAMES[lastMonth]}</span>`); } cells += inYear ? `<button type="button" data-year-day="${key}" class="heat-${dayLevel(days[key])}${key === state.selectedCoffeeDay ? ' selected' : ''}${key === todayKey ? ' today' : ''}" aria-label="${key}"></button>` : '<span></span>'; cursor.setDate(cursor.getDate() + 1); } weeks.push(`<div class="year-week">${cells}</div>`); weekIndex += 1; } const grid = $('#coffeeYearGrid'); grid.innerHTML = `<div class="year-month-labels" style="grid-template-columns:repeat(${weeks.length},10px)">${labels.join('')}</div><div class="year-weeks">${weeks.join('')}</div>`; renderYearPopover(days[state.selectedCoffeeDay]); if (state.coffeeCalendarView === 'year') requestAnimationFrame(() => { const selected = grid.querySelector(`[data-year-day="${state.selectedCoffeeDay}"]`); if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'center' }); requestAnimationFrame(() => renderYearPopover(days[state.selectedCoffeeDay], selected)); }); }
  function renderYearPopover(day, anchor) { const host = $('#yearPopover'); if (!day || state.coffeeCalendarView !== 'year') { host.hidden = true; return; } const date = dateFromKey(day.date); host.hidden = false; host.innerHTML = `<strong>${date.getMonth() + 1}月${date.getDate()}日 ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}</strong><span>${money(day.cost)} · ${formatWeight(day.grams)} · ${day.averageRating ? `${day.averageRating}★` : '未评分'} · ${day.cups} 杯</span>`; if (!anchor) return; const wrap = host.closest('.year-heatmap-wrap'); const wrapRect = wrap.getBoundingClientRect(); const anchorRect = anchor.getBoundingClientRect(); const maxLeft = wrap.clientWidth - host.offsetWidth - 8; const left = Math.max(8, Math.min(maxLeft, anchorRect.left - wrapRect.left + anchorRect.width / 2 - host.offsetWidth / 2)); const above = anchorRect.top - wrapRect.top - host.offsetHeight - 8; const below = anchorRect.bottom - wrapRect.top + 8; host.classList.toggle('below', above < 8); host.style.left = `${left}px`; host.style.top = `${Math.max(8, above >= 8 ? above : below)}px`; }
  function renderCalendarRecent() { $('#calendarRecentList').innerHTML = state.drinkLogs.length ? state.drinkLogs.slice(0, 5).map((log) => logTemplate(log, true)).join('') : '<p class="manager-empty">还没有饮用记录。</p>'; }
  function shiftCoffeeMonth(delta) { state.coffeeCalendarDate.setMonth(state.coffeeCalendarDate.getMonth() + delta); state.selectedCoffeeDay = ymd(new Date(state.coffeeCalendarDate.getFullYear(), state.coffeeCalendarDate.getMonth(), 1)); renderCoffeeCalendar(); }
  function shiftCoffeeYear(delta) { const next = new Date(state.coffeeCalendarDate); next.setFullYear(next.getFullYear() + delta); state.coffeeCalendarDate = next; state.selectedCoffeeDay = ymd(next); renderCoffeeCalendar(); }
  // 详情页 hero（1.5 方案 C）：有图→模糊照片当氛围底 + 右上角清晰缩略图（点击进大图预览）；无图→烘焙度渐变兜底，结构不变。
  function renderDetailHero(bean) {
    const hero = $('#detailHero'); const bg = $('#detailHeroBg'); const thumbHost = $('#detailHeroThumb');
    const cutout = state.settings.photoJournal && bean.bagCutoutImagePath ? imageSrc(bean.bagCutoutImagePath) : '';
    const src = bean.bagImagePath ? imageSrc(bean.bagImagePath) : '';
    hero.classList.toggle('journal-hero', Boolean(cutout));
    hero.classList.toggle('has-photo', Boolean(src));
    if (cutout) {
      const ph = BeanCore.beanPlaceholder(bean);
      bg.className = `profile-hero-bg bean-thumb--${ph.roastKey}`; bg.style.backgroundImage = '';
      const previewPath = bean.bagImagePath || bean.bagCutoutImagePath;
      thumbHost.innerHTML = `<div class="profile-hero-cutout" data-preview-image="${esc(previewPath)}" data-preview-label="咖啡袋原图" role="button" tabindex="0" aria-label="查看咖啡袋原图"><img src="${esc(cutout)}" alt="" loading="lazy"></div>`;
    } else if (src) {
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
    const brewReview = BeanInsights.handBrewBeanReview(state.drinkLogs, state.beans, bean.id, { advancedRatings: Boolean(state.settings.advancedRatings), enabledDimensions: state.settings.enabledDimensions });
    $('#detailBrewReviewEntry').hidden = !brewReview.ok;
    $('#detailBrewReview').dataset.beanId = bean.id;
    $('#detailBrewReviewSummary').textContent = brewReview.ok ? `${brewReview.data.ratedCount} 杯有效评分 · 平均 ${Number(brewReview.data.averageRating).toFixed(1)}` : '';
    setDialog(els.detail, true);
  }
  function openDrinkDetail(log) {
    if (!log) return; state.viewingDrinkId = log.id; const bean = log.beanId ? state.beans.find((item) => item.id === log.beanId) : null;
    $$('.drink-detail-photos', els.drinkDetail).forEach((node) => node.remove());
    const external = log.source === 'external';
    const title = external ? (log.drinkName || log.cafeName || log.beanName) : log.beanName;
    $('#drinkDetailTitle').textContent = title; $('#drinkDetailBean').textContent = title;
    $('#drinkDetailMeta').textContent = external ? `${formatDateTime(log.consumedAt)} · 外饮` : `${formatDateTime(log.consumedAt)} · ${log.brewMethod}`; $('#drinkDetailStars').innerHTML = stars(log.overallRating);
    $('#drinkDetailFacts').innerHTML = external ? detailFact('饮品名称', log.drinkName || '未记录', true) + detailFact('店名/来源', log.cafeName) + detailFact('价格', log.price > 0 ? formatPrice(log.price) : '未记录') + detailFact('地点/城市', log.location) + detailFact('饮用时间', formatDateTime(log.consumedAt)) + detailFact('整体评分', log.overallRating ? `${log.overallRating} / 5` : '未评分') : detailFact('本次用豆', formatWeight(log.grams), true) + detailFact('冲煮方式', log.brewMethod) + detailFact('饮用时间', formatDateTime(log.consumedAt)) + detailFact('整体评分', log.overallRating ? `${log.overallRating} / 5` : '未评分');
    const snapshot = log.brewPlanSnapshot;
    $('#drinkDetailPlanSection').hidden = external || !snapshot;
    $('#drinkSaveAsPlan').hidden = external || !(snapshot && brewPlansEnabled());
    if (snapshot) {
      $('#drinkDetailPlanSource').textContent = log.brewPlanId ? `${snapshot.name} · v${snapshot.version}` : '本次手填参数';
      $('#drinkDetailPlan').innerHTML = drinkParamSummary(snapshot, log.brewMethod);
    }
    $('#drinkDetailNotesSection').hidden = !log.notes;
    $('#drinkDetailNotes').textContent = log.notes || '';
    const dimensions = BeanCore.DIMENSION_KEYS.filter((key) => log[key]); $('#drinkDetailDimensions').hidden = !dimensions.length;
    const previousCandidate = BeanCore.previousComparableDrink(state.drinkLogs, log);
    const previous = previousCandidate && dimensions.filter((key) => previousCandidate[key]).length >= 3 ? previousCandidate : null;
    const radar = buildRatingRadar(log, { labels: true, animate: true, compare: previous });
    $('#drinkDetailDimensions').querySelector('.section-heading small').textContent = previous ? '与上次同豆评价对比' : '本次风味感受';
    const legend = previous ? `<div class="radar-legend"><span class="current">本次</span><span class="previous">上次 · ${esc(formatDateTime(previous.consumedAt))}</span></div>` : '';
    $('#drinkDetailRadar').innerHTML = radar + legend;
    // 画出雷达图时不再重复显示字段式维度列表（分值已标在雷达轴上）；不足 3 维回退到列表。
    $('#drinkDetailDimensionList').innerHTML = radar ? '' : dimensions.map((key) => `<div><span>${DIMENSIONS[key]}</span><strong>${key === 'bitterness' ? '☹' : '☺'} ${log[key]} / 5</strong></div>`).join('');
    const photoHtml = log.photos && log.photos.length ? `<section class="profile-images drink-detail-photos"><div class="section-heading"><div><span>照片贴图</span><small>${log.photos.length} 张本机图片</small></div></div>${log.photos.map((path, index) => imageCard(`饮用照片 ${index + 1}`, path)).join('')}</section>` : '';
    $('#drinkDetailDimensions').insertAdjacentHTML('afterend', photoHtml);
    $('#drinkDetailEdit').hidden = !(bean || external); setDialog(els.drinkDetail, true);
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
    toast('已带入本次参数，保存后可以再次回味');
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

  // 冲煮辅助在 app-brew-assist.js(拆分第三批):计时器/WakeLock 为模块私有,进行态仍在 state.brewAssist。
  const { openDrinkBrewAssist, openPlanBrewAssist, pauseBrewAssist, tapBrewAssistRing, skipBrewAssistStage, finishBrewAssist, cancelBrewAssist, requestWakeLock } =
    window.AppBrewAssist.create({ $, $$, state, els, core: BeanCore, toast, setDialog, haptic, esc, formatWeight, durationText, setDurationControl, syncRatioValue, syncDurationField, currentDrinkMethod, selectedDrinkPlan, drinkParamSnapshot, openPlanDetail, saveAssistDrink, openTastingById });

  async function reload(options) {
    suppressListEnter = Boolean(options && options.skipEnterAnimation);
    document.body.classList.toggle('suppress-list-enter', suppressListEnter);
    try { const [beans, logs, plans, settings] = await Promise.all([BeanRepository.getAll(), BeanRepository.getDrinkLogs(), BeanRepository.getBrewPlans(), BeanRepository.getSettings()]); state.beans = beans; state.drinkLogs = logs; state.brewPlans = plans; state.settings = settings; await resolveWebImages(beans, logs); applyTheme(settings.theme, false); render(); if (els.detail.open && state.editingId) { const bean = state.beans.find((item) => item.id === state.editingId); if (bean) openDetail(bean); } if (els.drinkDetail.open && state.viewingDrinkId) { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); if (log) openDrinkDetail(log); } if (els.planDetail.open && state.viewingPlanId) { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); if (plan) openPlanDetail(plan); } if (!(options && options.keepForm) && els.editor.open && state.editingId) { const bean = state.beans.find((item) => item.id === state.editingId); if (bean) fillForm(bean); } }
    catch (error) { console.error(error); toast('读取豆仓失败，请重试'); }
    finally { suppressListEnter = false; document.body.classList.remove('suppress-list-enter'); }
  }

  async function openEditor(bean, scanResult) {
    state.editingId = bean ? bean.id : null; subjectCropJob += 1; subjectCropBusy = false; subjectCropStatus = ''; beanImagesToDelete = []; if (!scanResult) clearPendingImages(true); $('#editorTitle').textContent = bean ? '编辑咖啡豆' : '新增咖啡豆'; $('#deleteBean').hidden = !bean; els.form.reset(); const submit = els.form.querySelector('[type="submit"]'); if (submit) submit.disabled = false; $$('.field', els.form).forEach((field) => field.classList.remove('needs-review')); els.scanResult.hidden = true; els.scanResult.innerHTML = ''; SMART_FIELDS.forEach((field) => { $(`#field-${field}`).value = ''; });
    $('#field-remainingWeight').dataset.userEdited = bean ? '1' : '';
    if (bean) fillForm(bean); else if (scanResult) { fillForm(scanResult.fields); $('#field-remainingWeight').dataset.userEdited = $('#field-remainingWeight').value ? '1' : ''; syncInitialWeightToRemaining(); } else { $('#field-status').value = '未开封'; renderImageVault(); } await initSmartSelects(); syncAllChoiceTriggers(); if (scanResult) showScanResult(scanResult); setDialog(els.editor, true); setTimeout(() => $('#field-name').focus(), 120);
  }
  function fillForm(bean) { Object.entries(bean).forEach(([key, value]) => { const control = els.form.elements[key]; if (!control) return; if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value == null ? '' : value; }); SMART_FIELDS.forEach((field) => { $(`#field-${field}`).value = bean[field] || ''; }); renderImageVault(bean); }
  function syncInitialWeightToRemaining() { const remaining = $('#field-remainingWeight'); if (state.editingId || remaining.dataset.userEdited || remaining.value) return; remaining.value = $('#field-initialWeight').value; }
  function markRemainingWeightEdited() { if (!state.editingId) $('#field-remainingWeight').dataset.userEdited = '1'; }
  function showScanResult(result) { const count = result.recognizedFields.length; const low = result.lowConfidenceFields.map((field) => FIELD_LABELS[field] || field); els.scanResult.innerHTML = `<strong>${count ? `已离线识别 ${count} 个字段` : '没有识别出可靠字段'}</strong>${count ? '请核对后再保存。' : '可以重新拍摄，或继续手动填写。'}${low.length ? ` 黄色字段需要重点确认：${esc(low.join('、'))}` : ''}`; els.scanResult.hidden = false; result.lowConfidenceFields.forEach((field) => { const control = els.form.elements[field]; if (control && control.closest('.field')) control.closest('.field').classList.add('needs-review'); }); }
  async function askPhotoSource(options) {
    return new Promise((resolve) => {
      const limit = Math.max(1, Math.min(3, Math.round(Number(options && options.limit) || 1)));
      $('#photoSourceEyebrow').textContent = (options && options.eyebrow) || 'PHOTO';
      $('#photoSourceTitle').textContent = (options && options.title) || '选择图片来源';
      $('#photoSourceIntro').textContent = (options && options.intro) || (limit > 1
        ? `可拍摄 1 张，或从相册一次选择最多 ${limit} 张。`
        : '选择拍摄新照片，或从系统图片选择器读取已有照片。');
      const photosHint = $('[data-photo-source="photos"] small');
      const cameraHint = $('[data-photo-source="camera"] small');
      if (photosHint) photosHint.textContent = limit > 1 ? `从手机图片中一次最多选 ${limit} 张` : '从手机图片中选择一张';
      if (cameraHint) cameraHint.textContent = limit > 1 ? '打开相机拍一张（相机每次一张）' : '打开相机拍一张包装或标签';
      const finish = (source) => { cleanup(); setDialog(els.photoSource, false); resolve(source); };
      const choose = (event) => { const button = event.target.closest('[data-photo-source]'); if (button) finish(button.dataset.photoSource); };
      const skip = () => finish(null);
      const cleanup = () => {
        $('#photoSourceClose').removeEventListener('click', skip);
        els.photoSource.removeEventListener('close', skip);
        els.photoSource.removeEventListener('click', choose);
      };
      $('#photoSourceClose').addEventListener('click', skip);
      els.photoSource.addEventListener('click', choose);
      els.photoSource.addEventListener('close', skip);
      setDialog(els.photoSource, true);
    });
  }
  async function pickCoffeePhoto(options) {
    const photos = await pickCoffeePhotos(options, 1);
    return photos[0] || null;
  }
  async function pickCoffeePhotos(options, limit) {
    const camera = capPlugin('Camera');
    if (!BeanRepository.isNative() || !camera) throw new Error('图片功能仅在 Android App 中可用');
    const max = Math.max(1, Math.min(3, Math.round(Number(limit) || 1)));
    const source = await askPhotoSource({ ...(options || {}), limit: max });
    if (!source) return [];
    if (source === 'camera' || max <= 1 || !camera.pickImages) {
      const photo = await camera.getPhoto({
        quality: 92,
        width: 2200,
        correctOrientation: true,
        allowEditing: false,
        resultType: options && options.resultType || 'uri',
        source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
        saveToGallery: false
      });
      return photo ? [photo] : [];
    }
    const result = await camera.pickImages({ quality: 92, width: 2200, correctOrientation: true, limit: max });
    return (result && result.photos || []).slice(0, max);
  }
  async function askScanImageRole(path, preview) { return new Promise((resolve) => { $('#scanImagePreview').src = imageSrc(preview || path); const finish = (role) => { cleanup(); setDialog(els.scanImage, false); resolve(role); }; const choose = (event) => { const button = event.target.closest('[data-image-role]'); if (button) finish(button.dataset.imageRole); }; const skip = () => finish(null); const cleanup = () => { $('#scanImageClose').removeEventListener('click', skip); $('#scanImageSkip').removeEventListener('click', skip); els.scanImage.removeEventListener('close', skip); els.scanImage.removeEventListener('click', choose); }; $('#scanImageClose').addEventListener('click', skip); $('#scanImageSkip').addEventListener('click', skip); els.scanImage.addEventListener('click', choose); els.scanImage.addEventListener('close', skip); setDialog(els.scanImage, true); }); }
  async function clearPendingImages(discard) {
    subjectCropJob += 1; subjectCropBusy = false; subjectCropStatus = '';
    const submit = els.form && els.form.querySelector('[type="submit"]'); if (submit) submit.disabled = false;
    const pending = state.pendingImages.slice(); state.pendingImages = [];
    if (!discard || !pending.length) return;
    const scanner = capPlugin('CoffeeLabelScanner');
    pending.forEach((item) => {
      if (item.web) BeanRepository.deleteWebImage(item.ref);
      else if (scanner && scanner.discardImage) scanner.discardImage({ path: item.path }).catch(() => {});
    });
  }
  async function scanCoffeeLabel() { const button = $('#scanBean'); const scanner = capPlugin('CoffeeLabelScanner'); if (!BeanRepository.isNative() || !scanner) return toast('拍照识别仅在 Android App 中可用'); button.disabled = true; try { const photo = await pickCoffeePhoto({ eyebrow: 'OCR', title: '识别咖啡包装', intro: '选择拍摄包装，或读取已有咖啡袋/标签图片。' }); if (!photo) return; const path = photo.path || photo.webPath; if (!path) throw new Error('没有取得照片路径'); toast('正在离线识别包装文字…'); const scan = await scanner.recognize({ path, deleteSource: false }); const parsed = CoffeeParser.parse(scan, { knownRoasters: [...new Set(state.beans.map((bean) => bean.roaster).filter(Boolean))] }); const role = scanner.archiveImage ? await askScanImageRole(path, photo.webPath || path) : null; if (role) { state.pendingImages.push({ path, role }); parsed.fields[role === 'bag' ? 'bagImagePath' : 'labelImagePath'] = path; } else if (scanner.discardImage) await scanner.discardImage({ path }).catch(() => {}); await openEditor(null, parsed); if (role === 'bag' && state.settings.photoJournal) await generateDraftCutout(path); } catch (error) { const message = String(error && error.message || error || ''); if (!/cancel|取消/i.test(message)) { console.error(error); toast(/permission|权限/i.test(message) ? '需要相机权限才能拍照或读取图片' : '识别失败，请重新拍摄'); } } finally { button.disabled = false; } }
  const IMAGE_FIELD_BY_ROLE = { bag: 'bagImagePath', bagCutout: 'bagCutoutImagePath', label: 'labelImagePath' };
  function setImageField(role, value) { $(`#field-${IMAGE_FIELD_BY_ROLE[role]}`).value = value; }
  function pendingImageValue(item) { return item && (item.ref || item.path) || ''; }
  function scheduleImageDeletion(path) {
    if (!path || state.pendingImages.some((item) => pendingImageValue(item) === path) || beanImagesToDelete.includes(path)) return;
    beanImagesToDelete.push(path);
  }
  function discardPendingRoles(roles) {
    const selected = state.pendingImages.filter((item) => roles.includes(item.role));
    state.pendingImages = state.pendingImages.filter((item) => !roles.includes(item.role));
    selected.forEach((item) => deleteImageRef(pendingImageValue(item), false));
  }
  function replacePendingImage(item) {
    discardPendingRoles([item.role]);
    state.pendingImages.push(item);
  }
  function setCropBusy(busy, status) {
    subjectCropBusy = Boolean(busy); subjectCropStatus = status || '';
    const submit = els.form.querySelector('[type="submit"]'); if (submit) submit.disabled = subjectCropBusy;
    renderImageVault();
  }
  async function storeCutoutDataUrl(dataUrl) {
    if (BeanRepository.isNative()) {
      const filesystem = capPlugin('Filesystem');
      const data = String(dataUrl || '').split(',')[1];
      if (!filesystem || !data) throw new Error('无法保存手账封面');
      const stored = await filesystem.writeFile({ path: `subject-crop/crop-${Date.now()}.png`, data, directory: 'CACHE', recursive: true });
      return { path: stored.uri, role: 'bagCutout' };
    }
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const ref = await BeanRepository.saveWebImage(blob);
    webImageUrls.set(ref, URL.createObjectURL(blob));
    return { ref, role: 'bagCutout', web: true };
  }
  async function generateDraftCutout(sourcePath) {
    if (!state.settings.photoJournal || !sourcePath) return;
    const job = ++subjectCropJob;
    setCropBusy(true, 'working');
    try {
      const result = await subjectCropUi.generate({ src: imageSrc(sourcePath) });
      if (job !== subjectCropJob) return;
      const stored = await storeCutoutDataUrl(result.dataUrl);
      if (job !== subjectCropJob) { deleteImageRef(pendingImageValue(stored), false); return; }
      scheduleImageDeletion($('#field-bagCutoutImagePath').value);
      replacePendingImage(stored);
      setImageField('bagCutout', pendingImageValue(stored));
      subjectCropStatus = 'ready';
    } catch (error) {
      if (job !== subjectCropJob) return;
      console.error(error); subjectCropStatus = 'error';
      toast('手账封面生成失败，原图仍可正常保存');
    } finally {
      if (job === subjectCropJob) setCropBusy(false, subjectCropStatus);
    }
  }
  async function addBeanImageWeb(role) {
    const file = await pickWebImageFile();
    if (!file) return;
    const blob = await compressImageFile(file);
    const ref = await BeanRepository.saveWebImage(blob);
    webImageUrls.set(ref, URL.createObjectURL(blob));
    if (role === 'bag') {
      scheduleImageDeletion($('#field-bagImagePath').value); scheduleImageDeletion($('#field-bagCutoutImagePath').value);
      discardPendingRoles(['bag', 'bagCutout']); setImageField('bagCutout', ''); subjectCropStatus = '';
    } else scheduleImageDeletion($('#field-labelImagePath').value);
    replacePendingImage({ ref, role, web: true });
    setImageField(role, ref);
    renderImageVault();
    if (role === 'bag' && state.settings.photoJournal) await generateDraftCutout(ref);
    toast(role === 'bag' ? '已添加咖啡袋图片' : '已添加标签图片');
  }
  async function addBeanImage(role) {
    if (!BeanRepository.isNative()) {
      try { await addBeanImageWeb(role); } catch (error) { console.error(error); toast('添加图片失败'); }
      return;
    }
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner) return toast('图片留存仅在 Android App 中可用');
    try {
      const cropEnabled = role === 'bag' && state.settings.photoJournal;
      const photo = await pickCoffeePhoto({
        eyebrow: 'BEAN PHOTO',
        title: role === 'bag' ? '添加咖啡袋图片' : '添加标签图片',
        intro: cropEnabled ? '选择后会在本机自动生成手账封面，编辑页仍保留原图。' : '图片会先显示在编辑页，保存咖啡豆后才正式归档。',
        resultType: cropEnabled ? 'dataUrl' : 'uri'
      });
      if (!photo) return;
      let path = photo.path || photo.webPath;
      const filesystem = capPlugin('Filesystem');
      if (photo.dataUrl) {
        if (!filesystem) throw new Error('无法暂存系统转换后的图片');
        const data = String(photo.dataUrl).split(',')[1];
        if (!data) throw new Error('系统没有返回可处理的图片数据');
        const stored = await filesystem.writeFile({ path: `subject-crop/source-${Date.now()}.jpg`, data, directory: 'CACHE', recursive: true });
        path = stored.uri;
      }
      if (!path) throw new Error('没有取得照片路径');
      if (role === 'bag') {
        scheduleImageDeletion($('#field-bagImagePath').value); scheduleImageDeletion($('#field-bagCutoutImagePath').value);
        discardPendingRoles(['bag', 'bagCutout']); setImageField('bagCutout', ''); subjectCropStatus = '';
      } else scheduleImageDeletion($('#field-labelImagePath').value);
      replacePendingImage({ path, role });
      setImageField(role, path); renderImageVault();
      if (cropEnabled) await generateDraftCutout(path);
      toast(role === 'bag' ? '已添加咖啡袋图片' : '已添加标签图片');
    } catch (error) {
      const message = String(error && error.message || error || '');
      if (!/cancel|取消/i.test(message)) { console.error(error); toast(/permission|权限/i.test(message) ? '需要相机权限才能拍照或读取图片' : '添加图片失败'); }
    }
  }
  function removeBeanImage(role) {
    const roles = role === 'bag' ? ['bag', 'bagCutout'] : [role];
    roles.forEach((itemRole) => scheduleImageDeletion($(`#field-${IMAGE_FIELD_BY_ROLE[itemRole]}`).value));
    discardPendingRoles(roles);
    setImageField(role, '');
    if (role === 'bag') { subjectCropJob += 1; subjectCropBusy = false; subjectCropStatus = ''; setImageField('bagCutout', ''); }
    renderImageVault();
    toast(role === 'bag' ? '已移除咖啡袋图片' : '已移除标签图片');
  }
  function removeDraftCutout() { scheduleImageDeletion($('#field-bagCutoutImagePath').value); discardPendingRoles(['bagCutout']); setImageField('bagCutout', ''); subjectCropStatus = ''; renderImageVault(); }
  async function archivePendingImages(fields) { if (!state.pendingImages.length) return fields; if (!BeanRepository.isNative()) { state.pendingImages = []; return fields; } const scanner = capPlugin('CoffeeLabelScanner'); if (!scanner || !scanner.archiveImage) return fields; let next = { ...fields }; for (const item of state.pendingImages) { const field = IMAGE_FIELD_BY_ROLE[item.role]; const result = await scanner.archiveImage({ path: item.path, role: item.role === 'bagCutout' ? 'bag' : item.role, deleteSource: true }); next[field] = result.path || result.uri || next[field] || ''; } state.pendingImages = []; return next; }
  async function addDrinkPhoto() {
    const remain = Math.max(0, 3 - (state.drinkPhotoDraft || []).length);
    if (!remain) return toast('每条记录最多 3 张照片');
    try {
      if (!BeanRepository.isNative()) {
        const files = await pickWebImageFiles(remain);
        if (!files.length) return;
        for (const file of files) {
          if ((state.drinkPhotoDraft || []).length >= 3) break;
          const blob = await compressImageFile(file);
          const ref = await BeanRepository.saveWebImage(blob);
          webImageUrls.set(ref, URL.createObjectURL(blob));
          state.pendingDrinkPhotos.push({ ref, web: true });
          state.drinkPhotoDraft.push(ref);
        }
      } else {
        const photos = await pickCoffeePhotos({
          eyebrow: 'DRINK PHOTO',
          title: '添加饮用照片',
          intro: remain > 1
            ? `图片会先显示在记录里，保存后正式归档。相册可一次最多选 ${remain} 张。`
            : '图片会先显示在记录里，保存后正式归档。'
        }, remain);
        if (!photos.length) return;
        for (const photo of photos) {
          if ((state.drinkPhotoDraft || []).length >= 3) break;
          const path = photo.path || photo.webPath || photo.uri;
          if (!path) continue;
          state.pendingDrinkPhotos.push({ path });
          state.drinkPhotoDraft.push(path);
        }
        if (!(state.drinkPhotoDraft || []).length) throw new Error('没有取得照片路径');
      }
      renderDrinkPhotoVault();
    } catch (error) {
      const message = String(error && error.message || error || '');
      if (!/cancel|取消/i.test(message)) { console.error(error); toast('添加照片失败'); }
    }
  }
  function removeDrinkPhoto(index) {
    const path = state.drinkPhotoDraft[index];
    if (!path) return;
    const pending = state.pendingDrinkPhotos.find((item) => item.path === path || item.ref === path);
    if (pending) deleteImageRef(pending.ref || pending.path, false);
    else state.drinkPhotosToDelete.push(path);
    state.pendingDrinkPhotos = state.pendingDrinkPhotos.filter((item) => item.path !== path && item.ref !== path);
    state.drinkPhotoDraft.splice(index, 1);
    renderDrinkPhotoVault();
  }
  async function archivePendingDrinkPhotos() {
    if (!state.pendingDrinkPhotos.length || !BeanRepository.isNative()) { state.pendingDrinkPhotos = []; return (state.drinkPhotoDraft || []).slice(0, 3); }
    const scanner = capPlugin('CoffeeLabelScanner');
    if (!scanner || !scanner.archiveImage) return (state.drinkPhotoDraft || []).slice(0, 3);
    const archived = [];
    try {
      for (const item of state.pendingDrinkPhotos) {
        const result = await scanner.archiveImage({ path: item.path, role: 'drink', deleteSource: true });
        const next = result.path || result.uri || item.path;
        const index = state.drinkPhotoDraft.indexOf(item.path);
        if (index >= 0) state.drinkPhotoDraft[index] = next;
        archived.push(next);
      }
      state.pendingDrinkPhotos = [];
      return state.drinkPhotoDraft.slice(0, 3);
    } catch (error) {
      archived.forEach((path) => deleteImageRef(path, true));
      throw error;
    }
  }
  async function discardDrinkPhotoDraft() {
    const pending = state.pendingDrinkPhotos.slice();
    state.pendingDrinkPhotos = [];
    state.drinkPhotoDraft = [];
    state.drinkPhotosToDelete = [];
    pending.forEach((item) => deleteImageRef(item.ref || item.path, false));
  }
  async function openExternalUrl(url, errorText) {
    if (!url) return;
    try {
      const opener = capPlugin('ExternalLinkOpener');
      if (BeanRepository.isNative() && opener) await opener.open({ url });
      else window.open(url, '_blank', 'noopener');
    } catch (error) {
      console.error(error);
      toast(errorText || '无法打开链接');
    }
  }
  async function openPurchaseUrl(url) { return openExternalUrl(url, '无法打开购买链接'); }
  async function saveForm(event) {
    event.preventDefault();
    if (subjectCropBusy) return toast('手账封面仍在生成，请稍候');
    const fd = new FormData(els.form);
    const old = state.editingId ? state.beans.find((bean) => bean.id === state.editingId) : null;
    const isFirstBean = !old && state.beans.length === 0;
    const stamp = new Date().toISOString();
    if (!String(fd.get('name') || '').trim()) return toast('请先填写豆名');
    try {
      const fields = await archivePendingImages(Object.fromEntries(fd.entries()));
      const payload = BeanCore.normalizeBean({ ...(old || {}), ...fields, id: state.editingId || undefined, favorite: $('#field-favorite').checked, createdAt: old ? old.createdAt : stamp, updatedAt: stamp }, stamp);
      const justFinished = Boolean(old && old.status !== '已喝完' && payload.status === '已喝完');
      await BeanRepository.save(payload);
      const retained = new Set([payload.bagImagePath, payload.bagCutoutImagePath, payload.labelImagePath].filter(Boolean));
      beanImagesToDelete.filter((path) => !retained.has(path)).forEach((path) => deleteImageRef(path, true)); beanImagesToDelete = [];
      setDialog(els.editor, false); state.editingId = null; await reload();
      let savedMsg = isFirstBean ? '第一包豆子已入仓，故事开始了' : justFinished ? '这一包喝完了，故事留在豆仓里' : old ? '记录已更新' : '咖啡豆已入仓';
      const nudgeKey = `coffee-vault-photo-nudge:${payload.id}`;
      if (state.settings.showBeanPhotosInList && !payload.bagImagePath && !readLocalFlag(nudgeKey)) { savedMsg += ' · 拍张袋子照，列表更好认'; writeLocalFlag(nudgeKey); }
      toast(savedMsg);
    } catch (error) { console.error(error); toast('保存失败，请稍后重试'); }
  }
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
    setMokaSize('plan', p.mokaPotSize);
    setRatioControls('plan', p.ratio);
    $('#plan-method').value = p.brewMethod || '手冲'; $('#plan-useHotWater').checked = Boolean(p.useHotWater);
    $('#plan-steps').value = (p.steps || []).map((step) => [step.label, step.water || '', step.time, step.note].filter(Boolean).join(' | ')).join('\n');
    state.activePourStepIndex = (p.steps || []).length ? -1 : 0;
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
    updatePourAllocation();
  }
  function syncPlanRatioFromWater() {
    if ($('#plan-totalWater').closest('.field').hidden) return;
    syncRatioFromTotal('plan');
    updatePourAllocation();
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
  function pourStepSummary(step) {
    const time = [step.startTime, step.endTime].filter(Boolean).join('-');
    return [step.water ? formatWeight(step.water) : '', time, step.note].filter(Boolean).join(' · ') || '未填写细节';
  }
  function renderPourSteps(steps) {
    const rows = steps && steps.length ? steps : [{ label: '闷蒸', water: 30, startTime: '0:00', endTime: '0:30' }];
    state.activePourStepIndex = state.activePourStepIndex >= 0 ? Math.min(state.activePourStepIndex, rows.length - 1) : -1;
    let previousEnd = '';
    $('#pourStepList').innerHTML = rows.map((step, index) => {
      const stage = pourStageName(index);
      const parts = String(step.time || '').split('-');
      const start = step.startTime || parts[0] || previousEnd || '';
      const end = step.endTime || parts[1] || '';
      previousEnd = end || previousEnd;
      const active = index === state.activePourStepIndex;
      const label = step.label || stage;
      const data = `data-step-label="${esc(label)}" data-step-water="${step.water == null ? '' : esc(step.water)}" data-step-start="${esc(start)}" data-step-end="${esc(end)}" data-step-note="${esc(step.note || '')}"`;
      const collapsed = `<button class="pour-step-summary" type="button" data-pour-step-open="${index}"><span><b>${esc(label)}</b><small>${esc(pourStepSummary({ ...step, startTime: start, endTime: end }))}</small></span><i>编辑</i></button>`;
      const editor = `<div class="pour-step-head"><input data-pour-label type="text" maxlength="80" value="${esc(label)}" placeholder="${esc(stage)}" aria-label="步骤名称"><button type="button" data-remove-pour-step="${index}" aria-label="删除这一段">×</button></div><div class="pour-step-grid"><label><span>水量</span><div class="input-unit"><input data-pour-water type="number" min="0" step="0.1" inputmode="decimal" value="${step.water == null ? '' : esc(step.water)}"><em>g</em></div></label><label><span>开始</span>${pourTimeControl('start', start)}</label><label><span>结束</span>${pourTimeControl('end', end)}</label><label class="full"><span>备注</span><input data-pour-note type="text" maxlength="200" value="${esc(step.note || '')}" placeholder="可选"></label></div>`;
      return `<article class="pour-step${active ? ' active' : ''}" data-step-index="${index}" ${data}>${active ? editor : collapsed}</article>`;
    }).join('');
    updatePourAllocation();
  }
  function readPourSteps() {
    return $$('.pour-step', $('#pourStepList')).map((row, index) => {
      const active = row.classList.contains('active');
      const label = active ? $('[data-pour-label]', row).value.trim() : row.dataset.stepLabel;
      const water = active ? $('[data-pour-water]', row).value : row.dataset.stepWater;
      const startTime = active ? pourTimeValue(row, 'start') : row.dataset.stepStart;
      const endTime = active ? pourTimeValue(row, 'end') : row.dataset.stepEnd;
      const note = active ? $('[data-pour-note]', row).value.trim() : row.dataset.stepNote;
      return { label: label || pourStageName(index), water, startTime, endTime, time: [startTime, endTime].filter(Boolean).join('-'), note };
    }).filter((step) => step.label || step.water || step.startTime || step.endTime || step.note);
  }
  function addPourStepFromLast() {
    const rows = readPourSteps();
    const last = rows[rows.length - 1];
    rows.push({ label: pourStageName(rows.length), water: '', startTime: last ? last.endTime : '', endTime: '' });
    state.activePourStepIndex = rows.length - 1;
    renderPourSteps(rows);
  }
  function plannedTotalWater() {
    const direct = Number($('#plan-totalWater').value);
    if (direct > 0) return direct;
    const fromRatio = waterFromRatio($('#plan-dose').value, $('#plan-ratio').value);
    return fromRatio > 0 ? fromRatio : null;
  }
  function pourWaterRemainder() {
    const total = plannedTotalWater();
    if (!total) return null;
    const used = readPourSteps().reduce((sum, step) => sum + (Number(step.water) > 0 ? Number(step.water) : 0), 0);
    return { total, used: Math.round(used * 10) / 10, left: Math.round((total - used) * 10) / 10 };
  }
  function updatePourAllocation() {
    const el = $('#pourAllocation'); const button = $('#pourFillRemainder');
    if (!el || !button) return;
    const info = pourWaterRemainder();
    if (!info) {
      const used = readPourSteps().reduce((sum, step) => sum + (Number(step.water) > 0 ? Number(step.water) : 0), 0);
      el.textContent = used > 0 ? `已分配 ${formatWeight(Math.round(used * 10) / 10)}` : '';
      el.classList.remove('over');
      button.hidden = true;
      return;
    }
    el.textContent = `已分配 ${formatWeight(info.used)} / ${formatWeight(info.total)}`;
    el.classList.toggle('over', info.left < 0);
    button.hidden = info.left < 1;
    if (!button.hidden) button.textContent = `余量 ${formatWeight(info.left)} 补入末段`;
  }
  function fillPourRemainder() {
    const info = pourWaterRemainder();
    if (!info || info.left <= 0) return;
    const rows = readPourSteps();
    if (!rows.length) return;
    const last = rows[rows.length - 1];
    last.water = Math.round(((Number(last.water) || 0) + info.left) * 10) / 10;
    renderPourSteps(rows);
  }
  async function applyPourTemplate(presetId) {
    const preset = BeanCore.presetBrewPlans().find((plan) => plan.id === presetId);
    if (!preset || !(preset.steps || []).length) return;
    const current = readPourSteps();
    if (current.length > 1) {
      const ok = await askConfirm({ eyebrow: 'TEMPLATE', title: '替换现有步骤？', message: '将按模板结构重新生成分段注水，现有步骤会被覆盖。', confirmText: '替换' });
      if (!ok) return;
    }
    const target = plannedTotalWater() || preset.totalWater;
    const presetSum = preset.steps.reduce((sum, step) => sum + Number(step.water || 0), 0);
    let allocated = 0;
    const rows = preset.steps.map((step, index) => {
      const parts = splitStepTime(step);
      let water = Math.round(Number(step.water || 0) * target / presetSum / 5) * 5;
      if (index === preset.steps.length - 1) water = Math.max(0, Math.round((target - allocated) * 10) / 10);
      allocated += water;
      return { label: step.label, water, startTime: parts.startTime, endTime: parts.endTime, note: '' };
    });
    state.activePourStepIndex = -1;
    renderPourSteps(rows);
    toast(`已按「${preset.name}」生成 ${rows.length} 段，水量按 ${formatWeight(target)} 分配`);
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
    try { await BeanRepository.saveBrewPlan(payload); setDialog(els.planEditor, false); state.editingPlanId = null; await reload(); toast(old ? '方案已更新' : '这段风味已保存'); } catch (error) { console.error(error); toast(error.message || '方案保存失败'); }
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
  function openChoicePicker(select) {
    state.choiceTarget = select;
    $('#choiceTitle').textContent = selectLabel(select);
    setChoiceListLayout('list');
    $('#choiceList').innerHTML = Array.from(select.options).map((option) => `<button type="button" data-choice="${esc(option.value)}" class="${option.value === select.value ? 'active' : ''}"><span>${esc(option.textContent)}</span><i>${option.value === select.value ? '✓' : ''}</i></button>`).join('');
    setDialog(els.choice, true);
  }
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
  function renderDimensionRatings(log) { const enabled = state.settings.enabledDimensions; $('#advancedRatingSection').hidden = !state.settings.advancedRatings; $('#dimensionRatings').innerHTML = enabled.map((key) => `<fieldset class="dimension-rating"><legend>${DIMENSIONS[key]}${dimInfoButton(key)}</legend><div class="rating-row faces" data-rating-name="${key}"></div></fieldset>`).join(''); enabled.forEach((key) => renderRating($(`[data-rating-name="${key}"]`), key, log && log[key], key === 'bitterness')); }
  function dimInfoButton(key) { return `<button type="button" class="dim-info-btn" data-dim-info="${key}" aria-label="${DIMENSIONS[key]}评分说明">?</button>`; }
  // 维度说明浮窗：定位到「?」按钮上方（放不下则下方），用 Popover API 自带轻触关闭；不支持时回退 toast。
  function showDimInfo(key, anchor) {
    const pop = $('#dimInfoPopover');
    if (!pop || !pop.showPopover) return toast(`${DIMENSIONS[key]}：${DIMENSION_INFO[key] || ''}`);
    pop.innerHTML = `<strong>${esc(DIMENSIONS[key])} ${key === 'bitterness' ? '☹' : '☺'}</strong><p>${esc(DIMENSION_INFO[key] || '')}</p>`;
    if (!pop.matches(':popover-open')) pop.showPopover();
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 8));
    const above = rect.top - pop.offsetHeight - 8;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(above < 8 ? rect.bottom + 8 : above)}px`;
  }
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
    setMokaSize('drink-param', data.mokaPotSize);
    setRatioControls('drink', data.ratio);
    setDrinkParam('useHotWater', data.useHotWater);
    $('#drink-param-dose').value = $('#drink-grams').value || data.dose || '';
    state.activeDrinkStepIndex = -1;
    state.drinkDoseRef = Number(data.dose) || Number($('#drink-param-dose').value) || null;
    renderDrinkSteps(data.steps || []);
    syncDrinkParamFields(); syncDurationControls(els.drinkForm); syncDrinkTotalWater();
    scaleDrinkStepsToDose();
  }
  // 粉量变化时把注水步骤水量等比缩放，保持方案结构不用逐段重填。
  function scaleDrinkStepsToDose() {
    const dose = Number($('#drink-param-dose').value || $('#drink-grams').value);
    if (!(dose > 0)) return;
    const ref = Number(state.drinkDoseRef);
    if (!(ref > 0) || dose === ref || currentDrinkMethod() !== '手冲') { state.drinkDoseRef = dose; return; }
    const rows = readDrinkSteps();
    state.drinkDoseRef = dose;
    if (!rows.some((row) => Number(row.water) > 0)) return;
    rows.forEach((row) => { const water = Number(row.water); if (water > 0) row.water = Math.round(water * dose / ref * 10) / 10; });
    renderDrinkSteps(rows);
    toast('注水步骤水量已按新粉量等比调整');
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
      const editor = `<div class="pour-step-head"><input data-drink-step-label type="text" maxlength="80" value="${esc(step.label || stage)}" placeholder="${esc(stage)}" aria-label="步骤名称"><button type="button" data-remove-drink-step="${index}" aria-label="删除这一段">×</button></div><div class="pour-step-grid"><label><span>水量</span><div class="input-unit"><input data-drink-step-water type="number" min="0" step="0.1" inputmode="decimal" value="${step.water == null ? '' : esc(step.water)}"><em>g</em></div></label><label><span>开始</span>${drinkStepTimeControl('start', step.startTime)}</label><label><span>结束</span>${drinkStepTimeControl('end', step.endTime)}</label><label class="full"><span>备注</span><input data-drink-step-note type="text" maxlength="200" value="${esc(step.note)}" placeholder="可选"></label></div>`;
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
      return `<button type="button" data-drink-plan="${esc(plan.id)}" class="${plan.id === currentId ? 'active' : ''}"><span>${esc(plan.name)}${tagHtml ? `<em>${tagHtml}</em>` : ''}</span></button>`;
    }).join('');
    const lastManualButton = lastManual ? `<button type="button" class="drink-plan-action" data-use-last-brew="${esc(last.id)}"><span>上次手填参数<em><i>上次</i></em></span><small>${esc(formatDateTime(last.consumedAt))}</small></button>` : '';
    const hints = [currentMethod || '当前方式'];
    if (last) hints.push('当前豆子的上次使用');
    hints.push('已绑定方案优先');
    $('#drinkPlanPicker').innerHTML = `<div class="section-heading"><div><span>方案选择</span><small>${esc(hints.join(' · '))}</small></div></div><div class="drink-plan-options"><button type="button" data-drink-plan="" class="drink-plan-action ${!currentId ? 'active' : ''}"><span>不使用方案</span><small>手填本次参数</small></button>${lastManualButton}${planButtons}${plans.length || lastManual ? '' : '<p class="manager-empty compact-empty">当前冲煮方式暂无方案。</p>'}</div>`;
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
  function drinkableBeans() {
    return state.beans.filter((bean) => bean.status === '饮用中' && Number(bean.remainingWeight) > 0)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
  }
  function setChoiceListLayout(mode) {
    const list = $('#choiceList');
    list.className = mode === 'source' ? 'source-actions' : 'choice-list';
  }
  function openDrinkTypePicker() {
    const beans = drinkableBeans();
    $('#choiceTitle').textContent = '记一杯';
    setChoiceListLayout('source');
    $('#choiceList').innerHTML = `<button type="button" data-drink-choice="bean" ${beans.length ? '' : 'disabled'}><span>从豆仓记一杯</span><small>${beans.length ? '扣减库存克数' : '暂无可喝豆'}</small></button><button type="button" data-drink-choice="external"><span>外饮记录</span><small>咖啡馆 / 外卖，不扣库存</small></button>`;
    setDialog(els.choice, true);
  }
  function openBeanPickerForDrink() {
    const beans = drinkableBeans();
    if (!beans.length) return toast('暂无余量足够的豆子');
    $('#choiceTitle').textContent = '选择咖啡豆';
    setChoiceListLayout('list');
    $('#choiceList').innerHTML = beans.map((bean) => `<button type="button" data-drink-bean="${esc(bean.id)}"><span>${esc(bean.name)}<small>${esc([bean.roaster, bean.origin].filter(Boolean).join(' · ') || '豆仓咖啡豆')}</small></span><i>${esc(formatWeight(bean.remainingWeight))}</i></button>`).join('') + '<p class="manager-empty compact-empty">未开封豆子的第一杯请到豆仓卡片中记录。</p>';
    setDialog(els.choice, true);
  }
  let lastWidgetAction = null;
  let lastWidgetActionAt = 0;
  function handleWidgetUrl(value) {
    const action = AppWidgetIntent.parseAction(value);
    if (!action || !state.initialized) return false;
    const now = Date.now();
    if (lastWidgetAction === action && now - lastWidgetActionAt < 800) return true;
    lastWidgetAction = action;
    lastWidgetActionAt = now;
    if (els.choice.open) setDialog(els.choice, false);
    if (els.drink.open) { discardDrinkPhotoDraft(); setDialog(els.drink, false); }
    state.view = 'drinks';
    state.drinkVisibleLimit = DRINK_PAGE_SIZE;
    render();
    if (action === 'external') openExternalDrinkDialog();
    else openBeanPickerForDrink();
    return true;
  }
  function configureDrinkSource(source, orphaned) {
    const external = source === 'external';
    $('#drink-source').value = source;
    $$('[data-bean-only]', els.drinkForm).forEach((node) => { node.hidden = external; });
    $$('[data-external-only]', els.drinkForm).forEach((node) => { node.hidden = !external; });
    const grams = $('#drink-grams');
    if (external) { grams.required = false; grams.removeAttribute('min'); grams.removeAttribute('max'); }
    else { grams.required = true; grams.min = '0.1'; }
    $('#saveDrink').textContent = external ? '保存' : '保存并扣量';
    $('#drinkStartAssist').hidden = external || $('#drinkStartAssist').hidden;
    $$('#drinkForm input, #drinkForm select, #drinkForm textarea, #drinkForm [data-rate], #drinkForm .select-trigger, #drinkForm [data-drink-plan], #drinkForm [data-use-last-brew], #drinkForm [data-drink-step-open], #drinkForm [data-remove-drink-step], #addDrinkStep, [data-add-drink-photo], [data-remove-drink-photo]').forEach((control) => { if (!['drinkCancel', 'deleteDrink'].includes(control.id)) control.disabled = orphaned; });
  }
  function configureDrinkMode(log, mode) {
    state.drinkMode = mode === 'tasting' ? 'tasting' : 'full';
    const tasting = state.drinkMode === 'tasting';
    els.drink.classList.toggle('tasting-mode', tasting);
    $('#drinkTastingSummary').hidden = !tasting;
    $('#drinkEditFull').hidden = !tasting;
    $('#drinkCancel').textContent = tasting ? '稍后再说' : '取消';
    if (!tasting) {
      if (log && log.id) {
        $('#drinkTitle').textContent = log.source === 'external' ? '编辑外饮记录' : '编辑饮用记录';
        $('#deleteDrink').hidden = false;
        $('#saveDrink').textContent = log.source === 'external' ? '保存' : '保存并扣量';
      }
      return;
    }
    $('#drinkTitle').textContent = '留下这一杯的感受';
    $('#drinkBeanMeta').textContent = `${log.beanName} · 可以留空直接完成`;
    const facts = planFactList(log.brewPlanSnapshot || {}, log.brewMethod);
    $('#drinkTastingSummary').innerHTML = `<div><span>本次冲煮</span><strong>${esc(log.brewPlanName || log.brewMethod)}</strong><small>${esc([formatWeight(log.grams), formatDateTime(log.consumedAt)].join(' · '))}</small></div><button type="button" id="drinkTastingSummaryToggle">查看冲煮参数</button><div class="tasting-summary-detail" id="drinkTastingSummaryDetail" hidden>${facts.map((item) => `<p><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></p>`).join('') || '<p>本次没有记录详细参数</p>'}</div>`;
    $('#deleteDrink').hidden = true;
    $('#drinkStartAssist').hidden = true;
    $('#saveDrink').hidden = false;
    $('#saveDrink').textContent = '完成记录';
  }
  function renderCafeSuggestions() {
    const input = $('#drink-cafeName'); const host = $('#drinkCafeSuggestions');
    if (!input || !host) return;
    const query = input.value.trim();
    const names = BeanCore.recentCafeNames(state.drinkLogs, query, query ? 4 : 1);
    const recent = BeanCore.recentCafeNames(state.drinkLogs, '', 1)[0];
    input.placeholder = recent ? `最近：${recent}` : '例如：街角咖啡';
    host.innerHTML = names.length ? `<span>${query ? '匹配店名' : '最近使用'}</span>${names.map((name) => `<button data-cafe-name="${esc(name)}" type="button">${esc(name)}</button>`).join('')}` : (query ? '<span>没有匹配，可直接保存新店名</span>' : '');
  }
  // showRecent：值不是用户敲进去的（自动填充/点胶囊回填）时，列最近几个地点供切换，
  // 否则输入框一有值就只剩一个和它重复的「匹配」胶囊，等于没有候选可选。
  function renderLocationSuggestions(showRecent) {
    const input = $('#drink-location'); const host = $('#drinkLocationSuggestions');
    if (!input || !host) return;
    const query = showRecent ? '' : input.value.trim();
    const names = BeanCore.recentDrinkLocations(state.drinkLogs, query, query ? 4 : 3);
    const recent = BeanCore.recentDrinkLocations(state.drinkLogs, '', 1)[0];
    input.placeholder = recent ? `最近：${recent}` : '例如：杭州';
    host.innerHTML = names.length ? `<span>${query ? '匹配地点' : '最近使用'}</span>${names.map((name) => `<button data-drink-location="${esc(name)}" type="button">${esc(name)}</button>`).join('')}` : (query ? '<span>没有匹配，可直接保存新地点</span>' : '');
  }
  function renderDrinkNameSuggestions() {
    const input = $('#drink-drinkName'); const host = $('#drinkNameSuggestions'); const cafeInput = $('#drink-cafeName');
    if (!input || !host || !cafeInput) return;
    const query = input.value.trim();
    const names = BeanCore.recentExternalDrinkNames(state.drinkLogs, cafeInput.value, query, query ? 4 : 3);
    const recent = BeanCore.recentExternalDrinkNames(state.drinkLogs, cafeInput.value, '', 1)[0];
    input.placeholder = recent ? `最近：${recent}` : '例如：Dirty';
    host.innerHTML = names.length ? `<span>${query ? '匹配饮品' : '同店最近'}</span>${names.map((name) => `<button data-drink-name="${esc(name)}" type="button">${esc(name)}</button>`).join('')}` : (query && cafeInput.value.trim() ? '<span>没有匹配，可直接保存新饮品</span>' : '');
  }
  function openDrinkDialog(bean, log, mode) { if (!bean && log && log.beanId) bean = state.beans.find((item) => item.id === log.beanId); const sourceKind = log && log.source === 'external' ? 'external' : 'bean'; const orphaned = sourceKind === 'bean' && !bean && Boolean(log); if (sourceKind === 'bean' && !bean && !log) return; state.editingDrinkId = log ? log.id : null; els.drinkForm.reset(); state.pendingDrinkPhotos = []; state.drinkPhotosToDelete = []; state.drinkPhotoDraft = (log && log.photos || []).slice(0, 3); const remaining = bean ? Number(bean.remainingWeight) || 0 : 0; const grams = log ? log.grams : Math.min(state.settings.quickGrams, remaining); const last = bean && !log ? lastBeanLog(bean.id) : null; const lastPlanEnabled = brewPlansEnabled() && last; const lastMethod = !log && last ? last.brewMethod : '手冲'; $('#drink-id').value = log ? log.id : ''; $('#drink-beanId').value = bean ? bean.id : ''; $('#drink-plan-id').value = log && log.brewPlanId || lastPlanEnabled && last.brewPlanId || ''; $('#drink-grams').value = grams; $('#drink-grams').max = remaining + (log ? Number(log.grams) : 0); $('#drink-time').value = localDateTime(log && log.consumedAt); $('#drink-notes').value = log ? log.notes : ''; $('#drink-cafeName').value = log ? log.cafeName || '' : ''; $('#drink-drinkName').value = log ? log.drinkName || '' : ''; renderCafeSuggestions(); renderDrinkNameSuggestions(); $('#drink-price').value = log && log.price != null ? log.price : ''; $('#drink-location').value = log ? log.location || '' : ''; renderLocationSuggestions(true); $('#drinkTitle').textContent = sourceKind === 'external' ? (log ? '编辑外饮记录' : '外饮记录') : orphaned ? '历史饮用记录' : log ? '编辑饮用记录' : '喝一杯'; $('#drinkBeanMeta').textContent = sourceKind === 'external' ? '咖啡馆 / 外卖，不扣库存' : orphaned ? `${log.beanName} · 原豆子已删除` : `${bean.name} · 当前剩余 ${formatWeight(remaining)}`; $('#deleteDrink').hidden = !log; $('#saveDrink').hidden = orphaned; methodOptions(log && log.brewMethod || lastMethod); if (sourceKind === 'bean') renderDrinkPlanPicker(bean, log); const source = log && log.brewPlanSnapshot || lastPlanEnabled && last.brewPlanSnapshot || selectedDrinkPlan() || { brewMethod: currentDrinkMethod(), dose: grams }; fillDrinkParams(source); $('#drinkParamPanel').hidden = sourceKind === 'external' || !brewPlansEnabled(); renderRating($('#overallRating'), 'overallRating', log && log.overallRating, false); renderDimensionRatings(log); renderDrinkFeatureHint(log); renderDrinkPhotoVault(); configureDrinkSource(sourceKind, orphaned); configureDrinkMode(log || {}, mode); setDialog(els.drink, true); }
  // 只有新建外饮才自动带上最近一次的地点（地点通常不变）；编辑已有记录必须原样显示它自己的地点。
  function openExternalDrinkDialog(log) { openDrinkDialog(null, log ? { ...log, source: 'external' } : BeanCore.normalizeDrinkLog({ source: 'external' })); state.editingDrinkId = log ? log.id : null; if (!log) { $('#drink-id').value = ''; $('#deleteDrink').hidden = true; $('#drinkTitle').textContent = '外饮记录'; const lastLocation = BeanCore.recentDrinkLocations(state.drinkLogs, '', 1)[0]; if (lastLocation) $('#drink-location').value = lastLocation; renderLocationSuggestions(true); } }
  function ratingPayload() { const result = {}; $$('[data-rating-name]', els.drinkForm).forEach((node) => { result[node.dataset.ratingName] = node.dataset.value || null; }); return result; }
  async function persistDrink(options) {
    const opts = options || {};
    const button = $('#saveDrink');
    if (button.disabled) return null;
    button.disabled = true;
    const external = $('#drink-source').value === 'external';
    syncRatioValue('drink'); $$('.duration-field', els.drinkForm).forEach(syncDurationField);
    const bean = state.beans.find((item) => item.id === $('#drink-beanId').value);
    const old = state.drinkLogs.find((item) => item.id === state.editingDrinkId);
    let method = external ? '' : $('#drink-method').value;
    if (method === '__custom__') method = $('#drink-method-custom').value.trim();
    try {
      if (!external && !bean) throw new Error('找不到对应的咖啡豆');
      if (!external && !method) throw new Error('请填写冲煮方式');
      if (external && !$('#drink-cafeName').value.trim() && !$('#drink-drinkName').value.trim()) throw new Error('请填写店名或饮品名称');
      const consumed = new Date(dateTimeValue($('#drink-time').value));
      if (Number.isNaN(consumed.getTime())) throw new Error('请选择饮用时间');
      const photos = await archivePendingDrinkPhotos();
      const plan = !external && brewPlansEnabled() ? selectedDrinkPlan() : null;
      const snapshot = !external && brewPlansEnabled() ? drinkParamSnapshot(method, plan) : null;
      const payload = { ...(old || {}), id: state.editingDrinkId || undefined, source: external ? 'external' : 'bean', beanId: external ? null : bean.id, beanName: external ? '' : bean.name, grams: external ? 0 : $('#drink-grams').value, brewMethod: method, brewPlanId: plan ? plan.id : null, brewPlanVersion: plan ? plan.version : null, brewPlanName: plan ? plan.name : '', brewPlanSnapshot: snapshot, photos, cafeName: $('#drink-cafeName').value, drinkName: $('#drink-drinkName').value, price: $('#drink-price').value, location: $('#drink-location').value, consumedAt: consumed.toISOString(), notes: $('#drink-notes').value, ...ratingPayload() };
      payload.tastingStatus = BeanCore.resolveTastingStatus(payload, { forcePending: opts.forcePending, completing: state.drinkMode === 'tasting', existingStatus: old && old.tastingStatus, isNew: !old });
      const finishesBean = !external && !old && Number(payload.grams) >= Number(bean.remainingWeight);
      const saved = await BeanRepository.saveDrinkLog(payload);
      if (!external) {
        state.settings.lastBrewMethod = method;
        try { await BeanRepository.saveSettings(state.settings); }
        catch (settingsError) { console.warn('上次冲煮方式保存失败，不影响饮用记录', settingsError); }
      }
      state.drinkPhotosToDelete.forEach((ref) => deleteImageRef(ref, true)); state.drinkPhotosToDelete = [];
      if (opts.close !== false) setDialog(els.drink, false);
      state.editingDrinkId = null;
      await reload();
      if (opts.notify !== false) {
        const savedMessage = state.drinkMode === 'tasting' ? '这一杯的感受已留下' : old ? '饮用记录已更新' : payload.tastingStatus === 'pending' ? '冲煮已记录，稍后可以评分' : '这一杯已记下';
        toast(finishesBean ? `${savedMessage} · 这一包喝完了，故事留在豆仓里` : savedMessage);
      }
      return saved;
    } catch (error) {
      console.error(error); toast(error.message || '保存失败'); return null;
    } finally { button.disabled = false; }
  }
  async function saveDrink(event) { event.preventDefault(); await persistDrink(); }
  async function saveAssistDrink(elapsed) {
    $('#drink-param-targetDuration').value = durationText(elapsed, 'minute');
    const field = $('[data-duration-target="drink-param-targetDuration"]', els.drinkForm);
    if (field) setDurationControl(field, $('#drink-param-targetDuration').value);
    return persistDrink({ forcePending: true, close: false, notify: false });
  }
  function openTastingById(id) {
    const log = state.drinkLogs.find((item) => item.id === id);
    const bean = log && state.beans.find((item) => item.id === log.beanId);
    if (!log || !bean) return toast('找不到这杯记录');
    if (els.detail.open) setDialog(els.detail, false);
    openDrinkDialog(bean, log, 'tasting');
  }
  function handlePendingTastingAction(event) {
    const open = event.target.closest('[data-continue-tasting]');
    if (open) { event.stopPropagation(); return openTastingById(open.dataset.continueTasting); }
  }
  async function removeDrink() {
    if (!state.editingDrinkId) return;
    const log = state.drinkLogs.find((item) => item.id === state.editingDrinkId);
    const external = log && log.source === 'external';
    if (!await askConfirm({ title: '删除饮用记录？', message: external ? '删除这条外饮记录。' : '这杯记录会移除，并把用掉的咖啡豆克数归还。', confirmText: '删除记录' })) return;
    try { await BeanRepository.deleteDrinkLog(state.editingDrinkId); (log && log.photos || []).forEach((ref) => deleteImageRef(ref, true)); setDialog(els.drink, false); state.editingDrinkId = null; await reload(); if (els.detail.open && state.editingId) openDetail(state.beans.find((bean) => bean.id === state.editingId)); toast(external ? '外饮记录已删除' : '记录已删除，克数已归还'); } catch (error) { console.error(error); toast('删除失败'); }
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

  function syncPhotoJournalClass() { document.body.classList.toggle('photo-journal', Boolean(state.settings && state.settings.photoJournal)); }
  function applyTheme(theme, persist) { if (!themeColors[theme]) theme = 'dark-roast'; document.documentElement.dataset.theme = theme; state.settings.theme = theme; syncPhotoJournalClass(); localStorage.setItem('coffee-vault-theme', theme); $$('[data-theme-value]').forEach((button) => button.classList.toggle('active', button.dataset.themeValue === theme)); const statusBar = capPlugin('StatusBar'); if (statusBar) { if (statusBar.setOverlaysWebView) statusBar.setOverlaysWebView({ overlay: false }).catch(() => {}); statusBar.setBackgroundColor({ color: themeColors[theme] }).catch(() => {}); statusBar.setStyle({ style: ['frost', 'blaze'].includes(theme) ? 'LIGHT' : 'DARK' }).catch(() => {}); } if (persist && state.initialized) BeanRepository.saveSettings(state.settings).catch(() => toast('主题保存失败')); }
  function syncBackupDialog() { $$('[data-requires-brew-plans]').forEach((button) => { button.hidden = !brewPlansEnabled(); }); }
  function renderSettings() { $('#settingQuickGrams').value = state.settings.quickGrams; $('#settingFlavorReminderDays').value = state.settings.flavorReminderDays; $('#settingLowStockCups').value = state.settings.lowStockCups; $('#settingBrewPlans').checked = brewPlansEnabled(); $('#settingBeanPhotos').checked = state.settings.showBeanPhotosInList; $('#settingPhotoJournal').checked = state.settings.photoJournal; $('#settingPriceUnit').value = state.settings.priceUnit || 'g'; enhanceSelect($('#settingPriceUnit')); syncChoiceTrigger($('#settingPriceUnit')); $('#settingAdvanced').checked = state.settings.advancedRatings; $('#dimensionSettings').innerHTML = BeanCore.DIMENSION_KEYS.map((key) => `<label><input type="checkbox" data-dimension="${key}" ${state.settings.enabledDimensions.includes(key) ? 'checked' : ''}><span>${DIMENSIONS[key]} ${key === 'bitterness' ? '☹' : '☺'}</span>${dimInfoButton(key)}</label>`).join(''); $('#dimensionSection').hidden = !state.settings.advancedRatings; }
  async function saveSettingsFromUi() { state.settings = BeanCore.normalizeSettings({ ...state.settings, quickGrams: $('#settingQuickGrams').value, flavorReminderDays: $('#settingFlavorReminderDays').value, lowStockCups: $('#settingLowStockCups').value, enableBrewPlans: $('#settingBrewPlans').checked, showBeanPhotosInList: $('#settingBeanPhotos').checked, photoJournal: $('#settingPhotoJournal').checked, priceUnit: $('#settingPriceUnit').value, advancedRatings: $('#settingAdvanced').checked, enabledDimensions: $$('[data-dimension]:checked').map((node) => node.dataset.dimension) }); syncPhotoJournalClass(); syncBackupDialog(); await BeanRepository.saveSettings(state.settings); render(); if (els.detail.open && state.editingId) openDetail(state.beans.find((bean) => bean.id === state.editingId)); }
  // 关于页/更新检查在 app-update.js(拆分第三批)。
  const { showAbout, checkForUpdates, openReleasePage, openUpdateDownload } =
    window.AppUpdate.create({ $, state, els, core: BeanCore, capPlugin, setDialog, openExternalUrl, esc });
  function openImagePreview(path, label) { if (!path) return; state.previewImage = { path, label: label || '图片预览' }; $('#imagePreviewTitle').textContent = state.previewImage.label; $('#imagePreviewPhoto').src = imageSrc(path); setDialog(els.imagePreview, true); }
  async function sharePreviewImage() { if (!state.previewImage) return; try { const scanner = capPlugin('CoffeeLabelScanner'); const filename = `豆仓-${String(state.previewImage.label || '图片').replace(/[\\/:*?"<>|]/g, '').slice(0, 32) || '图片'}-${Date.now()}`; if (BeanRepository.isNative() && scanner && scanner.saveArchivedImage) { await scanner.saveArchivedImage({ path: state.previewImage.path, filename }); toast('已保存到相册「豆仓」'); } else if (BeanRepository.isNative()) { throw new Error('当前版本不支持保存归档图片'); } else { const link = document.createElement('a'); link.href = imageSrc(state.previewImage.path); link.download = `${filename}.jpg`; link.click(); toast('图片已下载'); } } catch (error) { console.error(error); toast(error && error.message || '保存图片失败'); } }
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
  // 云同步账号 UI 在 app-sync-ui.js(拆分第二批):依赖显式注入,状态位仍写回共享 state。
  const { renderSyncSettings, setSyncAuthMode, openSyncAuth, syncAuthBack, syncAuthSubmit, syncLogout, syncDeleteAccount, syncToggle, syncNow, copyRecoveryCode } =
    window.AppSyncUi.create({ $, state, els, cloudSync, toast, setDialog, askConfirm, reload, copyText, formatDateTime });
  async function copyCurrentPlanShareCode() {
    const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
    if (!plan) return;
    setDialog(els.planShareChoice, false);
    try { await copyText(BeanCore.encodePlanShare(plan)); toast('分享码已复制'); } catch (error) { console.error(error); toast('复制失败，请用分享卡片二维码'); }
  }
  // 分享卡片画布渲染在 app-share-card.js(拆分第二批):纯绘制,依赖显式注入。
  const { renderShareCard, canvasToBlob, loadCanvasImage } = window.AppShareCard.create({ imageSrc, monthNames: MONTH_NAMES });
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
  async function openDrinkShareChoice() { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); if (!log) return; if (log.source === 'external' || !log.brewPlanSnapshot) { try { await shareCanvas(BeanCore.buildSharePayload('drink', log, { includeBrew: false, style: 'receipt' })); } catch (error) { console.error(error); toast('分享失败'); } return; } $('#drinkShareIncludeBrew').checked = false; $('#drinkShareBrewOption').hidden = false; setDialog(els.drinkShareChoice, true); }
  async function confirmDrinkShareChoice() { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); const includeBrew = $('#drinkShareIncludeBrew').checked; setDialog(els.drinkShareChoice, false); if (!log) return; try { await shareCanvas(BeanCore.buildSharePayload('drink', log, { includeBrew, style: 'receipt' })); } catch (error) { console.error(error); toast('分享失败'); } }
  function sharePlanCard() { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); if (!plan) return; state.sharePlanId = plan.id; $('#planShareIncludeQr').checked = false; setDialog(els.planShareChoice, true); }
  async function confirmPlanShareChoice() {
    const plan = state.brewPlans.find((item) => item.id === state.sharePlanId); const includeQr = $('#planShareIncludeQr').checked; setDialog(els.planShareChoice, false);
    if (!plan) return;
    try { await shareCanvas(BeanCore.buildSharePayload('brewPlan', plan, { style: 'receipt', includeQr })); } catch (error) { console.error(error); toast('分享失败'); }
  }
  function setImportStatus(message, isError) { const el = $('#planImportStatus'); el.textContent = message || ''; el.classList.toggle('error', Boolean(isError)); }
  function clearImportSummary() { state.importPlanDraft = null; $('#planImportSummary').hidden = true; $('#planImportConfirm').disabled = true; }
  function fillPlanImportBeans() {
    const select = $('#planImportBean'); if (!select) return;
    const beans = state.beans.filter((bean) => !bean.deletedAt);
    const options = ['<option value="">不指定豆子（拍照或口述给 AI）</option>']
      .concat(beans.map((bean) => `<option value="${esc(bean.id)}">${esc(bean.name || '未命名豆子')}</option>`));
    select.innerHTML = options.join('');
    $('#planImportBeanField').hidden = !beans.length;
  }
  function setPlanImportTab(tab) {
    state.planImportTab = tab === 'ai' ? 'ai' : 'code';
    $$('#planImportTabs .chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.importTab === state.planImportTab));
    $$('#planImportDialog [data-import-panel]').forEach((panel) => { panel.hidden = panel.dataset.importPanel !== state.planImportTab; });
    clearImportSummary(); setImportStatus('');
  }
  function openPlanImport() {
    clearImportSummary(); $('#planImportCode').value = ''; $('#planImportAiCode').value = ''; setImportStatus('');
    fillPlanImportBeans(); setPlanImportTab('code');
    setDialog(els.planImport, true);
  }
  function showPlanImportPreview(plan, statusMessage) {
    state.importPlanDraft = plan;
    $('#planImportName').textContent = plan.name;
    $('#planImportMeta').textContent = [plan.brewMethod, plan.dose ? plan.dose + 'g' : '', plan.ratio, plan.waterTemp].filter(Boolean).join(' · ');
    $('#planImportSteps').textContent = plan.steps && plan.steps.length ? `${plan.steps.length} 段步骤` : '无分段步骤';
    $('#planImportSummary').hidden = false; $('#planImportConfirm').disabled = false; setImportStatus(statusMessage || '已识别方案，确认后导入');
  }
  async function copyAiPlanPrompt() {
    const beanId = $('#planImportBean').value;
    const bean = beanId ? state.beans.find((item) => item.id === beanId) : null;
    const prompt = BeanCore.buildAiPlanPrompt(bean || null);
    try {
      await copyText(prompt);
      toast(bean ? `已复制针对「${bean.name}」的提示词，去粘贴给你的 AI` : '已复制通用提示词，可拍豆袋照片或口述给 AI');
    } catch (error) { console.error(error); toast('复制失败，请手动长按输入框粘贴'); }
  }
  function parseAiPlanInput() {
    const text = $('#planImportAiCode').value;
    let result;
    try { result = BeanCore.parseAiPlanJson(text); }
    catch (error) { clearImportSummary(); setImportStatus(error.message || 'AI 方案无法解析', true); return; }
    showPlanImportPreview(result.plan, result.pickedFirst ? '检测到多个方案，已取第 1 个，确认后导入' : '已识别 AI 方案，确认后导入');
  }
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
    showPlanImportPreview(plan);
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
  async function shareCoffeeReport(report) { const payload = BeanInsights.buildCoffeeReportSharePayload(report); await shareCanvas(payload); }
  async function shareCoffeeCatalog(catalog, options) { const payload = options && options.external ? BeanInsights.buildExternalCatalogSharePayload(catalog) : BeanInsights.buildCoffeeCatalogSharePayload(catalog); await shareCanvas(payload); }
  // 备份导出/导入与旧版迁移在 app-backup.js(拆分第三批)。
  const { exportBackup, startImport, webImport, loadMockData, offerMigration, migrateLegacy } =
    window.AppBackup.create({ $, state, els, core: BeanCore, repository: BeanRepository, capPlugin, toast, setDialog, reload, confirmFn: (message) => askConfirm({ eyebrow: 'LOCAL TEST', title: '载入 Mock 数据？', message, confirmText: '载入' }) });
  const insightsUi = window.AppInsights.create({ state, dialog: els.insights, core: BeanInsights, setDialog, toast, imageSrc, shareReport: shareCoffeeReport, shareCatalog: shareCoffeeCatalog, reopenPersonal: openPersonal });
  function openInsights() { insightsUi.open(); }
  function openInsightsFromPersonal(openPage) { if (els.personal.open) els.personal.close(); openPage(); }

  function exitApp() { const app = capPlugin('App'); if (app) app.exitApp(); }
  // 轻量退出：主界面再次返回（约 2 秒内）才退出，否则先 toast 提示，避免误触整块退出弹窗。
  function requestExit() {
    if (state.exitPromptAt && Date.now() - state.exitPromptAt < 2000) { state.exitPromptAt = 0; return exitApp(); }
    state.exitPromptAt = Date.now();
    toast('再次操作退出程序');
  }
  function closeTopLayerOrExit() {
    if (els.confirm.open) return resolveConfirm(false);
    if (els.sharePreview.open) return closeSharePreview();
    if (els.drinkShareChoice.open) return els.drinkShareChoice.close();
    if (els.choice.open) return els.choice.close();
    if (els.datePicker.open) return els.datePicker.close();
    if (els.photoSource.open) return els.photoSource.close();
    if (els.scanImage.open) return els.scanImage.close();
    if (els.imagePreview.open) return els.imagePreview.close();
    if (els.shareChoice.open) return els.shareChoice.close();
    if (els.brewAssist.open) return cancelBrewAssist();
    if (els.drink.open) { discardDrinkPhotoDraft(); return els.drink.close(); }
    if (els.planEditor.open) return els.planEditor.close();
    if (els.syncAuth.open) return syncAuthBack();
    if (els.sync.open) return els.sync.close();
    if (els.backup.open) return els.backup.close();
    if (els.insights.open) return insightsUi.handleBack() || els.insights.close();
    if (els.calendar.open) return els.calendar.close();
    if (els.drinkDetail.open) return els.drinkDetail.close();
    if (els.planDetail.open) return els.planDetail.close();
    if (els.about.open) return els.about.close();
    if (els.manager.open) return els.manager.close();
    if (els.settings.open) return els.settings.close();
    if (els.personal.open) return els.personal.close();
    if (els.editor.open) { clearPendingImages(true); return els.editor.close(); }
    if (els.detail.open) return els.detail.close();
    if (els.migration.open) return els.migration.close();
    return requestExit();
  }
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
    try { await BeanRepository.remove(bean.id); if (els.detail.open) setDialog(els.detail, false); await animateCardExit(card); await reload({ skipEnterAnimation: true }); toast('已删除，饮用历史保留'); } catch (error) { console.error(error); toast('删除失败'); }
  }
  async function longPressDeletePlan(card) {
    const plan = state.brewPlans.find((item) => item.id === card.dataset.planId);
    if (!plan) return;
    if (plan.source === 'preset') return toast('预置方案不能删除，可复制后编辑');
    if (!await askConfirm({ title: `删除方案「${plan.name}」？`, message: '历史饮用记录会保留当时的冲煮参数快照。' })) return;
    try { await BeanRepository.deleteBrewPlan(plan.id); if (els.planDetail.open) setDialog(els.planDetail, false); await animateCardExit(card); await reload({ skipEnterAnimation: true }); toast('方案已删除'); } catch (error) { console.error(error); toast(error.message || '删除失败'); }
  }
  async function longPressDeleteDrink(card) {
    const log = state.drinkLogs.find((item) => item.id === card.dataset.logId);
    if (!log) return;
    const external = log.source === 'external';
    if (!await askConfirm({ title: '删除这条饮用记录？', message: external ? '删除这条外饮记录。' : '这杯记录会移除，并把用掉的咖啡豆克数归还。', confirmText: '删除记录' })) return;
    try {
      await BeanRepository.deleteDrinkLog(log.id);
      (log.photos || []).forEach((ref) => deleteImageRef(ref, true));
      if (state.editingDrinkId === log.id) state.editingDrinkId = null;
      if (els.drinkDetail.open && state.viewingDrinkId === log.id) { state.viewingDrinkId = null; setDialog(els.drinkDetail, false); }
      if (els.drink.open && !state.editingDrinkId) setDialog(els.drink, false);
      await animateCardExit(card); await reload({ skipEnterAnimation: true });
      toast(external ? '外饮记录已删除' : '记录已删除，克数已归还');
    } catch (error) { console.error(error); toast('删除失败'); }
  }
  async function syncMockDataVisibility() {
    const section = $('#mockDataSection');
    if (!section) return;
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!isNative) { section.hidden = !['localhost', '127.0.0.1'].includes(location.hostname); return; }
    section.hidden = true;
    try { const app = capPlugin('App'); if (app && app.getInfo) { const info = await app.getInfo(); if (/-debug$/i.test(String(info && info.version || ''))) section.hidden = false; } } catch (_) {}
  }
  function bindEvents() {
    $('#calendarReportOpen').addEventListener('click', () => { const button = $('#calendarReportOpen'); if (!button.dataset.reportKey) return; setDialog(els.calendar, false); insightsUi.openReport(button.dataset.reportType, button.dataset.reportKey); });
    setupNumberInputs();
    $$('dialog').forEach((dialog) => dialog.addEventListener('close', syncDialogScrim));
    new MutationObserver(syncDialogScrim).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    els.drink.addEventListener('close', resetQuickDrinkFeedback);
    $('#loadMockData').addEventListener('click', loadMockData); syncMockDataVisibility();
    $('#plan-mokaPotSize-choice').addEventListener('change', () => syncMokaSize('plan'));
    $('#plan-mokaPotSize-custom').addEventListener('input', () => syncMokaSize('plan'));
    $('#drink-param-mokaPotSize-choice').addEventListener('change', () => syncMokaSize('drink-param'));
    $('#drink-param-mokaPotSize-custom').addEventListener('input', () => syncMokaSize('drink-param'));
    ['addBean', 'scanBean', 'planImportFab'].forEach((id) => $(`#${id}`).addEventListener('click', floatingActionClickGuard, true));
    $('#addBean').addEventListener('click', () => { expandFloatingActions(); return state.view === 'plans' ? openPlanEditor(null) : state.view === 'drinks' ? openDrinkTypePicker() : openEditor(null); }); $('#scanBean').addEventListener('click', () => { expandFloatingActions(); scanCoffeeLabel(); }); $('#editorClose').addEventListener('click', () => { clearPendingImages(true); beanImagesToDelete = []; setDialog(els.editor, false); }); $('#editorCancel').addEventListener('click', () => { clearPendingImages(true); beanImagesToDelete = []; setDialog(els.editor, false); }); $('#deleteBean').addEventListener('click', removeCurrent); els.form.addEventListener('submit', saveForm); $('#field-initialWeight').addEventListener('input', syncInitialWeightToRemaining); $('#field-remainingWeight').addEventListener('input', markRemainingWeightEdited); $('#editorImageVault').addEventListener('click', (event) => { if (event.target.closest('[data-preview-cutout]')) return openImagePreview($('#field-bagCutoutImagePath').value, '手账封面'); if (event.target.closest('[data-remove-cutout]')) return removeDraftCutout(); if (event.target.closest('[data-regenerate-cutout]')) return generateDraftCutout($('#field-bagImagePath').value); const remove = event.target.closest('[data-remove-image-role]'); if (remove) return removeBeanImage(remove.dataset.removeImageRole); const button = event.target.closest('[data-add-image-role]'); if (button) return addBeanImage(button.dataset.addImageRole); const card = event.target.closest('[data-preview-image]'); if (card) openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); });
    els.empty.addEventListener('click', (event) => {
      const button = event.target.closest('[data-empty-action]');
      if (!button) return;
      if (button.dataset.emptyAction === 'add') return openEditor(null);
      if (button.dataset.emptyAction === 'scan') return scanCoffeeLabel();
      if (button.dataset.emptyAction === 'backup') { syncBackupDialog(); setDialog(els.backup, true); }
    });
    $('#drinkEmpty').addEventListener('click', (event) => { const button = event.target.closest('[data-drink-empty-action]'); if (!button) return; if (button.dataset.drinkEmptyAction === 'external') return openExternalDrinkDialog(); openBeanPickerForDrink(); });
    $('#drinkStarterHint').addEventListener('click', (event) => { if (!event.target.closest('[data-drink-hint-dismiss]')) return; writeLocalFlag('coffee-vault-hint-first-drink'); renderDrinkStarterHint(); });
    els.list.addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const quick = event.target.closest('[data-drink-id]'); if (quick) { event.stopPropagation(); return animateQuickDrink(quick); } const card = event.target.closest('.bean-card'); if (card) openDetail(state.beans.find((bean) => bean.id === card.dataset.id)); });
    attachLongPress(els.list, '.bean-card', longPressDeleteBean);
    els.list.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return; const card = event.target.closest('.bean-card'); if (card) { event.preventDefault(); openDetail(state.beans.find((bean) => bean.id === card.dataset.id)); } });
    $('#beanReminderPanel').addEventListener('click', (event) => { const button = event.target.closest('[data-reminder-id]'); if (!button) return; acknowledgeReminder(button.dataset.reminderId); renderBeanReminders(); if (button.dataset.reminderReportType) { insightsUi.openReport(button.dataset.reminderReportType, button.dataset.reminderReportKey); return; } if (button.dataset.reminderBean) openDetail(state.beans.find((bean) => bean.id === button.dataset.reminderBean)); });
    $('#globalDrinkList').addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } if (event.target.closest('[data-continue-tasting]')) return handlePendingTastingAction(event); const preview = event.target.closest('[data-preview-image]'); if (preview) { event.stopPropagation(); return openImagePreview(preview.dataset.previewImage, preview.dataset.previewLabel); } if (event.target.closest('#drinkLoadMore')) { state.drinkVisibleLimit += DRINK_PAGE_SIZE; return renderDrinks(); } const item = event.target.closest('[data-log-id]'); if (item) openDrinkDetail(state.drinkLogs.find((entry) => entry.id === item.dataset.logId)); }); $('#detailDrinkHistory').addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } if (event.target.closest('[data-continue-tasting]')) return handlePendingTastingAction(event); const preview = event.target.closest('[data-preview-image]'); if (preview) return openImagePreview(preview.dataset.previewImage, preview.dataset.previewLabel); const item = event.target.closest('[data-log-id]'); if (item) openDrinkDetail(state.drinkLogs.find((log) => log.id === item.dataset.logId)); });
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
    $('#imagePreviewClose').addEventListener('click', () => setDialog(els.imagePreview, false)); $('#imagePreviewCancel').addEventListener('click', () => setDialog(els.imagePreview, false)); $('#imagePreviewSave').addEventListener('click', sharePreviewImage); $('#shareImageChoiceClose').addEventListener('click', () => setDialog(els.shareChoice, false)); $('#shareImageChoiceCancel').addEventListener('click', () => setDialog(els.shareChoice, false)); $('#shareImageChoiceConfirm').addEventListener('click', confirmBeanShareChoice); $('#planShareChoiceClose').addEventListener('click', () => setDialog(els.planShareChoice, false)); $('#planShareChoiceCancel').addEventListener('click', () => setDialog(els.planShareChoice, false)); $('#planShareChoiceConfirm').addEventListener('click', confirmPlanShareChoice); $('#planImportFab').addEventListener('click', () => { expandFloatingActions(); openPlanImport(); }); $('#settingsImportPlan').addEventListener('click', () => { setDialog(els.settings, false); openPlanImport(); }); $('#planImportClose').addEventListener('click', () => setDialog(els.planImport, false)); $('#planImportCancel').addEventListener('click', () => setDialog(els.planImport, false)); $('#planImportCamera').addEventListener('click', () => importQrFromSource('camera')); $('#planImportGallery').addEventListener('click', () => importQrFromSource('photos')); $('#planImportParse').addEventListener('click', parsePastedImportCode); $('#planImportConfirm').addEventListener('click', confirmImportPlan); $('#planImportTabs').addEventListener('click', (event) => { const chip = event.target.closest('[data-import-tab]'); if (chip) setPlanImportTab(chip.dataset.importTab); }); $('#planImportCopyPrompt').addEventListener('click', copyAiPlanPrompt); $('#planImportAiParse').addEventListener('click', parseAiPlanInput);
    $('#drinkShareChoiceClose').addEventListener('click', () => setDialog(els.drinkShareChoice, false));
    $('#drinkShareChoiceCancel').addEventListener('click', () => setDialog(els.drinkShareChoice, false));
    $('#drinkShareChoiceConfirm').addEventListener('click', confirmDrinkShareChoice);
    $('#drinkDetailShare').addEventListener('click', openDrinkShareChoice);
    els.drinkDetail.addEventListener('click', (event) => { const card = event.target.closest('[data-preview-image]'); if (card) openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); });
    els.drinkDetail.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const card = event.target.closest('[data-preview-image]'); if (card) { event.preventDefault(); openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); } });
    $('#detailClose').addEventListener('click', () => setDialog(els.detail, false)); $('#detailShare').addEventListener('click', openBeanShareChoice); $('#detailEdit').addEventListener('click', () => { const bean = state.beans.find((item) => item.id === state.editingId); setDialog(els.detail, false); openEditor(bean); }); $('#detailDrink').addEventListener('click', () => openDrinkDialog(state.beans.find((bean) => bean.id === $('#detailDrink').dataset.beanId))); $('#detailBrewReview').addEventListener('click', () => { const beanId = $('#detailBrewReview').dataset.beanId; if (!state.beans.some((bean) => bean.id === beanId && !bean.deletedAt)) return; setDialog(els.detail, false); insightsUi.openBeanReview(beanId); });
    $('#drinkDetailClose').addEventListener('click', () => setDialog(els.drinkDetail, false)); $('#drinkSaveAsPlan').addEventListener('click', saveLogAsPlan); $('#drinkDetailEdit').addEventListener('click', () => { const log = state.drinkLogs.find((item) => item.id === state.viewingDrinkId); const bean = log && state.beans.find((item) => item.id === log.beanId); if (!log || (!bean && log.source !== 'external')) return; setDialog(els.drinkDetail, false); return log.source === 'external' ? openExternalDrinkDialog(log) : openDrinkDialog(bean, log); });
    $$('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; if (state.view === 'drinks') state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); }));
    $('#planDetailClose').addEventListener('click', () => setDialog(els.planDetail, false)); $('#planShare').addEventListener('click', sharePlanCard); $('#planShareCopyCode').addEventListener('click', copyCurrentPlanShareCode); $('#planAssistStart').addEventListener('click', openPlanBrewAssist);
    $('#planDetailEdit').addEventListener('click', () => { const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId); setDialog(els.planDetail, false); openPlanEditor(plan); }); $('#planDuplicate').addEventListener('click', duplicateCurrentPlan); $('#planEditorDelete').addEventListener('click', deleteCurrentPlan); $('#planEditorClose').addEventListener('click', () => setDialog(els.planEditor, false)); $('#planEditorCancel').addEventListener('click', () => setDialog(els.planEditor, false)); els.planForm.addEventListener('submit', savePlan); $('#plan-method').addEventListener('change', () => { syncPlanMethodFields(); syncPlanTotalWater(); fillTemplateOptions($('#plan-method').value); syncChoiceTrigger($('#plan-method')); }); $('#plan-dose').addEventListener('input', syncPlanTotalWater); $('#plan-totalWater').addEventListener('input', syncPlanRatioFromWater); ['plan-ratio-left', 'plan-ratio-right'].forEach((id) => $(`#${id}`).addEventListener('input', () => { syncRatioValue('plan'); syncPlanTotalWater(); })); $$('.duration-field', els.planForm).forEach((field) => field.addEventListener('input', () => syncDurationField(field))); $('#addPourStep').addEventListener('click', addPourStepFromLast); $('#pourStepList').addEventListener('click', (event) => { const remove = event.target.closest('[data-remove-pour-step]'); if (remove) { const rows = readPourSteps(); rows.splice(Number(remove.dataset.removePourStep), 1); state.activePourStepIndex = Math.min(state.activePourStepIndex, rows.length - 1); renderPourSteps(rows); return; } const open = event.target.closest('[data-pour-step-open]'); if (open) { state.activePourStepIndex = Number(open.dataset.pourStepOpen); renderPourSteps(readPourSteps()); } }); $('#pourStepList').addEventListener('input', updatePourAllocation); $('#pourTemplateRow').addEventListener('click', (event) => { const chip = event.target.closest('[data-pour-template]'); if (chip) applyPourTemplate(chip.dataset.pourTemplate); }); $('#pourFillRemainder').addEventListener('click', fillPourRemainder); $('#plan-template').addEventListener('change', applySelectedTemplate);
    $('#drinkClose').addEventListener('click', () => { discardDrinkPhotoDraft(); setDialog(els.drink, false); }); $('#drinkCancel').addEventListener('click', () => { discardDrinkPhotoDraft(); setDialog(els.drink, false); }); $('#drinkEditFull').addEventListener('click', () => { const log = state.drinkLogs.find((item) => item.id === state.editingDrinkId); if (log) configureDrinkMode(log, 'full'); }); $('#drinkStartAssist').addEventListener('click', openDrinkBrewAssist); $('#deleteDrink').addEventListener('click', removeDrink); els.drinkForm.addEventListener('submit', saveDrink); $('#drinkPhotoVault').addEventListener('click', (event) => { const add = event.target.closest('[data-add-drink-photo]'); if (add) return addDrinkPhoto(); const remove = event.target.closest('[data-remove-drink-photo]'); if (remove) return removeDrinkPhoto(Number(remove.dataset.removeDrinkPhoto)); const card = event.target.closest('[data-preview-image]'); if (card) return openImagePreview(card.dataset.previewImage, card.dataset.previewLabel); }); els.drinkForm.addEventListener('click', (event) => { const summaryToggle = event.target.closest('#drinkTastingSummaryToggle'); if (summaryToggle) { const detail = $('#drinkTastingSummaryDetail'); detail.hidden = !detail.hidden; summaryToggle.textContent = detail.hidden ? '查看冲煮参数' : '收起冲煮参数'; return; } const dimInfo = event.target.closest('[data-dim-info]'); if (dimInfo) { event.preventDefault(); return showDimInfo(dimInfo.dataset.dimInfo, dimInfo); } if (event.target.closest('[data-drink-feature-dismiss]')) { writeLocalFlag('coffee-vault-hint-drink-features'); return renderDrinkFeatureHint(state.editingDrinkId ? state.drinkLogs.find((item) => item.id === state.editingDrinkId) : null); } const assistButton = event.target.closest('[data-start-brew-assist]'); if (assistButton) return openDrinkBrewAssist(); const lastButton = event.target.closest('[data-use-last-brew]'); if (lastButton) { const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); return applyLastBrew(state.drinkLogs.find((log) => log.id === lastButton.dataset.useLastBrew), bean); } const planButton = event.target.closest('[data-drink-plan]'); if (planButton) { const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); return chooseDrinkPlan(planButton.dataset.drinkPlan, bean); } const openStep = event.target.closest('[data-drink-step-open]'); if (openStep) { state.activeDrinkStepIndex = Number(openStep.dataset.drinkStepOpen); return renderDrinkSteps(readDrinkSteps()); } const removeStep = event.target.closest('[data-remove-drink-step]'); if (removeStep) { const rows = readDrinkSteps(); rows.splice(Number(removeStep.dataset.removeDrinkStep), 1); state.activeDrinkStepIndex = Math.max(0, Math.min(state.activeDrinkStepIndex, rows.length - 1)); return renderDrinkSteps(rows); } const button = event.target.closest('[data-rate]'); if (!button) return; const row = button.parentElement; const clicked = Number(button.dataset.rate); const next = Number(row.dataset.value) === clicked ? null : clicked; renderRating(row, row.dataset.ratingName, next, row.dataset.ratingName === 'bitterness'); }); $('#addDrinkStep').addEventListener('click', addDrinkStep); $('#drink-grams').addEventListener('change', scaleDrinkStepsToDose); $('#drink-param-dose').addEventListener('change', scaleDrinkStepsToDose); $('#drink-grams').addEventListener('input', () => { $('#drink-param-dose').value = $('#drink-grams').value; syncDrinkTotalWater(); }); $('#drink-param-dose').addEventListener('input', syncDrinkTotalWater); $('#drink-param-totalWater').addEventListener('input', syncDrinkRatioFromWater); ['drink-ratio-left', 'drink-ratio-right'].forEach((id) => $(`#${id}`).addEventListener('input', () => { syncRatioValue('drink'); syncDrinkTotalWater(); })); $$('.duration-field', els.drinkForm).forEach((field) => field.addEventListener('input', () => syncDurationField(field))); $('#drink-method').addEventListener('change', () => { const custom = $('#drink-method-custom'); custom.hidden = $('#drink-method').value !== '__custom__'; if (!custom.hidden) custom.focus(); syncChoiceTrigger($('#drink-method')); $('#drink-plan-id').value = ''; syncDrinkParamFields(); syncDrinkTotalWater(); const bean = state.beans.find((item) => item.id === $('#drink-beanId').value); if (bean) renderDrinkPlanPicker(bean, null); });
    $('#drink-cafeName').addEventListener('input', () => { renderCafeSuggestions(); renderDrinkNameSuggestions(); });
    $('#drink-drinkName').addEventListener('input', renderDrinkNameSuggestions);
    // 包一层：input 事件会把 Event 当首参传入，直接传函数会让 showRecent 恒为真。
    $('#drink-location').addEventListener('input', () => renderLocationSuggestions());
    $('#drinkLocationSuggestions').addEventListener('click', (event) => { const choice = event.target.closest('[data-drink-location]'); if (!choice) return; $('#drink-location').value = choice.dataset.drinkLocation; renderLocationSuggestions(true); $('#drink-location').focus(); });
    $('#drinkCafeSuggestions').addEventListener('click', (event) => { const choice = event.target.closest('[data-cafe-name]'); if (!choice) return; $('#drink-cafeName').value = choice.dataset.cafeName; renderCafeSuggestions(); renderDrinkNameSuggestions(); $('#drink-cafeName').focus(); });
    $('#drinkNameSuggestions').addEventListener('click', (event) => { const choice = event.target.closest('[data-drink-name]'); if (!choice) return; $('#drink-drinkName').value = choice.dataset.drinkName; renderDrinkNameSuggestions(); $('#drink-drinkName').focus(); });
    $('#drinkSourceFilters').addEventListener('click', (event) => { const chip = event.target.closest('.chip'); if (!chip) return; state.drinkSource = chip.dataset.value; state.drinkVisibleLimit = DRINK_PAGE_SIZE; renderDrinks(); });
    $('#statusFilters').addEventListener('click', (event) => { const chip = event.target.closest('.chip'); if (!chip) return; $$('.chip', $('#statusFilters')).forEach((node) => node.classList.remove('active')); chip.classList.add('active'); state.status = chip.dataset.value; renderBeans(); }); $('#planMethodFilters').addEventListener('click', (event) => { const chip = event.target.closest('.chip'); if (!chip) return; state.planMethod = chip.dataset.value; renderBrewPlans(); }); $$('.sort-button').forEach((button) => button.addEventListener('click', () => { $$('.sort-button').forEach((node) => node.classList.remove('active')); button.classList.add('active'); state.sort = button.dataset.sort; renderBeans(); })); $('#sortDirection').addEventListener('click', () => { state.direction = state.direction === 'desc' ? 'asc' : 'desc'; $('#sortDirection').textContent = state.direction === 'desc' ? '↓' : '↑'; renderBeans(); }); $('#searchToggle').addEventListener('click', () => { els.searchPanel.hidden = false; $('#searchToggle').setAttribute('aria-expanded', 'true'); els.search.focus(); }); els.search.addEventListener('input', () => { state.query = els.search.value; state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); }); $('#searchClear').addEventListener('click', () => { els.search.value = ''; state.query = ''; state.drinkVisibleLimit = DRINK_PAGE_SIZE; els.searchPanel.hidden = true; $('#searchToggle').setAttribute('aria-expanded', 'false'); render(); });
    setupSmartSelects(); setupPlanSmartSelects(); syncAllChoiceTriggers(); $$('.picker-control').forEach((input) => input.addEventListener('click', () => openDatePicker(input))); $('#choiceList').addEventListener('click', (event) => { const drinkChoice = event.target.closest('[data-drink-choice]'); if (drinkChoice && !drinkChoice.disabled) { setDialog(els.choice, false); return drinkChoice.dataset.drinkChoice === 'external' ? openExternalDrinkDialog() : openBeanPickerForDrink(); } const drinkBean = event.target.closest('[data-drink-bean]'); if (drinkBean) { const bean = state.beans.find((item) => item.id === drinkBean.dataset.drinkBean); setDialog(els.choice, false); if (bean) openDrinkDialog(bean); return; } chooseOption(event); }); $('#choiceClose').addEventListener('click', () => setDialog(els.choice, false)); $('#datePickerClose').addEventListener('click', () => setDialog(els.datePicker, false)); $('#datePickerCancel').addEventListener('click', () => setDialog(els.datePicker, false)); $('#datePickerConfirm').addEventListener('click', confirmDatePicker); $('#datePickerClear').addEventListener('click', clearDatePicker); $('#calendarPrev').addEventListener('click', () => shiftCalendar(-1)); $('#calendarNext').addEventListener('click', () => shiftCalendar(1)); $('#calendarDays').addEventListener('click', chooseCalendarDay); $$('[data-manage]').forEach((button) => button.addEventListener('click', () => openManager(button.dataset.manage))); $('#managerClose').addEventListener('click', () => setDialog(els.manager, false)); $('#managerList').addEventListener('click', managerAction);
    $('#profileOpen').addEventListener('click', openPersonal); $('#personalClose').addEventListener('click', () => setDialog(els.personal, false)); $('#coffeeCalendarOpen').addEventListener('click', () => openCoffeeCalendar('month')); $('#insightsOpen').addEventListener('click', openInsights); $('#personalInsightsOpen').addEventListener('click', () => openInsightsFromPersonal(() => insightsUi.open())); $('#personalCatalogOpen').addEventListener('click', () => openInsightsFromPersonal(() => insightsUi.openCatalog())); $('#personalReportsOpen').addEventListener('click', () => openInsightsFromPersonal(() => insightsUi.openReports())); $('#insightsClose').addEventListener('click', () => insightsUi.close()); els.insights.addEventListener('click', (event) => insightsUi.handleClick(event)); $('#personalSettingsOpen').addEventListener('click', () => { renderSettings(); setDialog(els.settings, true); }); $('#personalSyncOpen').addEventListener('click', () => { renderSyncSettings(); setDialog(els.sync, true); }); $('#dataBackupOpen').addEventListener('click', () => { syncBackupDialog(); setDialog(els.backup, true); }); $('#dataBackupClose').addEventListener('click', () => setDialog(els.backup, false));
    $('#calendarClose').addEventListener('click', () => setDialog(els.calendar, false)); $('#calendarShare').addEventListener('click', shareCalendarCard); $$('[data-calendar-view]').forEach((button) => button.addEventListener('click', () => { state.coffeeCalendarView = button.dataset.calendarView; renderCoffeeCalendar(); })); $('#calendarPrevMonth').addEventListener('click', () => shiftCoffeeMonth(-1)); $('#calendarNextMonth').addEventListener('click', () => shiftCoffeeMonth(1)); $('#calendarPrevYear').addEventListener('click', () => shiftCoffeeYear(-1)); $('#calendarNextYear').addEventListener('click', () => shiftCoffeeYear(1)); els.calendar.addEventListener('click', (event) => { if (cardPressFired) { cardPressFired = false; return; } const day = event.target.closest('[data-calendar-day]'); if (day) { state.selectedCoffeeDay = day.dataset.calendarDay; state.coffeeCalendarDate = dateFromKey(state.selectedCoffeeDay); renderCoffeeCalendar(); return; } const yearDay = event.target.closest('[data-year-day]'); if (yearDay) { state.selectedCoffeeDay = yearDay.dataset.yearDay; state.coffeeCalendarDate = dateFromKey(state.selectedCoffeeDay); renderCoffeeCalendar(); return; } const logItem = event.target.closest('[data-log-id]'); if (logItem) openDrinkDetail(state.drinkLogs.find((log) => log.id === logItem.dataset.logId)); if (event.target.closest('#calendarSeeLogs')) { setDialog(els.calendar, false); state.view = 'drinks'; state.drinkVisibleLimit = DRINK_PAGE_SIZE; render(); } });
    $('#settingsClose').addEventListener('click', () => setDialog(els.settings, false)); $$('[data-theme-value]').forEach((button) => button.addEventListener('click', () => applyTheme(button.datasetThemeValue || button.dataset.themeValue, true))); $('#settingQuickGrams').addEventListener('change', saveSettingsFromUi); $('#settingFlavorReminderDays').addEventListener('change', saveSettingsFromUi); $('#settingLowStockCups').addEventListener('change', saveSettingsFromUi); $('#settingBrewPlans').addEventListener('change', saveSettingsFromUi); $('#settingBeanPhotos').addEventListener('change', saveSettingsFromUi); $('#settingPhotoJournal').addEventListener('change', saveSettingsFromUi); $('#settingPriceUnit').addEventListener('change', () => { syncChoiceTrigger($('#settingPriceUnit')); saveSettingsFromUi(); }); $('#settingAdvanced').addEventListener('change', () => { $('#dimensionSection').hidden = !$('#settingAdvanced').checked; saveSettingsFromUi(); }); $('#dimensionSettings').addEventListener('click', (event) => { const dimInfo = event.target.closest('[data-dim-info]'); if (dimInfo) { event.preventDefault(); showDimInfo(dimInfo.dataset.dimInfo, dimInfo); } }); $('#dimensionSettings').addEventListener('change', saveSettingsFromUi); $('#syncClose').addEventListener('click', () => setDialog(els.sync, false)); $('#syncLoginOpen').addEventListener('click', () => openSyncAuth('login')); $('#syncAuthClose').addEventListener('click', syncAuthBack); $$('[data-sync-auth-mode]').forEach((button) => button.addEventListener('click', () => setSyncAuthMode(button.dataset.syncAuthMode))); $('#syncAuthSubmit').addEventListener('click', syncAuthSubmit); $('#syncLogout').addEventListener('click', syncLogout); $('#syncDeleteAccount').addEventListener('click', syncDeleteAccount); $('#syncEnabled').addEventListener('change', syncToggle); $('#syncNow').addEventListener('click', syncNow); $('#syncCopyRecovery').addEventListener('click', copyRecoveryCode); $('#aboutOpen').addEventListener('click', showAbout); $('#aboutClose').addEventListener('click', () => setDialog(els.about, false)); $('#aboutCheckUpdate').addEventListener('click', checkForUpdates); $('#aboutOpenReleases').addEventListener('click', openReleasePage); $('#aboutDownloadUpdate').addEventListener('click', openUpdateDownload); $$('[data-export-scope]').forEach((button) => button.addEventListener('click', () => exportBackup(button.dataset.exportScope))); $$('[data-import-scope]').forEach((button) => button.addEventListener('click', () => startImport(button.dataset.importScope))); $('#webImportInput').addEventListener('change', webImport); $('#migrationLater').addEventListener('click', () => setDialog(els.migration, false)); $('#migrationNow').addEventListener('click', migrateLegacy);
    $('#brewAssistStop').addEventListener('click', cancelBrewAssist); $('#brewAssistPause').addEventListener('click', pauseBrewAssist); $('#brewAssistRing').addEventListener('click', tapBrewAssistRing); $('#brewAssistRing').addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); tapBrewAssistRing(); } }); $('#brewAssistSkip').addEventListener('click', skipBrewAssistStage); $('#brewAssistFinish').addEventListener('click', finishBrewAssist);
    $('#sharePreviewClose').addEventListener('click', closeSharePreview); $('#sharePreviewCancel').addEventListener('click', closeSharePreview); $('#sharePreviewSave').addEventListener('click', saveShareCard); $('#sharePreviewShare').addEventListener('click', confirmShareCard);
    $('#confirmCancel').addEventListener('click', () => resolveConfirm(false)); $('#confirmAccept').addEventListener('click', () => resolveConfirm(true)); els.confirm.addEventListener('close', () => resolveConfirm(false));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (els.brewAssist.open && state.brewAssist && !state.brewAssist.completed) requestWakeLock(); scheduleAutoSync(); updateFabInset(); syncFloatingActions({ delay: 1800 }); });
    window.addEventListener('scroll', () => { if (!floatingActionsActive()) return; expandFloatingActions({ delay: 1600 }); clearTimeout(fabScrollTimer); fabScrollTimer = setTimeout(() => scheduleFloatingActionCollapse(900), 160); }, { passive: true });
    updateFabInset();
    window.addEventListener('resize', updateFabInset);
    window.addEventListener('orientationchange', updateFabInset);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updateFabInset);
    setInterval(updateFabInset, 300);
    [els.personal, els.backup, els.calendar, els.insights, els.detail, els.drinkDetail, els.planDetail, els.planEditor, els.editor, els.drink, els.brewAssist, els.choice, els.datePicker, els.photoSource, els.scanImage, els.imagePreview, els.shareChoice, els.drinkShareChoice, els.sharePreview, els.confirm, els.manager, els.settings, els.sync, els.syncAuth, els.about].forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog === els.brewAssist ? cancelBrewAssist() : dialog === els.sharePreview ? closeSharePreview() : dialog === els.drink ? (discardDrinkPhotoDraft(), dialog.close()) : dialog.close(); }));
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
    // keepForm：自动同步是后台行为，不能拿库里的旧值覆盖用户正在编辑、尚未保存的表单（含刚添加的图片）。
    try { const result = await cloudSync.sync(); if (result && !result.skipped) { await reload({ keepForm: true }); if (els.sync.open) renderSyncSettings(); } }
    catch (error) { console.error(error); }
    finally { autoSyncing = false; state.syncBusy = false; if (els.sync.open) renderSyncSettings(); }
  }
  function scheduleAutoSync(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(autoSync, delay == null ? 800 : delay); }
  function closeNumberInputOrTopLayer() { if (AppNumberInput.isOpen()) return AppNumberInput.close(false); return closeTopLayerOrExit(); }
  function bindNativeLifecycle() { const app = capPlugin('App'); if (!app) return; app.addListener('backButton', closeNumberInputOrTopLayer); app.addListener('appUrlOpen', ({ url }) => handleWidgetUrl(url)); app.addListener('appStateChange', async ({ isActive }) => { if (!isActive || state.resuming) return; state.resuming = true; await reload({ keepForm: true }); state.resuming = false; scheduleAutoSync(); }); }
  async function boot() { applyTheme(localStorage.getItem('coffee-vault-theme') || 'dark-roast', false); bindEvents(); try { await BeanRepository.init(); await reload(); bindNativeLifecycle(); await offerMigration(); state.initialized = true; const app = capPlugin('App'); if (app && app.getLaunchUrl) { const launch = await app.getLaunchUrl(); if (launch && launch.url) handleWidgetUrl(launch.url); } syncFloatingActions({ showHint: true }); scheduleAutoSync(1500); } catch (error) { console.error(error); els.count.textContent = '豆仓启动失败'; toast(error.message || '数据库初始化失败'); } finally { const splash = capPlugin('SplashScreen'); if (splash) splash.hide().catch(() => {}); } }
  boot();
})();
