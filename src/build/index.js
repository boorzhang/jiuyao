import { readFileSync, readdirSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCategories } from './categories.js';
import { buildFeeds } from './feeds.js';
import { buildRecommend } from './recommend.js';
import { buildDetails } from './details.js';
import { buildAuthors } from './authors.js';
import { buildConfig } from './config.js';

/**
 * 构建 R2 数据产物。
 *
 * 使用示例：
 * ```bash
 * RELEASE_ID=20260327-demo R2_BASE=https://static.example.com/releases/20260327-demo node src/build/index.js
 * ```
 */
export function buildData({
  root = process.env.JIUYAO_ROOT || process.cwd(),
  outDir = join(root, 'r2-data'),
  releaseId = process.env.RELEASE_ID || '',
  generatedAt = new Date().toISOString(),
  r2Base = process.env.R2_BASE || '',
  assetPrefix = '',
} = {}) {
  const byIdDir = join(root, '_by_id');
  const tagsDir = join(root, '_by_tags');
  const commentsDir = join(root, 'comments', '_by_id');
  const m3u8Dir = join(root, 'm3u8');

  console.log('=== Jiuyao 数据构建 ===');
  console.log(`源数据目录: ${root}`);
  console.log(`输出目录: ${outDir}`);

  mkdirSync(outDir, { recursive: true });

  console.log('\n[1/6] 读取全部视频...');
  const files = readdirSync(byIdDir).filter(f => f.endsWith('.json'));
  const videoMap = new Map();
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(byIdDir, f), 'utf-8'));
    videoMap.set(data.id, data);
  }
  console.log(`  已加载 ${videoMap.size} 个视频`);

  const allVideos = [...videoMap.values()];

  console.log('\n[2/6] 构建分类分页...');
  const { categories } = buildCategories(videoMap, tagsDir, outDir);
  console.log(`  生成 ${categories.length} 个分类:`);
  for (const c of categories) {
    console.log(`    ${c.name}: ${c.count} 个视频, ${c.totalPages} 页`);
  }

  console.log('\n[3/6] 构建 Feed 分页...');
  const feeds = buildFeeds(allVideos, outDir);
  console.log(`  推荐 feed: ${feeds.recommend.totalPages} 页`);
  console.log(`  最新 feed: ${feeds.latest.totalPages} 页`);

  console.log('\n[4/6] 构建推荐...');
  buildRecommend(allVideos, outDir);
  console.log(`  已为 ${allVideos.length} 个视频生成推荐`);

  console.log('\n[5/7] 构建详情和评论...');
  const { detailCount, commentCount } = buildDetails(videoMap, commentsDir, outDir);
  console.log(`  详情: ${detailCount}, 评论: ${commentCount}`);

  console.log('\n[6/7] 构建作者数据...');
  const { authorCount } = buildAuthors(allVideos, outDir);
  console.log(`  作者: ${authorCount}`);

  console.log('\n[7/7] 复制 M3U8...');
  if (existsSync(m3u8Dir)) {
    const m3u8Out = join(outDir, 'm3u8');
    mkdirSync(m3u8Out, { recursive: true });
    cpSync(m3u8Dir, m3u8Out, {
      recursive: true,
      filter: (src) => {
        if (src.endsWith('.ndjson') || src.endsWith('_summary.json')) return false;
        return true;
      },
    });
    console.log('  M3U8 复制完成');
  }

  console.log('\n[8/8] 生成 config.json...');
  const config = buildConfig(outDir, {
    categories,
    feeds,
    totalVideos: videoMap.size,
    r2Base,
    releaseId,
    generatedAt,
    assetPrefix,
  });
  console.log(`  版本: ${config.version}`);

  console.log('\n=== 构建完成 ===');
  console.log(`总视频: ${videoMap.size}`);
  console.log(`分类: ${categories.length}`);
  console.log(`输出目录: ${outDir}`);

  return {
    releaseId,
    generatedAt,
    categories,
    feeds,
    totalVideos: videoMap.size,
    detailCount,
    commentCount,
    authorCount,
    config,
    outDir,
  };
}

const isMainModule = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  buildData();
}
