import { getUser, getLikes, getHistory, getCollections } from '../store.js';
import { escapeHtml } from '../utils.js';

export function initMine() {
  const user = getUser();

  document.querySelector('.mine-name').textContent = user.username;
  document.querySelector('.mine-uid').textContent = `UID: ${user.uid.slice(0, 8)}`;

  updateStats();

  // 菜单点击
  document.querySelectorAll('.mine-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.querySelector('.menu-text').textContent;
      if (text === '我的收藏') {
        showListPage('我的收藏', getCollections());
      } else if (text === '观看历史') {
        showListPage('观看历史', getHistory());
      }
    });
  });
}

function updateStats() {
  const stats = document.querySelectorAll('.mine-stat .num');
  if (stats.length >= 4) {
    stats[0].textContent = '0';
    stats[1].textContent = '0';
    stats[2].textContent = getLikes().length;
    stats[3].textContent = '0';
  }
}

function showListPage(title, ids) {
  // 简单提示
  if (ids.length === 0) {
    alert(`${title}为空`);
  } else {
    alert(`${title}: ${ids.length} 个视频`);
  }
}

export function refreshMine() {
  updateStats();
}
