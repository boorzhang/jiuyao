// localStorage 用户数据管理
const KEYS = {
  user: 'jiuyao_user',
  likes: 'jiuyao_likes',
  history: 'jiuyao_history',
  collections: 'jiuyao_collections',
  follows: 'jiuyao_follows',
};

// === 用户 ===
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

// === 点赞 ===
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
  return idx < 0;
}

// === 关注 ===
// 存储结构: [{ uid, name, portrait }]
export function getFollows() {
  const raw = localStorage.getItem(KEYS.follows);
  return raw ? JSON.parse(raw) : [];
}

export function isFollowed(publisherUid) {
  return getFollows().some(f => f.uid === publisherUid);
}

export function toggleFollow(publisher) {
  // publisher: { uid, name, portrait }
  const follows = getFollows();
  const idx = follows.findIndex(f => f.uid === publisher.uid);
  if (idx >= 0) {
    follows.splice(idx, 1);
  } else {
    follows.unshift({ uid: publisher.uid, name: publisher.name, portrait: publisher.portrait || '' });
  }
  localStorage.setItem(KEYS.follows, JSON.stringify(follows));
  return idx < 0; // true = 新关注
}

export function getFollowCount() {
  return getFollows().length;
}

// === 观看历史 ===
// 存储结构: [{ id, title, cover, type: 'short'|'long', publisher, playTime, timestamp }]
export function getHistory() {
  const raw = localStorage.getItem(KEYS.history);
  return raw ? JSON.parse(raw) : [];
}

export function getHistoryByType(type) {
  return getHistory().filter(h => h.type === type);
}

export function addHistory(video, type) {
  // type: 'short' (抖音刷) | 'long' (详情页)
  const history = getHistory().filter(h => h.id !== video.id);
  history.unshift({
    id: video.id,
    title: video.title || '',
    cover: video.cover || '',
    type: type || 'long',
    publisher: video.publisher ? { name: video.publisher.name } : null,
    playTime: video.playTime || 0,
    timestamp: Date.now(),
  });
  if (history.length > 500) history.length = 500;
  localStorage.setItem(KEYS.history, JSON.stringify(history));
}

// === 收藏 ===
// 存储结构: [{ id, title, cover, type: 'short'|'long', publisher, playTime, timestamp }]
export function getCollections() {
  const raw = localStorage.getItem(KEYS.collections);
  return raw ? JSON.parse(raw) : [];
}

export function getCollectionsByType(type) {
  return getCollections().filter(c => c.type === type);
}

export function isCollected(videoId) {
  return getCollections().some(c => c.id === videoId);
}

export function toggleCollection(video, type) {
  const collections = getCollections();
  const idx = collections.findIndex(c => c.id === video.id);
  if (idx >= 0) {
    collections.splice(idx, 1);
  } else {
    collections.unshift({
      id: video.id,
      title: video.title || '',
      cover: video.cover || '',
      type: type || 'long',
      publisher: video.publisher ? { name: video.publisher.name } : null,
      playTime: video.playTime || 0,
      timestamp: Date.now(),
    });
  }
  localStorage.setItem(KEYS.collections, JSON.stringify(collections));
  return idx < 0;
}
