(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AppWidgetIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseAction(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value));
      if (url.protocol !== 'coffeebean:' || url.hostname !== 'quick-drink') return null;
      const action = url.pathname.replace(/^\/+|\/+$/g, '');
      return action === 'bean' || action === 'external' ? action : null;
    } catch (_) {
      return null;
    }
  }

  return { parseAction };
});
