import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildFrontend } from './build-frontend.js';
import { buildData } from '../src/build/index.js';
import { buildReleaseManifest, resolveReleaseId, writeJsonFile } from './lib/release.js';

/**
 * 统一执行发布构建。
 *
 * 使用示例：
 * ```bash
 * RELEASE_ID=20260327-demo DATA_BASE=https://static.example.com/releases/20260327-demo node scripts/build-release.js
 * ```
 */
export async function buildRelease({
  root = process.cwd(),
  env = process.env,
  releaseId = resolveReleaseId(env),
  generatedAt = new Date().toISOString(),
  pagesBase = env.PAGES_BASE || '',
  dataBase = env.DATA_BASE || env.R2_BASE || '',
  m3u8Base = env.M3U8_BASE || '',
  apiBase = env.API_BASE || '',
  assetPrefix = `/assets/${releaseId}`,
} = {}) {
  const frontend = buildFrontend({ root, releaseId });

  // CI 环境没有本地原始数据目录，跳过数据构建（数据已通过 upload:r2 单独上传至 R2）
  const hasLocalData = existsSync(join(root, '_by_id'));
  const data = hasLocalData
    ? buildData({ root, releaseId, generatedAt, r2Base: dataBase, assetPrefix })
    : null;

  const manifest = buildReleaseManifest({
    releaseId,
    generatedAt,
    pagesBase,
    dataBase,
    m3u8Base,
    apiBase,
    assetPrefix,
  });

  writeJsonFile(join(root, 'dist', 'release.json'), manifest);

  return {
    releaseId,
    generatedAt,
    assetPrefix: frontend.assetPrefix,
    manifest,
    data,
  };
}

const isMainModule = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  const result = await buildRelease();
  const dataStatus = result.data ? '含数据构建' : '仅前端（无本地数据目录）';
  console.log(`统一发布构建完成: ${result.releaseId} [${dataStatus}]`);
}
