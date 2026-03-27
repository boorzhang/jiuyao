import { api } from '../api.js';
import { formatCount, escapeHtml } from '../utils.js';
import { isLiked, toggleLike } from '../store.js';
import { decryptImages } from '../imgloader.js';

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

function playCurrentSlide() {
  destroyCurrentVideo();

  const cur = feed()[dy.idx];
  if (!cur) return;

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
    video.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:0;background:#000;';
    // 插入到封面图之后
    const coverImg = slide.querySelector('.sv-cover');
    if (coverImg) coverImg.after(video);
    else slide.prepend(video);
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

  return `<div class="dy-slide" data-pos="${position}" data-vid="${v.id}">
    <img class="sv-cover" data-decrypt-src="${escapeHtml(v.cover || '')}" alt="">
    <div class="sv-play-center" id="playIcon-${position}">
      <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </div>
    <div class="sv-overlay">
      <div class="sv-publisher">
        ${v.publisher?.portrait ? `<img class="sv-avatar" data-decrypt-src="${escapeHtml(v.publisher.portrait)}" alt="">` : ''}
        <span class="sv-name">@${escapeHtml(v.publisher?.name || '用户')}</span>
        <button class="sv-follow-btn">+ 关注</button>
      </div>
      <div class="sv-title">${escapeHtml(v.title)}</div>
      ${tags.length ? `<div class="sv-tags">${tags.map(t => `<span class="sv-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="sv-music">
        <svg class="sv-music-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span class="sv-music-text">${escapeHtml(v.publisher?.name || '原声')} 创作的原声</span>
      </div>
    </div>
    <div class="sv-actions">
      <div class="sv-action-avatar">
        ${v.publisher?.portrait ? `<img data-decrypt-src="${escapeHtml(v.publisher.portrait)}" alt="">` : '<div style="width:44px;height:44px;border-radius:50%;background:#333"></div>'}
        <div class="plus-badge">+</div>
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
      <div class="sv-action-btn" data-action="collect">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${formatCount(v.collectCount)}</span>
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
    const actionBtn = e.target.closest('.sv-action-btn');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      if (action === 'like') {
        const cur = feed()[dy.idx];
        if (cur) { toggleLike(cur.id); dyRender(); }
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
