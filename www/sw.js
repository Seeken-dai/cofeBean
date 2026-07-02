// 豆仓 Web Service Worker。
// 策略：网络优先 + 缓存回退。在线时总是取最新资源（满足 Web 热更新），
// 离线时回退到已缓存的应用外壳，导航请求回退到 index.html。
const CACHE = 'coffee-vault-shell-v4';
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
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const SHELL_URLS = SHELL.map((path) => new URL(path, self.location).href);
const INDEX_URL = new URL('./index.html', self.location).href;

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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(INDEX_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(INDEX_URL))
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match(INDEX_URL)))
  );
});
