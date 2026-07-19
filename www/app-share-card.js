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
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function fitImageRect(sourceWidth, sourceHeight, x, y, w, h, mode) {
      const sw = Number(sourceWidth); const sh = Number(sourceHeight); const bw = Number(w); const bh = Number(h);
      if (!(sw > 0) || !(sh > 0) || !(bw > 0) || !(bh > 0)) return { x, y, w: 0, h: 0, mode: 'contain', cropRatio: 0 };
      const sourceAspect = sw / sh; const boxAspect = bw / bh;
      const cropRatio = Math.min(sourceAspect / boxAspect, boxAspect / sourceAspect);
      const resolvedMode = mode === 'smart' ? (cropRatio >= .8 ? 'cover' : 'contain') : mode === 'cover' ? 'cover' : 'contain';
      const scale = resolvedMode === 'cover' ? Math.max(bw / sw, bh / sh) : Math.min(bw / sw, bh / sh);
      const rawW = sw * scale; const rawH = sh * scale;
      const iw = resolvedMode === 'contain' ? Math.min(bw, rawW) : rawW;
      const ih = resolvedMode === 'contain' ? Math.min(bh, rawH) : rawH;
      const offsetX = resolvedMode === 'contain' ? Math.max(0, (bw - iw) / 2) : (bw - iw) / 2;
      const offsetY = resolvedMode === 'contain' ? Math.max(0, (bh - ih) / 2) : (bh - ih) / 2;
      return { x: x + offsetX, y: y + offsetY, w: iw, h: ih, mode: resolvedMode, cropRatio };
    }
    function resolveReceiptComposition(payload, imageMeta) {
      const source = payload || {}; const images = imageMeta || []; const first = images[0] || {};
      const aspect = Number(first.aspect) > 0 ? Number(first.aspect) : 1;
      const singleImage = images.length === 1;
      if (source.type === 'calendarMonth') return { kind: 'calendar-split', leftRatio: .64, stepColumns: 3 };
      if (source.type === 'calendarYear') return { kind: 'calendar-year', stepColumns: 3 };
      if (source.type === 'bean' && singleImage && aspect <= 1.1) return { kind: 'bean-photo-sidebar', photoRatio: .44, stepColumns: 3 };
      if (source.type === 'drink' && singleImage && source.radar && source.radar.length >= 3) {
        return { kind: 'drink-photo-radar', photoRatio: aspect > 1.1 ? .56 : .42, stepColumns: 3 };
      }
      if (source.type === 'drink' && source.radar && source.radar.length >= 3) {
        return { kind: source.notes ? 'drink-radar-notes' : 'drink-radar-compact', radarRatio: source.notes ? .58 : .66, stepColumns: 3 };
      }
      return { kind: source.type || 'receipt', stepColumns: 3 };
    }
    function receiptRatingPresentation(rating) {
      if (!rating || !(Number(rating.value) > 0)) return null;
      const max = Math.max(1, Math.round(Number(rating.max) || 5));
      const value = Math.max(1, Math.min(max, Number(rating.value)));
      return {
        score: value.toFixed(1),
        stars: `${'★'.repeat(Math.round(value))}${'☆'.repeat(Math.max(0, max - Math.round(value)))}`
      };
    }
    async function loadReceiptImages(images) {
      return Promise.all((images || []).slice(0, 3).map(async (item) => {
        const img = await loadCanvasImage(item.path);
        return { item, img, aspect: img && img.width > 0 && img.height > 0 ? img.width / img.height : 1 };
      }));
    }
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
    function drawReceiptRating(ctx, rating, palette, x, y, w) {
      const presentation = receiptRatingPresentation(rating);
      if (!presentation) return y;
      fillRound(ctx, x, y, w, 146, 24, palette.ink);
      setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = palette.line; ctx.fillText(rating.label || '整体评价', x + 26, y + 38);
      setCanvasFont(ctx, 68, 850, true); ctx.fillStyle = palette.paper; ctx.fillText(presentation.score, x + 24, y + 112);
      setCanvasFont(ctx, 40, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(presentation.stars, x + 190, y + 99);
      return y + 166;
    }
    function drawReceiptStats(ctx, stats, palette, x, y, w) {
      if (!stats || !stats.length) return y;
      const gap = 16; const cols = stats.length <= 4 ? stats.length : 3; const cardW = (w - gap * (cols - 1)) / cols;
      stats.slice(0, 6).forEach((stat, index) => { const col = index % cols; const row = Math.floor(index / cols); const px = x + col * (cardW + gap); const py = y + row * 110; fillRound(ctx, px, py, cardW, 94, 20, palette.surface, palette.border); setCanvasFont(ctx, 22, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(stat.label, px + 20, py + 32); setCanvasFont(ctx, 34, 800, false); ctx.fillStyle = index === 0 ? palette.accent : palette.ink; ctx.fillText(clipCanvasText(ctx, stat.value, cardW - 40), px + 20, py + 74); });
      return y + Math.ceil(Math.min(stats.length, 6) / cols) * 110;
    }
    function drawReceiptStatStack(ctx, stats, palette, x, y, w, h) {
      const items = (stats || []).slice(0, 3); if (!items.length) return y;
      const gap = 12; const cardH = (h - gap * (items.length - 1)) / items.length;
      items.forEach((stat, index) => {
        const py = y + index * (cardH + gap);
        fillRound(ctx, x, py, w, cardH, 18, palette.surface, palette.border);
        if (cardH >= 90) {
          setCanvasFont(ctx, 21, 650, false); ctx.fillStyle = palette.muted; ctx.fillText(stat.label, x + 20, py + 32);
          setCanvasFont(ctx, 36, 850, false); ctx.fillStyle = index === 0 ? palette.accent : palette.ink; ctx.fillText(clipCanvasText(ctx, stat.value, w - 40), x + 20, py + 78);
        } else {
          setCanvasFont(ctx, 19, 650, false); ctx.fillStyle = palette.muted; ctx.fillText(stat.label, x + 18, py + cardH / 2 + 7);
          setCanvasFont(ctx, 28, 850, false); ctx.fillStyle = index === 0 ? palette.accent : palette.ink;
          const value = clipCanvasText(ctx, stat.value, w * .56); ctx.fillText(value, x + w - 18 - ctx.measureText(value).width, py + cardH / 2 + 9);
        }
      });
      return y + h;
    }
    function drawReceiptOverview(ctx, rating, stats, palette, x, y, w) {
      if (!rating || !(Number(rating.value) > 0)) return drawReceiptStats(ctx, stats, palette, x, y, w);
      const gap = 18; const ratingW = Math.round(w * .64); const statW = w - ratingW - gap; const h = 146;
      drawReceiptRating(ctx, rating, palette, x, y, ratingW);
      drawReceiptStatStack(ctx, stats, palette, x + ratingW + gap, y, statW, h);
      return y + h + 20;
    }
    function drawReceiptParameterGrid(ctx, rows, palette, x, y, w) {
      const items = (rows || []).slice(0, 12); if (!items.length) return y;
      const gap = 14; const rowGap = 14; const cardH = 84; const cardW = (w - gap) / 2;
      items.forEach((row, index) => {
        const col = index % 2; const line = Math.floor(index / 2); const lastOdd = items.length % 2 && index === items.length - 1;
        const px = x + col * (cardW + gap); const py = y + line * (cardH + rowGap); const cw = lastOdd ? w : cardW;
        fillRound(ctx, px, py, cw, cardH, 18, palette.surface, palette.border);
        setCanvasFont(ctx, 19, 650, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, row.label, cw - 36), px + 18, py + 29);
        setCanvasFont(ctx, 29, 850, false); ctx.fillStyle = index === 0 ? palette.accent : palette.ink; ctx.fillText(clipCanvasText(ctx, row.value, cw - 36), px + 18, py + 66);
      });
      return y + Math.ceil(items.length / 2) * (cardH + rowGap) + 4;
    }
    function drawReceiptNotes(ctx, notes, palette, x, y, w) {
      if (!notes) return y;
      setCanvasFont(ctx, 27, 600, false);
      const lines = wrapCanvasLines(ctx, notes, w - 44, 3); const height = 80 + Math.max(1, lines.length) * 34 + 22;
      fillRound(ctx, x, y, w, height, 22, palette.surface, palette.border);
      setCanvasFont(ctx, 23, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('风味 / 备注', x + 22, y + 38);
      setCanvasFont(ctx, 27, 600, false); ctx.fillStyle = palette.ink; lines.forEach((line, index) => ctx.fillText(line, x + 22, y + 78 + index * 34));
      return y + height + 26;
    }
    function drawReceiptRadar(ctx, ratings, palette, x, y, w, options) {
      if (!ratings || ratings.length < 3) return y;
      const opts = options || {}; const height = opts.height || 340;
      const cx = x + w / 2; const cy = y + height * .54;
      const radius = Math.min(w * .28, (height - 112) / 2); const count = ratings.length;
      const point = (r, index) => { const angle = (-Math.PI / 2) + index * Math.PI * 2 / count; return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]; };
      fillRound(ctx, x, y, w, height, 22, palette.surface, palette.border);
      setCanvasFont(ctx, 23, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('多维评价', x + 22, y + 38);
      ctx.lineWidth = 2;
      for (let level = 1; level <= 5; level += 1) { const points = ratings.map((_, index) => point(radius * level / 5, index)); ctx.beginPath(); points.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.strokeStyle = palette.line; ctx.globalAlpha = .5; ctx.stroke(); }
      ctx.globalAlpha = 1;
      ratings.forEach((_, index) => { const [px, py] = point(radius, index); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.strokeStyle = palette.line; ctx.globalAlpha = .55; ctx.stroke(); });
      ctx.globalAlpha = 1;
      const plot = ratings.map((item, index) => { const raw = Math.max(1, Math.min(5, Number(item.value) || 0)); const value = item.key === 'bitterness' ? 6 - raw : raw; return point(radius * value / 5, index); });
      ctx.beginPath(); plot.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fillStyle = 'rgba(183,120,61,.24)'; ctx.fill(); ctx.strokeStyle = palette.accent; ctx.lineWidth = 5; ctx.stroke();
      plot.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fillStyle = palette.accent; ctx.fill(); });
      ratings.forEach((item, index) => {
        const [px, py] = point(radius + 29, index);
        setCanvasFont(ctx, 19, 700, false); ctx.fillStyle = palette.muted;
        ctx.textAlign = Math.abs(px - cx) < 10 ? 'center' : px > cx ? 'left' : 'right';
        ctx.fillText(`${item.label} ${item.value}`, px, py + 6);
      });
      ctx.textAlign = 'left';
      return y + height + 26;
    }
    function drawCoverImage(ctx, img, x, y, w, h) { const scale = Math.max(w / img.width, h / img.height); const iw = img.width * scale; const ih = img.height * scale; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    function drawFittedImage(ctx, img, palette, x, y, w, h, mode) {
      ctx.fillStyle = palette.surface; ctx.fillRect(x, y, w, h);
      if (!img) return;
      const rect = fitImageRect(img.width, img.height, x, y, w, h, mode);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    }
    function drawJournalPhoto(ctx, loaded, palette, x, y, w, h, tilt, mode) {
      const cx = x + w / 2; const cy = y + h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt || 0); ctx.translate(-cx, -cy);
      fillRound(ctx, x - 9, y - 9, w + 18, h + 36, 10, '#fffaf0', palette.border);
      ctx.save(); roundRect(ctx, x, y, w, h, 7); ctx.clip(); drawFittedImage(ctx, loaded && loaded.img, palette, x, y, w, h, mode); ctx.restore();
      fillRound(ctx, x + w * .38, y - 18, w * .24, 38, 5, 'rgba(213,181,142,.72)');
      ctx.restore();
    }
    function singleImageHeight(loaded, innerW) {
      const aspect = loaded && loaded.aspect > 0 ? loaded.aspect : 1;
      return clamp(Math.round(innerW / aspect), 280, 720);
    }
    function drawJournalImages(ctx, images, palette, x, y, w, loadedImages) {
      const items = images.slice(0, 3); const loaded = loadedImages || [];
      if (items.length === 1) {
        const frameW = w - 68; const frameH = singleImageHeight(loaded[0], frameW);
        drawJournalPhoto(ctx, loaded[0], palette, x + 34, y, frameW, frameH, -.018, 'contain');
        return y + frameH + 60;
      }
      const gap = 18; const layouts = items.length === 1
        ? [{ x: 34, y: 0, w: w - 68, h: 430, tilt: -.018 }]
        : items.length === 2
          ? [{ x: 0, y: 8, w: (w - gap) / 2, h: 360, tilt: -.025 }, { x: (w + gap) / 2, y: 0, w: (w - gap) / 2, h: 360, tilt: .022 }]
          : [{ x: 0, y: 10, w: w * .55, h: 350, tilt: -.024 }, { x: w * .58, y: 0, w: w * .42, h: 166, tilt: .026 }, { x: w * .58, y: 188, w: w * .42, h: 166, tilt: -.018 }];
      layouts.forEach((box, index) => {
        drawJournalPhoto(ctx, loaded[index], palette, x + box.x, y + box.y, box.w, box.h, box.tilt, 'smart');
      });
      return y + (items.length === 1 ? 490 : 420);
    }
    function drawReceiptImagePanel(ctx, loaded, palette, x, y, w, h, options) {
      const opts = options || {};
      fillRound(ctx, x, y, w, h, 22, palette.surface, palette.border);
      ctx.save(); roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 17); ctx.clip();
      drawFittedImage(ctx, loaded && loaded.img, palette, x + 12, y + 12, w - 24, h - 24, opts.mode || 'contain');
      ctx.restore();
      if (opts.tape) fillRound(ctx, x + w * .39, y - 12, w * .22, 32, 5, 'rgba(213,181,142,.72)');
    }
    function drawReceiptImages(ctx, images, palette, x, y, w, loadedImages) {
      if (!images || !images.length) return y;
      const loaded = loadedImages || [];
      if (images.some((item) => item.role === 'drink')) return drawJournalImages(ctx, images, palette, x, y, w, loaded);
      if (images.length === 1) {
        const item = images[0]; const boxH = singleImageHeight(loaded[0], w - 32);
        fillRound(ctx, x, y, w, boxH, 26, palette.surface, palette.border);
        ctx.save(); roundRect(ctx, x + 16, y + 16, w - 32, boxH - 32, 20); ctx.clip(); drawFittedImage(ctx, loaded[0] && loaded[0].img, palette, x + 16, y + 16, w - 32, boxH - 32, 'contain'); ctx.restore();
        fillRound(ctx, x + 22, y + boxH - 58, 128, 38, 19, palette.ink); setCanvasFont(ctx, 22, 800, false); ctx.fillStyle = palette.paper; ctx.fillText(item.label, x + 44, y + boxH - 32);
        return y + boxH + 30;
      }
      const gap = 18; const itemW = (w - gap) / 2; const itemH = 210;
      for (let index = 0; index < images.slice(0, 2).length; index += 1) {
        const item = images[index]; const px = x + index * (itemW + gap); const current = loaded[index];
        fillRound(ctx, px, y, itemW, itemH, 22, palette.surface, palette.border);
        ctx.save(); roundRect(ctx, px + 10, y + 10, itemW - 20, itemH - 20, 18); ctx.clip(); drawFittedImage(ctx, current && current.img, palette, px + 10, y + 10, itemW - 20, itemH - 20, 'smart'); ctx.restore();
        fillRound(ctx, px + 18, y + itemH - 54, 112, 34, 17, palette.ink); setCanvasFont(ctx, 20, 800, false); ctx.fillStyle = palette.paper; ctx.fillText(item.label, px + 38, y + itemH - 31);
      }
      return y + itemH + 30;
    }
    function drawReceiptSteps(ctx, steps, palette, x, y, w) {
      if (!steps || !steps.length) return y;
      setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.ink; ctx.fillText('分段步骤', x, y); y += 44;
      const items = steps.slice(0, 8); const cols = Math.min(3, items.length); const gap = 14; const cardW = (w - gap * (cols - 1)) / cols; const cardH = 112;
      items.forEach((step, index) => {
        const col = index % cols; const row = Math.floor(index / cols); const px = x + col * (cardW + gap); const py = y + row * (cardH + gap);
        fillRound(ctx, px, py, cardW, cardH, 18, palette.surface, palette.border);
        fillRound(ctx, px + 16, py + 14, 34, 34, 17, palette.paper, palette.line);
        setCanvasFont(ctx, 18, 800, false); ctx.fillStyle = palette.muted; ctx.fillText(String(index + 1), px + 27, py + 37);
        setCanvasFont(ctx, 24, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, step.label, cardW - 76), px + 62, py + 38);
        setCanvasFont(ctx, 20, 600, false); ctx.fillStyle = palette.muted;
        wrapCanvasLines(ctx, step.value, cardW - 32, 2).forEach((line, lineIndex) => ctx.fillText(line, px + 16, py + 73 + lineIndex * 24));
      });
      return y + Math.ceil(items.length / cols) * (cardH + gap) + 10;
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
    function drawReceiptMonthPanel(ctx, calendar, palette, x, y, w) {
      const cells = calendar && calendar.cells || []; const pad = 18; const gap = 8; const innerW = w - pad * 2;
      const cell = Math.floor((innerW - gap * 6) / 7); const rows = Math.max(5, Math.ceil(cells.length / 7)); const height = 66 + rows * (cell + gap) + 20;
      fillRound(ctx, x, y, w, height, 22, palette.surface, palette.border);
      ['一', '二', '三', '四', '五', '六', '日'].forEach((day, index) => {
        setCanvasFont(ctx, 18, 800, false); ctx.fillStyle = palette.muted; ctx.textAlign = 'center';
        ctx.fillText(day, x + pad + index * (cell + gap) + cell / 2, y + 34);
      });
      cells.forEach((item, index) => {
        const col = index % 7; const row = Math.floor(index / 7); const px = x + pad + col * (cell + gap); const py = y + 50 + row * (cell + gap);
        if (item.empty) return;
        fillRound(ctx, px, py, cell, cell, Math.min(11, cell / 4), palette.heat[item.level || 0], item.selected ? palette.ink : palette.border);
        setCanvasFont(ctx, 19, 800, false); ctx.fillStyle = item.level >= 3 ? palette.paper : palette.ink; ctx.textAlign = 'left'; ctx.fillText(String(item.day), px + 9, py + 25);
      });
      ctx.textAlign = 'left';
      return y + height;
    }
    function drawReceiptMonthSide(ctx, payload, palette, x, y, w) {
      setCanvasFont(ctx, 22, 750, false); ctx.fillStyle = palette.muted; ctx.fillText('所选日期', x, y + 24);
      let cy = y + 42; const stats = (payload.stats || []).slice(0, 3); const statH = stats.length * 62 + Math.max(0, stats.length - 1) * 10;
      cy = drawReceiptStatStack(ctx, stats, palette, x, cy, w, statH) + 22;
      setCanvasFont(ctx, 22, 750, false); ctx.fillStyle = palette.muted; ctx.fillText('当日记录', x, cy + 22); cy += 40;
      const logs = (payload.logs || []).slice(0, 4);
      if (!logs.length) {
        fillRound(ctx, x, cy, w, 92, 18, palette.surface, palette.border);
        setCanvasFont(ctx, 20, 650, false); ctx.fillStyle = palette.muted; ctx.fillText('这一天还没有咖啡记录', x + 18, cy + 52);
        return cy + 92;
      }
      logs.forEach((log) => {
        fillRound(ctx, x, cy, w, 76, 18, palette.surface, palette.border);
        setCanvasFont(ctx, 22, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, log.title, w - 34), x + 17, cy + 31);
        setCanvasFont(ctx, 18, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, log.meta, w - 34), x + 17, cy + 57);
        cy += 88;
      });
      return cy - 12;
    }
    function drawReceiptMonthSplit(ctx, payload, palette, x, y, w) {
      const gap = 18; const leftW = Math.round((w - gap) * .64); const rightW = w - gap - leftW;
      const leftEnd = drawReceiptMonthPanel(ctx, payload.calendar, palette, x, y, leftW);
      const rightEnd = drawReceiptMonthSide(ctx, payload, palette, x + leftW + gap, y, rightW);
      return Math.max(leftEnd, rightEnd) + 28;
    }
    function drawReceiptYear(ctx, calendar, palette, x, y, w) {
      const levels = new Map((calendar.days || []).map((day) => [day.date, day.level || 0]));
      const labelW = 64; const areaW = w - labelW; const cell = areaW / 31; const dot = Math.min(cell * 0.64, 16); const rowH = 38;
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
    function drawDrinkPhotoRadar(ctx, payload, loaded, composition, palette, x, y, w) {
      const gap = 18; const photoW = Math.round((w - gap) * composition.photoRatio); const radarW = w - gap - photoW; const height = 400;
      const landscape = composition.photoRatio > .5; const photoX = landscape ? x : x + radarW + gap; const radarX = landscape ? x + photoW + gap : x;
      drawReceiptImagePanel(ctx, loaded[0], palette, photoX, y, photoW, height, { mode: 'contain', tape: true });
      drawReceiptRadar(ctx, payload.radar, palette, radarX, y, radarW, { height });
      return y + height + 26;
    }
    function drawReceiptNotePanel(ctx, notes, palette, x, y, w, h) {
      fillRound(ctx, x, y, w, h, 22, palette.surface, palette.border);
      setCanvasFont(ctx, 23, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('风味 / 备注', x + 22, y + 38);
      setCanvasFont(ctx, 27, 600, false); ctx.fillStyle = palette.ink;
      wrapCanvasLines(ctx, notes, w - 44, 6).forEach((line, index) => ctx.fillText(line, x + 22, y + 82 + index * 36));
    }
    function drawDrinkRadarDetails(ctx, payload, composition, palette, x, y, w) {
      if (!payload.radar || payload.radar.length < 3) return { y, notesConsumed: false };
      const height = 340; const gap = 18; const hasNotes = composition.kind === 'drink-radar-notes';
      if (hasNotes) {
        const radarW = Math.round((w - gap) * composition.radarRatio); const noteW = w - gap - radarW;
        drawReceiptRadar(ctx, payload.radar, palette, x, y, radarW, { height });
        drawReceiptNotePanel(ctx, payload.notes, palette, x + radarW + gap, y, noteW, height);
      } else {
        const radarW = Math.round(w * (composition.radarRatio || .66));
        drawReceiptRadar(ctx, payload.radar, palette, x + (w - radarW) / 2, y, radarW, { height });
      }
      return { y: y + height + 26, notesConsumed: hasNotes };
    }
    function drawBeanSidebar(ctx, payload, loaded, palette, x, y, w) {
      const gap = 18; const photoW = Math.round((w - gap) * .44); const detailW = w - gap - photoW;
      const parameterRows = Math.ceil(Math.min((payload.rows || []).length, 12) / 2);
      const parameterH = parameterRows ? parameterRows * 98 + 4 : 0;
      setCanvasFont(ctx, 27, 600, false); const noteLines = payload.notes ? wrapCanvasLines(ctx, payload.notes, detailW - 44, 3).length : 0;
      const notesH = noteLines ? 80 + noteLines * 34 + 22 + 26 : 0;
      const height = Math.max(430, parameterH + notesH);
      drawReceiptImagePanel(ctx, loaded[0], palette, x, y, photoW, height, { mode: 'contain', tape: true });
      let detailY = drawReceiptParameterGrid(ctx, payload.rows, palette, x + photoW + gap, y, detailW);
      detailY = drawReceiptNotes(ctx, payload.notes, palette, x + photoW + gap, detailY, detailW);
      return Math.max(y + height, detailY) + 26;
    }
    function drawReceiptFooter(ctx, payload, palette, x, y, w) {
      drawReceiptDivider(ctx, palette, x, y + 8, w); y += 58;
      setCanvasFont(ctx, 24, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(payload.footer || '本地记录 · 私人豆仓', x, y);
      return y;
    }
    async function renderReceiptShareCard(payload) {
      const palette = { bg: '#1a1412', paper: '#f4eadc', surface: '#eadcc8', ink: '#251811', muted: '#806b59', accent: '#b7783d', border: '#d9c6ac', line: '#d5b58e', heat: ['#e2d6c5', '#d5bd96', '#cda66b', '#bd8345', '#8f542d'] };
      const width = 1080; const workingHeight = 8000; const loadedImages = await loadReceiptImages(payload.images);
      const composition = resolveReceiptComposition(payload, loadedImages);
      const content = document.createElement('canvas'); content.width = width; content.height = workingHeight; const ctx = content.getContext('2d');
      const x = 96; const w = width - x * 2; let y = 132;
      y = drawReceiptHeader(ctx, payload, palette, x, y, w);
      if (payload.type === 'calendarMonth') {
        drawReceiptDivider(ctx, palette, x, y + 8, w); y += 50;
        y = drawReceiptMonthSplit(ctx, payload, palette, x, y, w);
      } else {
        y = drawReceiptOverview(ctx, payload.rating, payload.stats, palette, x, y, w);
        drawReceiptDivider(ctx, palette, x, y + 8, w); y += 50;
        if (payload.type === 'calendarYear') {
          y = drawReceiptYear(ctx, payload.calendar, palette, x, y, w);
        } else if (composition.kind === 'bean-photo-sidebar') {
          y = drawBeanSidebar(ctx, payload, loadedImages, palette, x, y, w);
        } else if (payload.type === 'bean') {
          y = drawReceiptParameterGrid(ctx, payload.rows, palette, x, y, w);
          y = drawReceiptNotes(ctx, payload.notes, palette, x, y, w);
          y = drawReceiptImages(ctx, payload.images, palette, x, y, w, loadedImages);
        } else if (payload.type === 'brewPlan') {
          y = drawReceiptParameterGrid(ctx, payload.rows, palette, x, y, w);
          y = drawReceiptSteps(ctx, payload.steps, palette, x, y, w);
          y = drawReceiptNotes(ctx, payload.notes, palette, x, y, w);
          y = drawReceiptQr(ctx, payload.qr, palette, x, y, w);
        } else if (payload.type === 'drink') {
          y = drawReceiptParameterGrid(ctx, payload.rows, palette, x, y, w);
          let notesConsumed = false;
          if (composition.kind === 'drink-photo-radar') y = drawDrinkPhotoRadar(ctx, payload, loadedImages, composition, palette, x, y, w);
          else {
            const radarDetails = drawDrinkRadarDetails(ctx, payload, composition, palette, x, y, w);
            y = radarDetails.y; notesConsumed = radarDetails.notesConsumed;
          }
          if (payload.brewRows && payload.brewRows.length) {
            setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.ink; ctx.fillText('本次冲煮记录', x, y); y += 48;
            y = drawReceiptParameterGrid(ctx, payload.brewRows, palette, x, y, w);
            y = drawReceiptSteps(ctx, payload.brewSteps, palette, x, y, w);
          }
          if (!notesConsumed) y = drawReceiptNotes(ctx, payload.notes, palette, x, y, w);
          if (composition.kind !== 'drink-photo-radar') y = drawReceiptImages(ctx, payload.images, palette, x, y, w, loadedImages);
        } else {
          y = drawReceiptParameterGrid(ctx, payload.rows, palette, x, y, w);
          y = drawReceiptSteps(ctx, payload.steps, palette, x, y, w);
          y = drawReceiptNotes(ctx, payload.notes, palette, x, y, w);
          y = drawReceiptImages(ctx, payload.images, palette, x, y, w, loadedImages);
          y = drawReceiptLogs(ctx, payload.logs, palette, x, y, w);
          y = drawReceiptQr(ctx, payload.qr, palette, x, y, w);
        }
      }
      y = drawReceiptFooter(ctx, payload, palette, x, y, w);
      const cardHeight = Math.max(Math.round(y + 116), 560);
      const out = document.createElement('canvas'); out.width = width; out.height = cardHeight; const octx = out.getContext('2d');
      octx.fillStyle = palette.bg; octx.fillRect(0, 0, width, cardHeight);
      fillRound(octx, 54, 54, width - 108, cardHeight - 108, 42, palette.paper, '#6f4d33');
      for (let dy = 170; dy <= cardHeight - 150; dy += 190) { octx.fillStyle = palette.bg; octx.beginPath(); octx.arc(54, dy, 16, 0, Math.PI * 2); octx.arc(width - 54, dy, 16, 0, Math.PI * 2); octx.fill(); }
      octx.drawImage(content, 0, 0);
      return out;
    }
    function drawReportBadge(ctx, payload, palette, x, y, w) {
      setCanvasFont(ctx, 26, 800, false); ctx.fillStyle = palette.accent;
      ctx.fillText(`${payload.eyebrow} · ${payload.reportKind === 'year' ? 'COFFEE YEAR REPORT' : 'COFFEE MONTH REPORT'}`, x, y);
      y += 24;
      setCanvasFont(ctx, 150, 850, true); ctx.fillStyle = palette.ink;
      const big = String((payload.badge && payload.badge.big) || '');
      ctx.fillText(big, x, y + 138);
      const bigW = ctx.measureText(big).width;
      setCanvasFont(ctx, 34, 700, false); ctx.fillStyle = palette.muted;
      ctx.fillText((payload.badge && payload.badge.small) || '', x + bigW + 22, y + 138);
      y += 172;
      setCanvasFont(ctx, 30, 600, false); ctx.fillStyle = palette.muted;
      y = drawCanvasTextBlock(ctx, payload.subtitle, x, y + 30, w, 42, 3);
      return y + 24;
    }
    function drawReportHero(ctx, stats, palette, x, y, w) {
      if (!stats || !stats.length) return y;
      const gap = 16; const cols = 4; const cardW = (w - gap * (cols - 1)) / cols; const h = 150;
      stats.slice(0, 4).forEach((stat, index) => {
        const px = x + index * (cardW + gap); const dark = index === 0;
        fillRound(ctx, px, y, cardW, h, 22, dark ? palette.ink : palette.surface, dark ? null : palette.border);
        setCanvasFont(ctx, 20, 700, false); ctx.fillStyle = dark ? palette.line : palette.muted; ctx.fillText(stat.label, px + 20, y + 40);
        setCanvasFont(ctx, 52, 850, true); ctx.fillStyle = dark ? palette.paper : palette.ink;
        const val = clipCanvasText(ctx, stat.value, cardW - 40); ctx.fillText(val, px + 20, y + 110);
        if (stat.unit) { const nw = ctx.measureText(val).width; setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = dark ? palette.accent : palette.muted; ctx.fillText(stat.unit, px + 20 + nw + 6, y + 110); }
      });
      return y + h + 26;
    }
    function drawReportSourceBar(ctx, source, palette, x, y, w) {
      if (!source) return y;
      const total = (Number(source.home) || 0) + (Number(source.external) || 0); if (!total) return y;
      setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('本阶段足迹', x, y); y += 36;
      const barH = 40; const homeW = Math.round(w * ((Number(source.home) || 0) / total));
      fillRound(ctx, x, y, w, barH, barH / 2, palette.surface, palette.border);
      if (homeW > 0) fillRound(ctx, x, y, Math.min(w, Math.max(homeW, barH)), barH, barH / 2, palette.accent);
      let labelY = y + barH + 42;
      setCanvasFont(ctx, 24, 600, false); ctx.fillStyle = palette.ink; ctx.fillText(`自家冲煮 ${source.home} 杯`, x, labelY);
      const right = `外饮 ${source.external} 杯`; ctx.fillStyle = palette.muted; ctx.fillText(right, x + w - ctx.measureText(right).width, labelY);
      if (source.unknownCost) { labelY += 34; setCanvasFont(ctx, 20, 500, false); ctx.fillStyle = palette.muted; ctx.fillText(`${source.unknownCost} 杯金额未计入估算`, x, labelY); }
      return labelY + 28;
    }
    function drawReportRhythm(ctx, rhythm, palette, x, y, w, activeLabel) {
      if (!rhythm || !rhythm.length) return y;
      setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = palette.muted; ctx.fillText('12 个月杯数节奏', x, y); y += 40;
      const n = rhythm.length; const gap = 10; const barW = (w - gap * (n - 1)) / n; const maxCups = Math.max(1, ...rhythm.map((item) => item.cups)); const areaH = 200; const baseY = y + areaH;
      rhythm.forEach((item, index) => {
        const px = x + index * (barW + gap); const bh = item.cups ? Math.max(8, Math.round(areaH * (item.cups / maxCups))) : 3;
        const active = item.label === activeLabel && item.cups;
        fillRound(ctx, px, baseY - bh, barW, bh, Math.min(8, barW / 2), active ? palette.accent : palette.surface, active ? null : palette.border);
        if (item.cups) { setCanvasFont(ctx, 18, 800, false); ctx.fillStyle = palette.ink; const t = String(item.cups); ctx.fillText(t, px + (barW - ctx.measureText(t).width) / 2, baseY - bh - 8); }
        setCanvasFont(ctx, 17, 600, false); ctx.fillStyle = palette.muted; const lbl = item.label.replace('月', ''); ctx.fillText(lbl, px + (barW - ctx.measureText(lbl).width) / 2, baseY + 26);
      });
      return baseY + 48;
    }
    function drawReportHighlights(ctx, items, palette, x, y, w) {
      if (!items || !items.length) return y;
      const gap = 16; const cardW = (w - gap) / 2; const h = 118;
      items.forEach((item, index) => {
        const px = x + (index % 2) * (cardW + gap); const py = y + Math.floor(index / 2) * (h + gap);
        fillRound(ctx, px, py, cardW, h, 20, palette.surface, palette.border);
        setCanvasFont(ctx, 20, 700, false); ctx.fillStyle = palette.accent; ctx.fillText(item.label, px + 22, py + 38);
        setCanvasFont(ctx, 30, 800, true); ctx.fillStyle = palette.ink; ctx.fillText(clipCanvasText(ctx, item.value, cardW - 44), px + 22, py + 80);
        if (item.sub) { setCanvasFont(ctx, 20, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, item.sub, cardW - 44), px + 22, py + 108); }
      });
      return y + Math.ceil(items.length / 2) * (h + gap) + 34;
    }
    function drawReportChips(ctx, label, items, palette, x, y, w) {
      if (!items || !items.length) return y;
      setCanvasFont(ctx, 22, 700, false); ctx.fillStyle = palette.muted; ctx.fillText(label, x, y); y += 42;
      let cx = x; let cy = y; const padX = 22; const h = 52; const gap = 14; const lineH = h + 18;
      items.forEach((raw) => {
        const text = String(raw); setCanvasFont(ctx, 24, 650, false); const cw = ctx.measureText(text).width + padX * 2;
        if (cx > x && cx + cw > x + w) { cx = x; cy += lineH; }
        fillRound(ctx, cx, cy, cw, h, h / 2, palette.surface, palette.border);
        setCanvasFont(ctx, 24, 650, false); ctx.fillStyle = palette.ink; ctx.fillText(text, cx + padX, cy + 34);
        cx += cw + gap;
      });
      return cy + h + 34;
    }
    async function renderReportShareCard(payload) {
      const palette = { bg: '#1a1412', paper: '#f4eadc', surface: '#eadcc8', ink: '#251811', muted: '#806b59', accent: '#b7783d', border: '#d9c6ac', line: '#d5b58e', heat: ['#e2d6c5', '#d5bd96', '#cda66b', '#bd8345', '#8f542d'] };
      const width = 1080; const maxHeight = 4200;
      const content = document.createElement('canvas'); content.width = width; content.height = maxHeight; const ctx = content.getContext('2d');
      const x = 96; const w = width - x * 2; let y = 140;
      setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.accent; ctx.fillText('豆仓 COFFEE VAULT', x, y); y += 54;
      y = drawReportBadge(ctx, payload, palette, x, y, w);
      y = drawReportHero(ctx, payload.hero, palette, x, y, w);
      drawReceiptDivider(ctx, palette, x, y, w); y += 46;
      y = drawReportSourceBar(ctx, payload.source, palette, x, y, w);
      y = drawReportRhythm(ctx, payload.rhythm, palette, x, y, w, payload.activeMonthLabel);
      y = drawReportHighlights(ctx, payload.highlights, palette, x, y, w);
      y = drawReportChips(ctx, '笔记里的常见风味', payload.flavors, palette, x, y, w);
      y = drawReportChips(ctx, '这一阶段喝过', payload.beans, palette, x, y, w);
      y = drawReportChips(ctx, '探索过的产地', payload.origins, palette, x, y, w);
      drawReceiptDivider(ctx, palette, x, y + 4, w); y += 56;
      setCanvasFont(ctx, 24, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(payload.footer || '本地记录 · 私人豆仓', x, y);
      const cardHeight = Math.min(Math.max(Math.round(y + 116), 560), maxHeight);
      const out = document.createElement('canvas'); out.width = width; out.height = cardHeight; const octx = out.getContext('2d');
      octx.fillStyle = palette.bg; octx.fillRect(0, 0, width, cardHeight);
      fillRound(octx, 54, 54, width - 108, cardHeight - 108, 42, palette.paper, '#6f4d33');
      for (let dy = 170; dy <= cardHeight - 150; dy += 190) { octx.fillStyle = palette.bg; octx.beginPath(); octx.arc(54, dy, 16, 0, Math.PI * 2); octx.arc(width - 54, dy, 16, 0, Math.PI * 2); octx.fill(); }
      octx.drawImage(content, 0, 0);
      return out;
    }

    async function loadCatalogCover(item) {
      const candidates = item && item.candidates || [];
      for (let index = 0; index < candidates.length; index += 1) {
        const img = await loadCanvasImage(candidates[index].path);
        if (img) return { img, type: candidates[index].type || 'bag' };
      }
      return { img: null, type: 'placeholder' };
    }

    function drawCatalogPlaceholder(ctx, item, x, y, w, h, palette) {
      const placeholder = item && item.placeholder || {};
      const colors = { light: '#decaa7', 'medium-light': '#c9a979', medium: '#aa7950', 'medium-dark': '#76503d', dark: '#46342f', neutral: '#b8aa98' };
      ctx.fillStyle = colors[placeholder.roastKey] || colors.neutral;
      ctx.fillRect(x, y, w, h);
      setCanvasFont(ctx, Math.round(Math.min(w, h) * .34), 800, true);
      ctx.fillStyle = '#fff8ec';
      const glyph = String(placeholder.glyph || (item.name || '豆').trim().charAt(0) || '豆');
      ctx.fillText(glyph, x + (w - ctx.measureText(glyph).width) / 2, y + h * .61);
    }

    async function drawCatalogWall(ctx, payload, palette, x, y, w) {
      const items = payload.covers || [];
      if (!items.length) return y;
      const wallLabel = payload.wallLabel || (payload.mode === 'journal' ? '贴纸收集册' : '豆款收集墙');
      setCanvasFont(ctx, 24, 750, false); ctx.fillStyle = palette.muted; ctx.fillText(wallLabel, x, y); y += 42;
      const cols = 4; const gap = 16; const cardW = (w - gap * (cols - 1)) / cols; const imageH = 190; const cardH = 258;
      const loaded = await Promise.all(items.map(loadCatalogCover));
      items.forEach((item, index) => {
        const col = index % cols; const row = Math.floor(index / cols); const px = x + col * (cardW + gap); const py = y + row * (cardH + gap); const cover = loaded[index];
        ctx.save();
        if (payload.mode === 'journal') { const tilt = (index % 2 ? 1 : -1) * .012; ctx.translate(px + cardW / 2, py + cardH / 2); ctx.rotate(tilt); ctx.translate(-(px + cardW / 2), -(py + cardH / 2)); }
        fillRound(ctx, px, py, cardW, cardH, 18, item.lit ? palette.surface : palette.paper, palette.border);
        ctx.save(); roundRect(ctx, px + 9, py + 9, cardW - 18, imageH, 13); ctx.clip();
        if (cover.img) {
          if (cover.type === 'cutout') {
            ctx.fillStyle = palette.cutout; ctx.fillRect(px + 9, py + 9, cardW - 18, imageH);
            const scale = Math.min((cardW - 28) / cover.img.width, (imageH - 18) / cover.img.height); const iw = cover.img.width * scale; const ih = cover.img.height * scale;
            ctx.drawImage(cover.img, px + (cardW - iw) / 2, py + 9 + (imageH - ih) / 2, iw, ih);
          } else drawCoverImage(ctx, cover.img, px + 9, py + 9, cardW - 18, imageH);
        } else drawCatalogPlaceholder(ctx, item, px + 9, py + 9, cardW - 18, imageH, palette);
        ctx.restore();
        if (!item.lit) { ctx.fillStyle = 'rgba(244,234,220,.52)'; ctx.fillRect(px + 9, py + 9, cardW - 18, imageH); }
        setCanvasFont(ctx, 22, 800, true); ctx.fillStyle = item.lit ? palette.ink : palette.muted; ctx.fillText(clipCanvasText(ctx, item.name, cardW - 28), px + 14, py + 226);
        setCanvasFont(ctx, 17, 600, false); ctx.fillStyle = palette.muted; ctx.fillText(clipCanvasText(ctx, item.origin || payload.coverFallback || '产地未记录', cardW - 28), px + 14, py + 249);
        ctx.restore();
      });
      const rows = Math.ceil(items.length / cols); y += rows * (cardH + gap) + 18;
      if (payload.remainingCovers) { setCanvasFont(ctx, 25, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(`还有 +${payload.remainingCovers} 款收藏`, x, y); y += 42; }
      return y;
    }

    async function renderCatalogShareCard(payload) {
      const palette = { bg: '#1a1412', paper: '#f4eadc', surface: '#eadcc8', ink: '#251811', muted: '#806b59', accent: '#b7783d', border: '#d9c6ac', line: '#d5b58e', cutout: '#dfcfb9' };
      const width = 1080; const maxHeight = 3600; const content = document.createElement('canvas'); content.width = width; content.height = maxHeight; const ctx = content.getContext('2d');
      const x = 96; const w = width - x * 2; let y = 140;
      setCanvasFont(ctx, 28, 800, false); ctx.fillStyle = palette.accent; ctx.fillText('豆仓 COFFEE VAULT', x, y); y += 66;
      setCanvasFont(ctx, 25, 800, false); ctx.fillStyle = palette.muted; ctx.fillText(`${payload.eyebrow || '咖啡图鉴'} · ${payload.atlasCode || 'COFFEE ATLAS'}`, x, y); y += 72;
      setCanvasFont(ctx, 62, 850, true); ctx.fillStyle = palette.ink; ctx.fillText(payload.title || '一路喝过的咖啡', x, y); y += 52;
      setCanvasFont(ctx, 27, 600, false); ctx.fillStyle = palette.muted; y = drawCanvasTextBlock(ctx, payload.subtitle || '', x, y, w, 38, 2) + 34;
      drawReceiptDivider(ctx, palette, x, y, w); y += 48;
      y = await drawCatalogWall(ctx, payload, palette, x, y, w);
      if (payload.origins && payload.origins.length) y = drawReportChips(ctx, payload.originsLabel || `探索过的产地 · ${payload.originCount} 个`, payload.origins, palette, x, y, w);
      if (payload.milestones && payload.milestones.length) {
        const gap = 16; const cardW = (w - gap) / 2; const h = 116;
        payload.milestones.forEach((item, index) => { const px = x + index * (cardW + gap); fillRound(ctx, px, y, cardW, h, 20, palette.surface, palette.border); setCanvasFont(ctx, 20, 700, false); ctx.fillStyle = palette.muted; ctx.fillText(item.label, px + 22, y + 36); setCanvasFont(ctx, 40, 850, true); ctx.fillStyle = palette.accent; ctx.fillText(item.value, px + 22, y + 88); });
        y += h + 38;
      }
      drawReceiptDivider(ctx, palette, x, y, w); y += 52; setCanvasFont(ctx, 24, 800, false); ctx.fillStyle = palette.accent; ctx.fillText(payload.footer || '本地记录 · 私人豆仓', x, y);
      const cardHeight = Math.min(Math.max(Math.round(y + 116), 760), maxHeight); const out = document.createElement('canvas'); out.width = width; out.height = cardHeight; const octx = out.getContext('2d');
      octx.fillStyle = palette.bg; octx.fillRect(0, 0, width, cardHeight); fillRound(octx, 54, 54, width - 108, cardHeight - 108, 42, palette.paper, '#6f4d33');
      for (let dy = 170; dy <= cardHeight - 150; dy += 190) { octx.fillStyle = palette.bg; octx.beginPath(); octx.arc(54, dy, 16, 0, Math.PI * 2); octx.arc(width - 54, dy, 16, 0, Math.PI * 2); octx.fill(); }
      octx.drawImage(content, 0, 0); return out;
    }

    const SHARE_CARD_RENDERERS = { receipt: renderReceiptShareCard, report: renderReportShareCard, catalog: renderCatalogShareCard };
    async function renderShareCard(payload, style) { const renderer = SHARE_CARD_RENDERERS[style || payload.style] || SHARE_CARD_RENDERERS.receipt; return renderer({ ...payload, style: style || payload.style || 'receipt' }); }

    // clipCanvasText / wrapCanvasLines 一并导出,供 Node 测试用假 ctx 验证换行/截断逻辑。
    return { renderShareCard, canvasToBlob, loadCanvasImage, clipCanvasText, wrapCanvasLines, fitImageRect, resolveReceiptComposition, receiptRatingPresentation };
  }

  return { create };
});
