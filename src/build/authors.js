import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slimVideo } from './categories.js';

const AUTHOR_PAGE_SIZE = 30;

/**
 * 构建作者数据 — 按 publisher.uid 分组，分页存储
 * 输出:
 *   r2-data/data/author/{uid}.json        — profile + 第1页视频
 *   r2-data/data/author/{uid}/page_{n}.json — 后续页
 */
export function buildAuthors(allVideos, outDir) {
  const authorMap = new Map();

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

    const allSlim = author.videos.map(slimVideo);
    const totalPages = Math.ceil(allSlim.length / AUTHOR_PAGE_SIZE) || 1;

    // 主文件: profile + 第1页
    const firstPage = allSlim.slice(0, AUTHOR_PAGE_SIZE);
    writeFileSync(join(authorDir, `${uid}.json`), JSON.stringify({
      uid: author.uid,
      name: author.name,
      portrait: author.portrait,
      gender: author.gender,
      summary: author.summary,
      fans: author.fans,
      totalWorks: author.totalWorks,
      vipLevel: author.vipLevel,
      videoCount: allSlim.length,
      totalPages,
      videos: firstPage,
    }));

    // 后续页
    if (totalPages > 1) {
      const uidDir = join(authorDir, String(uid));
      mkdirSync(uidDir, { recursive: true });
      for (let p = 2; p <= totalPages; p++) {
        const start = (p - 1) * AUTHOR_PAGE_SIZE;
        const pageVideos = allSlim.slice(start, start + AUTHOR_PAGE_SIZE);
        writeFileSync(join(uidDir, `page_${p}.json`), JSON.stringify({
          page: p, totalPages, videos: pageVideos,
        }));
      }
    }

    count++;
  }

  return { authorCount: count };
}

export { AUTHOR_PAGE_SIZE };
