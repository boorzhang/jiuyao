import { readFileSync, readdirSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCategories } from './categories.js';
import { buildFeeds } from './feeds.js';
import { buildRecommend } from './recommend.js';
import { buildDetails } from './details.js';
import { buildAuthors } from './authors.js';
import { buildConfig } from './config.js';

const ROOT = process.env.JIUYAO_ROOT || process.cwd();
const OUT_DIR = join(ROOT, 'r2-data');
const BY_ID_DIR = join(ROOT, '_by_id');
const BY_TAGS_DIR = join(ROOT, '_by_tags');
const COMMENTS_DIR = join(ROOT, 'comments', '_by_id');
const M3U8_DIR = join(ROOT, 'm3u8');

console.log('=== Jiuyao 数据构建 ===');
console.log(`源数据目录: ${ROOT}`);
console.log(`输出目录: ${OUT_DIR}`);

// 1. 读取全部视频到内存
console.log('\n[1/6] 读取全部视频...');
const files = readdirSync(BY_ID_DIR).filter(f => f.endsWith('.json'));
const videoMap = new Map();
for (const f of files) {
  const data = JSON.parse(readFileSync(join(BY_ID_DIR, f), 'utf-8'));
  videoMap.set(data.id, data);
}
console.log(`  已加载 ${videoMap.size} 个视频`);

const allVideos = [...videoMap.values()];

// 2. 分类分页
console.log('\n[2/6] 构建分类分页...');
const { categories } = buildCategories(videoMap, BY_TAGS_DIR, OUT_DIR);
console.log(`  生成 ${categories.length} 个分类:`);
for (const c of categories) {
  console.log(`    ${c.name}: ${c.count} 个视频, ${c.totalPages} 页`);
}

// 3. Feed 分页
console.log('\n[3/6] 构建 Feed 分页...');
const feeds = buildFeeds(allVideos, OUT_DIR);
console.log(`  推荐 feed: ${feeds.recommend.totalPages} 页`);
console.log(`  最新 feed: ${feeds.latest.totalPages} 页`);

// 4. 推荐
console.log('\n[4/6] 构建推荐...');
buildRecommend(allVideos, OUT_DIR);
console.log(`  已为 ${allVideos.length} 个视频生成推荐`);

// 5. 详情 + 评论
console.log('\n[5/7] 构建详情和评论...');
const { detailCount, commentCount } = buildDetails(videoMap, COMMENTS_DIR, OUT_DIR);
console.log(`  详情: ${detailCount}, 评论: ${commentCount}`);

// 6. 作者
console.log('\n[6/7] 构建作者数据...');
const { authorCount } = buildAuthors(allVideos, OUT_DIR);
console.log(`  作者: ${authorCount}`);

// 7. M3U8 复制
console.log('\n[7/7] 复制 M3U8...');
if (existsSync(M3U8_DIR)) {
  const m3u8Out = join(OUT_DIR, 'm3u8');
  mkdirSync(m3u8Out, { recursive: true });
  cpSync(M3U8_DIR, m3u8Out, {
    recursive: true,
    filter: (src) => {
      // 只复制 .m3u8 和 keys/ 目录
      if (src.endsWith('.ndjson') || src.endsWith('_summary.json')) return false;
      return true;
    }
  });
  console.log('  M3U8 复制完成');
}

// 7. Config
console.log('\n[8/8] 生成 config.json...');
const config = buildConfig(OUT_DIR, {
  categories,
  feeds,
  totalVideos: videoMap.size,
  r2Base: process.env.R2_BASE || '',
});
console.log(`  版本: ${config.version}`);

console.log('\n=== 构建完成 ===');
console.log(`总视频: ${videoMap.size}`);
console.log(`分类: ${categories.length}`);
console.log(`输出目录: ${OUT_DIR}`);
