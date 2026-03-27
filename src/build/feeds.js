import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slimVideo } from './categories.js';

const FEED_PAGE_SIZE = 10;

/**
 * 构建推荐和最新 feed 分页
 * @param {Array} allVideos - 全部视频数组
 * @param {string} outDir - r2-data 输出目录
 * @returns {{ recommend: { totalPages }, latest: { totalPages } }}
 */
export function buildFeeds(allVideos, outDir) {
  // 推荐 feed: 按 playCount 降序
  const byPlay = [...allVideos].sort((a, b) =>
    (b.raw?.playCount || 0) - (a.raw?.playCount || 0)
  );
  const recommendPages = writeFeed(byPlay, 'recommend', outDir);

  // 最新 feed: 按 createdAt 降序
  const byDate = [...allVideos].sort((a, b) => {
    const da = b.raw?.createdAt || '';
    const db = a.raw?.createdAt || '';
    return da.localeCompare(db);
  });
  const latestPages = writeFeed(byDate, 'latest', outDir);

  return {
    recommend: { totalPages: recommendPages },
    latest: { totalPages: latestPages },
  };
}

function writeFeed(videos, type, outDir) {
  const totalPages = Math.ceil(videos.length / FEED_PAGE_SIZE) || 1;
  const feedDir = join(outDir, 'data', 'feed', type);
  mkdirSync(feedDir, { recursive: true });

  for (let p = 1; p <= totalPages; p++) {
    const start = (p - 1) * FEED_PAGE_SIZE;
    const pageVideos = videos.slice(start, start + FEED_PAGE_SIZE).map(slimVideo);
    writeFileSync(
      join(feedDir, `page_${p}.json`),
      JSON.stringify({ page: p, totalPages, videos: pageVideos })
    );
  }

  return totalPages;
}

export { FEED_PAGE_SIZE };
