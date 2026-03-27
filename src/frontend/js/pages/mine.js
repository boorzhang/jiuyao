import { getUser, getLikes, getHistory, getHistoryByType, getCollections, getCollectionsByType, getFollows, getFollowCount, isFollowed, toggleFollow } from '../store.js';
import { escapeHtml, formatTime, formatCount } from '../utils.js';
import { decryptImages } from '../imgloader.js';
import { api } from '../api.js';

let overlayEl = null;

export function initMine() {
  const user = getUser();
  document.querySelector('.mine-name').textContent = user.username;
  document.querySelector('.mine-uid').textContent = `UID: ${user.uid.slice(0, 8)}`;

  updateStats();

  // 浮层
  overlayEl = document.createElement('div');
  overlayEl.className = 'mine-overlay';
  overlayEl.innerHTML = `
    <div class="mine-overlay-header">
      <div class="mine-overlay-back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </div>
      <div class="mine-overlay-title"></div>
      <div style="width:20px"></div>
    </div>
    <div class="mine-overlay-tabs"></div>
    <div class="mine-overlay-body"></div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector('.mine-overlay-back').addEventListener('click', closeOverlay);

  // Stats 快捷入口点击
  document.querySelectorAll('.mine-stat[data-action]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'collections') showCollections();
      else if (action === 'likes') showLikes();
      else if (action === 'history') showHistory();
      else if (action === 'follows') showFollows();
    });
  });

  // 菜单点击
  document.querySelectorAll('.mine-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.querySelector('.menu-text').textContent;
      if (text === '我的收藏') showCollections();
      else if (text === '观看历史') showHistory();
      else if (text === '我的关注') showFollows();
    });
  });

  // 全局监听 — 打开用户主页
  window.addEventListener('openUserProfile', (e) => showUserProfile(e.detail));
}

export function refreshMine() {
  updateStats();
}

function updateStats() {
  const stats = document.querySelectorAll('.mine-stat');
  if (stats.length >= 4) {
    stats[0].querySelector('.num').textContent = getCollections().length;
    stats[1].querySelector('.num').textContent = getLikes().length;
    stats[2].querySelector('.num').textContent = getHistory().length;
    stats[3].querySelector('.num').textContent = getFollowCount();
  }
}

// === 浮层 ===
function openOverlay(title) {
  overlayEl.querySelector('.mine-overlay-title').textContent = title;
  overlayEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOverlay() {
  overlayEl.classList.remove('open');
  document.body.style.overflow = '';
  updateStats();
}

function setTabs(tabs, activeIdx, onSwitch) {
  const tabsEl = overlayEl.querySelector('.mine-overlay-tabs');
  if (!tabs || tabs.length <= 1) { tabsEl.style.display = 'none'; return; }
  tabsEl.style.display = 'flex';
  tabsEl.innerHTML = tabs.map((t, i) =>
    `<div class="overlay-tab ${i === activeIdx ? 'active' : ''}" data-idx="${i}">${escapeHtml(t)}</div>`
  ).join('');
  tabsEl.onclick = (e) => {
    const tab = e.target.closest('.overlay-tab');
    if (!tab) return;
    tabsEl.querySelectorAll('.overlay-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    onSwitch(parseInt(tab.dataset.idx));
  };
}

function renderBody(html) {
  const body = overlayEl.querySelector('.mine-overlay-body');
  body.innerHTML = html;
  decryptImages(body);
  body.onclick = (e) => {
    const card = e.target.closest('.mine-video-item');
    if (card) {
      closeOverlay();
      window.dispatchEvent(new CustomEvent('openDetail', { detail: { id: card.dataset.vid } }));
    }
  };
}

// === 视频列表 ===
function videoListHTML(items) {
  if (!items.length) return '<div class="mine-empty">暂无内容</div>';
  return items.map(v => `
    <div class="mine-video-item" data-vid="${v.id}">
      <div class="mine-video-cover">
        <img data-decrypt-src="${escapeHtml(v.cover || '')}" alt="">
        <span class="mine-video-duration">${formatTime(v.playTime)}</span>
        <span class="mine-video-type">${v.type === 'short' ? '短' : '长'}</span>
      </div>
      <div class="mine-video-info">
        <div class="mine-video-title">${escapeHtml(v.title)}</div>
        <div class="mine-video-meta">${escapeHtml(v.publisher?.name || '')}</div>
      </div>
    </div>
  `).join('');
}

// === 各功能页 ===
function showCollections() {
  openOverlay('我的收藏');
  const render = (idx) => {
    const items = idx === 0 ? getCollections() : idx === 1 ? getCollectionsByType('long') : getCollectionsByType('short');
    renderBody(videoListHTML(items));
  };
  setTabs(['全部', '长视频', '短视频'], 0, render);
  render(0);
}

function showLikes() {
  openOverlay('我的点赞');
  setTabs(null);
  const likes = getLikes();
  if (!likes.length) { renderBody('<div class="mine-empty">还没有点赞</div>'); return; }
  renderBody(`<div class="mine-empty">已点赞 ${likes.length} 个视频</div>`);
}

function showHistory() {
  openOverlay('观看历史');
  const render = (idx) => {
    const items = idx === 0 ? getHistory() : idx === 1 ? getHistoryByType('long') : getHistoryByType('short');
    renderBody(videoListHTML(items));
  };
  setTabs(['全部', '长视频', '短视频'], 0, render);
  render(0);
}

function showFollows() {
  openOverlay('我的关注');
  setTabs(null);
  const follows = getFollows();
  if (!follows.length) { renderBody('<div class="mine-empty">还没有关注任何人</div>'); return; }
  const body = overlayEl.querySelector('.mine-overlay-body');
  body.innerHTML = follows.map(f => `
    <div class="mine-follow-item" data-uid="${f.uid}">
      <div class="mine-follow-avatar">
        ${f.portrait ? `<img data-decrypt-src="${escapeHtml(f.portrait)}" alt="">` : '<div class="mine-follow-placeholder">👤</div>'}
      </div>
      <div class="mine-follow-name">${escapeHtml(f.name)}</div>
    </div>
  `).join('');
  decryptImages(body);
  // 点击关注者 → 打开其主页
  body.onclick = (e) => {
    const item = e.target.closest('.mine-follow-item');
    if (item) {
      const f = follows.find(ff => String(ff.uid) === item.dataset.uid);
      if (f) showUserProfile(f);
    }
  };
}

// === 用户主页 ===
async function showUserProfile(publisher) {
  openOverlay('');
  overlayEl.querySelector('.mine-overlay-tabs').style.display = 'none';
  const followed = publisher.uid ? isFollowed(publisher.uid) : false;
  const body = overlayEl.querySelector('.mine-overlay-body');

  // 先渲染头部
  body.innerHTML = `
    <div class="user-profile">
      <div class="user-profile-bg"></div>
      <div class="user-profile-header">
        <div class="user-profile-avatar">
          ${publisher.portrait ? `<img data-decrypt-src="${escapeHtml(publisher.portrait)}" alt="">` : '<div class="user-profile-placeholder">👤</div>'}
        </div>
        <div class="user-profile-name">${escapeHtml(publisher.name || '用户')}</div>
        <div class="user-profile-uid">UID: ${publisher.uid || ''}</div>
        <div class="user-profile-summary" id="profileSummary"></div>
        <div class="user-profile-stats" id="profileStats">
          ${publisher.fans ? `<span>${formatCount(publisher.fans)} 粉丝</span>` : ''}
          ${publisher.totalWorks ? `<span>${publisher.totalWorks} 作品</span>` : ''}
        </div>
        <div class="user-profile-actions">
          <button class="user-profile-follow ${followed ? 'followed' : ''}" id="profileFollowBtn">
            ${followed ? '已关注' : '+ 关注'}
          </button>
          <button class="user-profile-msg" id="profileMsgBtn">私信</button>
        </div>
      </div>
      <div class="user-profile-tabs" id="profileTabs"></div>
      <div class="user-profile-videos" id="profileVideos">
        <div style="text-align:center;padding:20px;color:var(--text-secondary)">加载中...</div>
      </div>
    </div>
  `;
  decryptImages(body);

  // 关注
  body.querySelector('#profileFollowBtn').addEventListener('click', () => {
    if (!publisher.uid) return;
    toggleFollow(publisher);
    const btn = body.querySelector('#profileFollowBtn');
    const now = isFollowed(publisher.uid);
    btn.textContent = now ? '已关注' : '+ 关注';
    btn.classList.toggle('followed', now);
  });

  // 私信
  body.querySelector('#profileMsgBtn').addEventListener('click', () => {
    showToast('私信功能需要 VIP 权限，完成后续任务后开放');
  });

  // 加载作者数据（分页）
  if (!publisher.uid) return;
  try {
    const authorData = await api.author(publisher.uid);

    // 更新简介和统计
    const summaryEl = body.querySelector('#profileSummary');
    if (authorData.summary) summaryEl.textContent = authorData.summary;
    const statsEl = body.querySelector('#profileStats');
    statsEl.innerHTML = `
      <span>${formatCount(authorData.fans || 0)} 粉丝</span>
      <span>${authorData.videoCount || 0} 作品</span>
    `;

    // 分页状态
    const state = {
      allVideos: [...authorData.videos],
      currentPage: 1,
      totalPages: authorData.totalPages || 1,
      loading: false,
      activeTab: 0, // 0=全部, 1=长, 2=短
    };

    function videoCardHTML(v) {
      return `<div class="user-video-card" data-vid="${v.id}">
        <div class="user-video-cover">
          <img data-decrypt-src="${escapeHtml(v.cover || '')}" alt="">
          <span class="user-video-duration">${formatTime(v.playTime)}</span>
          <span class="user-video-plays">▶ ${formatCount(v.playCount)}</span>
        </div>
        <div class="user-video-title">${escapeHtml(v.title)}</div>
      </div>`;
    }

    function filteredVideos() {
      if (state.activeTab === 1) return state.allVideos.filter(v => (v.playTime || 0) > 300);
      if (state.activeTab === 2) return state.allVideos.filter(v => (v.playTime || 0) <= 300);
      return state.allVideos;
    }

    function renderGrid() {
      const container = body.querySelector('#profileVideos');
      const items = filteredVideos();
      if (!items.length) {
        container.innerHTML = '<div class="mine-empty">暂无作品</div>';
        return;
      }
      container.innerHTML = `<div class="user-video-grid">${items.map(videoCardHTML).join('')}</div>`;
      if (state.currentPage < state.totalPages) {
        container.insertAdjacentHTML('beforeend',
          '<div class="user-load-more" id="profileLoadMore">加载更多</div>');
      }
      decryptImages(container);
    }

    async function loadMoreVideos() {
      if (state.loading || state.currentPage >= state.totalPages) return;
      state.loading = true;
      const btn = body.querySelector('#profileLoadMore');
      if (btn) btn.textContent = '加载中...';
      try {
        const nextPage = state.currentPage + 1;
        const pageData = await api.authorPage(publisher.uid, nextPage);
        state.allVideos.push(...pageData.videos);
        state.currentPage = nextPage;
        renderGrid();
      } catch { /* ignore */ }
      state.loading = false;
    }

    function countByType() {
      const long = state.allVideos.filter(v => (v.playTime || 0) > 300).length;
      const short = state.allVideos.filter(v => (v.playTime || 0) <= 300).length;
      return { long, short, all: state.allVideos.length };
    }

    // Tabs
    const tabsEl = body.querySelector('#profileTabs');
    function renderTabs() {
      const c = countByType();
      const labels = [`全部 ${authorData.videoCount}`, `长视频 ${c.long}+`, `短视频 ${c.short}+`];
      tabsEl.innerHTML = labels.map((t, i) =>
        `<div class="overlay-tab ${i === state.activeTab ? 'active' : ''}" data-idx="${i}">${t}</div>`
      ).join('');
    }
    renderTabs();
    tabsEl.onclick = (e) => {
      const tab = e.target.closest('.overlay-tab');
      if (!tab) return;
      state.activeTab = parseInt(tab.dataset.idx);
      renderTabs();
      renderGrid();
    };

    renderGrid();

    // 视频卡片点击 + 加载更多
    const videosContainer = body.querySelector('#profileVideos');
    videosContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.user-video-card');
      if (card) {
        closeOverlay();
        window.dispatchEvent(new CustomEvent('openDetail', { detail: { id: card.dataset.vid } }));
        return;
      }
      if (e.target.closest('#profileLoadMore')) loadMoreVideos();
    });

    // 滚动加载
    const overlayBody = overlayEl.querySelector('.mine-overlay-body');
    overlayBody.addEventListener('scroll', () => {
      if (overlayBody.scrollHeight - overlayBody.scrollTop - overlayBody.clientHeight < 300) {
        loadMoreVideos();
      }
    });
  } catch {
    body.querySelector('#profileVideos').innerHTML = '<div class="mine-empty">暂无作品数据</div>';
  }
}

// === Toast ===
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'app-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

// 导出给 douyin 用
export { showToast, showUserProfile };
