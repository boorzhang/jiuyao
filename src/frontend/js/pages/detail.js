import { api, decryptImageUrl } from '../api.js';
import { formatCount, formatTime, escapeHtml, timeAgo } from '../utils.js';
import { toggleLike, isLiked, toggleCollection, isCollected, addHistory, isFollowed, toggleFollow } from '../store.js';
import { renderVideoCard } from './home.js';
import { decryptImages } from '../imgloader.js';

let config = null;
let currentVideo = null;
let hlsInstance = null;
let allComments = [];
let commentPage = 0;
let commentObserver = null;
const COMMENTS_PER_BATCH = 10;

export function initDetail(cfg) {
  config = cfg;

  // 关闭详情
  document.querySelector('.detail-back').addEventListener('click', closeDetailWithBack);

  // 浏览器返回手势（iOS 滑动返回）
  window.addEventListener('popstate', (e) => {
    if (currentVideo) {
      closeDetail();
    }
  });

  // 播放按钮
  document.querySelector('.detail-video-area .play-btn').addEventListener('click', playVideo);

  // 点击视频区域暂停/恢复
  document.querySelector('.detail-video-area').addEventListener('click', (e) => {
    if (e.target.closest('.play-btn')) return;
    const video = document.getElementById('detailVideoEl');
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  // Tab 切换
  document.querySelectorAll('.detail-tab').forEach((tab, i) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('detailIntro').style.display = i === 0 ? 'block' : 'none';
      document.getElementById('detailComments').style.display = i === 1 ? 'block' : 'none';
      if (i === 1 && currentVideo) loadComments(currentVideo.id);
    });
  });

  // 点赞/收藏
  document.getElementById('detailLike').addEventListener('click', () => {
    if (!currentVideo) return;
    toggleLike(currentVideo.id);
    updateActions();
  });
  document.getElementById('detailCollect').addEventListener('click', () => {
    if (!currentVideo) return;
    toggleCollection(currentVideo, 'long');
    updateActions();
  });

  // 推荐区视频点击
  document.getElementById('detailRecommend').addEventListener('click', (e) => {
    const card = e.target.closest('.video-card');
    if (card) openDetail(card.dataset.vid);
  });

  // 标签点击
  document.getElementById('detailTags').addEventListener('click', (e) => {
    const tag = e.target.closest('.tag');
    if (tag) {
      const tagName = tag.textContent.trim();
      openTagPage(tagName);
    }
  });

  // 全局事件监听
  window.addEventListener('openDetail', (e) => openDetail(e.detail.id));
}

async function openDetail(id) {
  try {
    const [detail, recs] = await Promise.all([
      api.videoDetail(id),
      api.videoRecommend(id).catch(() => []),
    ]);

    currentVideo = detail;
    addHistory(detail, 'long');

    // 封面（解密加载）
    const coverImg = document.getElementById('detailCover');
    coverImg.src = '';
    decryptImageUrl(detail.cover).then(url => { if (url) coverImg.src = url; });

    // 隐藏视频播放器（如果之前在播放）
    const videoEl = document.getElementById('detailVideoEl');
    if (videoEl) {
      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
      videoEl.remove();
    }
    document.querySelector('.detail-video-area .play-btn').style.display = '';
    coverImg.style.display = '';

    // 标题
    document.getElementById('detailTitle').textContent = detail.title;

    // 播放量
    document.getElementById('detailPlayCount').textContent =
      `${formatCount(detail.playCount)}观看 · ${formatTime(detail.playTime)}`;

    // 标签
    document.getElementById('detailTags').innerHTML =
      (detail.tags || []).map(t => `<span class="tag">${escapeHtml(t.name || t)}</span>`).join('');

    // 更新点赞/收藏状态
    updateActions();

    // 推荐
    const recContainer = document.getElementById('detailRecommend');
    recContainer.innerHTML = recs.map(v => renderVideoCard(v, config)).join('');
    decryptImages(recContainer);

    // 重置 tab
    document.querySelectorAll('.detail-tab').forEach((t, i) => {
      t.classList.toggle('active', i === 0);
    });
    document.getElementById('detailIntro').style.display = 'block';
    document.getElementById('detailComments').style.display = 'none';

    // 显示
    document.getElementById('detailPage').classList.add('open');
    document.body.style.overflow = 'hidden';

    // 推入历史记录，让 iOS 滑动返回手势能关闭详情页
    history.pushState({ detail: id }, '');

    // 滚动到顶部
    document.querySelector('.detail-content').scrollTop = 0;

    // 自动播放
    playVideo();
  } catch (e) {
    console.error('加载详情失败:', e);
  }
}

function updateActions() {
  if (!currentVideo) return;
  const liked = isLiked(currentVideo.id);
  const collected = isCollected(currentVideo.id);

  const likeEl = document.getElementById('detailLike');
  likeEl.querySelector('span').textContent =
    formatCount(liked ? (currentVideo.likeCount || 0) + 1 : currentVideo.likeCount);
  likeEl.classList.toggle('active', liked);

  const collectEl = document.getElementById('detailCollect');
  collectEl.querySelector('span').textContent =
    formatCount(collected ? (currentVideo.collectCount || 0) + 1 : currentVideo.collectCount);
  collectEl.classList.toggle('active', collected);
}

function playVideo() {
  if (!currentVideo) return;

  const area = document.querySelector('.detail-video-area');
  const coverImg = document.getElementById('detailCover');
  const playBtn = document.querySelector('.detail-video-area .play-btn');

  // 创建 video 元素
  const video = document.createElement('video');
  video.id = 'detailVideoEl';
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = 'width:100%;aspect-ratio:16/9;background:#000;';

  coverImg.style.display = 'none';
  playBtn.style.display = 'none';
  area.appendChild(video);

  const src = api.m3u8Url(currentVideo.id);

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
  } else if (window.Hls && window.Hls.isSupported()) {
    hlsInstance = new window.Hls();
    hlsInstance.loadSource(src);
    hlsInstance.attachMedia(video);
    hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else {
    video.src = src;
    video.play().catch(() => {});
  }
}

function commentSkeletonHTML() {
  return `<div class="comment-skeleton">
    <div class="skeleton" style="width:32px;height:32px;border-radius:50%;flex-shrink:0"></div>
    <div style="flex:1">
      <div class="skeleton" style="height:12px;width:40%;border-radius:4px;margin-bottom:8px"></div>
      <div class="skeleton" style="height:14px;width:90%;border-radius:4px;margin-bottom:4px"></div>
      <div class="skeleton" style="height:14px;width:60%;border-radius:4px"></div>
    </div>
  </div>`;
}

function renderCommentHTML(c) {
  return `<div class="comment-item">
    <div class="comment-header">
      <span class="comment-name">${escapeHtml(c.userName)}</span>
      <span class="comment-meta">${c.city ? escapeHtml(c.city) : ''} · ${timeAgo(c.createdAt)}</span>
    </div>
    <div class="comment-content">${escapeHtml(c.content)}</div>
    ${c.likeCount > 0 ? `<div class="comment-likes">♥ ${c.likeCount}</div>` : ''}
    ${(c.replies || []).map(r => `
      <div class="comment-reply">
        <span class="comment-name">${escapeHtml(r.userName)}</span>: ${escapeHtml(r.content)}
      </div>
    `).join('')}
  </div>`;
}

function appendCommentBatch() {
  const el = document.getElementById('detailCommentList');
  const start = commentPage * COMMENTS_PER_BATCH;
  const batch = allComments.slice(start, start + COMMENTS_PER_BATCH);
  if (batch.length === 0) return;

  el.insertAdjacentHTML('beforeend', batch.map(renderCommentHTML).join(''));
  commentPage++;

  // 如果还有更多，添加哨兵元素
  const oldSentinel = el.querySelector('.comment-sentinel');
  if (oldSentinel) oldSentinel.remove();

  if (commentPage * COMMENTS_PER_BATCH < allComments.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'comment-sentinel';
    el.appendChild(sentinel);
    if (commentObserver) commentObserver.observe(sentinel);
  }
}

async function loadComments(id) {
  const el = document.getElementById('detailCommentList');

  // 清理旧的 observer
  if (commentObserver) { commentObserver.disconnect(); commentObserver = null; }
  allComments = [];
  commentPage = 0;

  // 显示骨架屏
  el.innerHTML = Array(4).fill(commentSkeletonHTML()).join('');

  try {
    const comments = await api.videoComments(id);
    if (!comments || comments.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">暂无评论</div>';
      return;
    }

    allComments = comments;
    el.innerHTML = '';

    // 设置 IntersectionObserver
    const scrollRoot = document.querySelector('.detail-content');
    commentObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        commentObserver.unobserve(entries[0].target);
        appendCommentBatch();
      }
    }, { root: scrollRoot, rootMargin: '200px' });

    // 加载第一批
    appendCommentBatch();
  } catch {
    el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">暂无评论</div>';
  }
}

// === 标签聚合页 ===
function tagSkeletonHTML() {
  return `<div class="video-card skeleton-card">
    <div class="cover-box skeleton" style="padding-top:56.25%"></div>
    <div class="info-box">
      <div class="skeleton" style="height:14px;width:80%;border-radius:4px;margin-bottom:6px"></div>
      <div class="skeleton" style="height:12px;width:50%;border-radius:4px"></div>
    </div>
  </div>`;
}

async function openTagPage(tagName) {
  let overlay = document.getElementById('tagOverlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'tagOverlay';
  overlay.className = 'mine-overlay open';
  overlay.innerHTML = `
    <div class="mine-overlay-header">
      <div class="mine-overlay-back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </div>
      <div class="mine-overlay-title">#${escapeHtml(tagName)}</div>
      <div style="width:28px"></div>
    </div>
    <div class="mine-overlay-body">
      <div class="video-grid tag-page-grid">
        ${Array(8).fill(tagSkeletonHTML()).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
  overlay.querySelector('.mine-overlay-back').addEventListener('click', close);

  const grid = overlay.querySelector('.tag-page-grid');
  const body = overlay.querySelector('.mine-overlay-body');
  let page = 1;
  let totalPages = 1;
  let tagLoading = false;
  let tagAllLoaded = false;

  async function loadTagPageData() {
    if (tagLoading || tagAllLoaded) return;
    tagLoading = true;
    try {
      const data = await api.tagPage(tagName, page);
      if (page === 1) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', data.videos.map(v => renderVideoCard(v, config)).join(''));
      decryptImages(grid);
      totalPages = data.totalPages;
      if (page >= totalPages) tagAllLoaded = true;
      page++;
    } catch {
      if (page === 1) {
        grid.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px">暂无该标签的内容</div>';
      }
      tagAllLoaded = true;
    } finally {
      tagLoading = false;
    }
  }

  // 无穷滚动
  body.addEventListener('scroll', () => {
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 300) {
      loadTagPageData();
    }
  });

  // 视频卡片点击
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.video-card');
    if (card) {
      close();
      openDetail(card.dataset.vid);
    }
  });

  await loadTagPageData();
}

// 点击返回按钮时调用 history.back()，触发 popstate 再执行 closeDetail
function closeDetailWithBack() {
  if (currentVideo) {
    history.back();
  }
}

function closeDetail() {
  document.getElementById('detailPage').classList.remove('open');
  document.body.style.overflow = '';
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  const videoEl = document.getElementById('detailVideoEl');
  if (videoEl) videoEl.remove();
  currentVideo = null;
}
