import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 发布版本辅助工具。
 *
 * 使用示例：
 * ```js
 * import { resolveReleaseId, buildReleaseManifest } from './lib/release.js';
 *
 * const releaseId = resolveReleaseId(process.env);
 * const manifest = buildReleaseManifest({ releaseId });
 * ```
 */

/**
 * 解析当前发布版本号。
 * 优先级：RELEASE_ID > GITHUB_SHA 前 12 位 > UTC 时间戳。
 */
export function resolveReleaseId(env = process.env) {
  const explicitReleaseId = normalizeReleaseId(env.RELEASE_ID || '');
  if (explicitReleaseId) {
    return explicitReleaseId;
  }

  const githubSha = normalizeReleaseId((env.GITHUB_SHA || '').slice(0, 12));
  if (githubSha) {
    return githubSha;
  }

  return buildTimestampReleaseId();
}

/**
 * 构建统一的 release manifest。
 */
export function buildReleaseManifest({
  releaseId,
  generatedAt = new Date().toISOString(),
  pagesBase = '',
  dataBase = '',
  apiBase = '',
  assetPrefix = '',
} = {}) {
  if (!releaseId) {
    throw new Error('releaseId 不能为空');
  }

  return {
    releaseId,
    generatedAt,
    pagesBase,
    dataBase,
    apiBase,
    assetPrefix: assetPrefix || `/assets/${releaseId}`,
  };
}

/**
 * 把对象稳定写成 JSON 文件。
 */
export function writeJsonFile(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeReleaseId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
}

function buildTimestampReleaseId(date = new Date()) {
  const iso = date.toISOString();
  return iso.replace(/[-:TZ.]/g, '').slice(0, 14);
}
