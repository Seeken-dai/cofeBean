(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RANGE_LABELS = { '30d': '近30天', '90d': '近90天', thisYear: '今年', all: '全部' };
  const PREFERENCE_LABELS = { origin: '产地', process: '处理法', roastLevel: '烘焙度' };
  const FLAVOR_CLASSES = {
    ferment: 'wine', berry: 'berry', citrus: 'citrus', floral: 'floral', tea: 'tea',
    nutty: 'nutty', caramel: 'caramel', fruit: 'fruit', other: 'other'
  };
  const HELP_CONTENT = {
    dimensions: { title: '口味感受怎么统计', body: '只统计所选时间内已填写的高级评价。每个维度至少有 3 次评分才计算平均，至少凑齐 3 个维度后显示雷达图。' },
    flavor: { title: '杯中风味怎么整理', body: '只从喝完后写下的饮用笔记里识别风味，不读取豆袋标注。至少 3 杯笔记含有可识别风味后才展示。' },
    preference: { title: '常喝与喜欢怎么比较', body: '按当前仍在豆仓里的豆子资料分组，比较杯数、豆款和评分。外饮记录与已删除豆子不参与，修改资料后会重新计算。' },
    time: { title: '一天里的时间怎么统计', body: '按每杯记录的本地饮用时间分为凌晨、上午、下午和晚间；至少记录 3 杯后展示。' },
    weekday: { title: '一周里的日期怎么统计', body: '按每杯记录的本地日期归入星期一到星期日；至少记录 3 杯后展示。' },
    spend: { title: '咖啡开销怎么统计', body: '不随上方回顾范围变化，固定查看最近 12 个月。自家冲煮按豆价、初始重量和本次用豆量估算，外饮使用实付金额；没填金额的记录不计入。' },
    source: { title: '在家与在外怎么比较', body: '自家冲煮和外饮各至少 3 杯才比较。杯数使用全部有效记录，评分只使用已评分记录，开销只汇总能够估算的金额。' },
    freshness: { title: '赏味期怎么统计', body: '按每杯饮用日期与当前豆子的开封日、赏味期计算当时状态。期内和超期后各至少 3 杯有效评分才展示，只说明记录差异。' },
    value: { title: '日常好豆怎么统计', body: '同一支豆至少有 3 杯评分和可估算成本才进入列表。至少有两支候选豆时，才标记相对高分且单杯成本较低的豆子。' }
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function money(value) {
    const number = Math.round((Number(value) || 0) * 100) / 100;
    return `¥${number % 1 ? number.toFixed(1) : number.toFixed(0)}`;
  }

  function remainingText(result, fallback) {
    const meta = result && result.meta || {};
    if (Number.isFinite(meta.required) && Number.isFinite(meta.sampleSize)) {
      const remaining = Math.max(1, meta.required - meta.sampleSize);
      return `再记录 ${remaining} 杯，豆仓会更懂你的口味。`;
    }
    return fallback || '再记录几杯，豆仓会更懂你的口味。';
  }

  function helpButton(key) {
    const item = HELP_CONTENT[key];
    return item ? `<button type="button" class="insight-help-button" data-insights-help="${esc(key)}" aria-label="查看${esc(item.title)}">?</button>` : '';
  }

  function emptyCard(result, hint) {
    return `<div class="insight-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>再多记几杯就能看到</strong><p>${esc(hint || remainingText(result))}</p></div></div>`;
  }

  function polarPoint(cx, cy, radius, index, count) {
    const angle = -Math.PI / 2 + Math.PI * 2 * index / count;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }

  function buildRadar(axes) {
    const values = Array.isArray(axes) ? axes : [];
    if (values.length < 3) return '';
    const width = 300;
    const height = 250;
    const cx = 150;
    const cy = 124;
    const radius = 82;
    const polygon = (scale) => values.map((axis, index) => {
      const point = polarPoint(cx, cy, radius * scale, index, values.length);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(' ');
    const grids = [0.2, 0.4, 0.6, 0.8, 1].map((scale) => `<polygon points="${polygon(scale)}"></polygon>`).join('');
    const spokes = values.map((axis, index) => {
      const point = polarPoint(cx, cy, radius, index, values.length);
      return `<line x1="${cx}" y1="${cy}" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}"></line>`;
    }).join('');
    const dataPoints = values.map((axis, index) => {
      const point = polarPoint(cx, cy, radius * Math.max(0, Math.min(5, Number(axis.value))) / 5, index, values.length);
      return point;
    });
    const labels = values.map((axis, index) => {
      const point = polarPoint(cx, cy, radius + 26, index, values.length);
      const anchor = point.x < cx - 8 ? 'end' : point.x > cx + 8 ? 'start' : 'middle';
      return `<text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="${anchor}"><tspan>${esc(axis.label)}</tspan><tspan class="radar-value" x="${point.x.toFixed(1)}" dy="13">${esc(axis.value)}</tspan></text>`;
    }).join('');
    const points = dataPoints.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"></circle>`).join('');
    const label = values.map((axis) => `${axis.label}${axis.value}分`).join('，');
    return `<svg class="insight-radar" viewBox="0 0 ${width} ${height}" role="img" aria-label="口味雷达：${esc(label)}"><g class="radar-grid">${grids}${spokes}</g><polygon class="radar-shape" points="${dataPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}"></polygon><g class="radar-points">${points}</g><g class="radar-labels">${labels}</g></svg>`;
  }

  function buildSpendLineChart(series, view) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) return '';
    const definitions = [
      { id: 'total', key: 'amount', label: '总开销' },
      { id: 'home', key: 'homeAmount', label: '自家冲煮' },
      { id: 'external', key: 'externalAmount', label: '外饮' }
    ];
    const selected = view && view !== 'all' ? definitions.filter((item) => item.id === view) : definitions;
    const width = 320;
    const height = 150;
    const left = 14;
    const right = 306;
    const top = 18;
    const bottom = 114;
    const max = Math.max(1, ...rows.flatMap((row) => selected.map((item) => Number(row[item.key]) || 0)));
    const pointsFor = (item) => rows.map((row, index) => ({
      x: left + (right - left) * index / Math.max(1, rows.length - 1),
      y: bottom - (bottom - top) * (Number(row[item.key]) || 0) / max,
      row,
      value: Number(row[item.key]) || 0
    }));
    const lines = selected.slice().reverse().map((item) => {
      const points = pointsFor(item);
      const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      const dots = points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.5"><title>${esc(point.row.key)} ${item.label} ${money(point.value)}</title></circle>`).join('');
      return `<g class="spend-series spend-series-${item.id}"><polyline points="${line}"></polyline>${dots}</g>`;
    }).join('');
    const labels = rows.map((row, index) => ({ row, index })).filter(({ index }) => index % 3 === 0 || index === rows.length - 1).map(({ row, index }) => `<text x="${(left + (right - left) * index / Math.max(1, rows.length - 1)).toFixed(1)}" y="140" text-anchor="middle">${esc(row.label)}</text>`).join('');
    const aria = selected.map((item) => `${item.label}：${rows.map((row) => `${row.key}${money(row[item.key])}`).join('，')}`).join('；');
    return `<svg class="insight-spend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="近12个月咖啡花费趋势，${esc(aria)}"><line class="chart-baseline" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"></line><g class="spend-chart-lines">${lines}</g><g class="chart-labels">${labels}</g></svg>`;
  }

  function barRows(rows, valueKey, valueText) {
    const list = Array.isArray(rows) ? rows : [];
    const max = Math.max(1, ...list.map((row) => Number(row[valueKey]) || 0));
    return `<div class="insight-bars">${list.map((row) => `<div class="insight-bar-row"><div class="insight-bar-copy"><span>${esc(row.label)}</span><small>${esc(valueText(row))}</small></div><div class="insight-bar-track"><i style="--bar:${Math.max(3, (Number(row[valueKey]) || 0) / max * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`;
  }

  function unlockOr(result, render, hint) {
    return result && result.ok ? render(result.data, result.meta) : emptyCard(result, hint);
  }

  function create(deps) {
    const options = deps || {};
    if (!options.state || !options.dialog || !options.core || typeof options.setDialog !== 'function') throw new Error('AppInsights.create 缺少依赖');
    const state = options.state;
    const dialog = options.dialog;
    const core = options.core;
    const setDialog = options.setDialog;
    const toast = typeof options.toast === 'function' ? options.toast : null;
    const content = dialog.querySelector('#insightsContent');
    if (!content) throw new Error('回顾页面骨架不完整');

    function globalUnlock(logs) {
      const required = core.MIN_SAMPLE || 3;
      const remaining = Math.max(1, required - logs.length);
      return `<section class="insight-global-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><h3>先多记几杯</h3><p>再记录 ${remaining} 杯，就能从咖啡日常里慢慢看见自己的口味。</p></div></section>`;
    }

    function openingCard(logs, flavor, time) {
      const rated = logs.filter((log) => Number(log.overallRating) > 0).length;
      let sentence = `这段时间留下了 ${logs.length} 杯记录`;
      if (time.ok) {
        const favorite = time.data.slice().sort((a, b) => b.cups - a.cups)[0];
        if (favorite && favorite.cups) sentence += `，${favorite.label}是你最常喝咖啡的时候`;
      }
      if (flavor.ok && flavor.data.tags[0]) sentence += `，${flavor.data.tags[0].label}最常出现在你的笔记里`;
      sentence += '。';
      return `<section class="insight-opening"><div><p class="eyebrow">YOUR COFFEE RHYTHM</p><h3>豆仓读到的这一段日常</h3><p>${esc(sentence)}</p></div><span class="insight-opening-stamp"><b>${logs.length}</b><small>杯记录</small><em>${rated} 杯有评分</em></span></section>`;
    }

    function radarCard(result) {
      return `<article class="insight-card radar-card"><div class="insight-card-head"><div><span>高级评价</span><h4>这段时间的口味感受${helpButton('dimensions')}</h4></div><small>5 分制平均</small></div>${unlockOr(result, (data) => buildRadar(data.axes))}</article>`;
    }

    function flavorCard(result) {
      return `<article class="insight-card flavor-card"><div class="insight-card-head"><div><span>饮用笔记</span><h4>杯中常出现的风味${helpButton('flavor')}</h4></div><small>不含豆袋标注</small></div>${unlockOr(result, (data) => {
        const tags = `<div class="insight-flavor-tags">${data.tags.map((tag) => `<span class="flavor-${esc(FLAVOR_CLASSES[tag.category] || 'other')}">${esc(tag.label)}<b>${tag.count}</b></span>`).join('')}</div>`;
        return `${tags}${barRows(data.categories.slice(0, 5), 'count', (row) => `${row.count} 次`)}`;
      }, result && result.meta.sampleSize === 0 ? '下次喝完写下几种风味，豆仓才能慢慢读懂你的偏好。' : remainingText(result))}</article>`;
    }

    function preferenceCard(logs) {
      const field = state.insightsPreference || 'origin';
      const result = core.preferenceGap(logs, state.beans, field);
      const tabs = Object.entries(PREFERENCE_LABELS).map(([key, label]) => `<button type="button" data-insights-preference="${key}" class="${field === key ? 'active' : ''}">${label}</button>`).join('');
      return `<article class="insight-card preference-card"><div class="insight-card-head"><div><span>选择与评价</span><h4>常喝的，也更喜欢吗${helpButton('preference')}</h4></div></div><nav class="insight-mini-tabs" aria-label="偏好维度">${tabs}</nav>${unlockOr(result, (data) => {
        const conclusion = data.conclusion ? `<p class="insight-conclusion">${esc(data.conclusion)}</p>` : '<p class="insight-conclusion muted">样本正在积累，暂不下偏好结论。</p>';
        return `${conclusion}${barRows(data.groups, 'cups', (row) => `${row.beanCount} 款 · ${row.cups} 杯 · ${row.averageRating}★`)}`;
      })}</article>`;
    }

    function habitsSection(logs) {
      const times = core.timeBuckets(logs);
      const weekdays = core.weekdayStats(logs);
      const timeCard = `<article class="insight-card"><div class="insight-card-head"><div><span>一天里的节奏</span><h4>一天里什么时候喝得多${helpButton('time')}</h4></div></div>${unlockOr(times, (data) => barRows(data, 'cups', (row) => `${row.hint} · ${row.cups} 杯`))}</article>`;
      const weekdayCard = `<article class="insight-card"><div class="insight-card-head"><div><span>一周里的节奏</span><h4>一周里哪天喝得多${helpButton('weekday')}</h4></div></div>${unlockOr(weekdays, (data) => {
        const max = Math.max(1, ...data.map((row) => row.cups));
        return `<div class="weekday-chart" role="img" aria-label="${esc(data.map((row) => `${row.label}${row.cups}杯`).join('，'))}">${data.map((row) => `<span><b>${row.cups || ''}</b><i style="--height:${Math.max(row.cups ? 10 : 2, row.cups / max * 100).toFixed(1)}%"></i><small>${esc(row.shortLabel)}</small></span>`).join('')}</div>`;
      })}</article>`;
      return `<section class="insight-section"><div class="insight-section-title"><span>02</span><div><h3>喝咖啡的习惯</h3><p>看看咖啡如何落进你的日常节奏</p></div></div><div class="insight-card-stack two-up">${timeCard}${weekdayCard}</div></section>`;
    }

    function spendCard(result) {
      return `<article class="insight-card spend-card"><div class="insight-card-head"><div><span>不随上方范围变化</span><h4>近 12 个月的咖啡开销${helpButton('spend')}</h4></div></div>${unlockOr(result, (data, meta) => {
        const view = state.insightsSpendView || 'all';
        const metric = (id, label, value, className) => `<button class="${className || ''}${view === 'all' || view === id ? ' is-active' : ''}" data-insights-spend-view="${id}" type="button" aria-pressed="${view === 'all' || view === id}"><span>${label}</span><strong>${money(value)}</strong></button>`;
        return `<div class="spend-breakdown" aria-label="切换花费图表">${metric('total', '总开销', data.total, 'is-total')}${metric('home', '自家冲煮', data.homeTotal)}${metric('external', '外饮', data.externalTotal)}</div>${buildSpendLineChart(data.series, view)}<p class="spend-chart-hint">点击上方金额可单独查看，再点一次恢复全部。</p>${meta.excludedCount ? '<p class="insight-cost-note">部分记录未填写价格，未计入估算。</p>' : ''}`;
      }, '再补充几杯的价格，豆仓就能画出你的花费节奏。')}</article>`;
    }

    function sourceCompareCard(result) {
      return `<article class="insight-card"><div class="insight-card-head"><div><span>自家与外饮</span><h4>喜欢在家还是在外${helpButton('source')}</h4></div></div>${unlockOr(result, (data, meta) => {
        const group = (title, row) => `<div><span>${title}</span><b>${row.cups} 杯</b><small>${row.costSampleSize ? money(row.cost) : '金额待补'} · ${row.averageRating ? `${row.averageRating}★` : '未评分'}</small></div>`;
        return `<div class="source-compare">${group('自家冲煮', data.home)}${group('在店喝', data.external)}</div>${meta.excludedCount ? '<p class="insight-cost-note">部分记录未填写价格，未计入估算。</p>' : ''}`;
      }, '自家冲煮和外饮各积累 3 杯后，再来看看它们的差别。')}</article>`;
    }

    function valueCard(result) {
      return `<article class="insight-card value-card"><div class="insight-card-head"><div><span>评分与成本</span><h4>值得再买的日常好豆${helpButton('value')}</h4></div><small>每款至少3杯</small></div>${unlockOr(result, (data) => `<div class="value-list">${data.slice(0, 6).map((row) => `<div class="value-row${row.highValue ? ' is-highlight' : ''}"><div><b>${esc(row.beanName)}</b><small>${row.sampleSize} 杯有效记录</small></div><span><b>${row.averageRating}★</b><small>${money(row.costPerCup)} / 杯</small></span>${row.highValue ? '<em>高分低成本</em>' : ''}</div>`).join('')}</div>`, '同一支豆积累 3 杯评分和价格记录后，豆仓会帮你寻找日常好豆。')}</article>`;
    }

    function freshnessCard(result) {
      return `<article class="insight-card freshness-card"><div class="insight-card-head"><div><span>赏味期记录</span><h4>赏味期内，会更喜欢吗${helpButton('freshness')}</h4></div></div>${unlockOr(result, (data) => `<div class="freshness-compare"><div><span>赏味期内</span><b>${data.fresh.averageRating}★</b><small>${data.fresh.cups} 杯</small></div><i aria-hidden="true">${data.difference > 0 ? `+${data.difference}` : data.difference}</i><div><span>超期以后</span><b>${data.expired.averageRating}★</b><small>${data.expired.cups} 杯</small></div></div><p class="insight-cost-note">这是你记录中的评分差异，不代表赏味期是唯一原因。</p>`, '赏味期内和超期后各记录 3 杯，才能看出稳定差异。')}</article>`;
    }

    function showHelp(key, anchor) {
      const item = HELP_CONTENT[key];
      if (!item) return;
      const pop = document.querySelector('#insightsHelpPopover');
      if (!pop || typeof pop.showPopover !== 'function') {
        if (toast) toast(`${item.title}：${item.body}`);
        return;
      }
      const isOpen = pop.matches(':popover-open');
      if (isOpen && pop.dataset.helpKey === key) {
        pop.hidePopover();
        pop.dataset.helpKey = '';
        return;
      }
      pop.dataset.helpKey = key;
      pop.innerHTML = `<strong>${esc(item.title)}</strong><p>${esc(item.body)}</p>`;
      if (!isOpen) pop.showPopover();
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 8));
      const above = rect.top - pop.offsetHeight - 8;
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(above < 8 ? rect.bottom + 8 : above)}px`;
    }

    function hideHelp() {
      const pop = document.querySelector('#insightsHelpPopover');
      if (pop && pop.matches(':popover-open')) pop.hidePopover();
      if (pop) pop.dataset.helpKey = '';
    }

    function spendSection(logs) {
      const monthly = core.monthlySpendSeries(state.drinkLogs, state.beans, new Date());
      const source = core.homeVsExternal(logs, state.beans);
      const value = core.beanValueRanking(logs, state.beans);
      const freshness = core.freshnessRatingGap(logs, state.beans);
      return `<section class="insight-section"><div class="insight-section-title"><span>03</span><div><h3>花费与回购</h3><p>金额只统计能够估算的记录</p></div></div><div class="insight-card-stack">${spendCard(monthly)}<div class="two-up">${sourceCompareCard(source)}${freshnessCard(freshness)}</div>${valueCard(value)}</div></section>`;
    }

    function render() {
      state.insightsRange = RANGE_LABELS[state.insightsRange] ? state.insightsRange : 'all';
      state.insightsPreference = PREFERENCE_LABELS[state.insightsPreference] ? state.insightsPreference : 'origin';
      state.insightsSpendView = ['all', 'total', 'home', 'external'].includes(state.insightsSpendView) ? state.insightsSpendView : 'all';
      dialog.querySelectorAll('[data-insights-range]').forEach((button) => button.classList.toggle('active', button.dataset.insightsRange === state.insightsRange));
      const logs = core.filterLogsByRange(state.drinkLogs, state.insightsRange, new Date());
      if (logs.length < (core.MIN_SAMPLE || 3)) {
        content.innerHTML = globalUnlock(logs);
        return;
      }
      const dimensions = core.averageDimensions(logs, { enabled: Boolean(state.settings.advancedRatings), enabledDimensions: state.settings.enabledDimensions });
      const flavor = core.flavorProfile(logs);
      const time = core.timeBuckets(logs);
      const radar = state.settings.advancedRatings ? radarCard(dimensions) : '';
      content.innerHTML = `${openingCard(logs, flavor, time)}<section class="insight-section"><div class="insight-section-title"><span>01</span><div><h3>口味与偏好</h3><p>从饮用笔记和个人评价里慢慢整理</p></div></div><div class="insight-card-stack">${radar}${flavorCard(flavor)}${preferenceCard(logs)}</div></section>${habitsSection(logs)}${spendSection(logs)}`;
    }

    function open() {
      hideHelp();
      render();
      setDialog(dialog, true);
    }

    function close() { hideHelp(); setDialog(dialog, false); }

    function handleClick(event) {
      const help = event.target.closest('[data-insights-help]');
      if (help) { event.preventDefault(); showHelp(help.dataset.insightsHelp, help); return true; }
      hideHelp();
      const spendView = event.target.closest('[data-insights-spend-view]');
      if (spendView) {
        const next = spendView.dataset.insightsSpendView;
        state.insightsSpendView = state.insightsSpendView === next ? 'all' : next;
        render();
        return true;
      }
      const range = event.target.closest('[data-insights-range]');
      if (range) { state.insightsRange = range.dataset.insightsRange; render(); return true; }
      const preference = event.target.closest('[data-insights-preference]');
      if (preference) { state.insightsPreference = preference.dataset.insightsPreference; render(); return true; }
      return false;
    }

    dialog.addEventListener('close', hideHelp);
    return { render, open, close, handleClick };
  }

  return { HELP_CONTENT, create, buildRadar, buildSpendLineChart, emptyCard, helpButton, remainingText };
});
