import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 模拟 localStorage（在 Node.js 环境中）
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
  };

  function getUser() {
    const raw = storage.getItem(KEYS.user);
    if (raw) return JSON.parse(raw);
    // 首次初始化
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
    if (idx >= 0) {
      likes.splice(idx, 1);
    } else {
      likes.push(videoId);
    }
    storage.setItem(KEYS.likes, JSON.stringify(likes));
    return likes;
  }

  function getHistory() {
    const raw = storage.getItem(KEYS.history);
    return raw ? JSON.parse(raw) : [];
  }

  function addHistory(videoId) {
    const history = getHistory().filter(id => id !== videoId);
    history.unshift(videoId);
    // 最多保留 200 条
    if (history.length > 200) history.length = 200;
    storage.setItem(KEYS.history, JSON.stringify(history));
    return history;
  }

  function getCollections() {
    const raw = storage.getItem(KEYS.collections);
    return raw ? JSON.parse(raw) : [];
  }

  function toggleCollection(videoId) {
    const collections = getCollections();
    const idx = collections.indexOf(videoId);
    if (idx >= 0) {
      collections.splice(idx, 1);
    } else {
      collections.push(videoId);
    }
    storage.setItem(KEYS.collections, JSON.stringify(collections));
    return collections;
  }

  return { getUser, getLikes, toggleLike, getHistory, addHistory, getCollections, toggleCollection };
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
    assert.equal(user.username.length, 8); // "用户" + 6 位数字
  });

  it('再次获取用户返回相同数据', () => {
    const user1 = store.getUser();
    const user2 = store.getUser();
    assert.equal(user1.uid, user2.uid);
    assert.equal(user1.username, user2.username);
  });

  it('点赞写入/读取一致', () => {
    assert.deepEqual(store.getLikes(), []);

    store.toggleLike('video1');
    assert.deepEqual(store.getLikes(), ['video1']);

    store.toggleLike('video2');
    assert.deepEqual(store.getLikes(), ['video1', 'video2']);

    // 取消点赞
    store.toggleLike('video1');
    assert.deepEqual(store.getLikes(), ['video2']);
  });

  it('历史记录追加去重', () => {
    store.addHistory('v1');
    store.addHistory('v2');
    store.addHistory('v3');
    assert.deepEqual(store.getHistory(), ['v3', 'v2', 'v1']);

    // 重复添加 v1，应移到最前
    store.addHistory('v1');
    assert.deepEqual(store.getHistory(), ['v1', 'v3', 'v2']);
  });

  it('收藏 toggle', () => {
    store.toggleCollection('v1');
    assert.deepEqual(store.getCollections(), ['v1']);

    store.toggleCollection('v1');
    assert.deepEqual(store.getCollections(), []);
  });
});
