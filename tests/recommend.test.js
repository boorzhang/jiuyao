import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRecommend, gcd, STEP, REC_COUNT } from '../src/build/recommend.js';

function makeVideo(id) {
  return {
    id,
    title: `视频${id}`,
    newsType: 'SP',
    raw: {
      playCount: 100,
      playTime: 60,
      likeCount: 5,
      commentCount: 0,
      collectCount: 0,
      coins: 0,
      originCoins: 0,
      freeArea: true,
      cover: `cover/${id}.jpg`,
      tags: [{ name: '标签', id: 't1' }],
      publisher: { name: '测试' },
    },
  };
}

describe('recommend', () => {
  it('gcd(STEP, 75186) === 1', () => {
    assert.equal(gcd(STEP, 75186), 1);
  });

  it('推荐不包含自身，每个视频恰好4条推荐', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'rec-test-'));
    try {
      const videos = [];
      for (let i = 0; i < 100; i++) {
        videos.push(makeVideo(`v${String(i).padStart(4, '0')}`));
      }

      buildRecommend(videos, outDir);

      for (const v of videos) {
        const recs = JSON.parse(
          readFileSync(join(outDir, 'data', 'video', v.id, 'recommend.json'), 'utf-8')
        );
        assert.equal(recs.length, REC_COUNT);
        // 不包含自身
        for (const r of recs) {
          assert.notEqual(r.id, v.id);
        }
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('全覆盖：所有视频至少出现在某个推荐列表中', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'rec-cov-'));
    try {
      const N = 50;
      const videos = [];
      for (let i = 0; i < N; i++) {
        videos.push(makeVideo(`c${String(i).padStart(4, '0')}`));
      }

      buildRecommend(videos, outDir);

      const appearedIds = new Set();
      for (const v of videos) {
        const recs = JSON.parse(
          readFileSync(join(outDir, 'data', 'video', v.id, 'recommend.json'), 'utf-8')
        );
        for (const r of recs) {
          appearedIds.add(r.id);
        }
      }

      // 每个视频 id 都应在某个推荐中出现
      const allIds = new Set(videos.map(v => v.id));
      for (const id of allIds) {
        assert.ok(appearedIds.has(id), `视频 ${id} 未出现在任何推荐列表中`);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('确定性：相同输入产生相同输出', () => {
    const outDir1 = mkdtempSync(join(tmpdir(), 'rec-det1-'));
    const outDir2 = mkdtempSync(join(tmpdir(), 'rec-det2-'));
    try {
      const videos = [];
      for (let i = 0; i < 30; i++) {
        videos.push(makeVideo(`d${String(i).padStart(4, '0')}`));
      }

      buildRecommend(videos, outDir1);
      buildRecommend(videos, outDir2);

      for (const v of videos) {
        const r1 = readFileSync(join(outDir1, 'data', 'video', v.id, 'recommend.json'), 'utf-8');
        const r2 = readFileSync(join(outDir2, 'data', 'video', v.id, 'recommend.json'), 'utf-8');
        assert.equal(r1, r2);
      }
    } finally {
      rmSync(outDir1, { recursive: true, force: true });
      rmSync(outDir2, { recursive: true, force: true });
    }
  });
});
