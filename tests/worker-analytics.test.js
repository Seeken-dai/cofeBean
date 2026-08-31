'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('analytics logic: parseUserAgent parses OS, deviceType, and browser correctly', async () => {
  const analytics = await import('../worker/src/analytics.mjs');

  const androidMobile = analytics.parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36');
  assert.equal(androidMobile.os, 'Android');
  assert.equal(androidMobile.deviceType, 'mobile');
  assert.equal(androidMobile.browser, 'Chrome');

  const iphoneWechat = analytics.parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50');
  assert.equal(iphoneWechat.os, 'iOS');
  assert.equal(iphoneWechat.deviceType, 'mobile');
  assert.equal(iphoneWechat.browser, 'WeChat');

  const macSafari = analytics.parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15');
  assert.equal(macSafari.os, 'macOS');
  assert.equal(macSafari.deviceType, 'desktop');
  assert.equal(macSafari.browser, 'Safari');

  const winEdge = analytics.parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0');
  assert.equal(winEdge.os, 'Windows');
  assert.equal(winEdge.deviceType, 'desktop');
  assert.equal(winEdge.browser, 'Edge');
});

test('analytics logic: parseReferrerHost normalizes and handles direct / internal traffic', async () => {
  const analytics = await import('../worker/src/analytics.mjs');

  assert.equal(analytics.parseReferrerHost(''), 'Direct');
  assert.equal(analytics.parseReferrerHost(null), 'Direct');
  assert.equal(analytics.parseReferrerHost('https://cofevault.top/'), 'Direct');
  assert.equal(analytics.parseReferrerHost('https://www.cofevault.top/download'), 'Direct');
  assert.equal(analytics.parseReferrerHost('https://github.com/Seeken-dai/cofeBean'), 'github.com');
  assert.equal(analytics.parseReferrerHost('https://www.v2ex.com/t/123456'), 'v2ex.com');
  assert.equal(analytics.parseReferrerHost('invalid-url'), 'Direct');
});

test('analytics logic: generateVisitorHash is deterministic per day and anonymizes IP', async () => {
  const analytics = await import('../worker/src/analytics.mjs');

  const hash1 = await analytics.generateVisitorHash('1.2.3.4', 'Mozilla/5.0', '2026-08-31', 'salt1');
  const hash2 = await analytics.generateVisitorHash('1.2.3.4', 'Mozilla/5.0', '2026-08-31', 'salt1');
  const hashNextDay = await analytics.generateVisitorHash('1.2.3.4', 'Mozilla/5.0', '2026-09-01', 'salt1');
  const hashDiffIp = await analytics.generateVisitorHash('1.2.3.5', 'Mozilla/5.0', '2026-08-31', 'salt1');

  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 16);
  assert.notEqual(hash1, hashNextDay);
  assert.notEqual(hash1, hashDiffIp);
});

test('analytics integration: record hit and query stats in D1', async () => {
  const analytics = await import('../worker/src/analytics.mjs');

  const rows = [];
  const mockDb = {
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...args) {
          this._params = args;
          return this;
        },
        async run() {
          rows.push({
            id: rows.length + 1,
            created_at: this._params[0],
            event_type: this._params[1],
            path: this._params[2],
            referrer: this._params[3],
            referrer_host: this._params[4],
            country: this._params[5],
            os: this._params[6],
            browser: this._params[7],
            device_type: this._params[8],
            visitor_hash: this._params[9],
            meta_json: this._params[10]
          });
          return { success: true };
        },
        async first() {
          return {
            pv: rows.filter((r) => r.event_type === 'pageview').length,
            uv: 1,
            downloads: rows.filter((r) => r.event_type === 'click_download').length,
            webapp: rows.filter((r) => r.event_type === 'click_webapp').length
          };
        },
        async all() {
          return { results: [] };
        }
      };
    }
  };

  const env = { DB: mockDb, ANALYTICS_SALT: 'test-salt' };

  const hitReq = new Request('https://sync.cofevault.top/analytics/hit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0 Mobile',
      'CF-IPCountry': 'CN',
      'CF-Connecting-IP': '114.114.114.114'
    },
    body: JSON.stringify({
      event: 'click_download',
      path: '/',
      referrer: 'https://github.com/Seeken-dai/cofeBean'
    })
  });

  const hitRes = await analytics.recordAnalyticsHit(hitReq, env);
  assert.equal(hitRes.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, 'click_download');
  assert.equal(rows[0].referrer_host, 'github.com');
  assert.equal(rows[0].country, 'CN');
  assert.equal(rows[0].os, 'Android');

  const statsReq = new Request('https://sync.cofevault.top/analytics/stats?range=7d');
  const statsRes = await analytics.getAnalyticsStats(statsReq, env);
  assert.equal(statsRes.summary.totalDownloads, 1);
  assert.equal(statsRes.summary.range, '7d');
});
