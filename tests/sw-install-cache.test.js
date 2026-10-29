'use strict';

// 3.0.15：SW install 必须绕过 HTTP 缓存（cache: 'reload'），否则 max-age=14400 的旧 JS 会被装进新版本缓存。
// 在 vm 里执行 www/sw.js，用假的 self / caches / Request 触发 install，检查 addAll 收到的每个请求。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'sw.js'), 'utf8');

function runInstall() {
  const listeners = {};
  const added = [];
  class FakeRequest { constructor(url, init) { this.url = String(url); this.cache = init && init.cache; } }
  const cache = { keys: async () => [], delete: async () => true, addAll: async (requests) => { added.push(...requests); } };
  const self = {
    location: new URL('https://app.cofevault.top/sw.js'),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  const context = vm.createContext({ self, caches: { open: async () => cache, keys: async () => [], delete: async () => true }, Request: FakeRequest, Response: class {}, URL, fetch: async () => { throw new Error('no network'); }, console });
  vm.runInContext(source, context);
  let pending;
  listeners.install({ waitUntil: (promise) => { pending = promise; } });
  return pending.then(() => ({ added, shellCount: (source.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g) || []).length }));
}

test('sw install: every shell URL is fetched with cache: "reload" (bypasses HTTP cache)', async () => {
  const { added, shellCount } = await runInstall();
  assert.equal(added.length, shellCount, 'all SHELL entries are precached');
  for (const request of added) {
    assert.equal(typeof request, 'object', 'addAll gets Request objects, not bare URLs');
    assert.equal(request.cache, 'reload', request.url);
  }
  assert.ok(added.some((request) => request.url.endsWith('/app.js')));
  assert.ok(added.some((request) => /styles\.css\?v=/.test(request.url)));
});
