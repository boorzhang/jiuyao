const swUrl = new URL(self.location.href);
const releaseId = swUrl.searchParams.get('releaseId') || 'runtime';
const SHELL_CACHE = `jiuyao-shell-${releaseId}`;
const COVER_CACHE = `jiuyao-covers-${releaseId}`;
const DATA_CACHE = `jiuyao-data-${releaseId}`;
const ACTIVE_CACHES = new Set([SHELL_CACHE, COVER_CACHE, DATA_CACHE]);
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

function isM3u8Request(url) {
  return url.pathname.endsWith('.m3u8') || url.pathname.includes('/m3u8/');
}

function isReleasePointer(url) {
  return url.pathname === '/release.json' || url.pathname.endsWith('/release.json');
}

function isDataJsonRequest(url) {
  return url.pathname.endsWith('.json') && url.pathname.includes('/data/');
}

function isShellRequest(request, url) {
  return request.mode === 'navigate'
    || url.pathname === '/'
    || url.pathname.endsWith('.html')
    || url.pathname === '/manifest.json'
    || url.pathname.startsWith('/assets/');
}

// 安装：预缓存最小站点壳，其他资源在首次访问后进入 cache-first。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 激活：releaseId 变化后清理旧缓存，避免旧版站点壳和数据继续存活。
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('jiuyao-') && !ACTIVE_CACHES.has(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // m3u8: network only，避免播放列表被 Service Worker 持久缓存。
  if (isM3u8Request(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // release 指针始终走网络，让浏览器能第一时间感知版本切换。
  if (isReleasePointer(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 加密图片走 cache-first，减少重复拉取原始密文。
  if (url.hostname.includes('qqdanb.cn')) {
    event.respondWith(
      caches.open(COVER_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }

        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // 数据 JSON: network-first + cache fallback，兼顾新鲜度和容错。
  if (isDataJsonRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 站点壳与 release 资产: cache-first，配合 releaseId 分代缓存。
  if (isShellRequest(event.request, url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }

        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
  }
});
