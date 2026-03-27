import { api } from '../api.js';
import { formatCount, escapeHtml, timeAgo } from '../utils.js';
import { isLiked, toggleLike, isCollected, toggleCollection, isFollowed, toggleFollow, addHistory } from '../store.js';
import { decryptImages } from '../imgloader.js';
import { showToast } from './mine.js';

let config = null;
let currentHls = null;

const dy = {
  tab: 'recommend',
  feeds: { recommend: [], latest: [] },
  pages: { recommend: 0, latest: 0 },
  totalPages: { recommend: 1, latest: 1 },
  idx: 0,
  startY: 0,
  startTime: 0,
  deltaY: 0,
  swiping: false,
  threshold: 60,
  velocityThreshold: 0.4,
  hintShown: false,
  prefetching: false,
};

function feed() { return dy.feeds[dy.tab]; }

async function loadNextPage() {
  if (dy.prefetching) return;
  const tab = dy.tab;
  const nextPage = dy.pages[tab] + 1;
  if (nextPage > dy.totalPages[tab]) return;

  dy.prefetching = true;
  try {
    const data = await api.feedPage(tab, nextPage);
    dy.feeds[tab].push(...data.videos);
    dy.pages[tab] = nextPage;
    dy.totalPages[tab] = data.totalPages;
  } catch (e) {
    console.error('加载 feed 页失败:', e);
  } finally {
    dy.prefetching = false;
  }
}

function destroyCurrentVideo() {
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }
}

// 根据媒体真实宽高给 slide 打上横版/竖版类，保证手机版完整显示且不溢出。
function setSlideMediaOrientation(slide, width, height) {
  if (!slide || !width || !height) return;

  slide.classList.remove('is-landscape', 'is-portrait', 'is-square');
  if (width > height * 1.1) {
    slide.classList.add('is-landscape');
  } else if (height > width * 1.1) {
    slide.classList.add('is-portrait');
  } else {
    slide.classList.add('is-square');
  }
}

function syncCoverOrientation(slide) {
  const cover = slide?.querySelector('.sv-cover');
  if (!cover) return;

  const apply = () => setSlideMediaOrientation(slide, cover.naturalWidth, cover.naturalHeight);
  if (cover.complete && cover.naturalWidth) {
    apply();
    return;
  }

  cover.addEventListener('load', apply, { once: true });
}

function playCurrentSlide() {
  destroyCurrentVideo();

  const cur = feed()[dy.idx];
  if (!cur) return;

  // 记录短视频历史
  addHistory(cur, 'short');

  const slide = document.querySelector('.dy-slide[data-pos="current"]');
  if (!slide) return;

  // 创建 video 元素替换/覆盖封面
  let video = slide.querySelector('video.sv-video');
  if (!video) {
    video = document.createElement('video');
    video.className = 'sv-video';
    video.playsInline = true;
    video.loop = true;
    video.muted = true; // 必须 muted 才能自动播放
    video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.addEventListener('loadedmetadata', () => {
      setSlideMediaOrientation(slide, video.videoWidth, video.videoHeight);
    });
    video.addEventListener('loadeddata', () => {
      slide.classList.add('has-video-frame');
    }, { once: true });

    // 插入到媒体容器中，让横版和竖版都能共用同一套布局约束。
    const mediaShell = slide.querySelector('.sv-media-shell');
    const coverImg = slide.querySelector('.sv-cover');
    if (coverImg) {
      coverImg.after(video);
    } else if (mediaShell) {
      mediaShell.append(video);
    } else {
      slide.prepend(video);
    }
  }

  const src = api.m3u8Url(cur.id);

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
  } else if (window.Hls && window.Hls.isSupported()) {
    currentHls = new window.Hls();
    currentHls.loadSource(src);
    currentHls.attachMedia(video);
    currentHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  }

  // 用户点击取消静音
  slide.addEventListener('click', function unmute(e) {
    if (e.target.closest('.sv-action-btn') || e.target.closest('.sv-follow-btn')) return;
    if (video.muted) {
      video.muted = false;
      slide.removeEventListener('click', unmute);
    }
  }, { once: false });
}

function dySlideHTML(v, position) {
  if (!v) return '';
  const tags = (v.tags || []).filter(Boolean).slice(0, 3);
  const liked = isLiked(v.id);
  const collected = isCollected(v.id);
  const followed = v.publisher?.uid ? isFollowed(v.publisher.uid) : false;

  return `<div class="dy-slide" data-pos="${position}" data-vid="${v.id}">
    <div class="sv-media-shell">
      <img class="sv-backdrop" data-decrypt-src="${escapeHtml(v.cover || '')}" alt="" aria-hidden="true">
      <img class="sv-cover" data-decrypt-src="${escapeHtml(v.cover || '')}" alt="">
    </div>
    <div class="sv-play-center" id="playIcon-${position}">
      <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>
    <div class="sv-overlay">
      <div class="sv-publisher">
        ${v.publisher?.portrait ? `<img class="sv-avatar" data-decrypt-src="${escapeHtml(v.publisher.portrait)}" alt="">` : ''}
        <span class="sv-name">@${escapeHtml(v.publisher?.name || '用户')}</span>
        ${followed ? '' : '<button class="sv-follow-btn" data-action="follow">+ 关注</button>'}
      </div>
      <div class="sv-title">${escapeHtml(v.title)}</div>
      ${tags.length ? `<div class="sv-tags">${tags.map(t => `<span class="sv-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="sv-music">
        <svg class="sv-music-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span class="sv-music-text">${escapeHtml(v.publisher?.name || '原声')} 创作的原声</span>
      </div>
    </div>
    <div class="sv-actions">
      <div class="sv-action-avatar-wrap">
        <div class="sv-action-avatar" data-action="avatar">
          ${v.publisher?.portrait ? `<img data-decrypt-src="${escapeHtml(v.publisher.portrait)}" alt="">` : '<div style="width:44px;height:44px;border-radius:50%;background:#333"></div>'}
        </div>
        ${followed ? '' : '<div class="plus-badge" data-action="plus-follow">+</div>'}
      </div>
      <div class="sv-action-btn ${liked ? 'liked' : ''}" data-action="like">
        <svg viewBox="0 0 24 24" fill="${liked ? 'var(--accent)' : 'none'}" stroke="${liked ? 'var(--accent)' : 'currentColor'}" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>${formatCount(liked ? (v.likeCount || 0) + 1 : v.likeCount)}</span>
      </div>
      <div class="sv-action-btn" data-action="comment">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${formatCount(v.commentCount)}</span>
      </div>
      <div class="sv-action-btn" data-action="share">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span>分享</span>
      </div>
      <div class="sv-action-btn ${collected ? 'collected' : ''}" data-action="collect">
        <svg viewBox="0 0 24 24" fill="${collected ? 'var(--accent-gold)' : 'none'}" stroke="${collected ? 'var(--accent-gold)' : 'currentColor'}" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${collected ? '已收藏' : formatCount(v.collectCount)}</span>
      </div>
      <div class="sv-disc"></div>
    </div>
  </div>`;
}

function dyRender() {
  destroyCurrentVideo();

  const vp = document.getElementById('dyViewport');
  const f = feed();
  const cur = f[dy.idx];
  const prev = dy.idx > 0 ? f[dy.idx - 1] : null;
  const next = dy.idx < f.length - 1 ? f[dy.idx + 1] : null;

  let html = '';
  if (prev) html += dySlideHTML(prev, 'prev');
  html += dySlideHTML(cur, 'current');
  if (next) html += dySlideHTML(next, 'next');
  vp.innerHTML = html;

  // 触发图片解密
  decryptImages(vp);
  vp.querySelectorAll('.dy-slide').forEach(syncCoverOrientation);

  vp.querySelectorAll('.dy-slide').forEach(s => {
    if (s.dataset.pos === 'prev') s.style.transform = 'translateY(-100%)';
    else if (s.dataset.pos === 'current') s.style.transform = 'translateY(0)';
    else if (s.dataset.pos === 'next') s.style.transform = 'translateY(100%)';
  });

  const prog = document.getElementById('dyProgress');
  if (prog) {
    prog.style.animation = 'none';
    prog.offsetHeight;
    prog.style.animation = 'fakeProgress 15s linear infinite';
  }

  if (dy.hintShown) {
    const hint = document.getElementById('dyHint');
    if (hint) hint.classList.add('hidden');
  }

  // 预取
  if (f.length - dy.idx <= 3) loadNextPage();

  // 自动播放当前视频
  setTimeout(() => playCurrentSlide(), 100);
}

function switchDyTab(tab) {
  if (tab === dy.tab) return;
  dy.tab = tab;
  dy.idx = 0;
  document.querySelectorAll('.dy-top-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.dyTab === tab);
  });
  if (feed().length === 0) {
    loadNextPage().then(() => dyRender());
  } else {
    dyRender();
  }
}

function showHeartAnim(x, y) {
  const vp = document.getElementById('dyViewport');
  const heart = document.createElement('div');
  heart.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`;
  heart.style.cssText = `position:absolute;top:${y - 40}px;left:${x - 40}px;z-index:30;pointer-events:none;animation:heartPop .8s ease-out forwards;`;
  vp.appendChild(heart);
  setTimeout(() => heart.remove(), 900);
}

export async function initDouyin(cfg) {
  config = cfg;
  if (cfg.feeds) {
    dy.totalPages.recommend = cfg.feeds.recommend?.totalPages || 1;
    dy.totalPages.latest = cfg.feeds.latest?.totalPages || 1;
  }

  const vp = document.getElementById('dyViewport');

  document.querySelectorAll('.dy-top-tab').forEach(el => {
    el.addEventListener('click', () => switchDyTab(el.dataset.dyTab));
  });

  // Touch
  vp.addEventListener('touchstart', (e) => {
    dy.startY = e.touches[0].clientY;
    dy.startTime = Date.now();
    dy.deltaY = 0;
    dy.swiping = true;
    vp.querySelectorAll('.dy-slide').forEach(s => s.classList.add('no-transition'));
  }, { passive: true });

  vp.addEventListener('touchmove', (e) => {
    if (!dy.swiping) return;
    dy.deltaY = e.touches[0].clientY - dy.startY;
    const f = feed();
    if (dy.idx === 0 && dy.deltaY > 0) dy.deltaY *= 0.3;
    if (dy.idx === f.length - 1 && dy.deltaY < 0) dy.deltaY *= 0.3;
    vp.querySelectorAll('.dy-slide').forEach(s => {
      let base = 0;
      if (s.dataset.pos === 'prev') base = -window.innerHeight;
      else if (s.dataset.pos === 'next') base = window.innerHeight;
      s.style.transform = `translateY(${base + dy.deltaY}px)`;
    });
  }, { passive: true });

  function touchEnd() {
    if (!dy.swiping) return;
    dy.swiping = false;
    const elapsed = Date.now() - dy.startTime;
    const velocity = Math.abs(dy.deltaY) / elapsed;
    const f = feed();
    vp.querySelectorAll('.dy-slide').forEach(s => s.classList.remove('no-transition'));

    let dir = 0;
    if (Math.abs(dy.deltaY) > dy.threshold || velocity > dy.velocityThreshold) {
      dir = dy.deltaY < 0 ? -1 : 1;
    }

    if (dir === -1 && dy.idx < f.length - 1) {
      dy.idx++;
      dy.hintShown = true;
      dyRender();
    } else if (dir === 1 && dy.idx > 0) {
      dy.idx--;
      dyRender();
    } else {
      vp.querySelectorAll('.dy-slide').forEach(s => {
        if (s.dataset.pos === 'prev') s.style.transform = 'translateY(-100%)';
        else if (s.dataset.pos === 'current') s.style.transform = 'translateY(0)';
        else if (s.dataset.pos === 'next') s.style.transform = 'translateY(100%)';
      });
    }
  }

  vp.addEventListener('touchend', touchEnd, { passive: true });

  // Mouse fallback
  let mouseDown = false;
  vp.addEventListener('mousedown', (e) => {
    mouseDown = true;
    dy.startY = e.clientY;
    dy.startTime = Date.now();
    dy.deltaY = 0;
    dy.swiping = true;
    vp.querySelectorAll('.dy-slide').forEach(s => s.classList.add('no-transition'));
  });
  vp.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    dy.deltaY = e.clientY - dy.startY;
    const f = feed();
    if (dy.idx === 0 && dy.deltaY > 0) dy.deltaY *= 0.3;
    if (dy.idx === f.length - 1 && dy.deltaY < 0) dy.deltaY *= 0.3;
    vp.querySelectorAll('.dy-slide').forEach(s => {
      let base = 0;
      if (s.dataset.pos === 'prev') base = -window.innerHeight;
      else if (s.dataset.pos === 'next') base = window.innerHeight;
      s.style.transform = `translateY(${base + dy.deltaY}px)`;
    });
  });
  vp.addEventListener('mouseup', () => { mouseDown = false; touchEnd(); });
  vp.addEventListener('mouseleave', () => { if (mouseDown) { mouseDown = false; touchEnd(); } });

  // 双击点赞
  let lastTapTime = 0;
  vp.addEventListener('click', (e) => {
    // 关注按钮
    const followBtn = e.target.closest('.sv-follow-btn');
    if (followBtn) {
      e.stopPropagation();
      const cur = feed()[dy.idx];
      if (cur?.publisher?.uid) {
        toggleFollow(cur.publisher);
        dyRender();
      }
      return;
    }

    // +号点击 → 关注 + 动画
    const plusBadge = e.target.closest('.plus-badge[data-action="plus-follow"]');
    if (plusBadge) {
      e.stopPropagation();
      const cur = feed()[dy.idx];
      if (cur?.publisher?.uid) {
        toggleFollow(cur.publisher);
        // 关注成功动画
        plusBadge.classList.add('follow-anim');
        plusBadge.textContent = '✓';
        setTimeout(() => dyRender(), 600);
      }
      return;
    }

    // 头像点击 → 用户主页
    const avatarBtn = e.target.closest('.sv-action-avatar');
    if (avatarBtn) {
      e.stopPropagation();
      const cur = feed()[dy.idx];
      if (cur?.publisher) {
        window.dispatchEvent(new CustomEvent('openUserProfile', { detail: cur.publisher }));
      }
      return;
    }

    const actionBtn = e.target.closest('.sv-action-btn');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const cur = feed()[dy.idx];
      if (!cur) return;
      if (action === 'like') {
        toggleLike(cur.id); dyRender();
      } else if (action === 'collect') {
        toggleCollection(cur, 'short'); dyRender();
      } else if (action === 'share') {
        showSharePanel();
      } else if (action === 'comment') {
        showCommentPanel(cur.id);
      }
      return;
    }

    const now = Date.now();
    if (now - lastTapTime < 300) {
      const cur = feed()[dy.idx];
      if (cur && !isLiked(cur.id)) {
        toggleLike(cur.id);
        dyRender();
        const x = e.clientX || window.innerWidth / 2;
        const y = e.clientY || window.innerHeight / 2;
        showHeartAnim(x, y);
      }
    }
    lastTapTime = now;
  });

  // 键盘
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('page-douyin').classList.contains('active')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') {
      if (dy.idx < feed().length - 1) { dy.idx++; dy.hintShown = true; dyRender(); }
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      if (dy.idx > 0) { dy.idx--; dyRender(); }
    }
  });

  await loadNextPage();
  dyRender();
}

// === 分享面板 ===
function showSharePanel() {
  let panel = document.getElementById('dySharePanel');
  if (panel) { panel.remove(); return; }

  panel = document.createElement('div');
  panel.id = 'dySharePanel';
  panel.className = 'dy-bottom-panel';
  panel.innerHTML = `
    <div class="dy-panel-mask"></div>
    <div class="dy-panel-content">
      <div class="dy-panel-header">
        <span>分享</span>
        <span class="dy-panel-close">&times;</span>
      </div>
      <div class="dy-panel-body" style="text-align:center;padding:20px">
        <div id="shareQrCode" style="display:inline-block;background:#fff;padding:12px;border-radius:8px"></div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-secondary)">长按或截图保存二维码分享给好友</div>
        <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);word-break:break-all">${location.href}</div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('open'));

  // 简易 QR — 用 canvas 画一个带文字的占位
  const qr = panel.querySelector('#shareQrCode');
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  // 简易格子模式模拟 QR
  ctx.fillStyle = '#000';
  const url = location.href;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const charCode = url.charCodeAt((y * 20 + x) % url.length);
      if ((charCode + x * y) % 3 !== 0) {
        ctx.fillRect(x * 8, y * 8, 7, 7);
      }
    }
  }
  // 定位角
  for (const [ox, oy] of [[0,0],[13,0],[0,13]]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(ox*8, oy*8, 56, 56);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox*8+8, oy*8+8, 40, 40);
    ctx.fillStyle = '#000';
    ctx.fillRect(ox*8+16, oy*8+16, 24, 24);
  }
  qr.appendChild(canvas);

  const close = () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 300); };
  panel.querySelector('.dy-panel-mask').addEventListener('click', close);
  panel.querySelector('.dy-panel-close').addEventListener('click', close);
}

// === 评论面板 ===
async function showCommentPanel(videoId) {
  let panel = document.getElementById('dyCommentPanel');
  if (panel) { panel.remove(); return; }

  panel = document.createElement('div');
  panel.id = 'dyCommentPanel';
  panel.className = 'dy-bottom-panel';
  panel.innerHTML = `
    <div class="dy-panel-mask"></div>
    <div class="dy-panel-content dy-panel-tall">
      <div class="dy-panel-header">
        <span>评论</span>
        <span class="dy-panel-close">&times;</span>
      </div>
      <div class="dy-panel-body" style="padding:0 16px">
        <div style="text-align:center;padding:20px;color:var(--text-secondary)">加载中...</div>
      </div>
      <div class="dy-comment-input">
        <input type="text" placeholder="当前免费用户禁止评论，仅VIP可评论" disabled>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('open'));

  const close = () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 300); };
  panel.querySelector('.dy-panel-mask').addEventListener('click', close);
  panel.querySelector('.dy-panel-close').addEventListener('click', close);

  // 加载评论
  const body = panel.querySelector('.dy-panel-body');
  try {
    const comments = await api.videoComments(videoId);
    if (!comments || comments.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:13px">暂无评论</div>';
      return;
    }
    body.innerHTML = comments.map(c => `
      <div class="dy-comment-item">
        <div class="dy-comment-avatar">
          ${c.userPortrait ? `<img data-decrypt-src="${escapeHtml(c.userPortrait)}" alt="">` : '<div style="width:32px;height:32px;border-radius:50%;background:#333"></div>'}
        </div>
        <div class="dy-comment-body">
          <div class="dy-comment-name">${escapeHtml(c.userName)} <span class="dy-comment-meta">${c.city ? escapeHtml(c.city) : ''} · ${timeAgo(c.createdAt)}</span></div>
          <div class="dy-comment-text">${escapeHtml(c.content)}</div>
          ${c.likeCount > 0 ? `<div class="dy-comment-likes">♥ ${c.likeCount}</div>` : ''}
        </div>
      </div>
    `).join('');
    decryptImages(body);
  } catch {
    body.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:13px">暂无评论</div>';
  }
}
