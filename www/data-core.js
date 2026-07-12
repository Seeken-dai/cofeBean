(function (root, factory) {
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const syncCompare = isCommonJs ? require('./sync-compare.js') : root.BeanSyncCompare;
  const api = factory(syncCompare);
  if (isCommonJs) module.exports = api;
  root.BeanCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (syncCompare) {
  'use strict';

  if (!syncCompare || typeof syncCompare.compareSyncRecords !== 'function') {
    throw new Error('缺少 BeanSyncCompare:sync-compare.js 必须先于 data-core.js 加载');
  }

  const SCHEMA_VERSION = 7;
  const DIMENSION_KEYS = ['aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness'];
  const BREW_METHODS = ['手冲', '冷萃', '冰滴', '意式', '法压', '摩卡壶', '爱乐压', '聪明杯', '虹吸', '自定义'];
  const PLAN_SOURCES = new Set(['user', 'preset', 'copy']);
  const PLAN_FIELD_KEYS = [
    'dose', 'liquid', 'waterTemp', 'grinder', 'grindSetting', 'ratio', 'totalWater',
    'targetDuration', 'steepTime', 'steepEnvironment', 'coffeeMachine', 'basket',
    'targetYield', 'targetExtractionTime', 'pressTime', 'mokaPotSize', 'useHotWater',
    'heatLevel', 'customMethod'
  ];
  // 分享码字段映射：长字段名 -> 短字段名。encode/decode 共用此唯一来源，禁止两侧各自手写短名。
  // steps 固定为四元组 [label, water, startTime, endTime]，顺序即格式契约，不可调整。
  const PLAN_SHARE_PREFIX = 'DC1-';
  const PLAN_SHARE_MAX_BODY = 6000; // base64url 正文长度上限，约对应 4KB 原文，超长直接拒绝
  const PLAN_SHARE_FIELD_MAP = Object.freeze({
    name: 'n', brewMethod: 'm', dose: 'd', liquid: 'lq', waterTemp: 'wt', grinder: 'g',
    grindSetting: 'gs', ratio: 'r', totalWater: 'tw', targetDuration: 'td', steepTime: 'st',
    steepEnvironment: 'se', coffeeMachine: 'cm', basket: 'bk', targetYield: 'ty',
    targetExtractionTime: 'te', pressTime: 'pt', mokaPotSize: 'mp', useHotWater: 'hw',
    heatLevel: 'hl', customMethod: 'cu', steps: 's'
  });
  const PLAN_SHARE_SHORT_TO_LONG = Object.freeze(Object.fromEntries(
    Object.entries(PLAN_SHARE_FIELD_MAP).map(([long, short]) => [short, long])
  ));
  const DEFAULT_SETTINGS = Object.freeze({
    quickGrams: 15,
    enableBrewPlans: false,
    advancedRatings: false,
    enabledDimensions: DIMENSION_KEYS.slice(),
    lastBrewMethod: '手冲',
    priceUnit: 'g',
    theme: 'dark-roast',
    showBeanPhotosInList: false,
    photoJournal: false,
    flavorReminderDays: 7,
    lowStockCups: 4
  });
  const STATUS_ORDER = ['饮用中', '未开封', '已喝完'];
  const ALLOWED_STATUS = new Set(['未开封', '饮用中', '已喝完']);
  const ALLOWED_ROAST = new Set(['浅烘', '中浅烘', '中烘', '中深烘', '深烘']);
  const TEXT_FIELDS = ['name', 'roaster', 'origin', 'process', 'roastDate', 'openedDate', 'purchaseDate', 'purchaseUrl', 'tastingNotes', 'status', 'roastLevel', 'bagImagePath', 'labelImagePath'];
  const NUMBER_FIELDS = ['initialWeight', 'remainingWeight', 'price', 'bestFlavorDays'];
  const SEARCH_FIELDS = ['name', 'roaster', 'origin', 'process', 'tastingNotes'];
  const PRESET_BREW_PLANS = Object.freeze([
    {
      id: 'preset-46-method',
      name: '四六法',
      brewMethod: '手冲',
      source: 'preset',
      dose: 20,
      liquid: 300,
      totalWater: 300,
      ratio: '1:15',
      waterTemp: '92°C',
      targetDuration: '3:30',
      steps: [
        { label: '闷蒸', water: 60, time: '0:00-0:45' },
        { label: '第 1 段', water: 60, time: '0:45-1:30' },
        { label: '第 2 段', water: 60, time: '1:30-2:15' },
        { label: '第 3 段', water: 60, time: '2:15-3:00' },
        { label: '第 4 段', water: 60, time: '3:00-3:30' }
      ],
      notes: '用五段等量注水控制甜感与层次。'
    },
    {
      id: 'preset-single-pour',
      name: '一刀流',
      brewMethod: '手冲',
      source: 'preset',
      dose: 15,
      liquid: 225,
      totalWater: 225,
      ratio: '1:15',
      waterTemp: '91°C',
      targetDuration: '2:00-2:30',
      steps: [
        { label: '闷蒸', water: 30, time: '0:00-0:30' },
        { label: '第 1 段', water: 195, time: '0:30-1:20' }
      ],
      notes: '闷蒸后一次注至目标水量，适合稳定快速复现。'
    },
    {
      id: 'preset-three-pour',
      name: '三段式',
      brewMethod: '手冲',
      source: 'preset',
      dose: 15,
      liquid: 225,
      totalWater: 225,
      ratio: '1:15',
      waterTemp: '92°C',
      targetDuration: '2:30-3:00',
      steps: [
        { label: '闷蒸', water: 30, time: '0:00-0:30' },
        { label: '第 1 段', water: 90, time: '0:30-1:15' },
        { label: '第 2 段', water: 105, time: '1:15-2:00' }
      ],
      notes: '三段推进萃取，兼顾香气、甜感和尾段干净度。'
    }
  ]);
  const PRICE_UNITS = Object.freeze({
    g: { label: '每克单价', grams: 1, suffix: '/ g' },
    '50g': { label: '每 50g 单价', grams: 50, suffix: '/ 50g' },
    '100g': { label: '每 100g 单价', grams: 100, suffix: '/ 100g' },
    jin: { label: '每斤单价', grams: 500, suffix: '/ 斤' }
  });
  const PLAN_SHARE_FIELDS = [
    ['dose', '粉量', 'weight'],
    ['totalWater', '目标总水量', 'weight'],
    ['ratio', '粉液比', 'text'],
    ['waterTemp', '水温', 'text'],
    ['grindSetting', '研磨', 'grind'],
    ['targetDuration', '总时长', 'text'],
    ['steepTime', '浸泡', 'text'],
    ['steepEnvironment', '环境', 'text'],
    ['coffeeMachine', '咖啡机', 'text'],
    ['basket', '粉碗', 'text'],
    ['targetYield', '目标出液', 'weight'],
    ['targetExtractionTime', '萃取时间', 'text'],
    ['pressTime', '下压时间', 'text'],
    ['mokaPotSize', '规格', 'text'],
    ['useHotWater', '热水', 'boolean'],
    ['heatLevel', '火力', 'text'],
    ['customMethod', '自定义方式', 'text']
  ];

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength || 5000);
  }

  function cleanNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function cleanBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function normalizePurchaseUrl(value) {
    const text = cleanText(value, 5000);
    const match = text.match(/https?:\/\/[^\s<>"'()[\]，。！？、）】》]+/i);
    if (!match) return '';
    let url = match[0].replace(/[)\]}>,.;!?，。！？；、]+$/u, '');
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      url = parsed.href;
    } catch (_) {
      return '';
    }
    return cleanText(url, 1000);
  }

  function parseAppVersion(value) {
    const text = cleanText(value, 80).replace(/^[vV]\s*/, '');
    if (!/^\d+(?:\.\d+){0,2}$/.test(text)) return null;
    const parts = text.split('.').map((part) => Number(part));
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function compareAppVersions(left, right) {
    const a = parseAppVersion(left);
    const b = parseAppVersion(right);
    if (!a || !b) return null;
    for (let index = 0; index < 3; index += 1) {
      if (a[index] > b[index]) return 1;
      if (a[index] < b[index]) return -1;
    }
    return 0;
  }

  function isAppVersionNewer(remoteVersion, localVersion) {
    return compareAppVersions(remoteVersion, localVersion) > 0;
  }

  function selectReleaseApkAsset(assets) {
    const candidates = (Array.isArray(assets) ? assets : []).filter((asset) => {
      const name = cleanText(asset && asset.name, 240);
      const url = cleanText(asset && asset.browser_download_url, 1000);
      return name && url && /\.apk$/i.test(name) && !/debug/i.test(name);
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const aName = cleanText(a.name, 240);
      const bName = cleanText(b.name, 240);
      const aRelease = /release/i.test(aName) ? 1 : 0;
      const bRelease = /release/i.test(bName) ? 1 : 0;
      if (aRelease !== bRelease) return bRelease - aRelease;
      return aName.localeCompare(bName, 'zh-CN');
    });
    const picked = candidates[0];
    return {
      name: cleanText(picked.name, 240),
      url: cleanText(picked.browser_download_url, 1000),
      size: Math.max(0, Math.round(Number(picked.size) || 0))
    };
  }

  function safeJson(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return fallback; }
    }
    return value;
  }

  function brewAssistDurationText(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
  }

  function formatShareWeight(value) {
    const n = Number(value) || 0;
    return n >= 1000 ? `${Math.round(n / 100) / 10}kg` : `${Math.round(n * 10) / 10}g`;
  }

  function formatShareMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '未记录';
    return `¥${Math.round(n * 100) / 100}`;
  }

  function formatShareUnitPrice(bean, priceUnit) {
    const price = Number(bean && bean.price);
    const grams = Number(bean && bean.initialWeight);
    const unit = PRICE_UNITS[priceUnit] || PRICE_UNITS.g;
    if (!(price > 0) || !(grams > 0)) return '未记录';
    return `¥${(price / grams * unit.grams).toFixed(2)} ${unit.suffix}`;
  }

  function shareDateText(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return cleanText(value, 40);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function parseBrewAssistTime(value) {
    const text = cleanText(value, 40);
    if (!text) return null;
    const match = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return null;
    const seconds = match[3]
      ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
      : Number(match[1]) * 60 + Number(match[2]);
    return Number.isFinite(seconds) ? seconds : null;
  }

  function prepareBrewAssistSteps(steps) {
    let nextStart = 0;
    return (Array.isArray(steps) ? steps : []).map((step, index) => {
      const source = step && typeof step === 'object' ? step : {};
      const parts = cleanText(source.time, 40).split('-').map((part) => part.trim());
      let start = parseBrewAssistTime(source.startTime) ?? parseBrewAssistTime(parts[0]);
      let end = parseBrewAssistTime(source.endTime) ?? parseBrewAssistTime(parts[1]);
      if (start == null) start = nextStart;
      if (end == null || end <= start) end = start + 30;
      nextStart = end;
      return {
        label: cleanText(source.label, 80) || `第 ${index + 1} 段`,
        water: cleanNumber(source.water),
        start,
        end,
        duration: end - start,
        time: `${brewAssistDurationText(start)}-${brewAssistDurationText(end)}`
      };
    }).filter((step) => step.duration > 0);
  }

  function brewAssistStatus(steps, elapsed) {
    const list = prepareBrewAssistSteps(steps);
    const total = list.length ? list[list.length - 1].end : 0;
    // 用原始秒数（不取整）判定所处段落：圆环进度按原始 elapsed 计算，若这里取整会在临界点提前约
    // 0.5 秒切段，导致圆环快到满时被截断、跳切。仅把对外的 elapsed 取整用于文本显示。
    const raw = Math.max(0, Number(elapsed) || 0);
    const seconds = Math.round(raw);
    if (!list.length) return { phase: 'empty', index: -1, total, elapsed: seconds, current: null, next: null };
    if (raw >= total) return { phase: 'done', index: list.length - 1, total, elapsed: seconds, current: list[list.length - 1], next: null };
    const index = list.findIndex((step) => raw >= step.start && raw < step.end);
    if (index >= 0) return { phase: 'running', index, total, elapsed: seconds, current: list[index], next: list[index + 1] || null };
    // 不落在任何一段内 = 处于两段之间（或首段之前）的等待间奏（方案显式留了时间空档）。
    const nextIndex = list.findIndex((step) => step.start > raw);
    const prevIndex = nextIndex - 1;
    return { phase: 'gap', index: prevIndex, total, elapsed: seconds, current: list[prevIndex] || null, next: list[nextIndex], gapStart: prevIndex >= 0 ? list[prevIndex].end : 0, gapEnd: list[nextIndex].start };
  }

  // 首次为某支豆记录喝一杯时回填开封日期：仅在为空时用「本次饮用时间」的日期，不覆盖已有值。
  function resolveOpenedDate(bean, log) {
    const existing = cleanText(bean && bean.openedDate, 40);
    if (existing) return existing;
    const consumed = cleanText(log && log.consumedAt, 40);
    const match = consumed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function normalizeBean(input, now) {
    const source = input && typeof input === 'object' ? input : {};
    const bean = {};
    TEXT_FIELDS.forEach((field) => { bean[field] = cleanText(source[field]); });
    NUMBER_FIELDS.forEach((field) => { bean[field] = cleanNumber(source[field]); });
    bean.name = cleanText(source.name, 120);
    bean.roaster = cleanText(source.roaster, 120);
    bean.origin = cleanText(source.origin, 120);
    bean.process = cleanText(source.process, 120);
    bean.purchaseUrl = normalizePurchaseUrl(source.purchaseUrl);
    bean.tastingNotes = cleanText(source.tastingNotes, 4000);
    bean.bagImagePath = cleanText(source.bagImagePath, 1000);
    bean.labelImagePath = cleanText(source.labelImagePath, 1000);
    bean.bestFlavorDays = bean.bestFlavorDays == null ? null : Math.min(3650, Math.max(1, Math.round(bean.bestFlavorDays)));
    bean.status = ALLOWED_STATUS.has(bean.status) ? bean.status : '未开封';
    bean.roastLevel = ALLOWED_ROAST.has(bean.roastLevel) ? bean.roastLevel : '';
    bean.favorite = source.favorite === true || source.favorite === 1 || source.favorite === '1';
    bean.id = cleanText(source.id, 100) || makeId();
    const stamp = now || new Date().toISOString();
    bean.createdAt = cleanText(source.createdAt, 40) || stamp;
    bean.updatedAt = cleanText(source.updatedAt, 40) || stamp;
    bean.revision = Math.max(1, Math.round(Number(source.revision) || 1));
    bean.deviceId = cleanText(source.deviceId, 100);
    bean.deletedAt = cleanText(source.deletedAt, 40) || null;
    return bean;
  }

  function cleanRating(value) {
    if (value === '' || value == null) return null;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }

  function hasTastingContent(input) {
    const source = input && typeof input === 'object' ? input : {};
    const photos = safeJson(source.photos, []);
    return Boolean(cleanRating(source.overallRating)
      || cleanText(source.notes, 2000)
      || (Array.isArray(photos) && photos.some(Boolean))
      || DIMENSION_KEYS.some((key) => cleanRating(source[key])));
  }

  function resolveTastingStatus(input, context) {
    const source = input && typeof input === 'object' ? input : {};
    const options = context && typeof context === 'object' ? context : {};
    if (options.forcePending) return 'pending';
    if (options.completing) return 'completed';
    const hasContent = hasTastingContent(source);
    if (options.existingStatus === 'pending') return hasContent ? 'completed' : 'pending';
    return options.isNew && source.brewPlanId && !hasContent ? 'pending' : 'completed';
  }

  function normalizeDrinkLog(input, now) {
    const source = input && typeof input === 'object' ? input : {};
    const stamp = now || new Date().toISOString();
    const logSource = source.source === 'external' ? 'external' : 'bean';
    const photos = safeJson(source.photos, []);
    const log = {
      id: cleanText(source.id, 100) || makeId(),
      beanId: logSource === 'external' ? null : (cleanText(source.beanId, 100) || null),
      beanName: cleanText(source.beanName, 120) || '已删除的咖啡豆',
      grams: logSource === 'external' ? 0 : cleanNumber(source.grams),
      brewMethod: logSource === 'external' ? '' : (cleanText(source.brewMethod, 80) || '手冲'),
      brewPlanId: cleanText(source.brewPlanId, 100) || null,
      brewPlanVersion: cleanNumber(source.brewPlanVersion),
      brewPlanName: cleanText(source.brewPlanName, 120),
      brewPlanSnapshot: normalizePlanSnapshot(source.brewPlanSnapshot),
      photos: (Array.isArray(photos) ? photos : []).map((path) => cleanText(path, 1000)).filter(Boolean).slice(0, 3),
      source: logSource,
      cafeName: cleanText(source.cafeName, 120),
      drinkName: cleanText(source.drinkName, 120),
      price: cleanNumber(source.price),
      location: cleanText(source.location, 120),
      tastingStatus: source.tastingStatus === 'pending' ? 'pending' : 'completed',
      overallRating: cleanRating(source.overallRating),
      notes: cleanText(source.notes, 2000),
      consumedAt: cleanText(source.consumedAt, 40) || stamp,
      createdAt: cleanText(source.createdAt, 40) || stamp,
      updatedAt: cleanText(source.updatedAt, 40) || stamp,
      revision: Math.max(1, Math.round(Number(source.revision) || 1)),
      deviceId: cleanText(source.deviceId, 100),
      deletedAt: cleanText(source.deletedAt, 40) || null
    };
    if (log.source === 'external') {
      log.beanName = log.drinkName || log.cafeName || '外饮咖啡';
      log.brewPlanId = null;
      log.brewPlanVersion = null;
      log.brewPlanName = '';
      log.brewPlanSnapshot = null;
    }
    DIMENSION_KEYS.forEach((key) => { log[key] = cleanRating(source[key]); });
    return log;
  }

  function normalizeStep(input) {
    const source = input && typeof input === 'object' ? input : {};
    const startTime = cleanText(source.startTime, 80);
    const endTime = cleanText(source.endTime, 80);
    return {
      label: cleanText(source.label, 80),
      water: cleanNumber(source.water),
      startTime,
      endTime,
      time: cleanText(source.time, 80) || [startTime, endTime].filter(Boolean).join('-'),
      note: cleanText(source.note, 300)
    };
  }

  function normalizeBrewPlan(input, now) {
    const source = input && typeof input === 'object' ? input : {};
    const stamp = now || new Date().toISOString();
    const plan = {
      id: cleanText(source.id, 100) || makeId('plan'),
      name: cleanText(source.name, 120) || '未命名方案',
      brewMethod: cleanText(source.brewMethod, 80) || '手冲',
      version: Math.max(1, Math.round(Number(source.version) || 1)),
      source: PLAN_SOURCES.has(source.source) ? source.source : 'user',
      beanIds: Array.isArray(source.beanIds) ? [...new Set(source.beanIds.map((id) => cleanText(id, 100)).filter(Boolean))] : [],
      steps: Array.isArray(source.steps) ? source.steps.map(normalizeStep).filter((step) => step.label || step.water || step.time || step.note) : [],
      notes: cleanText(source.notes, 3000),
      createdAt: cleanText(source.createdAt, 40) || stamp,
      updatedAt: cleanText(source.updatedAt, 40) || stamp,
      revision: Math.max(1, Math.round(Number(source.revision) || 1)),
      deviceId: cleanText(source.deviceId, 100),
      deletedAt: cleanText(source.deletedAt, 40) || null
    };
    PLAN_FIELD_KEYS.forEach((key) => {
      if (['dose', 'liquid', 'totalWater', 'targetYield'].includes(key)) plan[key] = cleanNumber(source[key]);
      else if (key === 'useHotWater') plan[key] = cleanBoolean(source[key]);
      else plan[key] = cleanText(source[key], key === 'customMethod' ? 80 : 300);
    });
    if (!BREW_METHODS.includes(plan.brewMethod)) plan.brewMethod = plan.brewMethod || '自定义';
    if (!plan.totalWater && plan.dose && plan.ratio) plan.totalWater = waterFromRatio(plan.dose, plan.ratio);
    return plan;
  }

  function normalizePlanSnapshot(input) {
    const raw = safeJson(input, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return normalizeBrewPlan(raw, raw.updatedAt);
  }

  function waterFromRatio(dose, ratio) {
    const match = String(ratio || '').match(/1\s*[:：]\s*(\d+(?:\.\d+)?)/);
    const n = match ? Number(match[1]) : null;
    return n && Number(dose) > 0 ? Math.round(Number(dose) * n * 10) / 10 : null;
  }

  function planSnapshot(plan) {
    return plan ? normalizeBrewPlan(plan, plan.updatedAt) : null;
  }

  function utf8ToBase64Url(text) {
    const bytes = unescape(encodeURIComponent(String(text)));
    const base64 = typeof btoa === 'function'
      ? btoa(bytes)
      : Buffer.from(bytes, 'binary').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToUtf8(code) {
    const base64 = String(code).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    return decodeURIComponent(escape(bytes));
  }

  function crc32Hex(text) {
    let crc = 0xffffffff;
    for (let i = 0; i < text.length; i += 1) {
      crc ^= text.charCodeAt(i) & 0xff;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  }

  function planShareValue(value) {
    if (value === undefined || value === null || value === '' || value === false) return undefined;
    return value;
  }

  function encodePlanShare(planInput) {
    const plan = normalizeBrewPlan(planInput || {}, planInput && planInput.updatedAt);
    const compact = {};
    Object.entries(PLAN_SHARE_FIELD_MAP).forEach(([long, short]) => {
      if (long === 'steps') return;
      const value = planShareValue(plan[long]);
      if (value !== undefined) compact[short] = value;
    });
    const steps = (plan.steps || [])
      .map((step) => [cleanText(step.label, 80), cleanNumber(step.water) || 0, cleanText(step.startTime, 80), cleanText(step.endTime, 80)])
      .filter((tuple) => tuple[0] || tuple[1] || tuple[2] || tuple[3]);
    if (steps.length) compact[PLAN_SHARE_FIELD_MAP.steps] = steps;
    const body = utf8ToBase64Url(JSON.stringify(compact));
    return PLAN_SHARE_PREFIX + crc32Hex(body) + body;
  }

  function decodePlanShare(code) {
    const text = typeof code === 'string' ? code.trim() : '';
    if (!text.startsWith(PLAN_SHARE_PREFIX)) throw new Error('不是有效的豆仓分享码');
    const rest = text.slice(PLAN_SHARE_PREFIX.length);
    if (rest.length <= 8) throw new Error('分享码不完整或已损坏');
    const checksum = rest.slice(0, 8);
    const body = rest.slice(8);
    if (body.length > PLAN_SHARE_MAX_BODY) throw new Error('分享码内容过长');
    if (crc32Hex(body) !== checksum) throw new Error('分享码不完整或已损坏');
    let raw;
    try {
      raw = JSON.parse(base64UrlToUtf8(body));
    } catch (_) {
      throw new Error('分享码内容无法解析');
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('分享码中没有有效的方案');
    const draft = {};
    Object.entries(raw).forEach(([short, value]) => {
      const long = PLAN_SHARE_SHORT_TO_LONG[short];
      if (!long) return; // 忽略旧版未知字段，不致整体失败
      if (long === 'steps') {
        if (!Array.isArray(value)) return;
        draft.steps = value.filter(Array.isArray).map((tuple) => ({
          label: tuple[0], water: tuple[1], startTime: tuple[2], endTime: tuple[3]
        }));
      } else {
        draft[long] = value;
      }
    });
    if (!draft.name && !draft.brewMethod && !(draft.steps && draft.steps.length)) {
      throw new Error('分享码中没有有效的方案');
    }
    // 始终生成全新本地方案：不携带原 id / beanIds / 时间戳，来源标记为用户方案。
    return normalizeBrewPlan({
      name: draft.name,
      brewMethod: draft.brewMethod,
      steps: draft.steps,
      ...Object.fromEntries(PLAN_FIELD_KEYS.map((key) => [key, draft[key]])),
      source: 'user'
    });
  }

  function cloneBrewPlan(plan, overrides) {
    const source = normalizeBrewPlan(plan);
    return normalizeBrewPlan({
      ...source,
      ...(overrides || {}),
      id: overrides && overrides.id ? overrides.id : makeId('plan'),
      version: 1,
      source: overrides && overrides.source ? overrides.source : 'copy',
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  function presetBrewPlans(now) {
    return PRESET_BREW_PLANS.map((plan) => normalizeBrewPlan(plan, now || '2026-01-01T00:00:00.000Z'));
  }

  function summarizeBrewPlans(plans) {
    const list = (plans || []).map((plan) => normalizeBrewPlan(plan, plan.updatedAt));
    const beanIds = new Set();
    list.forEach((plan) => plan.beanIds.forEach((id) => beanIds.add(id)));
    const recent = list.slice().sort((a, b) => cleanText(b.updatedAt).localeCompare(cleanText(a.updatedAt)))[0] || null;
    return { total: list.length, boundBeans: beanIds.size, recent };
  }

  function recommendBrewPlans(plans, beanId, method) {
    const wantedMethod = cleanText(method, 80);
    const list = (plans || []).map((plan) => normalizeBrewPlan(plan, plan.updatedAt)).filter((plan) => !wantedMethod || plan.brewMethod === wantedMethod);
    return list.sort((a, b) => {
      const ab = beanId && a.beanIds.includes(beanId) ? 0 : 1;
      const bb = beanId && b.beanIds.includes(beanId) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return cleanText(b.updatedAt).localeCompare(cleanText(a.updatedAt));
    });
  }

  function normalizeSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const quick = Number(source.quickGrams);
    const enabled = Array.isArray(source.enabledDimensions)
      ? source.enabledDimensions.filter((key) => DIMENSION_KEYS.includes(key))
      : DEFAULT_SETTINGS.enabledDimensions.slice();
    return {
      quickGrams: Number.isFinite(quick) ? Math.min(100, Math.max(1, Math.round(quick * 10) / 10)) : DEFAULT_SETTINGS.quickGrams,
      enableBrewPlans: source.enableBrewPlans === true || source.enableBrewPlans === 1 || source.enableBrewPlans === '1',
      advancedRatings: source.advancedRatings === true || source.advancedRatings === 1 || source.advancedRatings === '1',
      enabledDimensions: Array.isArray(source.enabledDimensions) ? [...new Set(enabled)] : DEFAULT_SETTINGS.enabledDimensions.slice(),
      lastBrewMethod: cleanText(source.lastBrewMethod, 80) || DEFAULT_SETTINGS.lastBrewMethod,
      priceUnit: ['g', '50g', '100g', 'jin'].includes(source.priceUnit) ? source.priceUnit : DEFAULT_SETTINGS.priceUnit,
      theme: ['dark-roast', 'frost', 'obsidian', 'blaze'].includes(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
      showBeanPhotosInList: source.showBeanPhotosInList === true || source.showBeanPhotosInList === 1 || source.showBeanPhotosInList === '1',
      photoJournal: cleanBoolean(source.photoJournal),
      flavorReminderDays: cleanNumber(source.flavorReminderDays) == null ? DEFAULT_SETTINGS.flavorReminderDays : Math.min(60, Math.max(0, Math.round(Number(source.flavorReminderDays)))),
      lowStockCups: cleanNumber(source.lowStockCups) == null ? DEFAULT_SETTINGS.lowStockCups : Math.min(20, Math.max(1, Math.round(Number(source.lowStockCups))))
    };
  }

  function consumptionResult(remaining, initialWeight, delta) {
    const current = Number(remaining) || 0;
    const change = Number(delta) || 0;
    if (change > current) throw new Error('本次用量超过剩余克数');
    let next = Math.max(0, current - change);
    const initial = Number(initialWeight);
    if (Number.isFinite(initial) && initial >= 0) next = Math.min(initial, next);
    return Math.round(next * 1000) / 1000;
  }

  function makeId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return (prefix || 'bean') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeExportScope(scope) {
    return ['all', 'library', 'brewPlans'].includes(scope) ? scope : 'all';
  }

  function validateImport(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('备份文件结构不正确');
    const version = Number(payload.schemaVersion) || 1;
    if (version < 1 || version > SCHEMA_VERSION) throw new Error('暂不支持此备份版本');
    const exportScope = normalizeExportScope(payload.exportScope);
    const expectsLibrary = exportScope === 'all' || exportScope === 'library';
    const expectsPlans = exportScope === 'all' || exportScope === 'brewPlans';
    if (expectsLibrary && !Array.isArray(payload.beans)) throw new Error('备份中没有有效的咖啡豆记录');
    if (expectsPlans && !Array.isArray(payload.brewPlans) && exportScope === 'brewPlans') throw new Error('备份中没有有效的冲煮方案');
    const rawBeans = Array.isArray(payload.beans) ? payload.beans : [];
    if (rawBeans.length > 10000) throw new Error('备份记录超过 10000 条限制');
    const ids = new Set();
    const beans = rawBeans.map((raw) => {
      const bean = normalizeBean(raw);
      if (!bean.name) throw new Error('每条记录都必须有豆名');
      if (ids.has(bean.id)) throw new Error('备份包含重复记录 ID');
      ids.add(bean.id);
      return bean;
    });
    if (version === 1) return { schemaVersion: 1, exportScope: 'all', beans, drinkLogs: [], brewPlans: [], settings: null };
    const rawLogs = expectsLibrary && Array.isArray(payload.drinkLogs) ? payload.drinkLogs : [];
    const rawPlans = expectsPlans && Array.isArray(payload.brewPlans) ? payload.brewPlans : [];
    if (beans.length + rawLogs.length + rawPlans.length > 10000) throw new Error('备份记录超过 10000 条限制');
    const logIds = new Set();
    const drinkLogs = rawLogs.map((raw) => {
      const log = normalizeDrinkLog(raw, raw && raw.updatedAt);
      if (log.source !== 'external' && !(log.grams > 0)) throw new Error('饮用记录克数必须大于 0');
      if (logIds.has(log.id)) throw new Error('备份包含重复饮用记录 ID');
      logIds.add(log.id);
      return log;
    });
    const planIds = new Set();
    const beanIds = new Set(beans.map((bean) => bean.id));
    const brewPlans = rawPlans.map((raw) => {
      const planBeanIds = expectsLibrary ? (raw.beanIds || []).filter((id) => beanIds.has(id)) : (raw.beanIds || []);
      const plan = normalizeBrewPlan({ ...raw, beanIds: planBeanIds }, raw && raw.updatedAt);
      if (planIds.has(plan.id)) throw new Error('备份包含重复方案 ID');
      planIds.add(plan.id);
      return plan;
    });
    const beanImages = {};
    if (payload.beanImages && typeof payload.beanImages === 'object' && !Array.isArray(payload.beanImages)) {
      beans.forEach((bean) => {
        const entry = payload.beanImages[bean.id];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const next = {};
        ['bag', 'label'].forEach((role) => {
          const image = entry[role];
          if (!image || typeof image !== 'object' || !cleanText(image.data, 20000000)) return;
          next[role] = {
            data: cleanText(image.data, 20000000),
            extension: ['.jpg', '.png', '.webp'].includes(image.extension) ? image.extension : '.jpg',
            mimeType: cleanText(image.mimeType, 80) || 'image/jpeg'
          };
        });
        if (next.bag || next.label) beanImages[bean.id] = next;
      });
    }
    const drinkImages = {};
    if (payload.drinkImages && typeof payload.drinkImages === 'object' && !Array.isArray(payload.drinkImages)) {
      drinkLogs.forEach((log) => {
        const entry = payload.drinkImages[log.id];
        if (!Array.isArray(entry)) return;
        const images = entry.map((image) => {
          if (!image || typeof image !== 'object' || !cleanText(image.data, 20000000)) return null;
          return {
            data: cleanText(image.data, 20000000),
            extension: ['.jpg', '.png', '.webp'].includes(image.extension) ? image.extension : '.jpg',
            mimeType: cleanText(image.mimeType, 80) || 'image/jpeg'
          };
        }).filter(Boolean).slice(0, 3);
        if (images.length) drinkImages[log.id] = images;
      });
    }
    return { schemaVersion: SCHEMA_VERSION, exportScope, beans, drinkLogs, brewPlans, settings: exportScope === 'all' ? normalizeSettings(payload.settings) : null, beanImages, drinkImages };
  }

  function createBackup(beans, drinkLogs, settings, exportedAt, brewPlans, options) {
    const exportScope = normalizeExportScope(options && options.scope);
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      exportScope,
      exportedAt: exportedAt || new Date().toISOString(),
      app: '豆仓',
      appVersion: '2.2.9'
    };
    if (exportScope === 'all' || exportScope === 'library') {
      payload.beans = (beans || []).map((bean) => normalizeBean(bean, bean.updatedAt));
      payload.drinkLogs = (drinkLogs || []).map((log) => normalizeDrinkLog(log, log.updatedAt));
    }
    if (exportScope === 'all' || exportScope === 'brewPlans') payload.brewPlans = (brewPlans || []).map((plan) => normalizeBrewPlan(plan, plan.updatedAt));
    if (exportScope === 'all') payload.settings = normalizeSettings(settings);
    if ((exportScope === 'all' || exportScope === 'library') && options && options.beanImages) payload.beanImages = options.beanImages;
    if ((exportScope === 'all' || exportScope === 'library') && options && options.drinkImages) payload.drinkImages = options.drinkImages;
    return payload;
  }

  function bestFlavorDaysLeft(bean, today) {
    const days = Number(bean && bean.bestFlavorDays);
    if (!(days > 0) || !bean.openedDate) return null;
    const opened = new Date(bean.openedDate);
    if (Number.isNaN(opened.getTime())) return null;
    const start = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate());
    const base = today ? new Date(today) : new Date();
    const current = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    return Math.ceil((start.getTime() + days * 86400000 - current.getTime()) / 86400000);
  }

  function beanReminders(beans, settings, today) {
    const prefs = normalizeSettings(settings);
    const quick = Number(prefs.quickGrams) || DEFAULT_SETTINGS.quickGrams;
    const results = [];
    (beans || []).map((bean) => normalizeBean(bean, bean.updatedAt)).forEach((bean) => {
      if (bean.status === '已喝完') return;
      const daysLeft = bestFlavorDaysLeft(bean, today);
      if (daysLeft != null && daysLeft >= 0 && daysLeft <= prefs.flavorReminderDays) results.push({ type: 'flavor', beanId: bean.id, beanName: bean.name, daysLeft, message: daysLeft === 0 ? '今天到达最佳赏味期' : `最佳赏味期还有 ${daysLeft} 天` });
      const remaining = Number(bean.remainingWeight) || 0;
      if (remaining > 0 && remaining <= quick * prefs.lowStockCups) results.push({ type: 'stock', beanId: bean.id, beanName: bean.name, cupsLeft: Math.max(1, Math.ceil(remaining / quick)), message: `约剩 ${Math.max(1, Math.ceil(remaining / quick))} 杯` });
    });
    return results;
  }

  function filterAndSort(beans, options) {
    const opts = options || {};
    const q = cleanText(opts.query).toLocaleLowerCase('zh-CN');
    const filtered = beans.filter((bean) => {
      if (opts.status && opts.status !== '全部' && bean.status !== opts.status) return false;
      if (!q) return true;
      return SEARCH_FIELDS.some((field) => cleanText(bean[field]).toLocaleLowerCase('zh-CN').includes(q));
    });
    const direction = opts.direction === 'asc' ? 1 : -1;
    const unitPrice = (bean) => {
      const price = Number(bean.price);
      const grams = Number(bean.initialWeight);
      return Number.isFinite(price) && price > 0 && Number.isFinite(grams) && grams > 0 ? price / grams : null;
    };
    return filtered.slice().sort((a, b) => {
      if (opts.sort === 'name') return cleanText(a.name).localeCompare(cleanText(b.name), 'zh-CN') * direction;
      if (opts.sort === 'remainingWeight') return ((a.remainingWeight || 0) - (b.remainingWeight || 0)) * direction;
      if (opts.sort === 'unitPrice') {
        const ap = unitPrice(a);
        const bp = unitPrice(b);
        if (ap == null && bp == null) return cleanText(a.name).localeCompare(cleanText(b.name), 'zh-CN');
        if (ap == null) return 1;
        if (bp == null) return -1;
        return (ap - bp) * direction;
      }
      if (opts.sort === 'status') return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * direction;
      return cleanText(a.roastDate || a.createdAt).localeCompare(cleanText(b.roastDate || b.createdAt)) * direction;
    });
  }

  function summarize(beans) {
    return {
      total: beans.length,
      active: beans.filter((bean) => bean.status === '饮用中').length,
      remaining: beans.reduce((sum, bean) => sum + (Number(bean.remainingWeight) || 0), 0)
    };
  }

  function summarizeDrinkLogs(logs) {
    const rated = logs.filter((log) => Number(log.overallRating) > 0);
    return {
      cups: logs.length,
      grams: Math.round(logs.reduce((sum, log) => sum + (Number(log.grams) || 0), 0) * 10) / 10,
      averageRating: rated.length ? Math.round(rated.reduce((sum, log) => sum + Number(log.overallRating), 0) / rated.length * 10) / 10 : null
    };
  }

  function dateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function estimateDrinkCost(log, beans) {
    if (log && log.source === 'external') {
      const p = Number(log.price);
      return p > 0 ? Math.round(p * 100) / 100 : 0;
    }
    const bean = (beans || []).find((item) => item.id && item.id === log.beanId);
    const price = Number(bean && bean.price);
    const initialWeight = Number(bean && bean.initialWeight);
    const grams = Number(log && log.grams);
    if (!(price > 0) || !(initialWeight > 0) || !(grams > 0)) return 0;
    return Math.round((price / initialWeight * grams) * 100) / 100;
  }

  function sharePlanRows(plan) {
    return PLAN_SHARE_FIELDS.map(([key, label, type]) => {
      let value = plan[key];
      if (type === 'weight') value = value ? formatShareWeight(value) : '';
      else if (type === 'boolean') value = value ? '是' : '';
      else if (type === 'grind') value = [plan.grinder, plan.grindSetting].filter(Boolean).join(' · ');
      return value ? { label, value: cleanText(value, 120) } : null;
    }).filter(Boolean);
  }

  function buildBeanSharePayload(beanInput, options) {
    const bean = normalizeBean(beanInput || {}, beanInput && beanInput.updatedAt);
    const opts = options || {};
    const images = [
      opts.includeBag !== false && bean.bagImagePath ? { label: '咖啡袋', path: bean.bagImagePath, role: 'bag' } : null
    ].filter(Boolean);
    return {
      type: 'bean',
      style: cleanText(opts.style, 40) || 'receipt',
      title: bean.name || '未命名咖啡豆',
      subtitle: [bean.roaster, bean.origin].filter(Boolean).join(' · ') || '豆仓咖啡豆',
      eyebrow: '咖啡豆',
      meta: [bean.status, bean.roastDate ? `烘焙 ${bean.roastDate}` : '本地记录'].filter(Boolean),
      stats: [
        { label: '价格', value: formatShareMoney(bean.price) },
        { label: PRICE_UNITS[opts.priceUnit] ? PRICE_UNITS[opts.priceUnit].label : PRICE_UNITS.g.label, value: formatShareUnitPrice(bean, opts.priceUnit) }
      ],
      rows: [
        { label: '烘焙商', value: bean.roaster || '未记录' },
        { label: '产地', value: bean.origin || '未记录' },
        { label: '处理法', value: bean.process || '未记录' },
        { label: '烘焙度', value: bean.roastLevel || '未记录' }
      ],
      notes: bean.tastingNotes || '',
      images,
      footer: '一包豆子，故事从这里开始 · 豆仓'
    };
  }

  function buildPlanSharePayload(planInput, options) {
    const opts = options || {};
    const plan = normalizeBrewPlan(planInput || {}, planInput && planInput.updatedAt);
    const rows = sharePlanRows(plan);
    const steps = (plan.steps || []).map((step, index) => ({
      label: step.label || `第 ${index + 1} 段`,
      value: [step.water ? formatShareWeight(step.water) : '', step.time, step.note].filter(Boolean).join(' · ')
    })).filter((step) => step.label || step.value);
    const payload = {
      type: 'brewPlan',
      style: cleanText(opts.style, 40) || 'receipt',
      title: plan.name,
      subtitle: `${plan.brewMethod} · v${plan.version} · ${plan.source === 'preset' ? '预置方案' : '自定义方案'}`,
      eyebrow: '冲煮方案',
      meta: [plan.brewMethod, `${rows.length} 项参数`, steps.length ? `${steps.length} 段步骤` : '无分段'].filter(Boolean),
      rows,
      steps,
      notes: plan.notes || '',
      footer: '一段风味，值得反复回味 · 豆仓'
    };
    if (opts.includeQr) {
      payload.qr = { code: encodePlanShare(plan), title: '扫码导入此方案', hint: '在豆仓「导入方案」中拍摄或选图，即可保存为新方案 · 豆仓' };
    }
    return payload;
  }

  function buildDrinkSharePayload(logInput, options) {
    const opts = options || {};
    const log = normalizeDrinkLog(logInput || {}, logInput && logInput.updatedAt);
    const external = log.source === 'external';
    const title = external ? (log.drinkName || log.cafeName || '外饮咖啡') : (log.beanName || '一杯咖啡');
    const dimensions = { aroma: '香气', acidity: '酸质', sweetness: '甜感', body: '醇厚', aftertaste: '余韵', balance: '平衡', bitterness: '苦感' };
    const dimensionRatings = DIMENSION_KEYS.filter((key) => log[key]).map((key) => ({ key, label: dimensions[key], value: Number(log[key]) || 0 }));
    const snapshot = opts.includeBrew && log.brewPlanSnapshot ? normalizeBrewPlan(log.brewPlanSnapshot, log.updatedAt) : null;
    return {
      type: 'drink',
      style: cleanText(opts.style, 40) || 'receipt',
      title,
      subtitle: external ? [log.cafeName, log.location].filter(Boolean).join(' · ') || '外饮记录' : [log.brewMethod, log.beanName].filter(Boolean).join(' · '),
      eyebrow: '饮用手账',
      meta: [shareDateText(dateKey(log.consumedAt)), log.overallRating ? '已评价' : '未评分'].filter(Boolean),
      rating: log.overallRating ? { value: Number(log.overallRating), max: 5, label: '整体评价' } : null,
      stats: external ? [
        { label: '价格', value: log.price > 0 ? formatShareMoney(log.price) : '—' }
      ] : [
        { label: '用豆', value: formatShareWeight(log.grams) },
        { label: '方式', value: log.brewMethod || '未记录' }
      ],
      rows: dimensionRatings.length < 3 ? dimensionRatings.map((item) => ({ label: item.label, value: `${item.value} / 5` })) : [],
      radar: dimensionRatings.length >= 3 ? dimensionRatings : null,
      brewRows: snapshot ? sharePlanRows(snapshot) : [],
      brewSteps: snapshot ? (snapshot.steps || []).map((step, index) => ({ label: step.label || `第 ${index + 1} 段`, value: [step.water ? formatShareWeight(step.water) : '', step.time, step.note].filter(Boolean).join(' · ') })) : [],
      notes: log.notes || '',
      images: (log.photos || []).slice(0, 3).map((path, index) => ({ label: `照片 ${index + 1}`, path, role: 'drink' })),
      footer: '一页日常，留住每一次相遇 · 豆仓'
    };
  }

  function buildMonthCells(year, month, days, selectedDate) {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push({ empty: true });
    for (let day = 1; day <= total; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ date: key, day, level: dayLevel(days[key]), selected: key === selectedDate });
    }
    return cells;
  }

  function dayLevel(day) {
    const grams = Number(day && day.grams) || 0;
    if (grams <= 0) return 0;
    if (grams <= 15) return 1;
    if (grams <= 30) return 2;
    if (grams <= 45) return 3;
    return 4;
  }

  function statsForDayList(list) {
    const values = list || [];
    const rated = values.filter((day) => day.averageRating);
    return {
      cups: values.reduce((sum, day) => sum + (Number(day.cups) || 0), 0),
      grams: Math.round(values.reduce((sum, day) => sum + (Number(day.grams) || 0), 0) * 10) / 10,
      cost: Math.round(values.reduce((sum, day) => sum + (Number(day.cost) || 0), 0) * 100) / 100,
      averageRating: rated.length ? Math.round(rated.reduce((sum, day) => sum + Number(day.averageRating), 0) / rated.length * 10) / 10 : null
    };
  }

  function continuousDayCount(days) {
    const keys = Object.keys(days || {}).filter((key) => (Number(days[key] && days[key].grams) || 0) > 0 || (Number(days[key] && days[key].cups) || 0) > 0).sort();
    if (!keys.length) return 0;
    const parse = (key) => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
    let cursor = parse(keys[keys.length - 1]);
    let count = 0;
    while (days[dateKey(cursor)]) { count += 1; cursor.setDate(cursor.getDate() - 1); }
    return count;
  }

  function buildCalendarSharePayload(input, options) {
    const source = input || {};
    const opts = options || {};
    const days = source.days || {};
    const date = source.date ? new Date(source.date) : new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const selectedDate = cleanText(source.selectedDate, 20) || dateKey(date);
    const dayValues = Object.values(days).filter((day) => day && day.date);
    const selectedDay = days[selectedDate] || { date: selectedDate, cups: 0, grams: 0, cost: 0, averageRating: null, logs: [] };
    if (source.view === 'year') {
      const yearDays = dayValues.filter((day) => day.date.startsWith(`${year}-`));
      const stats = statsForDayList(yearDays);
      return {
        type: 'calendarYear',
        style: cleanText(opts.style, 40) || 'receipt',
        title: `${year} 年历`,
        subtitle: '年度咖啡节奏',
        eyebrow: '咖啡日历',
        meta: [`${stats.cups} 杯`, formatShareWeight(stats.grams), formatShareMoney(stats.cost)],
        stats: [
          { label: '本年', value: `${stats.cups}杯` },
          { label: '用豆', value: formatShareWeight(stats.grams) },
          { label: '花费', value: formatShareMoney(stats.cost) },
          { label: '连续', value: `${continuousDayCount(days)}天` }
        ],
        calendar: {
          view: 'year',
          year,
          days: yearDays.map((day) => ({ date: day.date, level: dayLevel(day) }))
        },
        footer: '本地记录 · 私人豆仓'
      };
    }
    const monthDays = dayValues.filter((day) => day.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
    const stats = statsForDayList(monthDays);
    return {
      type: 'calendarMonth',
      style: cleanText(opts.style, 40) || 'receipt',
      title: `${year} 年 ${month + 1} 月`,
      subtitle: `${shareDateText(selectedDate)} · ${selectedDay.cups || 0} 杯记录`,
      eyebrow: '咖啡日历',
      meta: [`本月 ${stats.cups} 杯`, formatShareWeight(stats.grams), stats.averageRating ? `${stats.averageRating}★` : '未评分'],
      stats: [
        { label: '用豆', value: formatShareWeight(selectedDay.grams) },
        { label: '花费', value: formatShareMoney(selectedDay.cost) },
        { label: '均分', value: selectedDay.averageRating ? `${selectedDay.averageRating}★` : '—' }
      ],
      calendar: {
        view: 'month',
        year,
        month: month + 1,
        selectedDate,
        cells: buildMonthCells(year, month, days, selectedDate)
      },
      logs: (selectedDay.logs || []).slice(0, 4).map((log) => ({
        title: log.source === 'external' ? (log.drinkName || log.cafeName || log.beanName || '外饮咖啡') : (log.beanName || '咖啡'),
        meta: (log.source === 'external' ? ['外饮', log.price > 0 ? formatShareMoney(log.price) : '', log.location, log.overallRating ? `${log.overallRating}★` : '未评分'] : [log.brewMethod, formatShareWeight(log.grams), log.overallRating ? `${log.overallRating}★` : '未评分']).filter(Boolean).join(' · ')
      })),
      footer: '本地记录 · 私人豆仓'
    };
  }

  function buildSharePayload(type, source, options) {
    if (type === 'bean') return buildBeanSharePayload(source, options);
    if (type === 'brewPlan') return buildPlanSharePayload(source, options);
    if (type === 'drink') return buildDrinkSharePayload(source, options);
    if (type === 'calendar') return buildCalendarSharePayload(source, options);
    throw new Error('未知分享类型');
  }

  function summarizeDrinkDays(logs, beans) {
    const days = {};
    (logs || []).forEach((log) => {
      const key = dateKey(log.consumedAt);
      if (!key) return;
      if (!days[key]) days[key] = { date: key, cups: 0, grams: 0, cost: 0, ratingSum: 0, rated: 0, logs: [] };
      const day = days[key];
      day.cups += 1;
      day.grams += Number(log.grams) || 0;
      day.cost += estimateDrinkCost(log, beans);
      if (Number(log.overallRating) > 0) { day.ratingSum += Number(log.overallRating); day.rated += 1; }
      day.logs.push(log);
    });
    Object.values(days).forEach((day) => {
      day.grams = Math.round(day.grams * 10) / 10;
      day.cost = Math.round(day.cost * 100) / 100;
      day.averageRating = day.rated ? Math.round(day.ratingSum / day.rated * 10) / 10 : null;
      day.logs.sort((a, b) => compareDrinkChronology(b, a));
      delete day.ratingSum;
      delete day.rated;
    });
    return days;
  }

  // ===== 同步合并（阶段 3，纯逻辑，不接存储/云端）=====
  // 记录信封形状：{ id, updatedAt, revision, deviceId, deletedAt, payload }
  // 合并：按 (updatedAt, revision, deviceId) 的 last-write-wins；胜者的 deletedAt 即最终删除态（墓碑）。
  // 删除必须写墓碑（deletedAt 非空且刷新 updatedAt），否则会被对端当作缺失而复活。
  // 详见 plan/SYNC_PROTOCOL_DESIGN.md §4/§5。
  // 裁决实现与云端 Worker 共用 sync-compare.js,禁止在此另写一份(两端分歧 = 数据不收敛)。
  const compareSyncRecords = syncCompare.compareSyncRecords;
  function mergeSyncRecords(local, remote) {
    const winners = new Map();
    [].concat(local || [], remote || []).forEach((record) => {
      if (!record || record.id == null) return;
      const prev = winners.get(record.id);
      if (!prev || compareSyncRecords(record, prev) > 0) winners.set(record.id, record);
    });
    return Array.from(winners.values());
  }
  function liveSyncRecords(records) {
    return (records || []).filter((record) => record && !record.deletedAt);
  }
  // 预置方案由 App 版本内置，不进同步集；只同步 user/copy。
  function syncablePlans(plans) {
    return (plans || []).filter((plan) => plan && plan.source !== 'preset');
  }

  // 无图豆子的生成式占位参数（纯函数，双端一致）。只用豆子已有数据，不新增字段。
  // roastKey → 底色档位；glyph → 豆名首字字纹；hash 派生 variant/angle/shift → 每颗豆确定性微差异（类 identicon）。
  const ROAST_TIER = { '浅烘': 'light', '中浅烘': 'medium-light', '中烘': 'medium', '中深烘': 'medium-dark', '深烘': 'dark' };
  function hashString(value) {
    let hash = 2166136261;
    const text = String(value == null ? '' : value);
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }
  function beanPlaceholder(bean) {
    const source = bean && typeof bean === 'object' ? bean : {};
    const name = cleanText(source.name, 120) || '';
    const chars = Array.from(name.trim());
    const glyph = chars.length ? chars[0] : '豆';
    const roastKey = ROAST_TIER[source.roastLevel] || 'neutral';
    const hash = hashString(source.id || name || 'bean');
    return { glyph, roastKey, hash, variant: hash % 4, angle: hash % 360, shift: (hash >>> 4) % 100 };
  }

  // 风味笔记 → 彩色风味标签（纯逻辑，可测试）。按分隔符/空白拆词，再按风味轮关键词归类配色。
  // 顺序即优先级：更具体的类别在前，避免通用词（如「花」「果」）误抢更精确的归类。
  const FLAVOR_LEXICON = [
    ['ferment', ['酒', '发酵', '厌氧', '威士忌', '朗姆', '白兰地', '红酒']],
    ['berry', ['莓', '浆果', '加仑', '覆盆']],
    ['citrus', ['柠檬', '柑', '橘', '橙', '柚', '青柠', '佛手']],
    ['floral', ['花', '茉莉', '玫瑰', '桂花', '薰衣草', '甘菊', '接骨木']],
    ['tea', ['茶', '乌龙', '伯爵', '草本', '香料', '肉桂', '丁香', '豆蔻', '木质', '雪松', '烟草']],
    ['nutty', ['坚果', '榛', '杏仁', '花生', '核桃', '腰果', '巧克力', '可可']],
    ['caramel', ['焦糖', '红糖', '蜂蜜', '枫糖', '太妃', '奶油', '香草', '麦芽']],
    ['fruit', ['桃', '杏', '李', '芒果', '菠萝', '凤梨', '百香果', '荔枝', '瓜', '葡萄', '苹果', '梨', '樱桃', '果']]
  ];
  function classifyFlavor(term) {
    for (let i = 0; i < FLAVOR_LEXICON.length; i += 1) {
      const words = FLAVOR_LEXICON[i][1];
      for (let j = 0; j < words.length; j += 1) { if (term.indexOf(words[j]) >= 0) return FLAVOR_LEXICON[i][0]; }
    }
    return 'other';
  }
  function flavorTags(text) {
    const raw = cleanText(text, 4000) || '';
    const parts = raw.split(/[、,，;；/／\\|·。.\s]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const tags = [];
    for (let i = 0; i < parts.length && tags.length < 12; i += 1) {
      const chars = Array.from(parts[i]);
      const label = chars.length > 12 ? chars.slice(0, 12).join('') : parts[i];
      const key = label.toLocaleLowerCase('zh-CN');
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push({ label, category: classifyFlavor(parts[i]) });
    }
    return tags;
  }

  // 处理法 → 类别（纯逻辑，可测试）。用于生成封面右下角小角标。顺序即优先级。
  const PROCESS_LEXICON = [
    ['anaerobic', ['厌氧', '双厌氧', '酒香', '酵素', 'anaerobic']],
    ['honey', ['蜜', 'honey', '黑蜜', '红蜜', '黄蜜', '白蜜']],
    ['natural', ['日晒', '自然', '干处理', 'natural', 'dry']],
    ['washed', ['水洗', '湿处理', '半水洗', '湿刨', 'washed', 'wet']]
  ];
  function beanProcessKind(process) {
    const text = cleanText(process, 120) || '';
    if (!text) return null;
    for (let i = 0; i < PROCESS_LEXICON.length; i += 1) {
      const words = PROCESS_LEXICON[i][1];
      for (let j = 0; j < words.length; j += 1) { if (text.indexOf(words[j]) >= 0) return PROCESS_LEXICON[i][0]; }
    }
    return null;
  }

  // 赏味期新鲜度 → 档位 + 紧凑标签（纯逻辑，可测试）。快到期自然从绿→琥珀→橙→过期。
  function beanFreshness(bean, today) {
    const daysLeft = bestFlavorDaysLeft(bean, today);
    if (daysLeft == null) return null;
    if (daysLeft < 0) return { daysLeft, level: 'expired', label: '超期' };
    if (daysLeft === 0) return { daysLeft, level: 'soon', label: '今天' };
    if (daysLeft <= 3) return { daysLeft, level: 'soon', label: `${daysLeft}天` };
    if (daysLeft <= 14) return { daysLeft, level: 'good', label: `${daysLeft}天` };
    return { daysLeft, level: 'fresh', label: `${daysLeft}天` };
  }

  // 饮用记录近 N 天日序列（纯逻辑）：每天杯数/克数/均分，用于迷你图。today 可注入便于测试。
  function recentDrinkSeries(logs, days, today) {
    const span = Math.max(1, Math.round(Number(days) || 30));
    const base = today ? new Date(today) : new Date();
    const end = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const buckets = new Map();
    (logs || []).forEach((log) => {
      if (!log || log.deletedAt || !log.consumedAt) return;
      const when = new Date(log.consumedAt);
      if (Number.isNaN(when.getTime())) return;
      const key = dateKey(when);
      const bucket = buckets.get(key) || { cups: 0, grams: 0, ratingSum: 0, rated: 0 };
      bucket.cups += 1;
      bucket.grams += Number(log.grams) || 0;
      const rating = Number(log.overallRating);
      if (rating > 0) { bucket.ratingSum += rating; bucket.rated += 1; }
      buckets.set(key, bucket);
    });
    const series = [];
    for (let i = span - 1; i >= 0; i -= 1) {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      const key = dateKey(day);
      const bucket = buckets.get(key) || { cups: 0, grams: 0, ratingSum: 0, rated: 0 };
      series.push({ date: key, cups: bucket.cups, grams: Math.round(bucket.grams * 10) / 10, averageRating: bucket.rated ? Math.round(bucket.ratingSum / bucket.rated * 10) / 10 : null });
    }
    return series;
  }

  // 找到当前记录之前、同一豆子最近一条可绘制雷达图的评价记录。
  function compareDrinkChronology(a, b) {
    const leftConsumed = new Date(a && a.consumedAt).getTime();
    const rightConsumed = new Date(b && b.consumedAt).getTime();
    const consumedDiff = (Number.isFinite(leftConsumed) ? leftConsumed : 0) - (Number.isFinite(rightConsumed) ? rightConsumed : 0);
    if (consumedDiff) return consumedDiff;
    const leftCreated = new Date(a && a.createdAt).getTime();
    const rightCreated = new Date(b && b.createdAt).getTime();
    const createdDiff = (Number.isFinite(leftCreated) ? leftCreated : 0) - (Number.isFinite(rightCreated) ? rightCreated : 0);
    if (createdDiff) return createdDiff;
    return cleanText(a && a.id).localeCompare(cleanText(b && b.id));
  }
  function previousComparableDrink(logs, current) {
    if (!current || !current.beanId) return null;
    if (!Number.isFinite(new Date(current.consumedAt).getTime())) return null;
    return (logs || []).filter((log) => {
      if (!log || log.id === current.id || log.deletedAt || log.source === 'external' || log.beanId !== current.beanId) return false;
      const dimensions = DIMENSION_KEYS.filter((key) => Number(log[key]) > 0).length;
      return Number.isFinite(new Date(log.consumedAt).getTime()) && compareDrinkChronology(log, current) < 0 && dimensions >= 3;
    }).sort((a, b) => compareDrinkChronology(b, a))[0] || null;
  }

  return { SCHEMA_VERSION, DIMENSION_KEYS, BREW_METHODS, DEFAULT_SETTINGS, normalizeBean, normalizeDrinkLog, normalizeBrewPlan, normalizeSettings, hasTastingContent, resolveTastingStatus, consumptionResult, validateImport, createBackup, bestFlavorDaysLeft, beanReminders, filterAndSort, summarize, summarizeDrinkLogs, summarizeBrewPlans, recommendBrewPlans, presetBrewPlans, cloneBrewPlan, planSnapshot, encodePlanShare, decodePlanShare, prepareBrewAssistSteps, brewAssistStatus, resolveOpenedDate, dateKey, estimateDrinkCost, summarizeDrinkDays, buildSharePayload, compareAppVersions, isAppVersionNewer, selectReleaseApkAsset, compareSyncRecords, mergeSyncRecords, liveSyncRecords, syncablePlans, beanPlaceholder, flavorTags, beanFreshness, recentDrinkSeries, compareDrinkChronology, previousComparableDrink, beanProcessKind };
});
