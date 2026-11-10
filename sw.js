/* 知云同职 Service Worker · 构建于 2026-11-10T01:39:31.347Z */
const CACHE = 'zy-1.5.1-2026-11-10';
const PRECACHE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/config.js",
  "./js/api.js",
  "./js/crypto.js",
  "./js/fraudGuard.js",
  "./js/jobs.js",
  "./js/ride.js",
  "./js/resume.js",
  "./js/profile.js",
  "./js/app.js",
  "./vendor/crypto-js.min.js",
  "./vendor/html2pdf.bundle.min.js",
  "./manifest.webmanifest",
  "./data/seed-jobs.json"
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 跨域 API 与第三方请求不接管（避免缓存掉最新岗位/推荐）
  if (url.origin !== self.location.origin) return;
  // 接口请求一律走网络，失败即由前端回退内置数据
  if (url.pathname.includes('/api/')) return;
  // 岗位数据：网络优先，弱网回退缓存（保证换岗后能拿到新数据）
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // 静态资源：缓存优先，回源更新
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
