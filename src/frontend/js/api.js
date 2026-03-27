// 数据获取层 — 所有请求指向静态 JSON
const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
let R2_BASE = isDev ? 'http://localhost:3001' : '';

const cache = new Map();

async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url}: ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

export function setR2Base(base) {
  R2_BASE = base;
}

export const api = {
  config: () => fetchJSON(`${R2_BASE}/data/config.json`),
  categoryPage: (cat, page) => fetchJSON(`${R2_BASE}/data/category/${encodeURIComponent(cat)}/page_${page}.json`),
  feedPage: (type, page) => fetchJSON(`${R2_BASE}/data/feed/${type}/page_${page}.json`),
  videoDetail: (id) => fetchJSON(`${R2_BASE}/data/video/${id}.json`),
  videoRecommend: (id) => fetchJSON(`${R2_BASE}/data/video/${id}/recommend.json`),
  videoComments: (id) => fetchJSON(`${R2_BASE}/data/video/${id}/comments.json`),
  author: (uid) => fetchJSON(`${R2_BASE}/data/author/${uid}.json`),
  m3u8Url: (id) => `${R2_BASE}/m3u8/VID${id}.m3u8`,
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
