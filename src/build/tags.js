import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slimVideo } from './categories.js';

const TAG_PAGE_SIZE = 20;

/**
 * 从视频的 raw.tags 构建标签聚合分页 JSON
 * 输出到 r2-data/data/tag/{tagName}/page_{n}.json
 */
export function buildTags(allVideos, outDir) {
  const tagMap = new Map();

  for (const v of allVideos) {
    const rawTags = v.raw?.tags || [];
    for (const t of rawTags) {
      const name = typeof t === 'string' ? t : (t.name || '');
      if (!name) continue;
      if (!tagMap.has(name)) tagMap.set(name, []);
      tagMap.get(name).push(v);
    }
  }

  // 按 playCount 降序排序每个标签下的视频
  for (const [, videos] of tagMap) {
    videos.sort((a, b) => (b.raw?.playCount || 0) - (a.raw?.playCount || 0));
  }

  const tagOutBase = join(outDir, 'data', 'tag');
  let tagCount = 0;

  for (const [name, videos] of tagMap) {
    const totalPages = Math.ceil(videos.length / TAG_PAGE_SIZE) || 1;
    const tagDir = join(tagOutBase, name);
    mkdirSync(tagDir, { recursive: true });

    for (let p = 1; p <= totalPages; p++) {
      const start = (p - 1) * TAG_PAGE_SIZE;
      const pageVideos = videos.slice(start, start + TAG_PAGE_SIZE).map(slimVideo);
      writeFileSync(
        join(tagDir, `page_${p}.json`),
        JSON.stringify({ tag: name, page: p, totalPages, total: videos.length, videos: pageVideos })
      );
    }
    tagCount++;
  }

  // 热门标签索引（按视频数降序，取前 50）
  const hotTags = [...tagMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 50)
    .map(([name, videos]) => ({ name, count: videos.length }));

  writeFileSync(
    join(tagOutBase, 'index.json'),
    JSON.stringify(hotTags)
  );

  return { tagCount, hotTags };
}

export { TAG_PAGE_SIZE };
