import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_SIZE = 20;

/**
 * 精简视频字段，用于列表页
 */
export function slimVideo(v) {
  const raw = v.raw || {};
  return {
    id: v.id,
    title: v.title || raw.title,
    cover: raw.cover || raw.coverThumb || '',
    playCount: raw.playCount || 0,
    playTime: raw.playTime || 0,
    likeCount: raw.likeCount || 0,
    commentCount: raw.commentCount || 0,
    collectCount: raw.collectCount || 0,
    coins: raw.coins || 0,
    originCoins: raw.originCoins || 0,
    freeArea: raw.freeArea || false,
    tags: (raw.tags || []).slice(0, 2).map(t => t.name || t),
    publisher: raw.publisher ? { uid: raw.publisher.uid, name: raw.publisher.name, portrait: raw.publisher.portrait || '' } : null,
    newsType: v.newsType || raw.newsType || '',
  };
}

/**
 * 构建分类分页 JSON
 * @param {Map} videoMap - id → video 对象
 * @param {string} tagsDir - _by_tags 目录路径
 * @param {string} outDir - r2-data 输出目录
 * @returns {{ categories: Array<{name,slug,totalPages,count}> }}
 */
export function buildCategories(videoMap, tagsDir, outDir) {
  const catDirs = readdirSync(tagsDir);
  const categories = [];

  for (const catSlug of catDirs) {
    const catPath = join(tagsDir, catSlug);
    let files;
    try {
      files = readdirSync(catPath).filter(f => f.endsWith('.json'));
    } catch { continue; }

    // 收集该分类下的视频
    const videos = [];
    for (const f of files) {
      const id = f.replace('VID', '').replace('.json', '');
      const v = videoMap.get(id);
      if (v) videos.push(v);
    }

    // 按 playCount 降序排序
    videos.sort((a, b) => (b.raw?.playCount || 0) - (a.raw?.playCount || 0));

    const totalPages = Math.ceil(videos.length / PAGE_SIZE) || 1;
    const catOutDir = join(outDir, 'data', 'category', catSlug);
    mkdirSync(catOutDir, { recursive: true });

    for (let p = 1; p <= totalPages; p++) {
      const start = (p - 1) * PAGE_SIZE;
      const pageVideos = videos.slice(start, start + PAGE_SIZE).map(slimVideo);
      writeFileSync(
        join(catOutDir, `page_${p}.json`),
        JSON.stringify({ page: p, totalPages, videos: pageVideos })
      );
    }

    categories.push({
      name: catSlug.replace('_', ' '),
      slug: catSlug,
      totalPages,
      count: videos.length,
    });
  }

  // 按视频数量降序排序
  categories.sort((a, b) => b.count - a.count);
  return { categories };
}

// 导出常量供测试使用
export { PAGE_SIZE };
