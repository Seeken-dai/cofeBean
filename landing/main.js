// 豆仓 Coffee Vault landing — i18n toggle, hero carousel, theme preview switch, live version.
(function () {
  'use strict';

  var STORE_KEY = 'cofevault-lang';
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));

  // theme id -> localized name + a gradient that reads on the dark page
  var THEMES = [
    { id: 'dark-roast', zh: '深烘', en: 'Dark Roast', grad: ['#e6be8a', '#b07d45'] },
    { id: 'frost',      zh: '澳白', en: 'Flat White', grad: ['#d8b48c', '#9a6b42'] },
    { id: 'obsidian',   zh: '火山灰绿', en: 'Ash Green', grad: ['#aeb98d', '#6f7d54'] },
    { id: 'blaze',      zh: '生豆', en: 'Green Bean', grad: ['#8fb877', '#4a6b3f'] }
  ];
  var SCREENS = ['home', 'records', 'calendar'];

  var currentLang = 'zh';
  var currentTheme = 'dark-roast';
  var toggle = document.getElementById('langToggle');

  function pickInitial() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (saved === 'zh' || saved === 'en') return saved;
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;
    var nav = (navigator.language || 'zh').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }

  function renderThemeTitle() {
    var el = document.getElementById('themeTitle');
    if (!el) return;
    var t = themeById(currentTheme);
    var tpl = el.getAttribute(currentLang === 'en' ? 'data-tpl-en' : 'data-tpl-zh') || '{theme}';
    el.innerHTML = tpl.replace('{theme}', '<span class="theme-word">' + (currentLang === 'en' ? t.en : t.zh) + '</span>');
    var word = el.querySelector('.theme-word');
    if (word) word.style.backgroundImage = 'linear-gradient(92deg,' + t.grad[0] + ',' + t.grad[1] + ')';
  }

  function apply(lang) {
    currentLang = lang;
    nodes.forEach(function (el) {
      var val = el.getAttribute(lang === 'en' ? 'data-en' : 'data-zh');
      if (val != null) el.textContent = val;
    });
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    if (toggle) {
      toggle.textContent = lang === 'en' ? '中' : 'EN';
      toggle.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    }
    renderThemeTitle();
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
  }

  // ----- language toggle -----
  apply(pickInitial());
  if (toggle) {
    toggle.addEventListener('click', function () {
      apply(currentLang === 'en' ? 'zh' : 'en');
    });
  }

  // ----- theme preview switch -----
  function swapImage(img, src) {
    var pre = new Image();
    pre.onload = function () { img.src = src; requestAnimationFrame(function () { img.classList.remove('img-fade'); }); };
    pre.onerror = function () { img.src = src; img.classList.remove('img-fade'); };
    img.classList.add('img-fade');
    pre.src = src;
  }

  function switchTheme(id) {
    currentTheme = id;
    Array.prototype.forEach.call(document.querySelectorAll('.theme-pill'), function (p) {
      var on = p.getAttribute('data-theme-id') === id;
      p.classList.toggle('is-active', on);
      p.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#themeScreens img[data-screen]'), function (img) {
      swapImage(img, 'assets/screens/' + id + '/' + img.getAttribute('data-screen') + '.webp');
    });
    renderThemeTitle();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.theme-pill'), function (pill) {
    pill.addEventListener('click', function () { switchTheme(pill.getAttribute('data-theme-id')); });
  });

  // ----- hero carousel -----
  (function initCarousel() {
    var root = document.getElementById('heroCarousel');
    if (!root) return;
    var slides = root.querySelectorAll('.carousel-slide');
    if (slides.length < 2) return;
    var i = 0, paused = false, timer = null;
    function go(n) {
      slides[i].classList.remove('is-active');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('is-active');
    }
    root.addEventListener('mouseenter', function () { paused = true; });
    root.addEventListener('mouseleave', function () { paused = false; });
    document.addEventListener('visibilitychange', function () { paused = document.hidden; });
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = setInterval(function () { if (!paused) go(i + 1); }, 2800);
    }
  })();

  // ----- live version from latest GitHub release -----
  (function fetchVersion() {
    var el = document.getElementById('appVersion');
    if (!el || !window.fetch) return;
    fetch('https://api.github.com/repos/Seeken-dai/cofeBean/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.tag_name) el.textContent = String(d.tag_name).replace(/^v/i, ''); })
      .catch(function () {});
  })();

  // ----- footer year -----
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
