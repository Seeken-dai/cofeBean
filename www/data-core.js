(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DIMENSION_KEYS = ['aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness'];
  const DEFAULT_SETTINGS = Object.freeze({
    quickGrams: 15,
    advancedRatings: false,
    enabledDimensions: DIMENSION_KEYS.slice(),
    lastBrewMethod: '手冲',
    priceUnit: 'g',
    theme: 'dark-roast'
  });
  const STATUS_ORDER = ['饮用中', '未开封', '已喝完'];
  const ALLOWED_STATUS = new Set(['未开封', '饮用中', '已喝完']);
  const ALLOWED_ROAST = new Set(['浅烘', '中浅烘', '中烘', '中深烘', '深烘']);
  const TEXT_FIELDS = ['name', 'roaster', 'origin', 'process', 'roastDate', 'openedDate', 'purchaseDate', 'tastingNotes', 'status', 'roastLevel', 'bagImagePath', 'labelImagePath'];
  const NUMBER_FIELDS = ['initialWeight', 'remainingWeight', 'price'];
  const SEARCH_FIELDS = ['name', 'roaster', 'origin', 'process', 'tastingNotes'];

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength || 5000);
  }

  function cleanNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
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
    bean.tastingNotes = cleanText(source.tastingNotes, 4000);
    bean.bagImagePath = cleanText(source.bagImagePath, 1000);
    bean.labelImagePath = cleanText(source.labelImagePath, 1000);
    bean.status = ALLOWED_STATUS.has(bean.status) ? bean.status : '未开封';
    bean.roastLevel = ALLOWED_ROAST.has(bean.roastLevel) ? bean.roastLevel : '';
    bean.favorite = source.favorite === true || source.favorite === 1 || source.favorite === '1';
    bean.id = cleanText(source.id, 100) || makeId();
    const stamp = now || new Date().toISOString();
    bean.createdAt = cleanText(source.createdAt, 40) || stamp;
    bean.updatedAt = cleanText(source.updatedAt, 40) || stamp;
    return bean;
  }

  function cleanRating(value) {
    if (value === '' || value == null) return null;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }

  function normalizeDrinkLog(input, now) {
    const source = input && typeof input === 'object' ? input : {};
    const stamp = now || new Date().toISOString();
    const log = {
      id: cleanText(source.id, 100) || makeId(),
      beanId: cleanText(source.beanId, 100) || null,
      beanName: cleanText(source.beanName, 120) || '已删除的咖啡豆',
      grams: cleanNumber(source.grams),
      brewMethod: cleanText(source.brewMethod, 80) || '手冲',
      overallRating: cleanRating(source.overallRating),
      notes: cleanText(source.notes, 2000),
      consumedAt: cleanText(source.consumedAt, 40) || stamp,
      createdAt: cleanText(source.createdAt, 40) || stamp,
      updatedAt: cleanText(source.updatedAt, 40) || stamp
    };
    DIMENSION_KEYS.forEach((key) => { log[key] = cleanRating(source[key]); });
    return log;
  }

  function normalizeSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const quick = Number(source.quickGrams);
    const enabled = Array.isArray(source.enabledDimensions)
      ? source.enabledDimensions.filter((key) => DIMENSION_KEYS.includes(key))
      : DEFAULT_SETTINGS.enabledDimensions.slice();
    return {
      quickGrams: Number.isFinite(quick) ? Math.min(100, Math.max(1, Math.round(quick * 10) / 10)) : DEFAULT_SETTINGS.quickGrams,
      advancedRatings: source.advancedRatings === true || source.advancedRatings === 1 || source.advancedRatings === '1',
      enabledDimensions: Array.isArray(source.enabledDimensions) ? [...new Set(enabled)] : DEFAULT_SETTINGS.enabledDimensions.slice(),
      lastBrewMethod: cleanText(source.lastBrewMethod, 80) || DEFAULT_SETTINGS.lastBrewMethod,
      priceUnit: ['g', '50g', '100g', 'jin'].includes(source.priceUnit) ? source.priceUnit : DEFAULT_SETTINGS.priceUnit,
      theme: ['dark-roast', 'frost', 'obsidian', 'blaze'].includes(source.theme) ? source.theme : DEFAULT_SETTINGS.theme
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

  function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'bean-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function validateImport(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('备份文件结构不正确');
    if (![1, SCHEMA_VERSION].includes(payload.schemaVersion)) throw new Error('暂不支持此备份版本');
    if (!Array.isArray(payload.beans)) throw new Error('备份中没有有效的咖啡豆记录');
    if (payload.beans.length > 10000) throw new Error('备份记录超过 10000 条限制');
    const ids = new Set();
    const beans = payload.beans.map((raw) => {
      const bean = normalizeBean(raw);
      if (!bean.name) throw new Error('每条记录都必须有豆名');
      if (ids.has(bean.id)) throw new Error('备份包含重复记录 ID');
      ids.add(bean.id);
      return bean;
    });
    if (payload.schemaVersion === 1) return { schemaVersion: 1, beans, drinkLogs: [], settings: null };
    if (!Array.isArray(payload.drinkLogs)) throw new Error('备份中缺少饮用记录列表');
    if (beans.length + payload.drinkLogs.length > 10000) throw new Error('备份记录超过 10000 条限制');
    const logIds = new Set();
    const drinkLogs = payload.drinkLogs.map((raw) => {
      const log = normalizeDrinkLog(raw, raw && raw.updatedAt);
      if (!(log.grams > 0)) throw new Error('饮用记录克数必须大于 0');
      if (logIds.has(log.id)) throw new Error('备份包含重复饮用记录 ID');
      logIds.add(log.id);
      return log;
    });
    return { schemaVersion: SCHEMA_VERSION, beans, drinkLogs, settings: normalizeSettings(payload.settings) };
  }

  function createBackup(beans, drinkLogs, settings, exportedAt) {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      app: '豆仓',
      appVersion: '1.2.5',
      beans: beans.map((bean) => normalizeBean(bean, bean.updatedAt)),
      drinkLogs: (drinkLogs || []).map((log) => normalizeDrinkLog(log, log.updatedAt)),
      settings: normalizeSettings(settings)
    };
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
    return filtered.slice().sort((a, b) => {
      if (opts.sort === 'name') return cleanText(a.name).localeCompare(cleanText(b.name), 'zh-CN') * direction;
      if (opts.sort === 'remainingWeight') return ((a.remainingWeight || 0) - (b.remainingWeight || 0)) * direction;
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

  return { SCHEMA_VERSION, DIMENSION_KEYS, DEFAULT_SETTINGS, normalizeBean, normalizeDrinkLog, normalizeSettings, consumptionResult, validateImport, createBackup, filterAndSort, summarize, summarizeDrinkLogs };
});
