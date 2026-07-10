// app.js 拆分第二批:分享卡片(收据风)画布渲染。
// 约定:本文件只做「payload → canvas」的纯绘制,不读写 state、不开对话框、不调插件;
// 分享/保存动作与 payload 组装仍在 app.js。跨闭包依赖通过 create(deps) 显式注入:
//   imageSrc(path)  —— 把仓储图片引用换成可加载的 URL(依赖 app.js 的 webImageUrls 缓存)
//   monthNames      —— 月份标签(与 app.js 共用一份,避免两处维护)
// 全局依赖:qrcode(vendor)、document/Image(浏览器)。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppShareCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(deps) {
    const imageSrc = deps.imageSrc;
    const MONTH_NAMES = deps.monthNames;
    if (typeof imageSrc !== 'function' || !Array.isArray(MONTH_NAMES)) throw new Error('AppShareCard.create 需要 imageSrc 与 monthNames');

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

    // clipCanvasText / wrapCanvasLines 一并导出,供 Node 测试用假 ctx 验证换行/截断逻辑。
    return { renderShareCard, canvasToBlob, loadCanvasImage, clipCanvasText, wrapCanvasLines };
  }

  return { create };
});
