// 豆仓 Coffee Vault landing — i18n toggle, hero carousel, theme preview switch, live version.
(function () {
  'use strict';

  var STORE_KEY = 'cofevault-lang';
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));

  // theme id -> localized name, page bg (for meta theme-color), title gradient + tailored copy.
  // {theme} is replaced by the gradient-highlighted theme name.
  // Palette tokens live in styles.css ([data-theme=...]); bg here mirrors app for <meta name="theme-color">.
  var THEMES = [
    { id: 'dark-roast', zh: '深烘', en: 'Dark Roast', bg: '#1a1412', grad: ['#e6be8a', '#b07d45'],
      titleZh: '温润深邃的 {theme}，像深夜里的一杯手冲',
      titleEn: 'A deep, mellow {theme} — like a late-night pour-over' },
    { id: 'frost', zh: '澳白', en: 'Flat White', bg: '#f7f1e8', grad: ['#d8b48c', '#9a6b42'],
      titleZh: '柔和奶润的 {theme}，明亮温柔如清晨',
      titleEn: 'A soft, milky {theme} — gentle as the morning light' },
    { id: 'obsidian', zh: '火山灰绿', en: 'Ash Green', bg: '#1e2320', grad: ['#aeb98d', '#6f7d54'],
      titleZh: '沉静内敛的 {theme}，如火山岩壤般深邃',
      titleEn: 'A calm, grounded {theme} — deep as volcanic earth' },
    { id: 'blaze', zh: '生豆', en: 'Green Bean', bg: '#f5f3ea', grad: ['#8fb877', '#4a6b3f'],
      titleZh: '清新自然的 {theme}，像刚离枝的青果',
      titleEn: 'A fresh, natural {theme} — like fruit just off the branch' }
  ];
  var currentLang = 'zh';
  var currentTheme = 'dark-roast';
  var toggle = document.getElementById('langToggle');
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');

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
    var tpl = currentLang === 'en' ? t.titleEn : t.titleZh;
    var name = currentLang === 'en' ? t.en : t.zh;
    el.innerHTML = tpl.replace('{theme}', '<span class="theme-word">' + name + '</span>');
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
    // label widths change with language — remeasure underline
    requestAnimationFrame(function () { updateThemeIndicator(); });
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
  }

  // ----- language toggle -----
  apply(pickInitial());
  if (toggle) {
    toggle.addEventListener('click', function () {
      apply(currentLang === 'en' ? 'zh' : 'en');
    });
  }

  // ----- theme preview switch (layered crossfade) -----
  function crossfade(shot, theme) {
    var screen = shot.getAttribute('data-screen');
    var src = 'assets/screens/' + theme + '/' + screen + '.webp';
    var cur = shot.querySelector('img');
    if (cur && cur.getAttribute('src') === src) return;
    var next = document.createElement('img');
    next.className = 'shot-img';
    next.setAttribute('width', '390');
    next.setAttribute('height', '844');
    if (cur) next.alt = cur.alt;
    next.style.opacity = '0';
    next.src = src;
    shot.appendChild(next);
    function reveal() {
      requestAnimationFrame(function () { next.style.opacity = '1'; });
      window.setTimeout(function () { if (cur && cur.parentNode) cur.parentNode.removeChild(cur); }, 600);
    }
    if (next.complete) reveal();
    else { next.onload = reveal; next.onerror = function () { next.style.opacity = '1'; if (cur && cur.parentNode) cur.parentNode.removeChild(cur); }; }
  }

  function applyPageTheme(id) {
    var t = themeById(id);
    document.documentElement.setAttribute('data-theme', t.id);
    if (themeColorMeta) themeColorMeta.setAttribute('content', t.bg);
  }

  /** Swap hero carousel frames to the active theme (incl. seamless-loop clone). */
  function syncHeroScreens(id) {
    Array.prototype.forEach.call(document.querySelectorAll('#heroTrack .carousel-slide'), function (img) {
      var src = img.getAttribute('src') || '';
      var m = src.match(/assets\/screens\/[^/]+\/(.+)$/);
      if (m) img.setAttribute('src', 'assets/screens/' + id + '/' + m[1]);
    });
  }

  function updateThemeIndicator() {
    var root = document.getElementById('themeSwitch');
    var bar = document.getElementById('themeIndicator');
    if (!root || !bar) return;
    var active = root.querySelector('.theme-tab.is-active');
    if (!active) {
      bar.style.width = '0';
      return;
    }
    // offset* is relative to the positioned switch; supports multi-line wrap
    var left = active.offsetLeft;
    var top = active.offsetTop + active.offsetHeight - 2;
    var width = active.offsetWidth;
    bar.style.width = width + 'px';
    bar.style.transform = 'translate(' + left + 'px, ' + top + 'px)';
  }

  function switchTheme(id) {
    var t = themeById(id);
    if (!t) return;
    var same = t.id === currentTheme;
    currentTheme = t.id;
    applyPageTheme(t.id);
    Array.prototype.forEach.call(document.querySelectorAll('.theme-tab'), function (p) {
      var on = p.getAttribute('data-theme-id') === t.id;
      p.classList.toggle('is-active', on);
      p.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (!same) {
      Array.prototype.forEach.call(document.querySelectorAll('#themeScreens .shot[data-screen]'), function (shot) {
        crossfade(shot, t.id);
      });
      syncHeroScreens(t.id);
    }
    renderThemeTitle();
    updateThemeIndicator();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.theme-tab'), function (tab) {
    tab.addEventListener('click', function () { switchTheme(tab.getAttribute('data-theme-id')); });
  });
  // initial page chrome (CSS tokens + browser chrome color)
  applyPageTheme(currentTheme);
  // place underline after layout / webfonts settle
  requestAnimationFrame(function () { updateThemeIndicator(); });
  window.addEventListener('resize', updateThemeIndicator);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { updateThemeIndicator(); }).catch(function () {});
  }

  // ----- hero carousel (horizontal slide, seamless forward loop) -----
  (function initCarousel() {
    var root = document.getElementById('heroCarousel');
    var track = document.getElementById('heroTrack');
    if (!root || !track) return;
    var real = track.querySelectorAll('.carousel-slide').length;
    if (real < 2) return;

    // clone the first slide at the end so the wrap-around slides forward, not back
    var clone = track.firstElementChild.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);

    var i = 0, paused = false;
    function place(animate) {
      track.style.transition = animate ? '' : 'none';
      track.style.transform = 'translateX(-' + (i * 100) + '%)';
    }
    function next() { i += 1; place(true); }

    track.addEventListener('transitionend', function () {
      if (i >= real) {            // landed on the clone (looks like slide 0)
        i = 0;
        place(false);            // jump back with no animation
        void track.offsetWidth;  // force reflow so the next move animates
        track.style.transition = '';
      }
    });

    root.addEventListener('mouseenter', function () { paused = true; });
    root.addEventListener('mouseleave', function () { paused = false; });
    document.addEventListener('visibilitychange', function () { paused = document.hidden; });

    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInterval(function () { if (!paused) next(); }, 4000);
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
