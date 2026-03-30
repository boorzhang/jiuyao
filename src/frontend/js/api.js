// 数据获取层：默认走 release manifest 提供的数据前缀，本地开发时再回退到本地静态服务。
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const DEFAULT_R2_BASE = isDev ? 'http://localhost:3001' : '';
let R2_BASE = DEFAULT_R2_BASE;
let m3u8Base = '';

const cache = new Map();

/**
 * 规范化静态数据前缀。
 *
 * 使用示例：
 * ```js
 * const base = normalizeBase('https://static.example.com/releases/r1/');
 * // => https://static.example.com/releases/r1
 * ```
 */
function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

function buildUrl(pathname) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${R2_BASE}${normalizedPath}`;
}

async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url}: ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

function clearImageCache() {
  for (const blobUrl of imgDecryptCache.values()) {
    if (typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  imgDecryptCache.clear();
  imgDecryptInFlight.clear();
}

export function setM3u8Base(base) {
  m3u8Base = normalizeBase(base);
}

export function setR2Base(base) {
  const nextBase = normalizeBase(base) || DEFAULT_R2_BASE;
  const changed = nextBase !== R2_BASE;
  R2_BASE = nextBase;

  if (changed) {
    clearCache();
    clearImageCache();
  }

  return changed;
}

/**
 * 根据 release manifest 更新当前运行时的数据前缀。
 *
 * 使用示例：
 * ```js
 * applyReleaseConfig({
 *   releaseId: '20260327-demo',
 *   dataBase: 'https://static.example.com/releases/20260327-demo'
 * });
 * ```
 */
export function applyReleaseConfig(releaseManifest = {}) {
  const nextBase = releaseManifest.dataBase || releaseManifest.r2Base || DEFAULT_R2_BASE;
  const changed = setR2Base(nextBase);

  // m3u8 可单独指定（本地开发时数据走本地，m3u8 走线上）
  if (releaseManifest.m3u8Base) {
    setM3u8Base(releaseManifest.m3u8Base);
  }

  return {
    releaseId: releaseManifest.releaseId || '',
    r2Base: R2_BASE,
    changed,
  };
}

export const api = {
  config: () => fetchJSON(buildUrl('/data/config.json')),
  categoryPage: (cat, page) => fetchJSON(buildUrl(`/data/category/${encodeURIComponent(cat)}/page_${page}.json`)),
  feedPage: (type, page) => fetchJSON(buildUrl(`/data/feed/${type}/page_${page}.json`)),
  videoDetail: (id) => fetchJSON(buildUrl(`/data/video/${id}.json`)),
  videoRecommend: (id) => fetchJSON(buildUrl(`/data/video/${id}/recommend.json`)),
  videoComments: (id) => fetchJSON(buildUrl(`/data/video/${id}/comments.json`)),
  author: (uid) => fetchJSON(buildUrl(`/data/author/${uid}.json`)),
  authorPage: (uid, page) => fetchJSON(buildUrl(`/data/author/${uid}/page_${page}.json`)),
  m3u8Url: (id) => `${m3u8Base || R2_BASE}/m3u8/VID${id}.m3u8`,
  comicList: () => fetchJSON(buildUrl('/data/comic/list.json')),
  comicTag: (tag) => fetchJSON(buildUrl(`/data/comic/tag/${encodeURIComponent(tag)}.json`)),
  comicDetail: (id) => fetchJSON(buildUrl(`/data/comic/${id}.json`)),
};

// === 图片解密 ===
const IMG_BASE = 'https://imgosne.qqdanb.cn';
const IMG_KEY = new TextEncoder().encode('2019ysapp7527');
const imgDecryptCache = new Map();
const imgDecryptInFlight = new Map();
const MAX_IMG_CACHE = 500;

/**
 * 获取加密图片并 XOR 解密，返回 blob URL
 */
export async function decryptImageUrl(path) {
  if (!path) return '';
  const url = /^https?:\/\//.test(path) ? path : `${IMG_BASE}/${path}`;

  // blob/data URL 直接返回
  if (/^(blob:|data:)/.test(url)) return url;

  // 缓存命中
  if (imgDecryptCache.has(url)) {
    const v = imgDecryptCache.get(url);
    // LRU: 移到末尾
    imgDecryptCache.delete(url);
    imgDecryptCache.set(url, v);
    return v;
  }

  // 去重并发
  if (imgDecryptInFlight.has(url)) return imgDecryptInFlight.get(url);

  const promise = fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Image ${res.status}`);
      return res.arrayBuffer();
    })
    .then(buf => {
      const arr = new Uint8Array(buf);
      const len = Math.min(100, arr.length);
      for (let i = 0; i < len; i++) {
        arr[i] ^= IMG_KEY[i % IMG_KEY.length];
      }
      const blob = new Blob([arr], { type: 'image/png' });
      const blobUrl = URL.createObjectURL(blob);

      imgDecryptCache.set(url, blobUrl);
      // 不 revoke blob URL — 页面上的 img 可能还在引用
      // 只删缓存条目，让同一张图再次请求时重新解密
      if (imgDecryptCache.size > MAX_IMG_CACHE) {
        const oldest = imgDecryptCache.keys().next().value;
        if (oldest) {
          imgDecryptCache.delete(oldest);
        }
      }
      imgDecryptInFlight.delete(url);
      return blobUrl;
    })
    .catch(err => {
      imgDecryptInFlight.delete(url);
      return '';
    });

  imgDecryptInFlight.set(url, promise);
  return promise;
}

/**
 * 原始图片 URL（未解密），用于需要直接 URL 的场景
 */
export function coverUrl(path) {
  if (!path) return '';
  return `${IMG_BASE}/${path}`;
}

export function clearCache() {
  cache.clear();
}
