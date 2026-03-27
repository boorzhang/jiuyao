import { api, setR2Base } from './api.js';
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

async function init() {
  // 加载配置
  let config;
  try {
    config = await api.config();
  } catch (e) {
    console.error('加载配置失败:', e);
    return;
  }

  // 配置 R2 base
  if (config.r2Base) setR2Base(config.r2Base);

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

  // PWA 注册
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
