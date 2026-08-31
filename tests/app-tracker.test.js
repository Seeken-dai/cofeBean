'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const appTracker = require('../www/app-tracker.js');

test('app-tracker: isNativeApp detects capacitor and file protocols', () => {
  assert.equal(appTracker.isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(appTracker.isNativeApp({ location: { protocol: 'capacitor:' } }), true);
  assert.equal(appTracker.isNativeApp({ location: { protocol: 'file:' } }), true);
  assert.equal(appTracker.isNativeApp({ location: { protocol: 'https:' } }), false);
  assert.equal(appTracker.isNativeApp({ location: { protocol: 'http:' } }), false);
});

test('app-tracker: native app environment completely disables tracker and does not send network requests', () => {
  let beaconCalled = false;
  let fetchCalled = false;

  const fakeWin = {
    Capacitor: { isNativePlatform: () => true },
    location: { protocol: 'capacitor:', hostname: 'localhost' },
    navigator: { sendBeacon: () => { beaconCalled = true; return true; } },
    fetch: async () => { fetchCalled = true; return {}; }
  };

  const tracker = appTracker.create({ window: fakeWin });
  assert.equal(tracker.enabled, false);
  assert.equal(tracker.reason, 'native_offline');

  tracker.track('pageview');
  assert.equal(beaconCalled, false);
  assert.equal(fetchCalled, false);
});

test('app-tracker: web browser environment sends tracking payloads with site and pwa flags', () => {
  const sentPayloads = [];

  const fakeWin = {
    location: { protocol: 'https:', hostname: 'app.cofevault.top', hash: '#beans' },
    matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }),
    navigator: {
      sendBeacon: (_url, blob) => {
        // Blob 在 Node 环境下
        sentPayloads.push({ url: _url, blob });
        return true;
      }
    }
  };

  const fakeDoc = {
    referrer: 'https://cofevault.top/',
    readyState: 'complete'
  };

  const tracker = appTracker.create({ window: fakeWin, document: fakeDoc });
  assert.equal(tracker.enabled, true);
  assert.equal(tracker.reason, 'web_online');
  assert.equal(sentPayloads.length, 1);
});
