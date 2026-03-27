import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFeeds, FEED_PAGE_SIZE } from '../src/build/feeds.js';

function makeVideo(id, playCount, createdAt) {
  return {
    id,
    title: `视频${id}`,
    newsType: 'SP',
    raw: {
      playCount,
      playTime: 60,
      likeCount: 5,
      commentCount: 0,
      collectCount: 0,
      coins: 0,
      originCoins: 0,
      freeArea: true,
      cover: `cover/${id}.jpg`,
      tags: [],
      publisher: { name: '测试' },
      createdAt,
    },
  };
}

describe('feeds', () => {
  it('recommend feed 按 playCount 降序', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'feed-test-'));
    try {
      const videos = [
        makeVideo('a', 100, '2024-01-01T00:00:00+08:00'),
        makeVideo('b', 500, '2024-01-02T00:00:00+08:00'),
        makeVideo('c', 300, '2024-01-03T00:00:00+08:00'),
      ];

      buildFeeds(videos, outDir);

      const page = JSON.parse(
        readFileSync(join(outDir, 'data', 'feed', 'recommend', 'page_1.json'), 'utf-8')
      );
      assert.equal(page.videos[0].playCount, 500);
      assert.equal(page.videos[1].playCount, 300);
      assert.equal(page.videos[2].playCount, 100);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('latest feed 按 createdAt 降序', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'feed-lat-'));
    try {
      const videos = [
        makeVideo('a', 100, '2024-01-01T00:00:00+08:00'),
        makeVideo('b', 500, '2024-01-03T00:00:00+08:00'),
        makeVideo('c', 300, '2024-01-02T00:00:00+08:00'),
      ];

      buildFeeds(videos, outDir);

      const page = JSON.parse(
        readFileSync(join(outDir, 'data', 'feed', 'latest', 'page_1.json'), 'utf-8')
      );
      // 最新的在前面
      assert.equal(page.videos[0].id, 'b');
      assert.equal(page.videos[1].id, 'c');
      assert.equal(page.videos[2].id, 'a');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('每页条数正确', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'feed-pag-'));
    try {
      const videos = [];
      for (let i = 0; i < 25; i++) {
        videos.push(makeVideo(`v${i}`, i * 10, `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00+08:00`));
      }

      const result = buildFeeds(videos, outDir);
      assert.equal(result.recommend.totalPages, 3); // 25/10 = 3

      const page1 = JSON.parse(
        readFileSync(join(outDir, 'data', 'feed', 'recommend', 'page_1.json'), 'utf-8')
      );
      assert.equal(page1.videos.length, FEED_PAGE_SIZE);

      const page3 = JSON.parse(
        readFileSync(join(outDir, 'data', 'feed', 'recommend', 'page_3.json'), 'utf-8')
      );
      assert.equal(page3.videos.length, 5); // 剩余 5 条
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
