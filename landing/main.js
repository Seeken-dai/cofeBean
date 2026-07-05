// 豆仓 Coffee Vault landing — language toggle (zh default) + small niceties.
(function () {
  'use strict';

  var STORE_KEY = 'cofevault-lang';
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));

  function pickInitial() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (saved === 'zh' || saved === 'en') return saved;
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;
    var nav = (navigator.language || 'zh').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  var toggle = document.getElementById('langToggle');

  function apply(lang) {
    nodes.forEach(function (el) {
      var val = el.getAttribute(lang === 'en' ? 'data-en' : 'data-zh');
      if (val != null) el.textContent = val;
    });
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    if (toggle) {
      // button shows the language you can switch TO
      toggle.textContent = lang === 'en' ? '中' : 'EN';
      toggle.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    }
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
  }

  var current = pickInitial();
  apply(current);

  if (toggle) {
    toggle.addEventListener('click', function () {
      current = current === 'en' ? 'zh' : 'en';
      apply(current);
    });
  }

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
