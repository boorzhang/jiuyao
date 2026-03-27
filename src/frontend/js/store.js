// localStorage 用户数据管理
const KEYS = {
  user: 'jiuyao_user',
  likes: 'jiuyao_likes',
  history: 'jiuyao_history',
  collections: 'jiuyao_collections',
};

export function getUser() {
  const raw = localStorage.getItem(KEYS.user);
  if (raw) return JSON.parse(raw);
  const user = {
    uid: crypto.randomUUID ? crypto.randomUUID() : 'u-' + Math.random().toString(36).slice(2, 10),
    username: '用户' + Math.floor(100000 + Math.random() * 900000),
    avatar: null,
    membership: null,
  };
  localStorage.setItem(KEYS.user, JSON.stringify(user));
  return user;
}

export function getLikes() {
  const raw = localStorage.getItem(KEYS.likes);
  return raw ? JSON.parse(raw) : [];
}

export function isLiked(videoId) {
  return getLikes().includes(videoId);
}

export function toggleLike(videoId) {
  const likes = getLikes();
  const idx = likes.indexOf(videoId);
  if (idx >= 0) likes.splice(idx, 1);
  else likes.push(videoId);
  localStorage.setItem(KEYS.likes, JSON.stringify(likes));
  return idx < 0; // true = 新增点赞
}

export function getHistory() {
  const raw = localStorage.getItem(KEYS.history);
  return raw ? JSON.parse(raw) : [];
}

export function addHistory(videoId) {
  const history = getHistory().filter(id => id !== videoId);
  history.unshift(videoId);
  if (history.length > 200) history.length = 200;
  localStorage.setItem(KEYS.history, JSON.stringify(history));
}

export function getCollections() {
  const raw = localStorage.getItem(KEYS.collections);
  return raw ? JSON.parse(raw) : [];
}

export function isCollected(videoId) {
  return getCollections().includes(videoId);
}

export function toggleCollection(videoId) {
  const collections = getCollections();
  const idx = collections.indexOf(videoId);
  if (idx >= 0) collections.splice(idx, 1);
  else collections.push(videoId);
  localStorage.setItem(KEYS.collections, JSON.stringify(collections));
  return idx < 0;
}
