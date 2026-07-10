// app.js 拆分第一批:无状态的格式化/解析工具。
// 约定:此文件只放不读写 state、不碰 DOM/els 的纯函数,可在 Node 测试里直接跑。
// 依赖 state 或 DOM 的辅助函数留在 app.js(或后续按视图拆分的文件)里。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
  function formatWeight(value) { const n = Number(value) || 0; return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}kg` : `${Math.round(n * 10) / 10}g`; }
  function formatPrice(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? `¥${Math.round(n * 100) / 100}` : '未记录'; }
  function formatDate(value) { if (!value) return '未记录'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date); }
  function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date); }
  function localDateTime(value) { const d = value ? new Date(value) : new Date(); const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return shifted.toISOString().slice(0, 16).replace('T', ' '); }
  function dateTimeValue(value) { return String(value || '').trim().replace(' ', 'T'); }
  function waterFromRatio(dose, ratio) { const match = String(ratio || '').match(/1\s*[:：]\s*(\d+(?:\.\d+)?)/); const n = match ? Number(match[1]) : null; return n && Number(dose) > 0 ? Math.round(Number(dose) * n * 10) / 10 : null; }
  function trimNumber(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace(/\.0$/, ''); }
  function ratioFromWater(dose, water) { const grams = Number(dose); const total = Number(water); return grams > 0 && total > 0 ? trimNumber(total / grams) : ''; }
  function parseRatio(value) { const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/); return match ? [match[1], match[2]] : ['1', '']; }
  function secondsFromText(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const h = text.match(/(\d+(?:\.\d+)?)\s*h/i) || text.match(/(\d+(?:\.\d+)?)\s*时/);
    const m = text.match(/(\d+(?:\.\d+)?)\s*m(?!s)/i) || text.match(/(\d+(?:\.\d+)?)\s*分/);
    const s = text.match(/(\d+(?:\.\d+)?)\s*s/i) || text.match(/(\d+(?:\.\d+)?)\s*秒/);
    const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (colon) return (colon[3] ? Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]) : Number(colon[1]) * 60 + Number(colon[2]));
    if (h || m || s) return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  function durationText(seconds, mode) {
    if (!(seconds >= 0)) return '';
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.round(seconds % 60);
    if (mode === 'hour') return `${h}h${m ? `${m}m` : ''}`;
    return `${m + h * 60}:${String(s).padStart(2, '0')}`;
  }
  function stars(value) { return value ? `<span class="stars" aria-label="${value} 星">${'★'.repeat(value)}${'☆'.repeat(5 - value)}</span>` : '<span class="unrated">未评分</span>'; }

  return { esc, formatWeight, formatPrice, formatDate, formatDateTime, localDateTime, dateTimeValue, waterFromRatio, trimNumber, ratioFromWater, parseRatio, secondsFromText, durationText, stars };
});
