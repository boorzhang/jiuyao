import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slimVideo } from './categories.js';

/**
 * 构建作者数据 — 按 publisher.uid 分组
 * 输出: r2-data/data/author/{uid}.json
 * 格式: { uid, name, portrait, summary, fans, totalWorks, videos: [...slimVideo] }
 */
export function buildAuthors(allVideos, outDir) {
  const authorMap = new Map(); // uid → { info, videos[] }

  for (const v of allVideos) {
    const pub = v.raw?.publisher;
    if (!pub || !pub.uid) continue;

    if (!authorMap.has(pub.uid)) {
      authorMap.set(pub.uid, {
        uid: pub.uid,
        name: pub.name || '',
        portrait: pub.portrait || '',
        gender: pub.gender || '',
        summary: pub.summary || '',
        fans: pub.fans || 0,
        totalWorks: pub.totalWorks || 0,
        vipLevel: pub.vipLevel || 0,
        videos: [],
      });
    }

    authorMap.get(pub.uid).videos.push(v);
  }

  const authorDir = join(outDir, 'data', 'author');
  mkdirSync(authorDir, { recursive: true });

  let count = 0;
  for (const [uid, author] of authorMap) {
    // 按 playCount 降序
    author.videos.sort((a, b) => (b.raw?.playCount || 0) - (a.raw?.playCount || 0));

    const out = {
      uid: author.uid,
      name: author.name,
      portrait: author.portrait,
      gender: author.gender,
      summary: author.summary,
      fans: author.fans,
      totalWorks: author.totalWorks,
      vipLevel: author.vipLevel,
      videoCount: author.videos.length,
      videos: author.videos.map(slimVideo),
    };

    writeFileSync(join(authorDir, `${uid}.json`), JSON.stringify(out));
    count++;
  }

  return { authorCount: count };
}
