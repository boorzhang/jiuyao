import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCategories, slimVideo, PAGE_SIZE } from '../src/build/categories.js';

function makeVideo(id, playCount, categoryList = ['测试']) {
  return {
    id,
    title: `视频${id}`,
    newsType: 'SP',
    categoryList,
    raw: {
      playCount,
      playTime: 120,
      likeCount: 10,
      commentCount: 0,
      collectCount: 0,
      coins: 0,
      originCoins: 0,
      freeArea: true,
      cover: `cover/${id}.jpg`,
      coverThumb: `thumb/${id}.jpg`,
      tags: [{ name: '标签1', id: 't1' }, { name: '标签2', id: 't2' }, { name: '标签3', id: 't3' }],
      publisher: { name: '发布者' },
      createdAt: '2024-01-01T00:00:00+08:00',
    },
  };
}


describe('categories', () => {
  it('slimVideo 精简字段正确', () => {
    const v = makeVideo('abc123', 5000);
    const slim = slimVideo(v);
    assert.equal(slim.id, 'abc123');
    assert.equal(slim.playCount, 5000);
    assert.equal(slim.tags.length, 2); // 最多2个
    assert.equal(slim.tags[0], '标签1');
    assert.equal(slim.publisher.name, '发布者');
    // 不应包含 raw
    assert.equal(slim.raw, undefined);
  });

  it('45条视频分3页(20+20+5)，按 playCount 降序', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const tmpDir = mkdtempSync(join(tmpdir(), 'cat-test-'));
    const outDir = mkdtempSync(join(tmpdir(), 'cat-out-'));

    try {
      // 创建 45 个视频
      const videoMap = new Map();
      const ids = [];
      for (let i = 1; i <= 45; i++) {
        const id = `id${String(i).padStart(3, '0')}`;
        ids.push(id);
        videoMap.set(id, makeVideo(id, i * 100)); // playCount: 100,200,...,4500
      }

      // 创建 tag 目录
      const catDir = join(tmpDir, '测试分类');
      mkdirSync(catDir, { recursive: true });
      for (const id of ids) {
        writeFileSync(join(catDir, `VID${id}.json`), '{}');
      }

      const result = buildCategories(videoMap, tmpDir, outDir);

      assert.equal(result.categories.length, 1);
      assert.equal(result.categories[0].count, 45);
      assert.equal(result.categories[0].totalPages, 3);

      // 验证第1页
      const page1 = JSON.parse(readFileSync(join(outDir, 'data', 'category', '测试分类', 'page_1.json'), 'utf-8'));
      assert.equal(page1.page, 1);
      assert.equal(page1.totalPages, 3);
      assert.equal(page1.videos.length, 20);
      // 按 playCount 降序
      assert.equal(page1.videos[0].playCount, 4500);
      assert.equal(page1.videos[1].playCount, 4400);

      // 验证第3页（最后一页5条）
      const page3 = JSON.parse(readFileSync(join(outDir, 'data', 'category', '测试分类', 'page_3.json'), 'utf-8'));
      assert.equal(page3.videos.length, 5);
      assert.equal(page3.page, 3);

      // 验证降序连贯
      for (let i = 1; i < page1.videos.length; i++) {
        assert.ok(page1.videos[i - 1].playCount >= page1.videos[i].playCount);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
