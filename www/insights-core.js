(function (root, factory) {
  const isCommonJs = typeof module !== 'undefined' && module.exports;
  const beanCore = isCommonJs ? require('./data-core.js') : root.BeanCore;
  const api = factory(beanCore);
  if (isCommonJs) module.exports = api;
  root.BeanInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (beanCore) {
  'use strict';

  if (!beanCore || typeof beanCore.flavorTags !== 'function' || typeof beanCore.estimateDrinkCost !== 'function') {
    throw new Error('缺少 BeanCore: data-core.js 必须先于 insights-core.js 加载');
  }

  const MIN_SAMPLE = 3;
  const HAND_BREW_MIN = 5;
  const HAND_BREW_BEAN_MIN = 3;
  const COFFEE_REPORT_MIN = 5;
  const CATALOG_REQUIRED = 1;
  const CATALOG_ORIGIN_MILESTONES = [1, 3, 5, 8, 12, 18, 25];
  const CATALOG_CUP_MILESTONES = [10, 50, 100, 300, 500, 1000];
  const CATALOG_STREAK_MILESTONES = [3, 7, 14, 30, 60];
  const CATALOG_CAFE_MILESTONES = [1, 3, 5, 10, 15, 25, 40];
  const CATALOG_PLACE_MILESTONES = [1, 3, 5, 8, 12, 18, 25];
  const CATALOG_EXTERNAL_CUP_MILESTONES = [5, 20, 50, 100, 200, 500];
  const CATALOG_UNNAMED_CAFE = '未记名咖啡馆';
  // 收集墙一屏放得下 3 格(grid-auto-columns:29%)，不超过就排单行，超过才回到两行横向滚动。
  const CATALOG_WALL_SINGLE_ROW_MAX = 3;
  // 单格最多留存的饮用照片数：炸开每次只随机取其中几张，存太多没意义还占内存。
  const CATALOG_PHOTO_LIMIT = 12;
  const CATALOG_PROCESS_GROUPS = [
    { key: 'washed', label: '水洗' },
    { key: 'natural', label: '日晒' },
    { key: 'honey', label: '蜜处理' },
    { key: 'special', label: '厌氧与特殊处理' },
    { key: 'other', label: '其他' }
  ];
  const DIMENSION_LABELS = {
    aroma: '香气', acidity: '酸质', sweetness: '甜感', body: '醇厚',
    aftertaste: '余韵', balance: '平衡', bitterness: '苦感'
  };
  const FLAVOR_LABELS = {
    ferment: '发酵酒香', berry: '莓果', sour: '酸味', citrus: '柑橘', floral: '花香',
    tea: '茶香', spice: '香料', green: '青植', papery: '纸霉木质', chemical: '化学与缺陷', roasted: '烘烤',
    nutty: '坚果可可', dairy: '乳脂奶香', caramel: '焦糖甜香', fruit: '其他水果', other: '其他'
  };
  const TIME_BUCKETS = [
    { key: 'dawn', label: '凌晨', hint: '0–5时', start: 0, end: 6 },
    { key: 'morning', label: '上午', hint: '6–11时', start: 6, end: 12 },
    { key: 'afternoon', label: '下午', hint: '12–17时', start: 12, end: 18 },
    { key: 'evening', label: '晚间', hint: '18–23时', start: 18, end: 24 }
  ];
  const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

  function round(value, digits) {
    const scale = 10 ** (digits == null ? 1 : digits);
    return Math.round((Number(value) || 0) * scale) / scale;
  }

  function response(ok, reason, data, meta) {
    return { ok, reason: reason || null, data: ok ? data : null, meta: { sampleSize: 0, required: MIN_SAMPLE, excludedCount: 0, ...(meta || {}) } };
  }

  function insufficient(sampleSize, required, excludedCount) {
    return response(false, sampleSize ? 'insufficient' : 'empty', null, { sampleSize, required: required == null ? null : required, excludedCount: excludedCount || 0 });
  }

  function validDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function filterLogsByRange(logs, range, now) {
    const current = validDate(now || new Date()) || new Date();
    const end = current.getTime();
    let start = null;
    if (range === '30d' || range === '90d') {
      const days = range === '30d' ? 30 : 90;
      start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - (days - 1)).getTime();
    } else if (range === 'thisYear' || range === 'year') {
      start = new Date(current.getFullYear(), 0, 1).getTime();
    }
    return (Array.isArray(logs) ? logs : []).filter((log) => {
      if (!log || log.deletedAt) return false;
      const date = validDate(log.consumedAt);
      if (!date) return false;
      const time = date.getTime();
      return time <= end && (start == null || time >= start);
    });
  }

  function groupStats(items, keyFn) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const key = keyFn(item, index);
      if (key == null || key === '') return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return Array.from(groups, ([key, values]) => ({ key, values }));
  }

  function averageDimensions(logs, options) {
    const opts = options || {};
    if (!opts.enabled) return response(false, 'featureOff', null, { required: MIN_SAMPLE });
    const keys = (Array.isArray(opts.enabledDimensions) && opts.enabledDimensions.length ? opts.enabledDimensions : beanCore.DIMENSION_KEYS)
      .filter((key) => beanCore.DIMENSION_KEYS.includes(key));
    const rows = (Array.isArray(logs) ? logs : []).filter((log) => keys.some((key) => Number(log && log[key]) > 0));
    if (rows.length < MIN_SAMPLE) return insufficient(rows.length, MIN_SAMPLE);
    const axes = keys.map((key) => {
      const values = rows.map((log) => Number(log[key])).filter((value) => value > 0);
      return values.length >= MIN_SAMPLE ? { key, label: DIMENSION_LABELS[key] || key, value: round(values.reduce((sum, value) => sum + value, 0) / values.length), sampleSize: values.length } : null;
    }).filter(Boolean);
    if (axes.length < 3) return insufficient(rows.length, null);
    return response(true, null, { axes }, { sampleSize: rows.length, required: MIN_SAMPLE });
  }

  function flavorProfile(logs) {
    const usable = [];
    const tagCounts = new Map();
    const categoryCounts = new Map();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
      const tags = beanCore.flavorTags(log && log.notes).map((tag) => {
        if (tag.category === 'other') return null;
        const lexicon = (beanCore.FLAVOR_LEXICON || []).find((entry) => entry[0] === tag.category);
        const match = lexicon && lexicon[1].slice().sort((a, b) => Array.from(b).length - Array.from(a).length)
          .find((word) => String(tag.label).includes(word));
        if (!match) return null;
        const canonical = { 花: '花香', 果: '果香', 茶: '茶感', 酒: '酒香' }[match] || match;
        return { label: canonical, category: tag.category };
      }).filter(Boolean);
      if (!tags.length) return;
      usable.push(log);
      tags.forEach((tag) => {
        const key = String(tag.label).toLocaleLowerCase('zh-CN');
        const previous = tagCounts.get(key) || { label: tag.label, count: 0, category: tag.category };
        previous.count += 1;
        tagCounts.set(key, previous);
        categoryCounts.set(tag.category, (categoryCounts.get(tag.category) || 0) + 1);
      });
    });
    if (usable.length < MIN_SAMPLE) return insufficient(usable.length, MIN_SAMPLE);
    const tags = Array.from(tagCounts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')).slice(0, 10);
    const categories = Array.from(categoryCounts, ([category, count]) => ({ category, label: FLAVOR_LABELS[category] || category, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
    return response(true, null, { tags, categories }, { sampleSize: usable.length, required: MIN_SAMPLE });
  }

  function averageRating(logs) {
    const ratings = logs.map((log) => Number(log && log.overallRating)).filter((rating) => rating > 0);
    return { ratedCount: ratings.length, averageRating: ratings.length ? round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null };
  }

  function preferenceGap(logs, beans, field) {
    const allowedFields = new Set(['origin', 'process', 'roastLevel']);
    if (!allowedFields.has(field)) throw new Error('不支持的偏好分组');
    const beanMap = new Map((Array.isArray(beans) ? beans : []).filter((bean) => bean && bean.id && !bean.deletedAt).map((bean) => [bean.id, bean]));
    let excludedCount = 0;
    const joined = [];
    (Array.isArray(logs) ? logs : []).forEach((log) => {
      const bean = log && log.source !== 'external' ? beanMap.get(log.beanId) : null;
      const label = bean && String(bean[field] || '').trim();
      if (!bean || !label) { excludedCount += 1; return; }
      joined.push({ log, bean, label });
    });
    const groups = groupStats(joined, (item) => item.label).map(({ key, values }) => {
      const ratings = averageRating(values.map((item) => item.log));
      return {
        label: key,
        cups: values.length,
        beanCount: new Set(values.map((item) => item.bean.id)).size,
        ratedCount: ratings.ratedCount,
        averageRating: ratings.averageRating
      };
    }).filter((group) => group.ratedCount >= 2);
    if (groups.length < 2) return insufficient(joined.filter((item) => Number(item.log.overallRating) > 0).length, null, excludedCount);
    groups.sort((a, b) => b.cups - a.cups || b.averageRating - a.averageRating || a.label.localeCompare(b.label, 'zh-CN'));
    const most = groups[0];
    const scored = groups.slice().sort((a, b) => b.averageRating - a.averageRating || b.ratedCount - a.ratedCount);
    const best = scored[0];
    const runnerUp = scored[1];
    let conclusion = '';
    if (most.cups >= MIN_SAMPLE && best.ratedCount >= MIN_SAMPLE) {
      if (best.averageRating - runnerUp.averageRating < 0.3) conclusion = `目前各组评分很接近，${most.label}是你喝得最多的选择。`;
      else if (most.label === best.label) conclusion = `${best.label}既是你喝得最多、也是目前评分最高的选择。`;
      else conclusion = `你喝得最多的是${most.label}，目前评分更高的是${best.label}。`;
    }
    return response(true, null, { groups, conclusion }, { sampleSize: joined.length, required: null, excludedCount });
  }

  function timeBuckets(logs) {
    const valid = (Array.isArray(logs) ? logs : []).map((log) => ({ log, date: validDate(log && log.consumedAt) })).filter((item) => item.date);
    if (valid.length < MIN_SAMPLE) return insufficient(valid.length, MIN_SAMPLE);
    const data = TIME_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, hint: bucket.hint, cups: valid.filter((item) => item.date.getHours() >= bucket.start && item.date.getHours() < bucket.end).length }));
    return response(true, null, data, { sampleSize: valid.length, required: MIN_SAMPLE });
  }

  function weekdayStats(logs) {
    const valid = (Array.isArray(logs) ? logs : []).map((log) => validDate(log && log.consumedAt)).filter(Boolean);
    if (valid.length < MIN_SAMPLE) return insufficient(valid.length, MIN_SAMPLE);
    const counts = Array(7).fill(0);
    valid.forEach((date) => { counts[(date.getDay() + 6) % 7] += 1; });
    return response(true, null, WEEKDAYS.map((label, index) => ({ key: index + 1, label, shortLabel: label.slice(-1), cups: counts[index] })), { sampleSize: valid.length, required: MIN_SAMPLE });
  }

  function beanMapOf(beans) {
    return new Map((Array.isArray(beans) ? beans : []).filter((bean) => bean && bean.id && !bean.deletedAt).map((bean) => [bean.id, bean]));
  }

  function positiveNumber(value) {
    if (value === '' || value == null) return null;
    const match = String(value).trim().match(/-?\d+(?:\.\d+)?/);
    const number = match ? Number(match[0]) : Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function parseRatioValue(value, dose, totalWater) {
    const match = String(value || '').match(/1\s*[:：]\s*(\d+(?:\.\d+)?)/);
    if (match) return positiveNumber(match[1]);
    const number = positiveNumber(value);
    if (number && number !== 1) return number;
    return dose > 0 && totalWater > 0 ? totalWater / dose : null;
  }

  function parseDurationSeconds(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const hours = text.match(/(\d+(?:\.\d+)?)\s*h/i) || text.match(/(\d+(?:\.\d+)?)\s*时/);
    const minutes = text.match(/(\d+(?:\.\d+)?)\s*m(?!s)/i) || text.match(/(\d+(?:\.\d+)?)\s*分/);
    const seconds = text.match(/(\d+(?:\.\d+)?)\s*s/i) || text.match(/(\d+(?:\.\d+)?)\s*秒/);
    const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (colon) return (colon[3] ? Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]) : Number(colon[1]) * 60 + Number(colon[2]));
    if (hours || minutes || seconds) return (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
    const number = Number(text);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function formatMetricNumber(value) {
    const number = round(value, 1);
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function formatHandBrewRatio(value) {
    return value == null ? '' : `1:${formatMetricNumber(value)}`;
  }

  function formatHandBrewDuration(seconds) {
    if (!(Number(seconds) >= 0)) return '';
    const total = Math.round(Number(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function snapshotOf(log) {
    const raw = log && log.brewPlanSnapshot;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return typeof beanCore.normalizeBrewPlan === 'function' ? beanCore.normalizeBrewPlan(raw, log.updatedAt) : raw;
  }

  function handBrewParameters(log) {
    const snapshot = snapshotOf(log) || {};
    const grams = positiveNumber(log && log.grams);
    const dose = grams || positiveNumber(snapshot.dose);
    const totalWater = positiveNumber(snapshot.totalWater) || positiveNumber(snapshot.liquid);
    return {
      dose,
      ratio: parseRatioValue(snapshot.ratio, dose, totalWater),
      waterTemp: positiveNumber(snapshot.waterTemp),
      grind: [snapshot.grinder, snapshot.grindSetting].filter(Boolean).join(' · '),
      durationSeconds: parseDurationSeconds(snapshot.targetDuration),
      steps: Array.isArray(snapshot.steps) ? snapshot.steps : [],
      snapshot
    };
  }

  function collectHandBrewRecords(logs, beans, beanId, now) {
    const current = validDate(now || new Date()) || new Date();
    const beansById = beanMapOf(beans);
    const records = [];
    let excludedCount = 0;
    (Array.isArray(logs) ? logs : []).forEach((log) => {
      if (!log || log.deletedAt || log.source === 'external' || log.brewMethod !== '手冲' || !log.beanId || (beanId && log.beanId !== beanId)) {
        excludedCount += 1;
        return;
      }
      const bean = beansById.get(log.beanId);
      const date = validDate(log.consumedAt);
      if (!bean || !date || date.getTime() > current.getTime()) {
        excludedCount += 1;
        return;
      }
      records.push({ log, bean, date, parameters: handBrewParameters(log) });
    });
    return { records, excludedCount };
  }

  function filterHandBrewLogs(logs, beans, beanId, now) {
    return collectHandBrewRecords(logs, beans, beanId, now).records.map((item) => item.log);
  }

  function summarizeMetric(values, digits) {
    const usable = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).map(Number);
    if (!usable.length) return null;
    const precision = digits == null ? 1 : digits;
    return { median: round(median(usable), precision), min: round(Math.min(...usable), precision), max: round(Math.max(...usable), precision), sampleSize: usable.length };
  }

  function dimensionRows(log, options) {
    const opts = options || {};
    const keys = Array.isArray(opts.enabledDimensions) ? opts.enabledDimensions.filter((key) => beanCore.DIMENSION_KEYS.includes(key)) : beanCore.DIMENSION_KEYS;
    return keys.map((key) => {
      const value = Number(log && log[key]);
      return value > 0 ? { key, label: DIMENSION_LABELS[key] || key, value: round(value) } : null;
    }).filter(Boolean);
  }

  function handBrewRecordView(item, options) {
    const log = item.log;
    const opts = options || {};
    return {
      id: log.id,
      consumedAt: log.consumedAt,
      rating: Number(log.overallRating),
      parameters: {
        dose: item.parameters.dose,
        ratio: item.parameters.ratio,
        waterTemp: item.parameters.waterTemp,
        grind: item.parameters.grind,
        durationSeconds: item.parameters.durationSeconds
      },
      steps: item.parameters.steps,
      dimensions: opts.advancedRatings ? dimensionRows(log, opts) : null
    };
  }

  function sortedRatedRecords(records) {
    return records.filter((item) => Number(item.log.overallRating) > 0).sort((a, b) => {
      const ratingDiff = Number(b.log.overallRating) - Number(a.log.overallRating);
      if (ratingDiff) return ratingDiff;
      const consumedDiff = b.date.getTime() - a.date.getTime();
      if (consumedDiff) return consumedDiff;
      const bCreated = validDate(b.log.createdAt);
      const aCreated = validDate(a.log.createdAt);
      return (bCreated ? bCreated.getTime() : 0) - (aCreated ? aCreated.getTime() : 0) || String(b.log.id || '').localeCompare(String(a.log.id || ''));
    });
  }

  function commonHandBrewDimensions(records, options) {
    const opts = options || {};
    if (!opts.advancedRatings || records.length < 2) return null;
    const keys = Array.isArray(opts.enabledDimensions) ? opts.enabledDimensions.filter((key) => beanCore.DIMENSION_KEYS.includes(key)) : beanCore.DIMENSION_KEYS;
    const common = keys.map((key) => {
      const values = records.map((record) => Number(record.log[key])).filter((value) => value > 0);
      return values.length === records.length ? { key, label: DIMENSION_LABELS[key] || key, value: round(values.reduce((sum, value) => sum + value, 0) / values.length), sampleSize: values.length } : null;
    }).filter(Boolean);
    return common.length >= 3 ? common : null;
  }

  function handBrewSummary(logs, beans, options) {
    const opts = options || {};
    const collection = collectHandBrewRecords(logs, beans, null, opts.now);
    const required = HAND_BREW_MIN;
    if (collection.records.length < required) return insufficient(collection.records.length, required, collection.excludedCount);
    const records = collection.records;
    return response(true, null, {
      cups: records.length,
      beanCount: new Set(records.map((item) => item.bean.id)).size,
      dose: summarizeMetric(records.map((item) => item.parameters.dose)),
      ratio: summarizeMetric(records.map((item) => item.parameters.ratio)),
      waterTemp: summarizeMetric(records.map((item) => item.parameters.waterTemp)),
      duration: summarizeMetric(records.map((item) => item.parameters.durationSeconds), 0)
    }, { sampleSize: records.length, required, excludedCount: collection.excludedCount });
  }

  function handBrewBeanReview(logs, beans, beanId, options) {
    const opts = options || {};
    const collection = collectHandBrewRecords(logs, beans, beanId, opts.now);
    const rated = sortedRatedRecords(collection.records);
    const required = HAND_BREW_BEAN_MIN;
    if (rated.length < required) return insufficient(rated.length, required, collection.excludedCount);
    const selected = rated.slice(0, 3);
    const records = selected.map((item) => handBrewRecordView(item, opts));
    const average = rated.reduce((sum, item) => sum + Number(item.log.overallRating), 0) / rated.length;
    return response(true, null, {
      beanId,
      beanName: collection.records[0].bean.name || '未命名咖啡豆',
      ratedCount: rated.length,
      averageRating: round(average),
      records,
      ranges: {
        dose: summarizeMetric(records.map((record) => record.parameters.dose)),
        ratio: summarizeMetric(records.map((record) => record.parameters.ratio)),
        waterTemp: summarizeMetric(records.map((record) => record.parameters.waterTemp)),
        duration: summarizeMetric(records.map((record) => record.parameters.durationSeconds), 0)
      },
      advanced: opts.advancedRatings ? { commonDimensions: commonHandBrewDimensions(selected, opts) } : null
    }, { sampleSize: rated.length, required, excludedCount: collection.excludedCount });
  }

  function estimateKnownCost(log, beansOrMap) {
    if (!log) return { known: false, amount: null };
    if (log.source === 'external') {
      const price = Number(log.price);
      return price > 0 ? { known: true, amount: round(price, 2) } : { known: false, amount: null };
    }
    const map = beansOrMap instanceof Map ? beansOrMap : beanMapOf(beansOrMap);
    const bean = map.get(log.beanId);
    const price = Number(bean && bean.price);
    const initialWeight = Number(bean && bean.initialWeight);
    const grams = Number(log.grams);
    if (!(price > 0) || !(initialWeight > 0) || !(grams > 0)) return { known: false, amount: null };
    return { known: true, amount: beanCore.estimateDrinkCost(log, [bean]) };
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function reportPeriod(type, key) {
    if (type === 'month') {
      const match = String(key || '').match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12) return null;
      return { type, key: `${year}-${String(month).padStart(2, '0')}`, start: new Date(year, month - 1, 1), end: new Date(year, month, 1), label: `${year} 年 ${month} 月`, title: `${year} 年 ${month} 月咖啡月报` };
    }
    if (type === 'year') {
      const match = String(key || '').match(/^(\d{4})$/);
      if (!match) return null;
      const year = Number(match[1]);
      return { type, key: String(year), start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: `${year} 年`, title: `${year} 年咖啡年报` };
    }
    return null;
  }

  function periodLogs(logs, period, now) {
    const current = validDate(now || new Date()) || new Date();
    if (!period || period.end.getTime() > new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1).getTime()) return [];
    return filterLogsByRange(logs, 'all', current).filter((log) => {
      const date = validDate(log.consumedAt);
      return date && date >= period.start && date < period.end;
    });
  }

  function reportFlavorWords(logs) {
    const counts = new Map();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
      const seen = new Set();
      beanCore.flavorTags(log && log.notes).forEach((tag) => {
        if (!tag || tag.category === 'other') return;
        const label = String(tag.label || '').trim();
        if (!label || seen.has(label)) return;
        seen.add(label);
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    return Array.from(counts, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')).slice(0, 3);
  }

  function longestReportStreak(logs) {
    const keys = Array.from(new Set((Array.isArray(logs) ? logs : []).map((log) => validDate(log && log.consumedAt)).filter(Boolean).map(localDateKey))).sort();
    let longest = 0;
    let current = 0;
    let previous = null;
    keys.forEach((key) => {
      const date = validDate(`${key}T00:00:00`);
      const consecutive = previous && date && Math.round((date.getTime() - previous.getTime()) / 86400000) === 1;
      current = consecutive ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous = date;
    });
    return longest;
  }

  function availableCoffeeReports(logs, now) {
    const current = validDate(now || new Date()) || new Date();
    const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    const currentYear = new Date(current.getFullYear(), 0, 1);
    const counts = new Map();
    filterLogsByRange(logs, 'all', current).forEach((log) => {
      const date = validDate(log.consumedAt);
      if (!date) return;
      if (date < currentMonth) counts.set(`month:${monthKey(date)}`, (counts.get(`month:${monthKey(date)}`) || 0) + 1);
      if (date < currentYear) counts.set(`year:${date.getFullYear()}`, (counts.get(`year:${date.getFullYear()}`) || 0) + 1);
    });
    return Array.from(counts, ([id, cups]) => {
      const [type, key] = id.split(':');
      const period = reportPeriod(type, key);
      return cups >= COFFEE_REPORT_MIN && period ? { ...period, cups } : null;
    }).filter(Boolean).sort((a, b) => b.end.getTime() - a.end.getTime() || (a.type === 'year' ? -1 : 1));
  }

  function coffeePeriodReport(logs, beans, options) {
    const opts = options || {};
    const period = reportPeriod(opts.type, opts.key);
    if (!period) return response(false, 'invalidPeriod', null, { required: COFFEE_REPORT_MIN });
    const current = validDate(opts.now || new Date()) || new Date();
    const currentBoundary = opts.type === 'year' ? new Date(current.getFullYear(), 0, 1) : new Date(current.getFullYear(), current.getMonth(), 1);
    if (period.end > currentBoundary) return response(false, 'incompletePeriod', null, { required: COFFEE_REPORT_MIN });
    const rows = periodLogs(logs, period, current);
    if (rows.length < COFFEE_REPORT_MIN) return insufficient(rows.length, COFFEE_REPORT_MIN);
    const beansById = beanMapOf(beans);
    const home = rows.filter((log) => log.source !== 'external');
    const external = rows.filter((log) => log.source === 'external');
    const joined = home.map((log) => ({ log, bean: beansById.get(log.beanId) })).filter((item) => item.bean);
    const beanGroups = groupStats(joined, (item) => item.bean.id).map(({ key, values }) => ({ beanId: key, beanName: values[0].bean.name || '未命名咖啡豆', cups: values.length }))
      .sort((a, b) => b.cups - a.cups || a.beanName.localeCompare(b.beanName, 'zh-CN'));
    const rated = rows.filter((log) => Number(log.overallRating) > 0).slice().sort((a, b) => Number(b.overallRating) - Number(a.overallRating) || new Date(b.consumedAt) - new Date(a.consumedAt));
    const highest = rated[0] || null;
    const costs = rows.map((log) => estimateKnownCost(log, beansById));
    const knownCosts = costs.filter((item) => item.known);
    const times = timeBuckets(rows);
    const commonTime = times.ok ? times.data.slice().sort((a, b) => b.cups - a.cups || a.start - b.start)[0] : null;
    const origins = Array.from(new Set(joined.map((item) => String(item.bean.origin || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const monthlyRhythm = [];
    if (opts.type === 'year') {
      for (let month = 0; month < 12; month += 1) {
        const key = `${period.key}-${String(month + 1).padStart(2, '0')}`;
        monthlyRhythm.push({ key, label: `${month + 1}月`, cups: rows.filter((log) => monthKey(validDate(log.consumedAt)) === key).length });
      }
    }
    const activeMonth = monthlyRhythm.length ? monthlyRhythm.slice().sort((a, b) => b.cups - a.cups || a.key.localeCompare(b.key))[0] : null;
    const topBean = beanGroups[0] || null;
    const summary = topBean ? `${period.label}记录了 ${rows.length} 杯咖啡，${topBean.beanName}是这一阶段喝得最多的豆子。` : `${period.label}记录了 ${rows.length} 杯咖啡，构成了这一阶段的咖啡日常。`;
    return response(true, null, {
      type: period.type,
      key: period.key,
      label: period.label,
      title: period.title,
      cups: rows.length,
      days: new Set(rows.map((log) => localDateKey(validDate(log.consumedAt)))).size,
      beanCount: new Set(joined.map((item) => item.bean.id)).size,
      beans: beanGroups,
      homeCups: home.length,
      externalCups: external.length,
      origins,
      topBean,
      topRated: highest ? {
        id: highest.id,
        name: highest.source === 'external' ? (highest.drinkName || highest.cafeName || '外饮咖啡') : ((beansById.get(highest.beanId) || {}).name || highest.beanName || '咖啡'),
        rating: Number(highest.overallRating),
        consumedAt: highest.consumedAt,
        source: highest.source === 'external' ? 'external' : 'bean'
      } : null,
      flavors: reportFlavorWords(rows),
      commonTime: commonTime && commonTime.cups ? commonTime : null,
      longestStreak: longestReportStreak(rows),
      estimatedSpend: knownCosts.length ? round(knownCosts.reduce((sum, item) => sum + item.amount, 0), 2) : null,
      unknownCostCount: costs.length - knownCosts.length,
      monthlyRhythm,
      activeMonth: activeMonth && activeMonth.cups ? activeMonth : null,
      summary
    }, { sampleSize: rows.length, required: COFFEE_REPORT_MIN, excludedCount: costs.length - knownCosts.length });
  }

  function coffeeReportReminders(logs, now) {
    const current = validDate(now || new Date()) || new Date();
    const endOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    return availableCoffeeReports(logs, current).filter((period) => {
      const expiresAt = new Date(period.end);
      expiresAt.setDate(expiresAt.getDate() + 7);
      return period.end <= endOfToday && current < expiresAt;
    }).map((period) => ({
      id: `report:${period.type}:${period.key}`,
      type: period.type === 'year' ? 'reportYear' : 'reportMonth',
      reportType: period.type,
      reportKey: period.key,
      priority: period.type === 'year' ? 400 : 300,
      title: period.type === 'year' ? '咖啡年报已生成' : '咖啡月报已生成',
      message: `${period.label} · ${period.cups} 杯记录`,
      expiresAt: new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 7).toISOString()
    }));
  }

  function buildCoffeeReportSharePayload(report) {
    if (!report) throw new Error('缺少咖啡报告');
    const isYear = report.type === 'year';
    const badge = isYear
      ? { big: String(report.key), small: '年度' }
      : { big: `${Number((String(report.key).split('-')[1] || '').replace(/^0/, '')) || ''}月`, small: `${String(report.key).split('-')[0]} 年` };
    const highlights = [
      report.topBean ? { label: '喝得最多', value: report.topBean.beanName, sub: `${report.topBean.cups} 杯` } : null,
      report.topRated ? { label: '一杯高分记录', value: report.topRated.name, sub: `${report.topRated.rating}★` } : null,
      report.commonTime ? { label: '常喝时段', value: report.commonTime.label, sub: `${report.commonTime.cups} 杯` } : null,
      report.longestStreak ? { label: '最长连续', value: `${report.longestStreak} 天`, sub: '按自然日' } : null,
      isYear && report.activeMonth ? { label: '最活跃月份', value: report.activeMonth.label, sub: `${report.activeMonth.cups} 杯` } : null
    ].filter(Boolean);
    return {
      type: isYear ? 'coffeeYearReport' : 'coffeeMonthReport',
      style: 'report',
      reportKind: isYear ? 'year' : 'month',
      eyebrow: isYear ? '咖啡年报' : '咖啡月报',
      title: report.title,
      subtitle: report.summary,
      badge,
      hero: [
        { label: '咖啡', value: `${report.cups}`, unit: '杯' },
        { label: '记录日', value: `${report.days}`, unit: '天' },
        { label: '豆款', value: `${report.beanCount}`, unit: '款' },
        { label: '估算花费', value: report.estimatedSpend == null ? '—' : `¥${round(report.estimatedSpend, 2)}`, unit: '' }
      ],
      source: { home: report.homeCups, external: report.externalCups, unknownCost: report.unknownCostCount || 0 },
      rhythm: (report.monthlyRhythm || []).map((item) => ({ label: item.label, cups: item.cups })),
      activeMonthLabel: report.activeMonth ? report.activeMonth.label : '',
      highlights,
      flavors: report.flavors.map((item) => item.label),
      beans: report.beans.slice(0, 6).map((item) => item.beanName),
      origins: report.origins.slice(0, 6),
      footer: isYear ? '咖啡日常，按年慢慢收好 · 豆仓' : '咖啡日常，按月慢慢收好 · 豆仓'
    };
  }

  function catalogMilestone(value, levels) {
    const current = Math.max(0, Number(value) || 0);
    const milestones = Array.isArray(levels) ? levels : [];
    const achieved = milestones.filter((level) => current >= level).pop() || null;
    const next = milestones.find((level) => current < level) || null;
    return { value: current, achieved, next, remaining: next == null ? null : next - current, complete: next == null };
  }

  function classifyCatalogProcess(value) {
    const text = String(value == null ? '' : value).trim().toLocaleLowerCase('en-US');
    if (/厌氧|无氧|anaerob|carbonic|二氧化碳|乳酸|lactic|发酵|ferment|特殊|special|实验|experimental|酵母|yeast|酒桶|barrel/.test(text)) return 'special';
    if (/蜜处理|红蜜|黄蜜|黑蜜|白蜜|honey|pulped[ -]?natural|semi[ -]?washed|半水洗|湿刨|wet[ -]?hulled|giling/.test(text)) return 'honey';
    if (/水洗|washed|wash process|fully[ -]?washed/.test(text)) return 'washed';
    if (/日晒|natural|dry[ -]?process|dry process/.test(text)) return 'natural';
    return 'other';
  }

  function firstBeanConsumedAt(logs, beanId, now) {
    const rows = filterLogsByRange(logs, 'all', now).filter((log) => log && log.source !== 'external' && log.beanId === beanId);
    if (!rows.length) return null;
    return rows.map((log) => validDate(log.consumedAt)).filter(Boolean).sort((a, b) => a - b)[0].toISOString();
  }

  function catalogCover(bean, photoJournal) {
    const candidates = [];
    if (photoJournal && bean.bagCutoutImagePath) candidates.push({ type: 'cutout', path: bean.bagCutoutImagePath });
    if (bean.bagImagePath) candidates.push({ type: 'bag', path: bean.bagImagePath });
    return {
      candidates,
      placeholder: beanCore.beanPlaceholder(bean),
      needsCutoutPrompt: Boolean(photoJournal && !bean.bagCutoutImagePath)
    };
  }

  // 收集墙格子的饮用照片：按传入记录的既有顺序摊平，去重后截断。
  // 只收记录里拍的照片，豆袋照与手账抠图不进来——那两张已经是封面。
  function catalogPhotos(rows) {
    const photos = [];
    (Array.isArray(rows) ? rows : []).forEach((log) => {
      if (!log || !Array.isArray(log.photos)) return;
      log.photos.forEach((path) => {
        const clean = String(path || '').trim();
        if (clean && !photos.includes(clean)) photos.push(clean);
      });
    });
    return photos.slice(0, CATALOG_PHOTO_LIMIT);
  }

  // 每次炸开随机挑几张：rng 可注入，便于测试。
  function sampleCatalogPhotos(photos, count, rng) {
    const pool = (Array.isArray(photos) ? photos : []).filter(Boolean).slice();
    const size = Math.max(0, Math.min(Math.floor(Number(count) || 0), pool.length));
    if (!size) return [];
    const random = typeof rng === 'function' ? rng : Math.random;
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = pool[i];
      pool[i] = pool[j];
      pool[j] = swap;
    }
    return pool.slice(0, size);
  }

  function coffeeCatalog(logs, beans, options) {
    const opts = options || {};
    const currentBeans = (Array.isArray(beans) ? beans : []).filter((bean) => bean && bean.id && !bean.deletedAt);
    if (!currentBeans.length) return response(false, 'emptyBeans', null, { sampleSize: 0, required: CATALOG_REQUIRED });
    const now = validDate(opts.now || new Date()) || new Date();
    const validLogs = filterLogsByRange(logs, 'all', now);
    const beanById = new Map(currentBeans.map((bean) => [bean.id, bean]));
    // 自家图鉴只认自家冲煮：外饮有独立图鉴（externalCatalog），两边杯数与连续天数互不计入。
    const homeLogs = validLogs.filter((log) => log.source !== 'external');
    const linkedLogs = homeLogs.filter((log) => beanById.has(log.beanId));
    const logsByBean = new Map();
    linkedLogs.forEach((log) => {
      if (!logsByBean.has(log.beanId)) logsByBean.set(log.beanId, []);
      logsByBean.get(log.beanId).push(log);
    });
    const mode = opts.photoJournal ? 'journal' : 'standard';
    // 同名 + 同烘焙商视为同一款咖啡：多次购买合并成一格，杯数累加、复购次数记为 purchaseCount。
    const wallIdentity = (bean) => `${String(bean.name || '').trim().toLocaleLowerCase('en-US')}|${String(bean.roaster || '').trim().toLocaleLowerCase('en-US')}`;
    const wallGroups = new Map();
    currentBeans.forEach((bean, index) => {
      const key = wallIdentity(bean);
      if (!wallGroups.has(key)) wallGroups.set(key, []);
      wallGroups.get(key).push({ bean, index });
    });
    const wall = Array.from(wallGroups.values()).map((members) => {
      const sorted = members.slice().sort((a, b) => {
        const da = validDate(a.bean.openedDate) || validDate(a.bean.createdAt);
        const db = validDate(b.bean.openedDate) || validDate(b.bean.createdAt);
        if (da && db) return db - da;
        if (da) return -1;
        if (db) return 1;
        return a.index - b.index;
      });
      const primary = sorted[0].bean;
      const cover = sorted.find((m) => (opts.photoJournal && m.bean.bagCutoutImagePath) || m.bean.bagImagePath) || sorted[0];
      const cups = members.reduce((sum, m) => sum + (logsByBean.get(m.bean.id) || []).length, 0);
      const firstConsumedAt = members.map((m) => firstBeanConsumedAt(validLogs, m.bean.id, now)).filter(Boolean).sort()[0] || null;
      // 同款豆的多次购买合并成一格，照片也跟着合并，最近喝的排前面。
      const memberLogs = members.reduce((all, m) => all.concat(logsByBean.get(m.bean.id) || []), []).sort((a, b) => {
        const da = validDate(a.consumedAt);
        const db = validDate(b.consumedAt);
        if (da && db) return db - da;
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
      return {
        id: primary.id,
        name: String(primary.name || '未命名咖啡豆').trim() || '未命名咖啡豆',
        origin: String(primary.origin || '').trim(),
        process: String(primary.process || '').trim(),
        roastLevel: String(primary.roastLevel || '').trim(),
        cups,
        lit: cups > 0,
        purchaseCount: members.length,
        firstConsumedAt,
        photos: catalogPhotos(memberLogs),
        cover: catalogCover(cover.bean, Boolean(opts.photoJournal)),
        _index: sorted[0].index
      };
    }).sort((a, b) => Number(b.lit) - Number(a.lit)
      || (a.firstConsumedAt && b.firstConsumedAt ? new Date(a.firstConsumedAt) - new Date(b.firstConsumedAt) : 0)
      || a._index - b._index).map(({ _index, ...item }) => item);

    const originMap = new Map();
    currentBeans.forEach((bean, index) => {
      const name = String(bean.origin || '').trim();
      if (!name) return;
      if (!originMap.has(name)) {
        const firstBeanDate = validDate(bean.createdAt) || validDate(firstBeanConsumedAt(validLogs, bean.id, now));
        originMap.set(name, { name, beanIds: new Set(), cups: 0, firstSeenAt: firstBeanDate ? firstBeanDate.toISOString() : null, _index: index });
      }
      const item = originMap.get(name);
      const beanLogs = logsByBean.get(bean.id) || [];
      if (beanLogs.length) item.beanIds.add(bean.id);
      item.cups += beanLogs.length;
    });
    const origins = Array.from(originMap.values()).sort((a, b) => {
      if (a.firstSeenAt && b.firstSeenAt) return new Date(a.firstSeenAt) - new Date(b.firstSeenAt) || a._index - b._index;
      if (a.firstSeenAt) return -1;
      if (b.firstSeenAt) return 1;
      return a._index - b._index;
    }).map((item) => ({ name: item.name, beanCount: item.beanIds.size, cups: item.cups, firstSeenAt: item.firstSeenAt }));

    const processMap = new Map(CATALOG_PROCESS_GROUPS.map((group) => [group.key, { ...group, beanIds: new Set(), cups: 0, present: false }]));
    currentBeans.forEach((bean) => {
      const key = classifyCatalogProcess(bean.process);
      const item = processMap.get(key);
      item.present = true;
      const beanLogs = logsByBean.get(bean.id) || [];
      if (beanLogs.length) item.beanIds.add(bean.id);
      item.cups += beanLogs.length;
    });
    const processes = CATALOG_PROCESS_GROUPS.map((group) => processMap.get(group.key))
      .filter((item) => item.key !== 'other' || item.present)
      .map((item) => ({ key: item.key, label: item.label, lit: item.cups > 0, beanCount: item.beanIds.size, cups: item.cups }));

    const longestStreak = longestReportStreak(homeLogs);
    const data = {
      mode,
      summary: `已探索 ${origins.length} 个产地 · 点亮 ${wall.filter((item) => item.lit).length} 款豆`,
      wall,
      singleRow: wall.length <= CATALOG_WALL_SINGLE_ROW_MAX,
      origins: { items: origins, milestone: catalogMilestone(origins.length, CATALOG_ORIGIN_MILESTONES) },
      processes,
      milestones: {
        cups: catalogMilestone(homeLogs.length, CATALOG_CUP_MILESTONES),
        streak: catalogMilestone(longestStreak, CATALOG_STREAK_MILESTONES)
      }
    };
    return response(true, null, data, { sampleSize: currentBeans.length, required: CATALOG_REQUIRED, excludedCount: Math.max(0, (Array.isArray(logs) ? logs.length : 0) - homeLogs.length) });
  }

  function externalLogCost(log) {
    return beanCore.estimateDrinkCost(log, []);
  }

  function topDrinkName(rows) {
    const counts = new Map();
    rows.forEach((log) => {
      const name = String(log.drinkName || '').trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).map(([name]) => name)[0] || '';
  }

  // 外饮图鉴：只认 source === 'external'，与自家冲煮图鉴各算各的，杯数与连续天数互不计入。
  // 外饮记录没有豆款、产地和处理法，所以收集维度换成咖啡馆与地点；店名留空的记录归入一个未记名格子，避免杯数凭空消失。
  function externalCatalog(logs, options) {
    const opts = options || {};
    const now = validDate(opts.now || new Date()) || new Date();
    const validLogs = filterLogsByRange(logs, 'all', now);
    const externalLogs = validLogs.filter((log) => log.source === 'external');
    if (!externalLogs.length) return response(false, 'emptyExternal', null, { sampleSize: 0, required: CATALOG_REQUIRED });

    const byRecent = externalLogs.slice().sort((a, b) => {
      const da = validDate(a.consumedAt);
      const db = validDate(b.consumedAt);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });

    const cafeMap = new Map();
    byRecent.forEach((log) => {
      const name = String(log.cafeName || '').trim();
      const key = name ? name.toLocaleLowerCase('zh-CN') : '__unnamed__';
      if (!cafeMap.has(key)) cafeMap.set(key, { key, name: name || CATALOG_UNNAMED_CAFE, named: Boolean(name), rows: [] });
      cafeMap.get(key).rows.push(log);
    });
    const cafes = Array.from(cafeMap.values()).map((entry) => {
      const dates = entry.rows.map((log) => validDate(log.consumedAt)).filter(Boolean).sort((a, b) => a - b);
      const visits = new Set(dates.map(localDateKey)).size;
      // rows 承袭 byRecent 的倒序，所以第一张有效照片就是最近一次的照片。
      const withPhoto = entry.rows.find((log) => Array.isArray(log.photos) && log.photos.length && log.photos[0]);
      const places = Array.from(new Set(entry.rows.map((log) => String(log.location || '').trim()).filter(Boolean)));
      return {
        id: entry.key,
        name: entry.name,
        named: entry.named,
        cups: entry.rows.length,
        visits,
        spend: round(entry.rows.reduce((sum, log) => sum + externalLogCost(log), 0), 2),
        unknownCostCount: entry.rows.filter((log) => !(externalLogCost(log) > 0)).length,
        firstVisitAt: dates.length ? dates[0].toISOString() : null,
        lastVisitAt: dates.length ? dates[dates.length - 1].toISOString() : null,
        topDrink: topDrinkName(entry.rows),
        places,
        // rows 承袭 byRecent 的倒序，所以同店铺的照片天然是最近优先。
        photos: catalogPhotos(entry.rows),
        cover: {
          candidates: withPhoto ? [{ type: 'drink', path: withPhoto.photos[0] }] : [],
          placeholder: beanCore.beanPlaceholder({ id: entry.key, name: entry.name }),
          needsCutoutPrompt: false
        }
      };
    }).sort((a, b) => Number(a.named === false) - Number(b.named === false)
      || b.cups - a.cups
      || (a.firstVisitAt && b.firstVisitAt ? new Date(a.firstVisitAt) - new Date(b.firstVisitAt) : 0)
      || a.name.localeCompare(b.name, 'zh-CN'));

    const placeMap = new Map();
    byRecent.slice().reverse().forEach((log) => {
      const name = String(log.location || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('zh-CN');
      if (!placeMap.has(key)) placeMap.set(key, { name, cafeKeys: new Set(), cups: 0, firstSeenAt: null });
      const item = placeMap.get(key);
      const cafe = String(log.cafeName || '').trim();
      if (cafe) item.cafeKeys.add(cafe.toLocaleLowerCase('zh-CN'));
      item.cups += 1;
      const date = validDate(log.consumedAt);
      if (date && !item.firstSeenAt) item.firstSeenAt = date.toISOString();
    });
    const places = Array.from(placeMap.values()).sort((a, b) => {
      if (a.firstSeenAt && b.firstSeenAt) return new Date(a.firstSeenAt) - new Date(b.firstSeenAt) || a.name.localeCompare(b.name, 'zh-CN');
      if (a.firstSeenAt) return -1;
      if (b.firstSeenAt) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    }).map((item) => ({ name: item.name, cafeCount: item.cafeKeys.size, cups: item.cups, firstSeenAt: item.firstSeenAt }));

    const namedCafeCount = cafes.filter((item) => item.named).length;
    const data = {
      mode: opts.photoJournal ? 'journal' : 'standard',
      summary: `去过 ${namedCafeCount} 家咖啡馆 · 喝过 ${externalLogs.length} 杯`,
      singleRow: cafes.length <= CATALOG_WALL_SINGLE_ROW_MAX,
      cafes: { items: cafes, milestone: catalogMilestone(namedCafeCount, CATALOG_CAFE_MILESTONES) },
      places: { items: places, milestone: catalogMilestone(places.length, CATALOG_PLACE_MILESTONES) },
      milestones: {
        cups: catalogMilestone(externalLogs.length, CATALOG_EXTERNAL_CUP_MILESTONES),
        streak: catalogMilestone(longestReportStreak(externalLogs), CATALOG_STREAK_MILESTONES)
      },
      spend: {
        total: round(externalLogs.reduce((sum, log) => sum + externalLogCost(log), 0), 2),
        unknownCostCount: externalLogs.filter((log) => !(externalLogCost(log) > 0)).length
      }
    };
    return response(true, null, data, { sampleSize: externalLogs.length, required: CATALOG_REQUIRED, excludedCount: Math.max(0, (Array.isArray(logs) ? logs.length : 0) - externalLogs.length) });
  }

  function buildCoffeeCatalogSharePayload(catalog, options) {
    if (!catalog) throw new Error('缺少咖啡图鉴');
    const opts = options || {};
    const limit = Math.max(1, Number(opts.coverLimit) || 8);
    const covers = (catalog.wall || []).slice(0, limit).map((item) => ({
      name: item.name,
      origin: item.origin,
      lit: item.lit,
      candidates: item.cover && item.cover.candidates || [],
      placeholder: item.cover && item.cover.placeholder || beanCore.beanPlaceholder(item)
    }));
    const originItems = catalog.origins && catalog.origins.items || [];
    return {
      type: 'coffeeCatalog',
      style: 'catalog',
      mode: catalog.mode === 'journal' ? 'journal' : 'standard',
      eyebrow: '冲煮图鉴',
      atlasCode: 'COFFEE ATLAS',
      title: '一路喝过的咖啡',
      subtitle: catalog.summary || '',
      covers,
      remainingCovers: Math.max(0, (catalog.wall || []).length - covers.length),
      origins: originItems.slice(0, 8).map((item) => item.name),
      originCount: originItems.length,
      milestones: [
        { label: '冲煮杯数', value: `${catalog.milestones && catalog.milestones.cups ? catalog.milestones.cups.value : 0} 杯` },
        { label: '最长连续冲煮', value: `${catalog.milestones && catalog.milestones.streak ? catalog.milestones.streak.value : 0} 天` }
      ],
      footer: '本地记录 · 私人豆仓'
    };
  }

  function buildExternalCatalogSharePayload(catalog, options) {
    if (!catalog) throw new Error('缺少外饮图鉴');
    const opts = options || {};
    const limit = Math.max(1, Number(opts.coverLimit) || 8);
    const items = catalog.cafes && catalog.cafes.items || [];
    const covers = items.slice(0, limit).map((item) => ({
      name: item.name,
      // 收集墙副标题位：外饮没有产地，改放常点饮品，其次是地点。
      origin: item.topDrink || (item.places || [])[0] || '',
      lit: true,
      candidates: item.cover && item.cover.candidates || [],
      placeholder: item.cover && item.cover.placeholder || beanCore.beanPlaceholder({ id: item.id, name: item.name })
    }));
    const placeItems = catalog.places && catalog.places.items || [];
    const spendTotal = catalog.spend && Number(catalog.spend.total) || 0;
    return {
      type: 'externalCatalog',
      style: 'catalog',
      mode: catalog.mode === 'journal' ? 'journal' : 'standard',
      eyebrow: '外饮图鉴',
      atlasCode: 'CAFE ATLAS',
      title: '一路喝过的咖啡馆',
      subtitle: catalog.summary || '',
      wallLabel: '咖啡馆收集墙',
      coverFallback: '饮品未记录',
      covers,
      remainingCovers: Math.max(0, items.length - covers.length),
      origins: placeItems.slice(0, 8).map((item) => item.name),
      originCount: placeItems.length,
      originsLabel: `去过的地点 · ${placeItems.length} 个`,
      milestones: [
        { label: '外饮杯数', value: `${catalog.milestones && catalog.milestones.cups ? catalog.milestones.cups.value : 0} 杯` },
        { label: '累计花费', value: spendTotal > 0 ? `¥${round(spendTotal, 2)}` : '未记录' }
      ],
      footer: '本地记录 · 私人豆仓'
    };
  }

  function monthlySpendSeries(logs, beans, now) {
    const current = validDate(now || new Date()) || new Date();
    const start = new Date(current.getFullYear(), current.getMonth() - 11, 1);
    const months = [];
    const monthMap = new Map();
    for (let index = 0; index < 12; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      const row = { key: monthKey(date), label: `${date.getMonth() + 1}月`, amount: 0, homeAmount: 0, externalAmount: 0, cups: 0 };
      months.push(row);
      monthMap.set(row.key, row);
    }
    const beansById = beanMapOf(beans);
    let knownCount = 0;
    let excludedCount = 0;
    let homeTotal = 0;
    let externalTotal = 0;
    filterLogsByRange(logs, 'all', current).forEach((log) => {
      const date = validDate(log.consumedAt);
      if (!date || date < start) return;
      const row = monthMap.get(monthKey(date));
      if (!row) return;
      const cost = estimateKnownCost(log, beansById);
      if (!cost.known) { excludedCount += 1; return; }
      knownCount += 1;
      row.cups += 1;
      row.amount += cost.amount;
      if (log.source === 'external') {
        row.externalAmount += cost.amount;
        externalTotal += cost.amount;
      } else {
        row.homeAmount += cost.amount;
        homeTotal += cost.amount;
      }
    });
    if (knownCount < MIN_SAMPLE) return insufficient(knownCount, MIN_SAMPLE, excludedCount);
    months.forEach((row) => {
      row.amount = round(row.amount, 2);
      row.homeAmount = round(row.homeAmount, 2);
      row.externalAmount = round(row.externalAmount, 2);
    });
    return response(true, null, {
      series: months,
      total: round(homeTotal + externalTotal, 2),
      homeTotal: round(homeTotal, 2),
      externalTotal: round(externalTotal, 2)
    }, { sampleSize: knownCount, required: MIN_SAMPLE, excludedCount });
  }

  function sourceSummary(logs, beansById) {
    let cost = 0;
    let costSampleSize = 0;
    let excludedCount = 0;
    let ratingSum = 0;
    let ratedCount = 0;
    logs.forEach((log) => {
      const estimate = estimateKnownCost(log, beansById);
      if (estimate.known) { cost += estimate.amount; costSampleSize += 1; }
      else excludedCount += 1;
      const rating = Number(log.overallRating);
      if (rating > 0) { ratingSum += rating; ratedCount += 1; }
    });
    return { cups: logs.length, cost: costSampleSize ? round(cost, 2) : null, costSampleSize, averageRating: ratedCount ? round(ratingSum / ratedCount) : null, ratedCount, excludedCount };
  }

  function homeVsExternal(logs, beans) {
    const rows = (Array.isArray(logs) ? logs : []).filter((log) => log && !log.deletedAt);
    const homeLogs = rows.filter((log) => log.source !== 'external');
    const externalLogs = rows.filter((log) => log.source === 'external');
    if (homeLogs.length < MIN_SAMPLE || externalLogs.length < MIN_SAMPLE) return insufficient(Math.min(homeLogs.length, externalLogs.length), MIN_SAMPLE);
    const beansById = beanMapOf(beans);
    const home = sourceSummary(homeLogs, beansById);
    const external = sourceSummary(externalLogs, beansById);
    return response(true, null, { home, external }, { sampleSize: rows.length, required: MIN_SAMPLE * 2, excludedCount: home.excludedCount + external.excludedCount });
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function beanValueRanking(logs, beans) {
    const beansById = beanMapOf(beans);
    const grouped = groupStats((Array.isArray(logs) ? logs : []).filter((log) => log && log.source !== 'external' && beansById.has(log.beanId)), (log) => log.beanId);
    let excludedCount = 0;
    const rows = grouped.map(({ key, values }) => {
      const usable = values.map((log) => ({ log, cost: estimateKnownCost(log, beansById) })).filter((item) => {
        const valid = item.cost.known && Number(item.log.overallRating) > 0;
        if (!valid) excludedCount += 1;
        return valid;
      });
      if (usable.length < MIN_SAMPLE) return null;
      const rating = round(usable.reduce((sum, item) => sum + Number(item.log.overallRating), 0) / usable.length);
      const cost = round(median(usable.map((item) => item.cost.amount)), 2);
      return { beanId: key, beanName: beansById.get(key).name || '未命名咖啡豆', averageRating: rating, costPerCup: cost, sampleSize: usable.length, highValue: false };
    }).filter(Boolean);
    if (!rows.length) return insufficient(0, MIN_SAMPLE, excludedCount);
    const ratingMedian = median(rows.map((row) => row.averageRating));
    const costMedian = median(rows.map((row) => row.costPerCup));
    rows.forEach((row) => { row.highValue = rows.length > 1 && row.averageRating > ratingMedian && row.costPerCup < costMedian; });
    rows.sort((a, b) => Number(b.highValue) - Number(a.highValue) || b.averageRating - a.averageRating || a.costPerCup - b.costPerCup || a.beanName.localeCompare(b.beanName, 'zh-CN'));
    return response(true, null, rows, { sampleSize: rows.reduce((sum, row) => sum + row.sampleSize, 0), required: MIN_SAMPLE, excludedCount });
  }

  // 类型顺序取自 BeanCore.COFFEE_TYPES：零杯的类型也要出现，否则条形图会随记录增减跳来跳去。
  function coffeeTypeMix(logs) {
    const rows = (Array.isArray(logs) ? logs : []).filter((log) => log && !log.deletedAt);
    if (rows.length < MIN_SAMPLE) return insufficient(rows.length, MIN_SAMPLE);
    const grouped = new Map(groupStats(rows, (log) => log.coffeeType).map(({ key, values }) => [key, values.length]));
    const data = beanCore.COFFEE_TYPES.map((type) => {
      const cups = grouped.get(type) || 0;
      return { key: type, label: type, cups, percent: round(cups / rows.length * 100) };
    });
    return response(true, null, data, { sampleSize: rows.length, required: MIN_SAMPLE });
  }

  return {
    MIN_SAMPLE, HAND_BREW_MIN, HAND_BREW_BEAN_MIN, COFFEE_REPORT_MIN, DIMENSION_LABELS, FLAVOR_LABELS,
    CATALOG_REQUIRED, CATALOG_ORIGIN_MILESTONES, CATALOG_CUP_MILESTONES, CATALOG_STREAK_MILESTONES, CATALOG_PROCESS_GROUPS,
    CATALOG_CAFE_MILESTONES, CATALOG_PLACE_MILESTONES, CATALOG_EXTERNAL_CUP_MILESTONES, CATALOG_UNNAMED_CAFE,
    CATALOG_WALL_SINGLE_ROW_MAX, CATALOG_PHOTO_LIMIT, sampleCatalogPhotos,
    filterLogsByRange, filterHandBrewLogs, groupStats,
    averageDimensions, flavorProfile, preferenceGap, timeBuckets, weekdayStats,
    handBrewSummary, handBrewHabits: handBrewSummary, handBrewBeanReview, beanHandBrewReview: handBrewBeanReview,
    formatHandBrewRatio, formatHandBrewDuration,
    estimateKnownCost, monthlySpendSeries, homeVsExternal, beanValueRanking, coffeeTypeMix,
    availableCoffeeReports, coffeePeriodReport, coffeeReportReminders, buildCoffeeReportSharePayload,
    catalogMilestone, classifyCatalogProcess, firstBeanConsumedAt, coffeeCatalog, buildCoffeeCatalogSharePayload,
    externalCatalog, buildExternalCatalogSharePayload
  };
});
