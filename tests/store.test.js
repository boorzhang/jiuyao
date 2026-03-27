import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 模拟 localStorage
class MockStorage {
  constructor() { this.data = {}; }
  getItem(key) { return this.data[key] ?? null; }
  setItem(key, value) { this.data[key] = String(value); }
  removeItem(key) { delete this.data[key]; }
  clear() { this.data = {}; }
}

// 内联 store 逻辑用于测试
function createStore(storage) {
  const KEYS = {
    user: 'jiuyao_user',
    likes: 'jiuyao_likes',
    history: 'jiuyao_history',
    collections: 'jiuyao_collections',
    follows: 'jiuyao_follows',
  };

  function getUser() {
    const raw = storage.getItem(KEYS.user);
    if (raw) return JSON.parse(raw);
    const user = {
      uid: 'mock-uuid-' + Math.random().toString(36).slice(2, 8),
      username: '用户' + Math.floor(100000 + Math.random() * 900000),
      avatar: null,
      membership: null,
    };
    storage.setItem(KEYS.user, JSON.stringify(user));
    return user;
  }

  function getLikes() {
    const raw = storage.getItem(KEYS.likes);
    return raw ? JSON.parse(raw) : [];
  }

  function toggleLike(videoId) {
    const likes = getLikes();
    const idx = likes.indexOf(videoId);
    if (idx >= 0) likes.splice(idx, 1);
    else likes.push(videoId);
    storage.setItem(KEYS.likes, JSON.stringify(likes));
    return idx < 0;
  }

  function getHistory() {
    const raw = storage.getItem(KEYS.history);
    return raw ? JSON.parse(raw) : [];
  }

  function getHistoryByType(type) {
    return getHistory().filter(h => h.type === type);
  }

  function addHistory(video, type) {
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
    storage.setItem(KEYS.history, JSON.stringify(history));
  }

  function getCollections() {
    const raw = storage.getItem(KEYS.collections);
    return raw ? JSON.parse(raw) : [];
  }

  function getCollectionsByType(type) {
    return getCollections().filter(c => c.type === type);
  }

  function isCollected(videoId) {
    return getCollections().some(c => c.id === videoId);
  }

  function toggleCollection(video, type) {
    const collections = getCollections();
    const idx = collections.findIndex(c => c.id === video.id);
    if (idx >= 0) collections.splice(idx, 1);
    else collections.unshift({
      id: video.id, title: video.title || '', cover: '', type: type || 'long',
      publisher: video.publisher ? { name: video.publisher.name } : null,
      playTime: video.playTime || 0, timestamp: Date.now(),
    });
    storage.setItem(KEYS.collections, JSON.stringify(collections));
    return idx < 0;
  }

  function getFollows() {
    const raw = storage.getItem(KEYS.follows);
    return raw ? JSON.parse(raw) : [];
  }

  function isFollowed(uid) {
    return getFollows().some(f => f.uid === uid);
  }

  function toggleFollow(publisher) {
    const follows = getFollows();
    const idx = follows.findIndex(f => f.uid === publisher.uid);
    if (idx >= 0) follows.splice(idx, 1);
    else follows.unshift({ uid: publisher.uid, name: publisher.name, portrait: '' });
    storage.setItem(KEYS.follows, JSON.stringify(follows));
    return idx < 0;
  }

  return {
    getUser, getLikes, toggleLike,
    getHistory, getHistoryByType, addHistory,
    getCollections, getCollectionsByType, isCollected, toggleCollection,
    getFollows, isFollowed, toggleFollow,
  };
}

describe('store', () => {
  let storage;
  let store;

  beforeEach(() => {
    storage = new MockStorage();
    store = createStore(storage);
  });

  it('首次初始化生成 uid 和 username', () => {
    const user = store.getUser();
    assert.ok(user.uid);
    assert.ok(user.username.startsWith('用户'));
    assert.equal(user.username.length, 8);
  });

  it('再次获取用户返回相同数据', () => {
    const user1 = store.getUser();
    const user2 = store.getUser();
    assert.equal(user1.uid, user2.uid);
  });

  it('点赞写入/读取一致', () => {
    assert.deepEqual(store.getLikes(), []);
    store.toggleLike('video1');
    assert.deepEqual(store.getLikes(), ['video1']);
    store.toggleLike('video2');
    assert.deepEqual(store.getLikes(), ['video1', 'video2']);
    store.toggleLike('video1');
    assert.deepEqual(store.getLikes(), ['video2']);
  });

  it('历史记录追加去重，按类型过滤', () => {
    store.addHistory({ id: 'v1', title: '短1' }, 'short');
    store.addHistory({ id: 'v2', title: '长1' }, 'long');
    store.addHistory({ id: 'v3', title: '短2' }, 'short');

    assert.equal(store.getHistory().length, 3);
    assert.equal(store.getHistory()[0].id, 'v3'); // 最新在前
    assert.equal(store.getHistoryByType('short').length, 2);
    assert.equal(store.getHistoryByType('long').length, 1);

    // 重复添加 v1，移到最前
    store.addHistory({ id: 'v1', title: '短1' }, 'short');
    assert.equal(store.getHistory().length, 3);
    assert.equal(store.getHistory()[0].id, 'v1');
  });

  it('收藏 toggle，按类型过滤', () => {
    store.toggleCollection({ id: 'v1', title: '短' }, 'short');
    store.toggleCollection({ id: 'v2', title: '长' }, 'long');

    assert.equal(store.getCollections().length, 2);
    assert.ok(store.isCollected('v1'));
    assert.ok(store.isCollected('v2'));
    assert.equal(store.getCollectionsByType('short').length, 1);
    assert.equal(store.getCollectionsByType('long').length, 1);

    // 取消收藏
    store.toggleCollection({ id: 'v1' }, 'short');
    assert.equal(store.getCollections().length, 1);
    assert.ok(!store.isCollected('v1'));
  });

  it('关注 toggle', () => {
    const pub1 = { uid: 100, name: '发布者A', portrait: '' };
    const pub2 = { uid: 200, name: '发布者B', portrait: '' };

    store.toggleFollow(pub1);
    assert.ok(store.isFollowed(100));
    assert.equal(store.getFollows().length, 1);

    store.toggleFollow(pub2);
    assert.equal(store.getFollows().length, 2);
    assert.equal(store.getFollows()[0].uid, 200); // 最新在前

    // 取消关注
    store.toggleFollow(pub1);
    assert.equal(store.getFollows().length, 1);
    assert.ok(!store.isFollowed(100));
  });
});
