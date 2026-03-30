import { api } from '../api.js';
import { decryptImages } from '../imgloader.js';
import { formatCount, escapeHtml } from '../utils.js';

let config = null;
let currentTag = '';
let allComics = [];

// 骨架屏
function skeletonCardHTML() {
  return `<div class="comic-card skeleton-card">
    <div class="comic-cover skeleton"></div>
    <div class="comic-card-info">
      <div class="skeleton" style="height:13px;width:80%;border-radius:4px;margin-bottom:4px"></div>
      <div class="skeleton" style="height:11px;width:40%;border-radius:4px"></div>
    </div>
  </div>`;
}

function showSkeletons() {
  const grid = document.getElementById('comicGrid');
  grid.innerHTML = Array(9).fill(skeletonCardHTML()).join('');
}

function renderCard(c) {
  const tags = (c.tags || []).slice(0, 2)
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `<div class="comic-card" data-comic-id="${c.id}">
    <div class="comic-cover">
      <img data-decrypt-src="${escapeHtml(c.cover || '')}" alt="" loading="lazy">
      <div class="comic-chapter-badge">${c.chapterCount || 0}P</div>
    </div>
    <div class="comic-card-info">
      <div class="comic-card-title">${escapeHtml(c.title)}</div>
      <div class="comic-card-meta">
        <span>${formatCount(c.countBrowse)}浏览</span>
        ${tags}
      </div>
    </div>
  </div>`;
}

function renderTabs() {
  const el = document.getElementById('comicTabs');
  if (!config) return;
  const tags = config.comicTags || [];
  const tabs = [{ name: '全部', slug: '' }, ...tags.map(t => ({ name: t.name, slug: t.name }))];
  el.innerHTML = tabs.map(t =>
    `<div class="cat-tab${t.slug === currentTag ? ' active' : ''}" data-comic-tag="${t.slug}">${escapeHtml(t.name)}</div>`
  ).join('');
}

function renderGrid(comics) {
  const grid = document.getElementById('comicGrid');
  if (comics.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">暂无漫画</div>';
    return;
  }
  grid.innerHTML = comics.map(renderCard).join('');
  decryptImages(grid);
}

async function loadComics(tag) {
  currentTag = tag;
  renderTabs();
  showSkeletons();
  try {
    let comics;
    if (!tag) {
      comics = await api.comicList();
      allComics = comics;
    } else {
      comics = await api.comicTag(tag);
    }
    renderGrid(comics);
  } catch (e) {
    console.error('加载漫画失败:', e);
    renderGrid([]);
  }
}

// 详情页
let currentComic = null;

async function openComicDetail(id) {
  const detail = document.getElementById('comicDetail');
  detail.classList.add('open');

  try {
    currentComic = await api.comicDetail(id);
    document.getElementById('comicDetailTitle').textContent = currentComic.title;
    document.getElementById('comicDetailSummary').textContent = currentComic.summary || '';

    const coverImg = document.getElementById('comicDetailCover');
    coverImg.dataset.decryptSrc = currentComic.cover || '';
    coverImg.src = '';
    decryptImages(detail);

    document.getElementById('comicDetailTags').innerHTML = (currentComic.tags || [])
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

    document.getElementById('comicDetailStats').innerHTML =
      `<span>${currentComic.chapterCount || 0}页</span>` +
      `<span>${formatCount(currentComic.countBrowse)}浏览</span>` +
      `<span>${formatCount(currentComic.countLike)}赞</span>`;
  } catch (e) {
    console.error('加载漫画详情失败:', e);
  }
}

function closeComicDetail() {
  document.getElementById('comicDetail').classList.remove('open');
  currentComic = null;
}

// 阅读器
function openReader() {
  if (!currentComic || !currentComic.chapters?.length) return;
  const reader = document.getElementById('comicReader');
  const body = document.getElementById('comicReaderBody');

  document.getElementById('comicReaderTitle').textContent = currentComic.title;
  document.getElementById('comicReaderPage').textContent = `1/${currentComic.chapters.length}`;

  // 生成所有图片占位
  body.innerHTML = currentComic.chapters.map((url, i) =>
    `<div class="comic-reader-page-wrap" data-page="${i + 1}">
      <img data-lazy-src="${escapeHtml(url)}" alt="第${i + 1}页">
    </div>`
  ).join('');

  reader.classList.add('open');
  body.scrollTop = 0;

  // 懒加载 + 页码跟踪
  setupLazyLoad();
}

function closeReader() {
  const reader = document.getElementById('comicReader');
  reader.classList.remove('open');
  const body = document.getElementById('comicReaderBody');
  body.innerHTML = '';
  if (readerObserver) {
    readerObserver.disconnect();
    readerObserver = null;
  }
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
}

let readerObserver = null;
let pageObserver = null;

function setupLazyLoad() {
  const body = document.getElementById('comicReaderBody');
  const images = body.querySelectorAll('img[data-lazy-src]');

  // 懒加载：进入可视区附近时解密加载
  readerObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.lazySrc && !img.dataset.decryptSrc) {
          img.dataset.decryptSrc = img.dataset.lazySrc;
          delete img.dataset.lazySrc;
          decryptImages(img.parentElement);
        }
        readerObserver.unobserve(img);
      }
    }
  }, { root: body, rootMargin: '200% 0px' });

  for (const img of images) {
    readerObserver.observe(img);
  }

  // 页码追踪
  const wraps = body.querySelectorAll('.comic-reader-page-wrap');
  pageObserver = new IntersectionObserver((entries) => {
    let maxPage = 0;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const p = parseInt(entry.target.dataset.page, 10);
        if (p > maxPage) maxPage = p;
      }
    }
    if (maxPage > 0 && currentComic) {
      document.getElementById('comicReaderPage').textContent =
        `${maxPage}/${currentComic.chapters.length}`;
    }
  }, { root: body, threshold: 0.5 });

  for (const wrap of wraps) {
    pageObserver.observe(wrap);
  }
}

export async function initComic(cfg) {
  config = cfg;

  // 标签点击
  document.getElementById('comicTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.cat-tab');
    if (tab) loadComics(tab.dataset.comicTag);
  });

  // 卡片点击 → 详情
  document.getElementById('comicGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.comic-card');
    if (card) openComicDetail(card.dataset.comicId);
  });

  // 详情返回
  document.getElementById('comicDetail').querySelector('.comic-detail-back')
    .addEventListener('click', closeComicDetail);

  // 开始阅读
  document.getElementById('comicReadBtn').addEventListener('click', openReader);

  // 阅读器返回
  document.getElementById('comicReaderHeader').querySelector('.comic-reader-back')
    .addEventListener('click', closeReader);

  // 阅读器点击顶栏切换显隐
  document.getElementById('comicReaderBody').addEventListener('click', () => {
    document.getElementById('comicReaderHeader').classList.toggle('hidden');
  });

  await loadComics('');
}
