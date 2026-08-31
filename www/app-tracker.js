// 豆仓 Web 版轻量访问统计（严格环境隔离：Android 原生端完全静默、不发任何网络请求）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppTracker = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ENDPOINT = 'https://sync.cofevault.top/analytics/hit';

  function isNativeApp(env) {
    var win = env || (typeof window !== 'undefined' ? window : null);
    if (!win) return false;
    var cap = win.Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
    var proto = win.location && win.location.protocol;
    if (proto === 'capacitor:' || proto === 'file:') return true;
    return false;
  }

  function isLocalHost(win) {
    if (!win || !win.location) return false;
    var host = win.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  function isPwa(win) {
    if (!win || typeof win.matchMedia !== 'function') return false;
    try {
      return win.matchMedia('(display-mode: standalone)').matches || win.navigator?.standalone === true;
    } catch {
      return false;
    }
  }

  function createTracker(options) {
    var opts = options || {};
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var sendBeacon = opts.sendBeacon || (win && win.navigator && win.navigator.sendBeacon ? win.navigator.sendBeacon.bind(win.navigator) : null);
    var fetchFn = opts.fetch || (win && win.fetch ? win.fetch.bind(win) : null);

    // 核心守卫：Android 原生端绝对不发网络请求
    if (isNativeApp(win)) {
      return {
        track: function () {},
        enabled: false,
        reason: 'native_offline'
      };
    }

    function track(event, meta) {
      try {
        if (isNativeApp(win)) return;

        var payload = {
          site: 'webapp',
          event: event || 'pageview',
          path: '/app' + (win && win.location ? win.location.hash || '' : ''),
          referrer: (doc && doc.referrer) || '',
          meta: Object.assign({
            pwa: isPwa(win)
          }, meta || {})
        };

        if (isLocalHost(win)) {
          if (typeof console !== 'undefined' && console.log) {
            console.log('[Web App Tracker (Local)]', payload);
          }
          return;
        }

        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (sendBeacon) {
          sendBeacon(ENDPOINT, blob);
        } else if (fetchFn) {
          fetchFn(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
          }).catch(function () {});
        }
      } catch {
        // 埋点异常绝不影响应用主流程
      }
    }

    // 自动触发页面 PV
    if (doc) {
      if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        track('pageview');
      } else if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('DOMContentLoaded', function () {
          track('pageview');
        });
      }
    }

    return {
      track: track,
      enabled: true,
      reason: 'web_online'
    };
  }

  // 浏览器环境自动初始化
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    createTracker();
  }

  return {
    isNativeApp: isNativeApp,
    isPwa: isPwa,
    create: createTracker
  };
});
