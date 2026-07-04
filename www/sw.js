// 豆仓 Web Service Worker。
// 策略：应用外壳（HTML/脚本/样式）缓存优先 + 后台再验证（stale-while-revalidate）；
// vendor/图标等稳定资源 cache-first。
// 缓存优先能让在线时也直接用本地缓存秒开，避免 iOS PWA 联网时长时间黑屏/白屏等待网络；
// 后台再验证保留 Web 热更新——新版本会在下次启动生效。
const CACHE = 'coffee-vault-shell-v10';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './data-core.js',
  './coffee-parser.js',
  './repository-web-adapter.js',
  './repository.js',
  './sync-engine.js',
  './sync-transport.js',
  './sync-service.js',
  './app.js',
  './vendor/qrcode-generator.js',
  './vendor/jsQR.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const SHELL_URLS = SHELL.map((path) => new URL(path, self.location).href);
const INDEX_URL = new URL('./index.html', self.location).href;
const CACHE_FIRST_URLS = new Set([
  './vendor/qrcode-generator.js',
  './vendor/jsQR.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.webmanifest'
].map((path) => new URL(path, self.location).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 后台再验证：拉取最新资源写回缓存，供下次启动使用；失败静默忽略。
function revalidate(request, cacheKey) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(cacheKey || request, copy));
      }
      return response;
    })
    .catch(() => null);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  // 导航请求：优先返回缓存的外壳，后台再验证；缺缓存时才等待网络。
  // 这样联网也能秒开，不再卡在等待网络的黑屏/白屏。
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(INDEX_URL).then((cached) => {
        const network = revalidate(request, INDEX_URL);
        return cached || network.then((response) => response || caches.match(INDEX_URL));
      })
    );
    return;
  }
  if (CACHE_FIRST_URLS.has(new URL(request.url).href)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }))
    );
    return;
  }
  // 其余同源资源（脚本/样式等外壳文件）：缓存优先 + 后台再验证。
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = revalidate(request);
      return cached || network.then((response) => response || caches.match(INDEX_URL));
    })
  );
});
