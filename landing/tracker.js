// 豆仓落地页轻量访问统计与行为埋点
(function () {
  'use strict';

  var ENDPOINT = 'https://sync.cofevault.top/analytics/hit';

  function isLocal() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function track(event, meta) {
    try {
      var payload = {
        event: event || 'pageview',
        path: location.pathname + location.search,
        referrer: document.referrer || '',
        meta: meta || {}
      };

      if (isLocal()) {
        console.log('[Analytics Tracker (Local)]', payload);
        return;
      }

      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, blob);
      } else if (window.fetch) {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {
      // 埋点异常绝不影响主业务
    }
  }

  // 1. 自动上报 PV
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    track('pageview');
  } else {
    window.addEventListener('DOMContentLoaded', function () {
      track('pageview');
    });
  }

  // 2. 核心转化事件监听
  document.addEventListener('click', function (e) {
    var target = e.target.closest('a, button');
    if (!target) return;

    var href = target.getAttribute('href') || '';
    if (href.indexOf('/releases') !== -1 || href.indexOf('.apk') !== -1) {
      track('click_download', { href: href });
    } else if (href.indexOf('app.cofevault.top') !== -1) {
      track('click_webapp', { href: href });
    } else if (href.indexOf('github.com') !== -1 && href.indexOf('/releases') === -1) {
      track('click_github', { href: href });
    }
  });

  window.CoffeeAnalytics = {
    track: track
  };
})();
