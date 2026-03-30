import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 漫画精简字段，用于列表展示
 */
function slimComic(c) {
  return {
    id: c.id,
    title: c.title,
    cover: c.cover,
    tags: c.tags || [],
    chapterCount: c.chapterCount || 0,
    countBrowse: c.countBrowse || 0,
    countLike: c.countLike || 0,
  };
}

/**
 * 构建漫画数据：list.json、tag/*.json、{id}.json
 */
export function buildComics(root, outDir) {
  const comicDir = join(root, 'storage', 'comic', '_by_id');
  if (!existsSync(comicDir)) {
    console.log('  漫画源目录不存在，跳过');
    return { comicCount: 0, comicTags: [] };
  }

  const files = readdirSync(comicDir).filter(f => f.startsWith('COMIC') && f.endsWith('.json'));
  const comics = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(comicDir, f), 'utf-8'));
      comics.push(data);
    } catch {
      // 跳过无法解析的文件
    }
  }

  if (comics.length === 0) {
    return { comicCount: 0, comicTags: [] };
  }

  // 按浏览量降序
  comics.sort((a, b) => (b.countBrowse || 0) - (a.countBrowse || 0));

  const comicOutDir = join(outDir, 'data', 'comic');
  mkdirSync(comicOutDir, { recursive: true });

  // list.json — 全量精简列表
  const list = comics.map(slimComic);
  writeFileSync(join(comicOutDir, 'list.json'), JSON.stringify(list));

  // 按标签分组
  const tagMap = new Map();
  for (const c of comics) {
    for (const tag of (c.tags || [])) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(slimComic(c));
    }
  }

  const tagOutDir = join(comicOutDir, 'tag');
  mkdirSync(tagOutDir, { recursive: true });
  for (const [tag, items] of tagMap) {
    writeFileSync(join(tagOutDir, `${tag}.json`), JSON.stringify(items));
  }

  // 热门标签（按漫画数降序，取前 10）
  const comicTags = [...tagMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([name, items]) => ({ name, count: items.length }));

  // 详情 JSON（含完整 chapters）
  for (const c of comics) {
    const detail = {
      id: c.id,
      title: c.title,
      cover: c.cover,
      verticalCover: c.verticalCover || c.cover,
      summary: c.summary || '',
      tags: c.tags || [],
      chapterCount: c.chapterCount || 0,
      countBrowse: c.countBrowse || 0,
      countCollect: c.countCollect || 0,
      countLike: c.countLike || 0,
      chapters: (c.chapters || []).map(ch => ch.url || ch.path || ''),
    };
    writeFileSync(join(comicOutDir, `${c.id}.json`), JSON.stringify(detail));
  }

  return { comicCount: comics.length, comicTags };
}
