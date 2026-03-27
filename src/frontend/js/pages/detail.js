import { api, decryptImageUrl } from '../api.js';
import { formatCount, formatTime, escapeHtml, timeAgo } from '../utils.js';
import { toggleLike, isLiked, toggleCollection, isCollected, addHistory } from '../store.js';
import { renderVideoCard } from './home.js';
import { decryptImages } from '../imgloader.js';

let config = null;
let currentVideo = null;
let hlsInstance = null;

export function initDetail(cfg) {
  config = cfg;

  // 关闭详情
  document.querySelector('.detail-back').addEventListener('click', closeDetail);

  // 播放按钮
  document.querySelector('.detail-video-area .play-btn').addEventListener('click', playVideo);

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
    toggleCollection(currentVideo.id);
    updateActions();
  });

  // 推荐区视频点击
  document.getElementById('detailRecommend').addEventListener('click', (e) => {
    const card = e.target.closest('.video-card');
    if (card) openDetail(card.dataset.vid);
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
    addHistory(id);

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

async function loadComments(id) {
  const el = document.getElementById('detailCommentList');
  el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">加载中...</div>';

  try {
    const comments = await api.videoComments(id);
    if (!comments || comments.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">暂无评论</div>';
      return;
    }

    el.innerHTML = comments.map(c => `
      <div class="comment-item">
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
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px">暂无评论</div>';
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
