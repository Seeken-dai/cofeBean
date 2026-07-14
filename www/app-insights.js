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
    value: { title: '日常好豆怎么统计', body: '同一支豆至少有 3 杯评分和可估算成本才进入列表。至少有两支候选豆时，才标记相对高分且单杯成本较低的豆子。' },
    handBrew: { title: '手冲回顾怎么统计', body: '只统计全部历史中明确标记为手冲的自家记录；外饮、其他冲煮方式和已删除豆子不参与。缺少某项参数只影响该项，不会让整杯记录失效。全局习惯 5 杯解锁，单豆回顾 3 杯带总评分解锁。' },
    report: { title: '咖啡月报与年报怎么统计', body: '只生成已经结束的自然月和自然年，周期内至少要有 5 杯有效记录。总杯数包含自家和外饮；豆款、产地等内容只读取当前仍在豆仓里的豆子，未填写的金额不会按零元计算。' }
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

  function handBrewNumber(value) {
    const number = Math.round((Number(value) || 0) * 10) / 10;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function handBrewWeight(value) {
    return value == null ? '' : `${handBrewNumber(value)}g`;
  }

  function handBrewTemperature(value) {
    return value == null ? '' : `${handBrewNumber(value)}°C`;
  }

  function handBrewDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '日期未记录';
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function handBrewMetricText(metric, formatter) {
    if (!metric) return '';
    const value = formatter(metric.median);
    const hasRange = metric.sampleSize >= 2 && metric.min !== metric.max;
    return { value, note: hasRange ? `${formatter(metric.min)}–${formatter(metric.max)} · ${metric.sampleSize} 个有效值` : `${metric.sampleSize} 个有效值` };
  }

  function handBrewMetricRows(data, core) {
    const definitions = [
      ['dose', '常用粉量', handBrewWeight],
      ['ratio', '常用粉水比', core.formatHandBrewRatio],
      ['waterTemp', '常用水温', handBrewTemperature],
      ['duration', '常见总时长', core.formatHandBrewDuration]
    ];
    return definitions.map(([key, label, formatter]) => {
      const metric = handBrewMetricText(data[key], formatter);
      return metric ? `<div><span>${label}</span><strong>${esc(metric.value)}</strong><small>${esc(metric.note)}</small></div>` : '';
    }).filter(Boolean).join('');
  }

  function handBrewUnlock(result, hint) {
    return `<div class="insight-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>手冲记录还在积累</strong><p>${esc(hint || remainingText(result))}</p></div></div>`;
  }

  function handBrewSummaryCard(result) {
    const count = Number(result && result.meta && result.meta.sampleSize) || 0;
    const message = count ? `已记录 ${count} 杯手冲` : '还没有手冲记录';
    const hint = count >= 5 ? '基于全部手冲记录，看看你平时怎么冲。' : '再记录几次，豆仓会慢慢整理出你的冲煮习惯。';
    return `<article class="insight-card handbrew-summary-card" data-insights-brew-review role="button" tabindex="0" aria-label="打开手冲回顾"><div class="insight-card-head"><div><span>手冲回顾</span><h4>冲煮表现${helpButton('handBrew')}</h4></div><strong>${esc(count ? `${count} 杯` : '—')}</strong></div><p>${esc(message)} · ${esc(hint)}</p><i aria-hidden="true">›</i></article>`;
  }

  function handBrewHomeSection(result) {
    return `<section class="insight-section handbrew-home-section"><div class="insight-section-title"><span>04</span><div><h3>冲煮回顾</h3><p>基于全部历史手冲记录，看看平时怎么冲</p></div></div>${handBrewSummaryCard(result)}</section>`;
  }

  function coffeeReportHomeSection(reports) {
    const latest = Array.isArray(reports) && reports[0];
    const count = Array.isArray(reports) ? reports.length : 0;
    const summary = latest ? `${latest.label}已有 ${latest.cups} 杯记录，打开看看这一阶段的咖啡日常。` : '完整自然月内记录满 5 杯后，这里会生成第一份咖啡月报。';
    return `<section class="insight-section report-home-section"><div class="insight-section-title"><span>05</span><div><h3>咖啡月报 / 咖啡年报</h3><p>把已经走完的一段咖啡日常收成一页</p></div></div><article class="insight-card coffee-report-summary-card" data-insights-reports role="button" tabindex="0" aria-label="打开咖啡月报与年报"><div><span>阶段报告</span><h4>${latest ? esc(latest.title) : '咖啡月报与年报'}${helpButton('report')}</h4><p>${esc(summary)}</p></div><strong><b>${count}</b><small>份报告</small><i aria-hidden="true">›</i></strong></article></section>`;
  }

  function reportMoney(value) {
    return value == null ? '待补充' : money(value);
  }

  function coffeeReportList(reports) {
    const list = Array.isArray(reports) ? reports : [];
    if (!list.length) return `<div class="report-page-intro"><p class="eyebrow">COFFEE REPORT</p><h3>咖啡月报与年报</h3><p>只收录已经结束、并留下至少 5 杯记录的自然月与自然年。${helpButton('report')}</p></div><div class="insight-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>第一份报告还在积累</strong><p>一个完整自然月记录满 5 杯后，月报会出现在这里。</p></div></div>`;
    return `<div class="report-page-intro"><p class="eyebrow">COFFEE REPORT</p><h3>咖啡月报与年报</h3><p>从已经走完的月份和年份里，翻出一段咖啡日常。${helpButton('report')}</p></div><div class="coffee-report-list">${list.map((report) => `<article class="coffee-report-link report-${esc(report.type)}" data-insights-report-type="${esc(report.type)}" data-insights-report-key="${esc(report.key)}" role="button" tabindex="0"><div><span>${report.type === 'year' ? '咖啡年报' : '咖啡月报'}</span><h4>${esc(report.label)}</h4><p>${esc(`${report.cups} 杯记录 · 已完成自然${report.type === 'year' ? '年' : '月'}`)}</p></div><strong aria-hidden="true">›</strong></article>`).join('')}</div>`;
  }

  function reportRhythm(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '';
    const max = Math.max(1, ...list.map((item) => Number(item.cups) || 0));
    return `<section class="coffee-report-rhythm"><div><span>12 个月杯数节奏</span><small>只呈现记录数量，不比较好坏</small></div><div role="img" aria-label="${esc(list.map((item) => `${item.label}${item.cups}杯`).join('，'))}">${list.map((item) => `<i style="--height:${Math.max(item.cups ? 8 : 2, item.cups / max * 100).toFixed(1)}%"><b>${item.cups || ''}</b><span>${esc(item.label.replace('月', ''))}</span></i>`).join('')}</div></section>`;
  }

  function coffeeReportDetail(result) {
    if (!result || !result.ok) return emptyCard(result, '这份报告暂时无法生成，请确认周期已经结束并积累至少 5 杯记录。');
    const data = result.data;
    const flavor = data.flavors.length ? `<div class="coffee-report-flavors"><span>笔记里的常见风味</span><p>${data.flavors.map((item) => `<b>${esc(item.label)}<small>${item.count}</small></b>`).join('')}</p></div>` : '';
    const topRated = data.topRated ? `<article><span>一杯评分较高的记录</span><strong>${esc(data.topRated.name)}</strong><small>${esc(handBrewDate(data.topRated.consumedAt))} · ${esc(data.topRated.rating)}★</small></article>` : '';
    const spendNote = data.unknownCostCount ? `<p class="insight-cost-note">${esc(data.unknownCostCount)} 杯缺少可估算金额，未按零元计入。</p>` : '';
    return `<div class="report-page-intro report-detail-intro"><p class="eyebrow">${data.type === 'year' ? 'COFFEE YEAR REPORT' : 'COFFEE MONTH REPORT'}</p><h3>${esc(data.title)}</h3><p>${esc(data.summary)} ${helpButton('report')}</p></div><section class="coffee-report-hero"><div><span>${esc(data.label)}</span><strong>${esc(data.cups)}</strong><small>杯咖啡</small></div><p><span><b>${esc(data.days)}</b> 个记录日</span><span><b>${esc(data.beanCount)}</b> 款豆</span><span><b>${esc(reportMoney(data.estimatedSpend))}</b> 估算花费</span></p></section><section class="coffee-report-story"><div class="coffee-report-source"><article><span>自家冲煮</span><strong>${esc(data.homeCups)} 杯</strong></article><article><span>外饮</span><strong>${esc(data.externalCups)} 杯</strong></article></div><div class="coffee-report-highlights">${data.topBean ? `<article><span>喝得最多的豆子</span><strong>${esc(data.topBean.beanName)}</strong><small>${esc(data.topBean.cups)} 杯</small></article>` : ''}${topRated}${data.commonTime ? `<article><span>常喝时段</span><strong>${esc(data.commonTime.label)}</strong><small>${esc(data.commonTime.cups)} 杯落在这个时段</small></article>` : ''}${data.longestStreak ? `<article><span>最长连续记录</span><strong>${esc(data.longestStreak)} 天</strong><small>按本地自然日计算</small></article>` : ''}</div>${flavor}${data.beans.length ? `<p class="coffee-report-origins"><span>这一阶段喝过</span>${data.beans.slice(0, 6).map((item) => `<b>${esc(item.beanName)}</b>`).join('')}</p>` : ''}${data.origins.length ? `<p class="coffee-report-origins"><span>探索过的产地</span>${data.origins.map((origin) => `<b>${esc(origin)}</b>`).join('')}</p>` : ''}${reportRhythm(data.monthlyRhythm)}${spendNote}</section><button class="coffee-report-share" data-insights-report-share type="button"><span>分享这份${data.type === 'year' ? '咖啡年报' : '咖啡月报'}</span><strong aria-hidden="true">↗</strong></button>`;
  }

  function handBrewHabitCard(result, core) {
    return `<article class="insight-card handbrew-habit-card"><div class="insight-card-head"><div><span>基于全部手冲记录</span><h4>你的手冲习惯${helpButton('handBrew')}</h4></div><small>中位数代表值</small></div>${unlockOr(result, (data) => `<div class="handbrew-habit-grid"><div><span>有效手冲杯数</span><strong>${esc(data.cups)}</strong><small>不受回顾范围影响</small></div><div><span>涉及豆款</span><strong>${esc(data.beanCount)}</strong><small>已删除豆子排除</small></div>${handBrewMetricRows(data, core)}</div><p class="insight-cost-note">范围只在有至少两个有效值时显示；没有有效值的参数不展示。</p>`, '再记录几次手冲，豆仓就能慢慢整理出你的冲煮习惯。')}</article>`;
  }

  function handBrewBeanLinks(state, core) {
    const settings = state.settings || {};
    return state.beans.filter((bean) => bean && !bean.deletedAt).map((bean) => ({
      bean,
      result: core.handBrewBeanReview(state.drinkLogs, state.beans, bean.id, { advancedRatings: Boolean(settings.advancedRatings), enabledDimensions: settings.enabledDimensions })
    })).filter((item) => item.result && item.result.ok).sort((a, b) => String(a.bean.name || '').localeCompare(String(b.bean.name || ''), 'zh-CN'));
  }

  function handBrewGlobalPage(result, state, core) {
    const unlocked = handBrewBeanLinks(state, core);
    const beans = unlocked.length ? unlocked.map(({ bean, result: beanResult }) => `<article class="handbrew-bean-link" data-insights-brew-bean="${esc(bean.id)}" role="button" tabindex="0"><div><span>单豆冲煮回顾</span><h4>${esc(bean.name || '未命名咖啡豆')}</h4><p>${esc(`${beanResult.data.ratedCount} 杯有效评分 · 平均 ${beanResult.data.averageRating}★`)}</p></div><strong aria-hidden="true">›</strong></article>`).join('') : '<div class="insight-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>还没有解锁单豆回顾</strong><p>同一支豆积累 3 杯带总评分的手冲记录后，会出现在这里。</p></div></div>';
    return `<div class="handbrew-page-intro"><p class="eyebrow">POUR-OVER NOTES</p><h3>手冲回顾</h3><p><span>基于全部手冲记录 · 只看自家手冲，不受首页时间范围影响</span>${helpButton('handBrew')}</p></div><section class="insight-section handbrew-section"><div class="insight-section-title"><span>01</span><div><h3>你的手冲习惯</h3><p>只回答平时怎么冲，不比较哪组参数更好</p></div></div>${handBrewHabitCard(result, core)}</section><section class="insight-section handbrew-section"><div class="insight-section-title"><span>02</span><div><h3>单豆冲煮回顾</h3><p>带总评分的手冲记录达到 3 杯后解锁</p></div></div><div class="handbrew-bean-list">${beans}</div></section>`;
  }

  function handBrewRangeRows(ranges, core) {
    const definitions = [
      ['dose', '粉量', handBrewWeight],
      ['ratio', '粉水比', core.formatHandBrewRatio],
      ['waterTemp', '水温', handBrewTemperature],
      ['duration', '总时长', core.formatHandBrewDuration]
    ];
    return definitions.map(([key, label, formatter]) => {
      const metric = handBrewMetricText(ranges[key], formatter);
      return metric ? `<div><span>${label}</span><strong>${esc(metric.value)}</strong><small>${esc(metric.note)}</small></div>` : '';
    }).filter(Boolean).join('');
  }

  function handBrewRecordCard(record, core, index) {
    const parameters = record.parameters || {};
    const rows = [
      parameters.dose != null ? ['粉量', handBrewWeight(parameters.dose)] : null,
      parameters.ratio != null ? ['粉水比', core.formatHandBrewRatio(parameters.ratio)] : null,
      parameters.waterTemp != null ? ['水温', handBrewTemperature(parameters.waterTemp)] : null,
      parameters.grind ? ['研磨度', parameters.grind] : null,
      parameters.durationSeconds != null ? ['总时长', core.formatHandBrewDuration(parameters.durationSeconds)] : null
    ].filter(Boolean);
    const dimensions = Array.isArray(record.dimensions) && record.dimensions.length ? `<section class="handbrew-record-dimensions"><span>本次高级评价</span><div>${record.dimensions.map((item) => `<b>${esc(item.label)} ${esc(item.value)}</b>`).join('')}</div></section>` : '';
    const steps = Array.isArray(record.steps) && record.steps.length ? `<section class="handbrew-record-steps"><div class="section-heading"><div><span>分段注水</span><small>只在展开记录后显示</small></div></div>${record.steps.map((step, stepIndex) => `<div><b>${esc(step.label || `第 ${stepIndex + 1} 段`)}</b><span>${esc([step.water ? handBrewWeight(step.water) : '', step.time, step.note].filter(Boolean).join(' · '))}</span></div>`).join('')}</section>` : '';
    return `<details class="handbrew-record"><summary><span class="handbrew-record-index">${index + 1}</span><span class="handbrew-record-date"><strong>${esc(handBrewDate(record.consumedAt))}</strong><small>饮用日期</small></span><b class="handbrew-record-rating">${esc(record.rating)}★</b><i aria-hidden="true">⌄</i></summary><div class="handbrew-record-body">${rows.length ? `<div class="handbrew-record-grid">${rows.map(([label, value]) => `<div><span>${esc(label)}</span><strong title="${esc(value)}">${esc(value)}</strong></div>`).join('')}</div>` : '<p class="handbrew-missing-note">这杯没有填写详细冲煮参数。</p>'}${dimensions}${steps}</div></details>`;
  }

  function handBrewBeanPage(result, bean, core) {
    const name = bean && bean.name || result && result.data && result.data.beanName || '未命名咖啡豆';
    if (!result || !result.ok) return `<div class="handbrew-page-intro"><p class="eyebrow">POUR-OVER NOTES</p><h3>${esc(name)}</h3><p><span>基于全部手冲记录</span></p></div>${handBrewUnlock(result, `再记录 ${Math.max(1, (result && result.meta && result.meta.required || 3) - (result && result.meta && result.meta.sampleSize || 0))} 杯带总评分的手冲，豆仓会解锁这支豆的回顾。`)}`;
    const data = result.data;
    const common = data.advanced && data.advanced.commonDimensions;
    const commonCard = common && common.length >= 3 ? `<div class="handbrew-common-note"><span>评分较高记录的共同填写维度</span><p>${common.map((item) => `${esc(item.label)} ${esc(item.value)}`).join(' · ')}<small>简单平均，不与其他参数比较。</small></p></div>` : '';
    return `<div class="handbrew-page-intro"><p class="eyebrow">POUR-OVER NOTES</p><h3>${esc(data.beanName || name)}</h3><p><span>基于全部手冲记录 · 只展示评分较高的具体记录</span>${helpButton('handBrew')}</p></div><article class="insight-card handbrew-score-card"><div><span>有效评分杯数</span><strong>${esc(data.ratedCount)}</strong></div><div><span>平均总评分</span><strong>${esc(data.averageRating)}★</strong></div></article>${data.ranges && handBrewRangeRows(data.ranges, core) ? `<article class="insight-card handbrew-range-card"><div class="insight-card-head"><div><span>选中的最多 3 条记录</span><h4>直观参数范围${helpButton('handBrew')}</h4></div><small>不生成推荐结论</small></div><div class="handbrew-range-grid">${handBrewRangeRows(data.ranges, core)}</div></article>` : ''}<section class="insight-section handbrew-section"><div class="insight-section-title"><span>03</span><div><h3>评分较高的记录</h3><p>按总评分从高到低，同分时优先较新的记录</p></div></div>${commonCard}<div class="handbrew-record-list">${data.records.map((record, index) => handBrewRecordCard(record, core, index)).join('')}</div></section>`;
  }

  function create(deps) {
    const options = deps || {};
    if (!options.state || !options.dialog || !options.core || typeof options.setDialog !== 'function') throw new Error('AppInsights.create 缺少依赖');
    const state = options.state;
    const dialog = options.dialog;
    const core = options.core;
    const setDialog = options.setDialog;
    const toast = typeof options.toast === 'function' ? options.toast : null;
    const shareReport = typeof options.shareReport === 'function' ? options.shareReport : null;
    const content = dialog.querySelector('#insightsContent');
    const homePage = dialog.querySelector('#insightsHomePage') || content;
    const brewReviewPage = dialog.querySelector('#brewReviewPage');
    const brewReviewContent = dialog.querySelector('#brewReviewContent');
    const reportReviewPage = dialog.querySelector('#reportReviewPage');
    const reportReviewContent = dialog.querySelector('#reportReviewContent');
    const title = dialog.querySelector('#insightsTitle');
    const subtitle = dialog.querySelector('#insightsSubtitle');
    const eyebrow = dialog.querySelector('#insightsEyebrow');
    const backButton = dialog.querySelector('#insightsBack');
    if (!content || !brewReviewPage || !brewReviewContent || !reportReviewPage || !reportReviewContent) throw new Error('回顾页面骨架不完整');

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

    function updatePageFrame() {
      const isBrewReview = state.insightsPage === 'brew';
      const isBeanReview = isBrewReview && Boolean(state.insightsBeanId);
      const isReportPage = state.insightsPage === 'reports' || state.insightsPage === 'report';
      const isReportDetail = state.insightsPage === 'report';
      homePage.hidden = isBrewReview || isReportPage;
      brewReviewPage.hidden = !isBrewReview;
      reportReviewPage.hidden = !isReportPage;
      if (backButton) backButton.hidden = !isBrewReview && !isReportPage;
      if (title) title.textContent = isBrewReview ? '手冲回顾' : isReportDetail ? (state.insightsReportType === 'year' ? '咖啡年报' : '咖啡月报') : isReportPage ? '咖啡月报与年报' : '回顾';
      if (subtitle) subtitle.textContent = isBrewReview ? '基于全部手冲记录 · 页内回看你的冲煮习惯' : isReportPage ? '只看已经走完的自然月与自然年' : '从每一杯里，慢慢看见自己的口味';
      if (eyebrow) eyebrow.textContent = isBrewReview ? 'POUR-OVER NOTES' : isReportPage ? 'COFFEE REPORT' : 'YOUR COFFEE';
      if (backButton) {
        backButton.setAttribute('aria-label', isBeanReview ? '返回手冲回顾' : isReportDetail ? '返回咖啡月报与年报' : '返回回顾首页');
      }
    }

    function renderHome() {
      state.insightsRange = RANGE_LABELS[state.insightsRange] ? state.insightsRange : 'all';
      state.insightsPreference = PREFERENCE_LABELS[state.insightsPreference] ? state.insightsPreference : 'origin';
      state.insightsSpendView = ['all', 'total', 'home', 'external'].includes(state.insightsSpendView) ? state.insightsSpendView : 'all';
      dialog.querySelectorAll('[data-insights-range]').forEach((button) => button.classList.toggle('active', button.dataset.insightsRange === state.insightsRange));
      const logs = core.filterLogsByRange(state.drinkLogs, state.insightsRange, new Date());
      const handBrew = core.handBrewSummary(state.drinkLogs, state.beans);
      const handBrewSection = handBrewHomeSection(handBrew);
      const reportSection = coffeeReportHomeSection(core.availableCoffeeReports(state.drinkLogs, new Date()));
      if (logs.length < (core.MIN_SAMPLE || 3)) {
        content.innerHTML = `${globalUnlock(logs)}${handBrewSection}${reportSection}`;
        return;
      }
      const dimensions = core.averageDimensions(logs, { enabled: Boolean(state.settings.advancedRatings), enabledDimensions: state.settings.enabledDimensions });
      const flavor = core.flavorProfile(logs);
      const time = core.timeBuckets(logs);
      const radar = state.settings.advancedRatings ? radarCard(dimensions) : '';
      content.innerHTML = `${openingCard(logs, flavor, time)}<section class="insight-section"><div class="insight-section-title"><span>01</span><div><h3>口味与偏好</h3><p>从饮用笔记和个人评价里慢慢整理</p></div></div><div class="insight-card-stack">${radar}${flavorCard(flavor)}${preferenceCard(logs)}</div></section>${habitsSection(logs)}${spendSection(logs)}${handBrewSection}${reportSection}`;
    }

    function renderBrewReview() {
      const settings = state.settings || {};
      const options = { advancedRatings: Boolean(settings.advancedRatings), enabledDimensions: settings.enabledDimensions };
      if (state.insightsBeanId) {
        const bean = state.beans.find((item) => item && item.id === state.insightsBeanId && !item.deletedAt);
        const result = bean ? core.handBrewBeanReview(state.drinkLogs, state.beans, bean.id, options) : null;
        brewReviewContent.innerHTML = handBrewBeanPage(result, bean, core);
        return;
      }
      const result = core.handBrewSummary(state.drinkLogs, state.beans);
      brewReviewContent.innerHTML = handBrewGlobalPage(result, state, core);
    }

    function renderReportReview() {
      if (state.insightsPage === 'report') {
        reportReviewContent.innerHTML = coffeeReportDetail(core.coffeePeriodReport(state.drinkLogs, state.beans, { type: state.insightsReportType, key: state.insightsReportKey }));
        return;
      }
      reportReviewContent.innerHTML = coffeeReportList(core.availableCoffeeReports(state.drinkLogs, new Date()));
    }

    function render() {
      updatePageFrame();
      if (state.insightsPage === 'brew') {
        renderBrewReview();
        return;
      }
      if (state.insightsPage === 'reports' || state.insightsPage === 'report') {
        renderReportReview();
        return;
      }
      renderHome();
    }

    function open() {
      hideHelp();
      state.insightsPage = 'home';
      state.insightsBeanId = null;
      state.insightsReportType = null;
      state.insightsReportKey = null;
      render();
      setDialog(dialog, true);
    }

    function close() { hideHelp(); setDialog(dialog, false); }

    function openBrewReview(beanId) {
      hideHelp();
      state.insightsPage = 'brew';
      state.insightsBeanId = beanId || null;
      render();
      setDialog(dialog, true);
    }

    function openReports() {
      hideHelp();
      state.insightsPage = 'reports';
      state.insightsReportType = null;
      state.insightsReportKey = null;
      render();
      setDialog(dialog, true);
    }

    function openReport(type, key) {
      hideHelp();
      state.insightsPage = 'report';
      state.insightsReportType = type === 'year' ? 'year' : 'month';
      state.insightsReportKey = key;
      render();
      setDialog(dialog, true);
    }

    function handleBack() {
      if (state.insightsPage === 'report') {
        state.insightsPage = 'reports';
        state.insightsReportType = null;
        state.insightsReportKey = null;
        hideHelp();
        render();
        return true;
      }
      if (state.insightsPage === 'reports') {
        state.insightsPage = 'home';
        hideHelp();
        render();
        return true;
      }
      if (state.insightsPage !== 'brew') return false;
      if (state.insightsBeanId) {
        state.insightsBeanId = null;
        hideHelp();
        render();
        return true;
      }
      state.insightsPage = 'home';
      state.insightsBeanId = null;
      hideHelp();
      render();
      return true;
    }

    function handleClick(event) {
      const help = event.target.closest('[data-insights-help]');
      if (help) { event.preventDefault(); showHelp(help.dataset.insightsHelp, help); return true; }
      hideHelp();
      const back = event.target.closest('#insightsBack');
      if (back) { event.preventDefault(); return handleBack(); }
      const summary = event.target.closest('[data-insights-brew-review]');
      if (summary) { openBrewReview(); return true; }
      const beanLink = event.target.closest('[data-insights-brew-bean]');
      if (beanLink) { openBrewReview(beanLink.dataset.insightsBrewBean); return true; }
      const reports = event.target.closest('[data-insights-reports]');
      if (reports) { openReports(); return true; }
      const reportLink = event.target.closest('[data-insights-report-type][data-insights-report-key]');
      if (reportLink) { openReport(reportLink.dataset.insightsReportType, reportLink.dataset.insightsReportKey); return true; }
      const share = event.target.closest('[data-insights-report-share]');
      if (share && shareReport) {
        const result = core.coffeePeriodReport(state.drinkLogs, state.beans, { type: state.insightsReportType, key: state.insightsReportKey });
        if (result.ok) Promise.resolve(shareReport(result.data)).catch(() => { if (toast) toast('分享失败'); });
        return true;
      }
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
    dialog.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key) || !event.target.closest('[data-insights-brew-review],[data-insights-brew-bean],[data-insights-reports],[data-insights-report-type]')) return;
      event.preventDefault();
      handleClick(event);
    });
    return { render, open, close, handleClick, handleBack, openBrewReview, openBeanReview: openBrewReview, openReports, openReport };
  }

  return { HELP_CONTENT, create, buildRadar, buildSpendLineChart, emptyCard, helpButton, remainingText, handBrewSummaryCard, handBrewRecordCard, handBrewBeanPage, coffeeReportHomeSection, coffeeReportDetail };
});
