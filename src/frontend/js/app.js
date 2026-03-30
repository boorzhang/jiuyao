import { api, applyReleaseConfig, setM3u8Base } from './api.js';
import { initImageLoader } from './imgloader.js';
import { initHome } from './pages/home.js';
import { initDouyin } from './pages/douyin.js';
import { initMine, refreshMine } from './pages/mine.js';
import { initDetail } from './pages/detail.js';

let currentTab = 'home';

function switchTab(name) {
  if (name === currentTab) return;
  currentTab = name;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');

  const tabMap = { home: 0, douyin: 1, mine: 2 };
  document.querySelectorAll('.tab-item')[tabMap[name]]?.classList.add('active');

  if (name === 'mine') refreshMine();
}

/**
 * 加载当前发布版本指针。
 *
 * 使用示例：
 * ```js
 * const release = await loadReleaseManifest();
 * console.log(release.releaseId);
 * ```
 */
export async function loadReleaseManifest(fetchImpl = fetch, releaseUrl = '/release.json') {
  const response = await fetchImpl(releaseUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`加载 release.json 失败: ${response.status}`);
  }

  return response.json();
}

/**
 * 先应用 release manifest，再读取当前版本的数据配置。
 *
 * 使用示例：
 * ```js
 * const { release, config } = await bootstrapRuntime();
 * ```
 */
export async function bootstrapRuntime({
  fetchRelease = () => loadReleaseManifest(),
  applyRelease = applyReleaseConfig,
  loadConfig = () => api.config(),
} = {}) {
  let release = {};

  try {
    release = await fetchRelease();
  } catch (error) {
    console.warn('读取 release manifest 失败，回退到默认数据前缀:', error);
  }

  const runtime = applyRelease(release);
  const config = await loadConfig();

  return {
    release: {
      ...release,
      ...runtime,
    },
    config,
  };
}

function registerServiceWorker(releaseId = '') {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const query = encodeURIComponent(releaseId || 'runtime');
  navigator.serviceWorker
    .register(`/sw.js?releaseId=${query}`, { updateViaCache: 'none' })
    .catch(() => {});
}

async function init() {
  let release;
  let config;

  try {
    const runtime = await bootstrapRuntime();
    release = runtime.release;
    config = runtime.config;
  } catch (e) {
    console.error('初始化前端失败:', e);
    return;
  }

  document.documentElement.dataset.releaseId = release.releaseId || 'runtime';

  // m3u8 使用线上 R2 地址
  if (config.r2Base) setM3u8Base(config.r2Base);

  // 初始化图片解密加载器
  initImageLoader();

  // 初始化各页面
  await Promise.all([
    initHome(config),
    initDouyin(config),
  ]);
  initMine();
  initDetail(config);

  // Tab 切换事件
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // PWA 注册：让 SW 直接感知当前 releaseId，便于清理旧缓存。
  registerServiceWorker(release.releaseId);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  init();
}
