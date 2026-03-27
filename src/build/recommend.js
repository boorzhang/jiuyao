import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slimVideo } from './categories.js';

const STEP = 7919; // 质数，与 75186 互素 (gcd=1)
const REC_COUNT = 4;

/**
 * 计算 gcd
 */
export function gcd(a, b) {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * 构建推荐 JSON
 * @param {Array} allVideos - 全部视频数组（会被按 id 排序）
 * @param {string} outDir - r2-data 输出目录
 */
export function buildRecommend(allVideos, outDir) {
  // 按 id 排序，保证确定性
  const sorted = [...allVideos].sort((a, b) => a.id.localeCompare(b.id));
  const N = sorted.length;

  for (let i = 0; i < N; i++) {
    const video = sorted[i];
    const recs = [];
    let k = 1;
    while (recs.length < REC_COUNT) {
      const idx = (i * STEP + k) % N;
      k++;
      if (idx === i) continue; // 跳过自身
      recs.push(slimVideo(sorted[idx]));
    }

    const recDir = join(outDir, 'data', 'video', video.id);
    mkdirSync(recDir, { recursive: true });
    writeFileSync(
      join(recDir, 'recommend.json'),
      JSON.stringify(recs)
    );
  }
}

export { STEP, REC_COUNT };
