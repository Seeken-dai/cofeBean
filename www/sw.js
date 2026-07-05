// 豆仓 Web Service Worker。
// 策略：按版本预缓存应用外壳（cache-first）。CACHE 版本号随 app 版本变化（由 scripts/bump-version.mjs 同步）。
// - install 时用 addAll 原子化拉取整套外壳：全部成功才写入这一版缓存，任一失败则安装失败、继续用旧 SW/旧缓存。
// - activate 时清理其它版本的缓存并接管页面。
// 这样每一版的外壳始终是「同一版本的一致集合」，不会出现新 index.html 配旧 app.js 之类的错配（这是之前
// stale-while-revalidate 按单文件各自更新、遇到弱网时导致「更新后 web 打开报错」的根因）。
// cache-first 也让联网时直接用本地缓存秒开，避免 iOS PWA 联网黑屏/白屏。
const CACHE = 'coffee-vault-shell-2.1.2';
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
  // 导航请求：始终返回同一版预缓存的外壳 index.html（cache-first），保证 HTML 与脚本同版本一致。
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(INDEX_URL).then((cached) => cached || fetch(request).catch(() => caches.match(INDEX_URL)))
    );
    return;
  }
  // 其余同源 GET：命中预缓存直接返回；未预缓存的资源走网络，成功再顺带缓存（同版本内稳定）。
  // 不再用 index.html 兜底非导航请求，避免把 HTML 当作脚本/样式返回导致解析错误。
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
