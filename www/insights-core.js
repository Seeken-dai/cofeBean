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
  const DIMENSION_LABELS = {
    aroma: '香气', acidity: '酸质', sweetness: '甜感', body: '醇厚',
    aftertaste: '余韵', balance: '平衡', bitterness: '苦感'
  };
  const FLAVOR_LABELS = {
    ferment: '发酵酒香', berry: '莓果', citrus: '柑橘', floral: '花香',
    tea: '茶与香料', nutty: '坚果可可', caramel: '焦糖甜香', fruit: '其他水果', other: '其他'
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

  function freshnessRatingGap(logs, beans) {
    const beansById = beanMapOf(beans);
    const fresh = [];
    const expired = [];
    let excludedCount = 0;
    (Array.isArray(logs) ? logs : []).forEach((log) => {
      const bean = log && log.source !== 'external' ? beansById.get(log.beanId) : null;
      const rating = Number(log && log.overallRating);
      const freshness = bean && rating > 0 ? beanCore.beanFreshness(bean, log.consumedAt) : null;
      if (!freshness) { excludedCount += 1; return; }
      (freshness.level === 'expired' ? expired : fresh).push(rating);
    });
    if (fresh.length < MIN_SAMPLE || expired.length < MIN_SAMPLE) return insufficient(Math.min(fresh.length, expired.length), MIN_SAMPLE, excludedCount);
    const freshAverage = round(fresh.reduce((sum, value) => sum + value, 0) / fresh.length);
    const expiredAverage = round(expired.reduce((sum, value) => sum + value, 0) / expired.length);
    return response(true, null, {
      fresh: { cups: fresh.length, averageRating: freshAverage },
      expired: { cups: expired.length, averageRating: expiredAverage },
      difference: round(freshAverage - expiredAverage)
    }, { sampleSize: fresh.length + expired.length, required: MIN_SAMPLE * 2, excludedCount });
  }

  return {
    MIN_SAMPLE, DIMENSION_LABELS, FLAVOR_LABELS, filterLogsByRange, groupStats,
    averageDimensions, flavorProfile, preferenceGap, timeBuckets, weekdayStats,
    estimateKnownCost, monthlySpendSeries, homeVsExternal, beanValueRanking, freshnessRatingGap
  };
});
