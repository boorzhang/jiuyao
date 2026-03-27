// 图片解密加载器 — 观察 data-decrypt-src 属性自动解密
import { decryptImageUrl } from './api.js';

const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === 1) processNode(node);
    }
  }
});

function processNode(el) {
  if (el.dataset && el.dataset.decryptSrc) {
    decryptImage(el);
  }
  // 子节点
  const children = el.querySelectorAll?.('[data-decrypt-src]');
  if (children) {
    for (const child of children) decryptImage(child);
  }
}

async function decryptImage(el) {
  const src = el.dataset.decryptSrc;
  if (!src || el.dataset.decrypting) return;
  el.dataset.decrypting = '1';

  try {
    const blobUrl = await decryptImageUrl(src);
    if (blobUrl) {
      el.src = blobUrl;
    }
  } catch {
    // 静默失败
  } finally {
    delete el.dataset.decrypting;
  }
}

export function initImageLoader() {
  observer.observe(document.body, { childList: true, subtree: true });
  // 处理已存在的元素
  processNode(document.body);
}

// 手动触发解密（用于动态插入后）
export function decryptImages(container) {
  processNode(container || document.body);
}
