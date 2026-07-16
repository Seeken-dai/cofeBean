(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RANGE_LABELS = { '30d': '近30天', '90d': '近90天', thisYear: '今年', all: '全部' };
  // 收集墙格子炸开时最多铺几张照片
  const BURST_PHOTO_COUNT = 5;
  // 相对格子中心的不规则散落（不是等距扇形）：x/y 为归一化偏移，r 旋转，s 相对缩放。
  const BURST_SCATTER = [
    { x: -0.72, y: -0.58, r: -16, s: 1.02 },
    { x: 0.68, y: -0.26, r: 12, s: 0.93 },
    { x: -0.28, y: 0.62, r: -8, s: 1.08 },
    { x: 0.58, y: 0.52, r: 17, s: 0.9 },
    { x: 0.06, y: -0.78, r: 5, s: 0.97 }
  ];
  // 外饮封面轮播：500ms 一个 tick，8 个 tick(=4s)轮到同一格一次；第 i 格相位取 i % 8，让整墙错峰而不是齐刷刷翻。
  const ROTATOR_TICK_MS = 500;
  const ROTATOR_TICKS_PER_TURN = 8;
  const ROTATOR_SLIDE_MS = 460;
  const PREFERENCE_LABELS = { origin: '产地', process: '处理法', roastLevel: '烘焙度' };
  const FLAVOR_CLASSES = {
    ferment: 'wine', berry: 'berry', sour: 'sour', citrus: 'citrus', floral: 'floral', tea: 'tea', spice: 'spice',
    green: 'green', papery: 'papery', chemical: 'chemical', roasted: 'roasted', nutty: 'nutty', dairy: 'dairy',
    caramel: 'caramel', fruit: 'fruit', other: 'other'
  };
  const HELP_CONTENT = {
    dimensions: { title: '口味感受怎么统计', body: '只统计所选时间内已填写的高级评价。每个维度至少有 3 次评分才计算平均，至少凑齐 3 个维度后显示雷达图。' },
    flavor: { title: '杯中风味怎么整理', body: '只从喝完后写下的饮用笔记里识别风味，不读取豆袋标注。至少 3 杯笔记含有可识别风味后才展示。' },
    preference: { title: '常喝与喜欢怎么比较', body: '按当前仍在豆仓里的豆子资料分组，比较杯数、豆款和评分。外饮记录与已删除豆子不参与，修改资料后会重新计算。' },
    catalogHome: { title: '冲煮图鉴怎么统计', body: '只统计自家冲煮，外饮在隔壁那页。固定基于全部历史。照片只改变收藏册的样子，不影响点亮与统计；点开格子能看到这支豆的饮用照片。' },
    catalogExternal: { title: '外饮图鉴怎么统计', body: '只统计外饮，自家冲煮在隔壁那页。固定基于全部历史。点开格子能看到这家店的饮用照片。' },
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
      const raw = Math.max(0, Math.min(5, Number(axis.value)));
      const plotted = axis.key === 'bitterness' ? 6 - Math.max(1, raw) : raw;
      const point = polarPoint(cx, cy, radius * plotted / 5, index, values.length);
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
    return `<section class="insight-section handbrew-home-section" id="insightsSectionBrew"><div class="insight-section-title"><span>04</span><div><h3>冲煮回顾</h3><p>基于全部历史手冲记录，看看平时怎么冲</p></div></div>${handBrewSummaryCard(result)}</section>`;
  }

  function reportMoney(value) {
    return value == null ? '待补充' : money(value);
  }

  function coffeeReportList(reports) {
    const list = Array.isArray(reports) ? reports : [];
    if (!list.length) return `<p class="report-list-note">只收录已经结束、并留下至少 5 杯记录的自然月与自然年。${helpButton('report')}</p><div class="insight-unlock"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>第一份报告还在积累</strong><p>一个完整自然月记录满 5 杯后，月报会出现在这里。</p></div></div>`;
    return `<p class="report-list-note">从已经走完的月份和年份里，翻出一段咖啡日常。${helpButton('report')}</p><div class="coffee-report-list">${list.map((report) => `<article class="coffee-report-link report-${esc(report.type)}" data-insights-report-type="${esc(report.type)}" data-insights-report-key="${esc(report.key)}" role="button" tabindex="0"><div><span>${report.type === 'year' ? '咖啡年报' : '咖啡月报'}</span><h4>${esc(report.label)}</h4><p>${esc(`${report.cups} 杯记录 · 已完成自然${report.type === 'year' ? '年' : '月'}`)}</p></div><strong aria-hidden="true">›</strong></article>`).join('')}</div>`;
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
    const shareCatalog = typeof options.shareCatalog === 'function' ? options.shareCatalog : null;
    const reopenPersonal = typeof options.reopenPersonal === 'function' ? options.reopenPersonal : null;
    const imageSrc = typeof options.imageSrc === 'function' ? options.imageSrc : (path) => path;
    const openImagePreview = typeof options.openImagePreview === 'function' ? options.openImagePreview : null;
    const content = dialog.querySelector('#insightsContent');
    const homePage = dialog.querySelector('#insightsHomePage') || content;
    const brewReviewPage = dialog.querySelector('#brewReviewPage');
    const brewReviewContent = dialog.querySelector('#brewReviewContent');
    const reportReviewPage = dialog.querySelector('#reportReviewPage');
    const reportReviewContent = dialog.querySelector('#reportReviewContent');
    const catalogPage = dialog.querySelector('#catalogPage');
    const catalogContent = dialog.querySelector('#catalogContent');
    const catalogTabs = dialog.querySelector('#catalogTabs');
    const title = dialog.querySelector('#insightsTitle');
    const subtitle = dialog.querySelector('#insightsSubtitle');
    const eyebrow = dialog.querySelector('#insightsEyebrow');
    const closeButton = dialog.querySelector('#insightsClose');
    let burstLayer = null;
    let rotatorTimer = null;
    let rotatorTick = 0;
    if (!content || !brewReviewPage || !brewReviewContent || !reportReviewPage || !reportReviewContent || !catalogPage || !catalogContent) throw new Error('回顾页面骨架不完整');

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
      return `<section class="insight-section" id="insightsSectionHabits"><div class="insight-section-title"><span>02</span><div><h3>喝咖啡的习惯</h3><p>看看咖啡如何落进你的日常节奏</p></div></div><div class="insight-card-stack two-up">${timeCard}${weekdayCard}</div></section>`;
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
      return `<section class="insight-section" id="insightsSectionSpend"><div class="insight-section-title"><span>03</span><div><h3>花费与回购</h3><p>金额只统计能够估算的记录</p></div></div><div class="insight-card-stack">${spendCard(monthly)}<div class="two-up">${sourceCompareCard(source)}${freshnessCard(freshness)}</div>${valueCard(value)}</div></section>`;
    }

    function catalogCover(item, options) {
      const opts = options || {};
      const cover = item.cover || {};
      const placeholder = cover.placeholder || {};
      const photos = Array.isArray(item.photos) ? item.photos : [];
      // 轮播形态：同店铺有多张照片时铺两层图片交叉滑动，路径清单挂在封面上供 ticker 取用。
      const rotate = Boolean(opts.rotate) && photos.length > 1;
      const paths = (cover.candidates || []).map((candidate) => ({ src: imageSrc(candidate.path), type: candidate.type || 'bag' })).filter((candidate) => candidate.src);
      let image = '';
      if (rotate) {
        // incoming 先不写 src：空 src 会被 CSS 藏起，也避免手账 overflow 一旦失效时露破图。
        image = `<img class="is-photo is-current" src="${esc(imageSrc(photos[0]))}" data-rotator-path="${esc(photos[0])}" alt="" loading="lazy"><img class="is-photo is-incoming" data-rotator-path="" alt="" aria-hidden="true">`;
      } else if (paths.length) {
        image = `<img class="${paths[0].type === 'cutout' ? 'is-cutout' : 'is-photo'}" src="${esc(paths[0].src)}" data-catalog-candidates="${esc(JSON.stringify(paths))}" data-catalog-index="0" alt="" loading="lazy">`;
      }
      const rotator = rotate ? ` data-catalog-rotator="${esc(JSON.stringify(photos))}"` : '';
      return `<div class="catalog-cover bean-thumb--${esc(placeholder.roastKey || 'neutral')}" style="--catalog-tilt:${Number(placeholder.rotation) || 0}deg"${rotator}><span aria-hidden="true">${esc(placeholder.glyph || '豆')}</span>${image}</div>`;
    }

    // 没有饮用照片的格子完全不可点：不给 role/tabindex，也不进炸开分支。
    function catalogBurstAttrs(item) {
      const photos = Array.isArray(item.photos) ? item.photos : [];
      if (!photos.length) return '';
      return ` data-catalog-burst="${esc(String(item.id))}" data-catalog-photos="${esc(JSON.stringify(photos))}" data-catalog-label="${esc(item.name)}" role="button" tabindex="0" aria-label="展开${esc(item.name)}的照片"`;
    }

    function catalogMilestoneCopy(progress, unit) {
      if (!progress) return '';
      if (progress.complete) return `已走过全部既定档位 · 当前 ${progress.value}${unit}`;
      if (!progress.achieved) return `下一档 ${progress.next}${unit} · 还差 ${progress.remaining}${unit}`;
      return `已达成 ${progress.achieved}${unit} · 下一档还差 ${progress.remaining}${unit}`;
    }

    function catalogTab() {
      return state.insightsCatalogTab === 'external' ? 'external' : 'home';
    }

    function motionReduced() {
      return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function stopCatalogRotator() {
      if (rotatorTimer == null) return;
      clearInterval(rotatorTimer);
      rotatorTimer = null;
    }

    function startCatalogRotator() {
      stopCatalogRotator();
      if (burstLayer || motionReduced() || document.hidden) return;
      if (state.insightsPage !== 'catalog' || catalogTab() !== 'external') return;
      if (!catalogContent.querySelector('[data-catalog-rotator]')) return;
      rotatorTick = 0;
      rotatorTimer = setInterval(tickCatalogRotator, ROTATOR_TICK_MS);
    }

    function tickCatalogRotator() {
      const covers = Array.from(catalogContent.querySelectorAll('[data-catalog-rotator]'));
      if (!covers.length || !dialog.open) { stopCatalogRotator(); return; }
      rotatorTick += 1;
      // 满一轮之后才开始翻，之后每格按自己的相位每 4s 翻一次，相邻格子差一个 tick。
      if (rotatorTick < ROTATOR_TICKS_PER_TURN) return;
      covers.forEach((cover, index) => {
        if (rotatorTick % ROTATOR_TICKS_PER_TURN === index % ROTATOR_TICKS_PER_TURN) rotateCatalogCover(cover);
      });
    }

    function rotatorPaths(node, key) {
      try {
        const parsed = JSON.parse(node.dataset[key] || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (_) {
        return [];
      }
    }

    function rotateCatalogCover(cover) {
      if (cover.dataset.rotatorBusy === '1') return;
      const photos = rotatorPaths(cover, 'catalogRotator');
      const current = cover.querySelector('img.is-current');
      const incoming = cover.querySelector('img.is-incoming');
      if (photos.length < 2 || !current || !incoming) return;
      const next = core.sampleCatalogPhotos(photos.filter((path) => path !== current.dataset.rotatorPath), 1)[0];
      if (!next) return;
      cover.dataset.rotatorBusy = '1';
      incoming.dataset.rotatorPath = next;
      incoming.src = imageSrc(next);
      // 装好 src 后再显示，避免空图破图在裁切失效时露边。
      incoming.style.visibility = '';
      incoming.style.opacity = '';
      incoming.style.transition = 'none';
      incoming.style.transform = 'translateX(100%)';
      // 强制回流把起点提交给渲染，再改 transform 才会走过渡；不用 rAF 是因为页面在后台时 rAF 不触发，格子会卡住。
      void incoming.offsetHeight;
      incoming.style.transition = '';
      incoming.style.transform = 'translateX(0)';
      current.style.transform = 'translateX(-100%)';
      // 用定时器而不是 transitionend 收尾：面板被隐藏时 transitionend 可能永远不来，格子会卡在半路。
      setTimeout(() => {
        current.classList.replace('is-current', 'is-incoming');
        incoming.classList.replace('is-incoming', 'is-current');
        current.style.transition = 'none';
        current.style.transform = 'translateX(100%)';
        incoming.style.transition = 'none';
        incoming.style.transform = 'translateX(0)';
        void cover.offsetHeight;
        current.style.transition = '';
        incoming.style.transition = '';
        cover.dataset.rotatorBusy = '0';
      }, ROTATOR_SLIDE_MS);
    }

    function preventBurstScroll(event) {
      // 炸开层盖住 sheet 时仍可能把滚动手势传给 dialog；直接吃掉，避免照片与格子脱节。
      event.preventDefault();
    }

    function setBurstScrollLock(locked) {
      if (locked) {
        if (dialog.dataset.burstScrollLock === '1') return;
        const top = dialog.scrollTop || 0;
        dialog.dataset.burstScrollLock = '1';
        dialog.dataset.burstScrollTop = String(top);
        dialog.classList.add('is-catalog-burst-open');
        // overflow 从 auto 切到 hidden 时部分浏览器会把 scrollTop 清零，立刻写回，避免量坐标前内容已跳位。
        dialog.scrollTop = top;
        void dialog.offsetHeight;
        dialog.scrollTop = top;
        dialog.addEventListener('wheel', preventBurstScroll, { passive: false });
        dialog.addEventListener('touchmove', preventBurstScroll, { passive: false });
        return;
      }
      if (dialog.dataset.burstScrollLock !== '1') return;
      const top = Number(dialog.dataset.burstScrollTop || 0);
      delete dialog.dataset.burstScrollLock;
      delete dialog.dataset.burstScrollTop;
      dialog.classList.remove('is-catalog-burst-open');
      dialog.removeEventListener('wheel', preventBurstScroll);
      dialog.removeEventListener('touchmove', preventBurstScroll);
      dialog.scrollTop = top;
    }

    function stopCatalogBurst() {
      if (!burstLayer) return false;
      const layer = burstLayer;
      burstLayer = null;
      setBurstScrollLock(false);
      layer.classList.remove('is-open');
      if (motionReduced()) layer.remove();
      else setTimeout(() => layer.remove(), 200);
      return true;
    }

    function closeCatalogBurst() {
      if (!stopCatalogBurst()) return false;
      startCatalogRotator();
      return true;
    }

    function clampBurstPoint(value, min, max) {
      if (max < min) return min;
      return Math.min(max, Math.max(min, value));
    }

    // absolute 层钉在当前滚动可视区：top 用锁滚动时记下的 scrollTop，高度用可视框，蒙版才能盖住下方已滚入视野的内容。
    function layoutBurstLayer(layer) {
      const top = Number(dialog.dataset.burstScrollTop != null ? dialog.dataset.burstScrollTop : (dialog.scrollTop || 0));
      // clientHeight 才是滚动视口高度；getBoundingClientRect 含边框，给一点余量避免底部露缝。
      const height = Math.max(dialog.clientHeight || 0, Math.round(dialog.getBoundingClientRect().height) || 0) + 2;
      layer.style.position = 'absolute';
      layer.style.top = `${top}px`;
      layer.style.left = '0';
      layer.style.right = '0';
      layer.style.width = '100%';
      layer.style.height = `${height}px`;
      layer.style.bottom = 'auto';
    }

    // 收集墙 overflow-x 会裁掉格子内定位；炸开层改 absolute 铺满当前可视区（不用 fixed，避免蒙版盖不全）。
    // 必须先锁滚动再量测格子：否则 overflow 变化导致的 scroll 跳动会让散落中心偏掉。
    function openCatalogBurst(tile) {
      const key = tile.dataset.catalogBurst || '';
      const reopened = Boolean(burstLayer) && burstLayer.dataset.burstKey === key;
      stopCatalogBurst();
      if (reopened) { startCatalogRotator(); return true; }
      const picked = core.sampleCatalogPhotos(rotatorPaths(tile, 'catalogPhotos'), BURST_PHOTO_COUNT);
      if (!picked.length) { startCatalogRotator(); return false; }
      stopCatalogRotator();
      const label = tile.dataset.catalogLabel || '照片';
      const layer = document.createElement('div');
      layer.className = 'catalog-burst';
      layer.dataset.burstKey = key;
      layer.innerHTML = '<div class="catalog-burst-scrim"></div>';
      layer.addEventListener('wheel', preventBurstScroll, { passive: false });
      layer.addEventListener('touchmove', preventBurstScroll, { passive: false });
      // 先挂空层 → 锁滚动 → 按当前 scrollTop 铺满可视区 → 再量测，保证蒙版与坐标都对准。
      dialog.appendChild(layer);
      burstLayer = layer;
      setBurstScrollLock(true);
      layoutBurstLayer(layer);
      void layer.offsetHeight;
      const host = layer.getBoundingClientRect();
      const rect = tile.getBoundingClientRect();
      // 格子若已滚出可视区，收起炸开，避免照片飞到奇怪位置。
      if (rect.bottom < host.top + 8 || rect.top > host.bottom - 8 || rect.right < host.left + 8 || rect.left > host.right - 8) {
        stopCatalogBurst();
        startCatalogRotator();
        return false;
      }
      const baseWidth = Math.min(136, Math.max(92, Math.round(rect.width * 1.22)));
      const pad = 12;
      const tileCenterX = rect.left - host.left + rect.width / 2;
      const tileCenterY = rect.top - host.top + rect.height / 2;
      const radiusX = Math.max(58, rect.width * 0.95);
      const radiusY = Math.max(52, rect.height * 0.88);
      const patternShift = Math.abs(String(key).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % BURST_SCATTER.length;
      picked.forEach((path, index) => {
        const scatter = BURST_SCATTER[(index + patternShift) % BURST_SCATTER.length];
        const width = Math.round(baseWidth * scatter.s);
        const height = Math.round(width * 1.25);
        const originX = Math.round(tileCenterX - width / 2);
        const originY = Math.round(tileCenterY - height / 2);
        const image = document.createElement('img');
        image.className = 'catalog-burst-photo';
        image.src = imageSrc(path);
        image.alt = '';
        image.dataset.previewImage = path;
        image.dataset.previewLabel = `${label} · 照片 ${index + 1}`;
        image.style.width = `${width}px`;
        image.style.height = `${height}px`;
        image.style.transitionDelay = `${index * 28}ms`;
        image.style.transform = `translate3d(${originX}px, ${originY}px, 0) scale(.36) rotate(${(scatter.r * 0.25).toFixed(1)}deg)`;
        const rawX = tileCenterX - width / 2 + scatter.x * radiusX;
        const rawY = tileCenterY - height / 2 + scatter.y * radiusY;
        const endX = Math.round(clampBurstPoint(rawX, pad, host.width - width - pad));
        const endY = Math.round(clampBurstPoint(rawY, pad, host.height - height - pad));
        image.dataset.burstTransform = `translate3d(${endX}px, ${endY}px, 0) rotate(${scatter.r.toFixed(1)}deg)`;
        image.style.zIndex = String(10 + index);
        layer.appendChild(image);
      });
      // 先强制回流提交起点，再切到展开位；不用 rAF 是因为页面在后台时 rAF 不触发，炸开层会停在起点且始终透明。
      void layer.offsetHeight;
      layer.classList.add('is-open');
      layer.querySelectorAll('.catalog-burst-photo').forEach((image) => { image.style.transform = image.dataset.burstTransform; });
      return true;
    }

    function renderHomeCatalog() {
      const result = core.coffeeCatalog(state.drinkLogs, state.beans, { photoJournal: Boolean(state.settings && state.settings.photoJournal) });
      if (!result.ok) {
        catalogContent.innerHTML = '<div class="catalog-page-intro"><span class="catalog-page-stamp" aria-hidden="true">ALL<br>TIME</span><p class="eyebrow">COFFEE ATLAS</p><h3>冲煮图鉴</h3><p>这本收藏册还是空的，等你的第一支豆子。</p></div><div class="catalog-empty"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>从第一支豆开始收藏</strong><p>把咖啡豆加入豆仓后，它会出现在这里；自家冲煮过以后，格子就会被点亮。</p></div></div>';
        return;
      }
      const data = result.data;
      const wall = data.wall.map((item) => `<article class="catalog-bean${item.lit ? ' is-lit' : ' is-unlit'}"${catalogBurstAttrs(item)}><div>${catalogCover(item)}<i>${item.lit ? `${item.cups} 杯` : '待点亮'}</i>${item.purchaseCount > 1 ? `<em class="catalog-repurchase" title="同款复购 ${item.purchaseCount} 次">复购 ×${item.purchaseCount}</em>` : ''}</div><h4 title="${esc(item.name)}">${esc(item.name)}</h4><p title="${esc(item.origin || '产地未记录')}">${esc(item.origin || '产地未记录')}</p>${item.cover.needsCutoutPrompt ? '<small>可在该豆编辑页生成手账封面</small>' : ''}</article>`).join('');
      const origins = data.origins.items.length ? `<div class="catalog-stamp-grid">${data.origins.items.map((item) => `<div class="catalog-stamp"><b title="${esc(item.name)}">${esc(item.name)}</b><span>${item.beanCount} 款 · ${item.cups} 杯</span></div>`).join('')}</div>` : '<p class="catalog-muted">豆子资料里还没有产地，补充后会在这里形成足迹。</p>';
      const processes = data.processes.map((item) => `<div class="catalog-medal${item.lit ? ' is-lit' : ''}"><span class="catalog-medal-seal" aria-hidden="true">${esc((item.label || '·').charAt(0))}</span><div><b title="${esc(item.label)}">${esc(item.label)}</b><small>${item.lit ? `${item.beanCount} 款 · ${item.cups} 杯` : '未解锁'}</small></div></div>`).join('');
      const milestones = [['冲煮杯数', data.milestones.cups, '杯'], ['最长连续冲煮', data.milestones.streak, '天']].map(([label, progress, unit]) => `<article class="catalog-milestone"><div class="catalog-seal"><strong>${progress.value}</strong><small>${esc(unit)}</small></div><b>${esc(label)}</b><p>${esc(catalogMilestoneCopy(progress, unit))}</p></article>`).join('');
      catalogContent.innerHTML = `<div class="catalog-page-intro"><span class="catalog-page-stamp" aria-hidden="true">ALL<br>TIME</span><p class="eyebrow">COFFEE ATLAS</p><h3>冲煮图鉴${helpButton('catalogHome')}</h3><p>每一支豆子都来过豆仓，又被慢慢喝完。留下的这一格，是它待过的证据。</p></div><section class="catalog-section"><div class="catalog-heading"><div><span>01</span><h3>豆款收集墙</h3></div><small>${data.mode === 'journal' ? '照片手账 · 贴纸册' : '标准收集册'}</small></div><div class="catalog-wall is-${data.mode}${data.singleRow ? ' is-single-row' : ''}">${wall}</div></section><section class="catalog-section"><div class="catalog-heading"><div><span>02</span><h3>产地足迹</h3></div><strong>${data.origins.items.length}<small>个产地</small></strong></div><p class="catalog-progress-copy">${esc(catalogMilestoneCopy(data.origins.milestone, '个'))}</p>${origins}</section><section class="catalog-section"><div class="catalog-heading"><div><span>03</span><h3>处理法收集</h3></div></div><div class="catalog-medal-row">${processes}</div></section><section class="catalog-section"><div class="catalog-heading"><div><span>04</span><h3>冲煮里程碑</h3></div><small>只含自家冲煮</small></div><div class="catalog-milestone-grid">${milestones}</div></section><button class="coffee-report-share catalog-share" data-insights-catalog-share type="button"><span>分享冲煮图鉴</span><strong aria-hidden="true">↗</strong></button>`;
    }

    function renderExternalCatalog() {
      const result = core.externalCatalog(state.drinkLogs, { photoJournal: Boolean(state.settings && state.settings.photoJournal) });
      if (!result.ok) {
        catalogContent.innerHTML = '<div class="catalog-page-intro"><span class="catalog-page-stamp" aria-hidden="true">ALL<br>TIME</span><p class="eyebrow">CAFE ATLAS</p><h3>外饮图鉴</h3><p>这本收藏册还是空的，等你推开第一扇店门。</p></div><div class="catalog-empty"><span class="insight-bean-mark" aria-hidden="true"></span><div><strong>从第一杯外饮开始收藏</strong><p>在记录里选「外饮记录」，填上咖啡馆名字；记下来以后，这里就会出现它的格子。</p></div></div>';
        return;
      }
      const data = result.data;
      const cafes = data.cafes.items.map((item) => `<article class="catalog-bean is-lit${item.named ? '' : ' is-unnamed'}"${catalogBurstAttrs(item)}><div>${catalogCover(item, { rotate: true })}<i>${item.cups} 杯</i>${item.visits > 1 ? `<em class="catalog-repurchase" title="去过 ${item.visits} 次">去过 ×${item.visits}</em>` : ''}</div><h4 title="${esc(item.name)}">${esc(item.name)}</h4><p title="${esc(item.topDrink || '饮品未记录')}">${esc(item.topDrink || '饮品未记录')}</p></article>`).join('');
      const places = data.places.items.length ? `<div class="catalog-stamp-grid">${data.places.items.map((item) => `<div class="catalog-stamp"><b title="${esc(item.name)}">${esc(item.name)}</b><span>${item.cafeCount} 家 · ${item.cups} 杯</span></div>`).join('')}</div>` : '<p class="catalog-muted">外饮记录里还没有填地点，补充后会在这里形成足迹。</p>';
      const milestones = [['外饮杯数', data.milestones.cups, '杯'], ['最长连续外饮', data.milestones.streak, '天']].map(([label, progress, unit]) => `<article class="catalog-milestone"><div class="catalog-seal"><strong>${progress.value}</strong><small>${esc(unit)}</small></div><b>${esc(label)}</b><p>${esc(catalogMilestoneCopy(progress, unit))}</p></article>`).join('');
      const spendCopy = data.spend.unknownCostCount ? `另有 ${data.spend.unknownCostCount} 杯没记价格` : '所有外饮都记了价格';
      const spendCard = `<article class="catalog-milestone catalog-milestone--spend"><div class="catalog-seal"><strong>${data.spend.total > 0 ? esc(money(data.spend.total)) : '—'}</strong></div><b>累计花费</b><p>${esc(spendCopy)}</p></article>`;
      catalogContent.innerHTML = `<div class="catalog-page-intro"><span class="catalog-page-stamp" aria-hidden="true">ALL<br>TIME</span><p class="eyebrow">CAFE ATLAS</p><h3>外饮图鉴${helpButton('catalogExternal')}</h3><p>推开过的每一扇店门，都收在这本册子里。</p></div><section class="catalog-section"><div class="catalog-heading"><div><span>01</span><h3>咖啡馆收集墙</h3></div><small>${data.mode === 'journal' ? '照片手账 · 贴纸册' : '标准收集册'}</small></div><div class="catalog-wall is-${data.mode}${data.singleRow ? ' is-single-row' : ''}">${cafes}</div></section><section class="catalog-section"><div class="catalog-heading"><div><span>02</span><h3>地点足迹</h3></div><strong>${data.places.items.length}<small>个地点</small></strong></div><p class="catalog-progress-copy">${esc(catalogMilestoneCopy(data.places.milestone, '个'))}</p>${places}</section><section class="catalog-section"><div class="catalog-heading"><div><span>03</span><h3>外饮里程碑</h3></div><small>只含外饮</small></div><div class="catalog-milestone-grid">${milestones}${spendCard}</div></section><button class="coffee-report-share catalog-share" data-insights-catalog-share type="button"><span>分享外饮图鉴</span><strong aria-hidden="true">↗</strong></button>`;
    }

    function renderCatalogPage() {
      const tab = catalogTab();
      // 重渲染会换掉整棵 DOM，旧的炸开层和轮播都要先收掉，否则会指向已被丢弃的节点。
      stopCatalogBurst();
      stopCatalogRotator();
      if (catalogTabs) {
        catalogTabs.querySelectorAll('[data-insights-catalog-tab]').forEach((button) => {
          const active = button.dataset.insightsCatalogTab === tab;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      }
      if (tab === 'external') renderExternalCatalog();
      else renderHomeCatalog();
      startCatalogRotator();
    }

    function updatePageFrame() {
      const isBrewReview = state.insightsPage === 'brew';
      const isBeanReview = isBrewReview && Boolean(state.insightsBeanId);
      const isReportPage = state.insightsPage === 'reports' || state.insightsPage === 'report';
      const isReportDetail = state.insightsPage === 'report';
      const isCatalogPage = state.insightsPage === 'catalog';
      homePage.hidden = isBrewReview || isReportPage || isCatalogPage;
      brewReviewPage.hidden = !isBrewReview;
      reportReviewPage.hidden = !isReportPage;
      catalogPage.hidden = !isCatalogPage;
      const isExternalCatalog = isCatalogPage && catalogTab() === 'external';
      if (title) title.textContent = isCatalogPage ? '咖啡图鉴' : isBrewReview ? '手冲回顾' : isReportDetail ? (state.insightsReportType === 'year' ? '咖啡年报' : '咖啡月报') : isReportPage ? '咖啡报告' : '回顾';
      if (subtitle) subtitle.textContent = isCatalogPage ? (isExternalCatalog ? '走过的咖啡馆，一格一格亮起来' : '喝过的豆子，一格一格亮起来') : isBrewReview ? '基于全部手冲记录 · 页内回看你的冲煮习惯' : isReportPage ? '只看已经走完的自然月与自然年' : '从每一杯里，慢慢看见自己的口味';
      if (eyebrow) eyebrow.textContent = isCatalogPage ? (isExternalCatalog ? 'CAFE ATLAS' : 'COFFEE ATLAS') : isBrewReview ? 'POUR-OVER NOTES' : isReportPage ? 'COFFEE REPORT' : 'YOUR COFFEE';
      // 返回箭头已移除：✕ 接管分层返回，所以它的 aria-label 要跟着当前页说清楚会退到哪。
      if (closeButton) {
        const reportDetailFromList = isReportDetail && state.insightsReportFromList;
        const backToPersonal = (isCatalogPage || state.insightsPage === 'reports' || state.insightsPage === 'home') && state.insightsExitTo === 'personal';
        closeButton.setAttribute('aria-label', isBeanReview ? '返回手冲回顾' : reportDetailFromList ? '返回咖啡月报与年报' : backToPersonal ? '返回个人中心' : isBrewReview ? '返回回顾首页' : '关闭');
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
      if (logs.length < (core.MIN_SAMPLE || 3)) {
        content.innerHTML = `${globalUnlock(logs)}${handBrewSection}`;
        return;
      }
      const dimensions = core.averageDimensions(logs, { enabled: Boolean(state.settings.advancedRatings), enabledDimensions: state.settings.enabledDimensions });
      const flavor = core.flavorProfile(logs);
      const time = core.timeBuckets(logs);
      const radar = state.settings.advancedRatings ? radarCard(dimensions) : '';
      content.innerHTML = `${openingCard(logs, flavor, time)}<section class="insight-section" id="insightsSectionTaste"><div class="insight-section-title"><span>01</span><div><h3>口味与偏好</h3><p>从饮用笔记和个人评价里慢慢整理</p></div></div><div class="insight-card-stack">${radar}${flavorCard(flavor)}${preferenceCard(logs)}</div></section>${habitsSection(logs)}${spendSection(logs)}${handBrewSection}`;
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
      if (state.insightsPage === 'catalog') {
        renderCatalogPage();
        return;
      }
      renderHome();
    }

    function syncNavOffset() {
      const header = dialog.querySelector('.sheet-header');
      if (!header) return;
      const height = header.offsetHeight;
      if (height) dialog.style.setProperty('--insights-nav-top', `${Math.round(height) - 1}px`);
    }

    function open(options) {
      const opts = options || {};
      hideHelp();
      state.insightsPage = 'home';
      // 从个人中心进来的要记下出口：✕ 接管返回后，回顾首页也该退回个人中心而不是直接关掉。
      state.insightsExitTo = opts.fromPersonal ? 'personal' : null;
      state.insightsBeanId = null;
      state.insightsReportType = null;
      state.insightsReportKey = null;
      render();
      setDialog(dialog, true);
      requestAnimationFrame(syncNavOffset);
      setTimeout(syncNavOffset, 280);
    }

    // insightsExitTo 必须在这里清掉：否则从个人中心进来后直接关闭，残值会让下一次会话误以为还要回个人中心。
    function close() { state.insightsExitTo = null; stopCatalogBurst(); stopCatalogRotator(); hideHelp(); setDialog(dialog, false); }

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
      state.insightsExitTo = 'personal';
      state.insightsReportFromList = false;
      state.insightsReportType = null;
      state.insightsReportKey = null;
      render();
      setDialog(dialog, true);
    }

    function openCatalog(tab) {
      hideHelp();
      state.insightsPage = 'catalog';
      state.insightsCatalogTab = tab === 'external' ? 'external' : 'home';
      state.insightsExitTo = 'personal';
      render();
      setDialog(dialog, true);
    }

    function openReport(type, key, options) {
      const opts = options || {};
      hideHelp();
      state.insightsPage = 'report';
      state.insightsReportFromList = Boolean(opts.fromList);
      if (!opts.fromList) state.insightsExitTo = null;
      state.insightsReportType = type === 'year' ? 'year' : 'month';
      state.insightsReportKey = key;
      render();
      setDialog(dialog, true);
    }

    // 月报/年报与图鉴已从回顾首页移出，只从个人中心（月报也从日历）进入。
    // 返回时不再回落到回顾首页：来自个人中心的关闭后重开个人中心，来自日历/提醒的直接退出。
    function exitInsights() {
      const returnPersonal = state.insightsExitTo === 'personal';
      state.insightsExitTo = null;
      hideHelp();
      close();
      if (returnPersonal && reopenPersonal) reopenPersonal();
    }

    function handleBack() {
      if (closeCatalogBurst()) return true;
      if (state.insightsPage === 'report') {
        if (state.insightsReportFromList) {
          state.insightsPage = 'reports';
          state.insightsReportType = null;
          state.insightsReportKey = null;
          hideHelp();
          render();
          return true;
        }
        exitInsights();
        return true;
      }
      if (state.insightsPage === 'reports' || state.insightsPage === 'catalog') {
        exitInsights();
        return true;
      }
      if (state.insightsPage !== 'brew') {
        // 回顾首页：从个人中心进来的退回个人中心，其它入口(主列表)照旧直接关闭。
        if (state.insightsPage === 'home' && state.insightsExitTo === 'personal') { exitInsights(); return true; }
        return false;
      }
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
      const summary = event.target.closest('[data-insights-brew-review]');
      if (summary) { openBrewReview(); return true; }
      const beanLink = event.target.closest('[data-insights-brew-bean]');
      if (beanLink) { openBrewReview(beanLink.dataset.insightsBrewBean); return true; }
      const anchor = event.target.closest('[data-insights-anchor]');
      if (anchor) {
        const ids = { taste: 'insightsSectionTaste', habits: 'insightsSectionHabits', spend: 'insightsSectionSpend', brew: 'insightsSectionBrew' };
        const target = dialog.querySelector(`#${ids[anchor.dataset.insightsAnchor] || ''}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      const reportLink = event.target.closest('[data-insights-report-type][data-insights-report-key]');
      if (reportLink) { openReport(reportLink.dataset.insightsReportType, reportLink.dataset.insightsReportKey, { fromList: true }); return true; }
      const share = event.target.closest('[data-insights-report-share]');
      if (share && shareReport) {
        const result = core.coffeePeriodReport(state.drinkLogs, state.beans, { type: state.insightsReportType, key: state.insightsReportKey });
        if (result.ok) Promise.resolve(shareReport(result.data)).catch(() => { if (toast) toast('分享失败'); });
        return true;
      }
      // 炸开层的三个出口要排在格子分支之前：照片 → 全屏预览，遮罩 → 收起。
      const burstPhoto = event.target.closest('.catalog-burst-photo');
      if (burstPhoto) {
        if (openImagePreview) openImagePreview(burstPhoto.dataset.previewImage, burstPhoto.dataset.previewLabel);
        return true;
      }
      if (event.target.closest('.catalog-burst')) { closeCatalogBurst(); return true; }
      const burstTile = event.target.closest('[data-catalog-burst]');
      if (burstTile) { event.preventDefault(); return openCatalogBurst(burstTile); }
      const catalogTabButton = event.target.closest('[data-insights-catalog-tab]');
      if (catalogTabButton) {
        stopCatalogBurst();
        state.insightsCatalogTab = catalogTabButton.dataset.insightsCatalogTab === 'external' ? 'external' : 'home';
        render();
        return true;
      }
      const catalogShare = event.target.closest('[data-insights-catalog-share]');
      if (catalogShare && shareCatalog) {
        const photoJournal = Boolean(state.settings && state.settings.photoJournal);
        const external = catalogTab() === 'external';
        const result = external
          ? core.externalCatalog(state.drinkLogs, { photoJournal })
          : core.coffeeCatalog(state.drinkLogs, state.beans, { photoJournal });
        if (result.ok) Promise.resolve(shareCatalog(result.data, { external })).catch(() => { if (toast) toast('分享失败'); });
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

    window.addEventListener('resize', () => { if (dialog.open || !dialog.hasAttribute('hidden')) syncNavOffset(); });
    dialog.addEventListener('scroll', syncNavOffset, { passive: true });
    dialog.addEventListener('close', () => { hideHelp(); stopCatalogBurst(); stopCatalogRotator(); });
    // 炸开层开着时 Esc 先收起它，而不是把整张 sheet 关掉。
    dialog.addEventListener('cancel', (event) => { if (closeCatalogBurst()) event.preventDefault(); });
    // 面板切到后台就停掉轮播，省得白烧电；回到前台再按当前页决定要不要重启。
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopCatalogRotator();
      else if (dialog.open) startCatalogRotator();
    });
    dialog.addEventListener('error', (event) => {
      const target = event.target.closest && event.target;
      // 轮播图片加载失败：把这张从该格的清单里剔掉，别让它再被抽中。
      const rotatorImage = target && target.closest && target.closest('img[data-rotator-path]');
      if (rotatorImage) {
        const cover = rotatorImage.closest('[data-catalog-rotator]');
        const failed = rotatorImage.dataset.rotatorPath;
        if (cover && failed) {
          const left = rotatorPaths(cover, 'catalogRotator').filter((path) => path !== failed);
          cover.dataset.catalogRotator = JSON.stringify(left);
          if (!left.length) cover.removeAttribute('data-catalog-rotator');
        }
        if (rotatorImage.classList.contains('is-current') && cover) {
          const fallback = rotatorPaths(cover, 'catalogRotator')[0];
          if (fallback) { rotatorImage.dataset.rotatorPath = fallback; rotatorImage.src = imageSrc(fallback); }
          else rotatorImage.remove();
        }
        return;
      }
      const image = event.target.closest && event.target.closest('img[data-catalog-candidates]');
      if (!image) return;
      let paths = [];
      try { paths = JSON.parse(image.dataset.catalogCandidates || '[]'); } catch (_) { paths = []; }
      const next = Number(image.dataset.catalogIndex || 0) + 1;
      if (paths[next]) { image.dataset.catalogIndex = String(next); image.className = paths[next].type === 'cutout' ? 'is-cutout' : 'is-photo'; image.src = paths[next].src; }
      else image.remove();
    }, true);
    dialog.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key) || !event.target.closest('[data-insights-brew-review],[data-insights-brew-bean],[data-insights-report-type],[data-catalog-burst]')) return;
      event.preventDefault();
      handleClick(event);
    });
    return { render, open, close, handleClick, handleBack, openBrewReview, openBeanReview: openBrewReview, openReports, openReport, openCatalog };
  }

  return { HELP_CONTENT, create, buildRadar, buildSpendLineChart, emptyCard, helpButton, remainingText, handBrewSummaryCard, handBrewRecordCard, handBrewBeanPage, coffeeReportDetail };
});
