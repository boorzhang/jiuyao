import { api } from '../api.js';
import { formatCount, formatTime, escapeHtml } from '../utils.js';

let config = null;
let currentCat = '';
let currentPage = 1;
let totalPages = 1;
let loading = false;
let allLoaded = false;

export function renderVideoCard(v, cfg) {
  const badge = v.freeArea ? '' :
    (v.originCoins === 0 ? '<div class="badge badge-vip">VIP</div>' :
    '<div class="badge badge-coins">金币</div>');
  const tags = (v.tags || []).filter(Boolean).slice(0, 2)
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  return `<div class="video-card" data-vid="${v.id}">
    <div class="cover-box">
      <img data-decrypt-src="${escapeHtml(v.cover || '')}" alt="" loading="lazy">
      ${badge}
      <div class="meta-overlay">
        <span>▶ ${formatCount(v.playCount)}</span>
        <span>${formatTime(v.playTime)}</span>
      </div>
    </div>
    <div class="info-box">
      <div class="title">${escapeHtml(v.title)}</div>
      <div class="tag-row">${tags}</div>
      <div class="bottom-row">
        <span>${escapeHtml(v.publisher?.name || '')}</span>
        <span>${v.commentCount > 0 ? '评论' + formatCount(v.commentCount) : ''}</span>
      </div>
    </div>
  </div>`;
}

function renderCatTabs() {
  const el = document.getElementById('catTabs');
  if (!config) return;
  el.innerHTML = config.categories.map(c =>
    `<div class="cat-tab${c.slug === currentCat ? ' active' : ''}" data-cat="${c.slug}">${escapeHtml(c.name)}</div>`
  ).join('');
}

async function loadPage() {
  if (loading || allLoaded) return;
  loading = true;

  try {
    const data = await api.categoryPage(currentCat, currentPage);
    const grid = document.getElementById('homeGrid');
    grid.insertAdjacentHTML('beforeend', data.videos.map(v => renderVideoCard(v)).join(''));
    totalPages = data.totalPages;
    if (currentPage >= totalPages) allLoaded = true;
    currentPage++;
  } catch (e) {
    console.error('加载分类页失败:', e);
  } finally {
    loading = false;
  }
}

function switchCat(slug) {
  currentCat = slug;
  currentPage = 1;
  allLoaded = false;
  const catInfo = config.categories.find(c => c.slug === slug);
  if (catInfo) totalPages = catInfo.totalPages;
  document.getElementById('homeGrid').innerHTML = '';
  window.scrollTo(0, 0);
  renderCatTabs();
  loadPage();
}

export async function initHome(cfg) {
  config = cfg;
  currentCat = config.categories[0]?.slug || '';

  renderCatTabs();

  document.getElementById('catTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.cat-tab');
    if (tab) switchCat(tab.dataset.cat);
  });

  const page = document.getElementById('page-home');
  window.addEventListener('scroll', () => {
    if (!page.classList.contains('active')) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      loadPage();
    }
  });

  document.getElementById('homeGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.video-card');
    if (card) {
      window.dispatchEvent(new CustomEvent('openDetail', { detail: { id: card.dataset.vid } }));
    }
  });

  await loadPage();
}
