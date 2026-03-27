const CACHE_NAME = 'jiuyao-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/store.js',
  '/js/utils.js',
  '/js/pages/home.js',
  '/js/pages/douyin.js',
  '/js/pages/mine.js',
  '/js/pages/detail.js',
  '/js/imgloader.js',
  '/manifest.json',
];

const COVER_CACHE = 'jiuyao-covers-v1';
const DATA_CACHE = 'jiuyao-data-v1';
const COVER_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天

// 安装：预缓存 app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== COVER_CACHE && k !== DATA_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // M3U8: network only
  if (url.pathname.endsWith('.m3u8') || url.pathname.includes('/m3u8/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 加密图片 (imgosne.qqdanb.cn): cache-first, 7天
  // 图片由 JS 层解密，SW 只缓存加密的原始数据
  if (url.hostname.includes('qqdanb.cn') && !url.pathname.endsWith('.m3u8')) {
    e.respondWith(
      caches.open(COVER_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 数据 JSON (r2): network-first + cache fallback
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
