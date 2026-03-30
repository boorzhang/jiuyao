import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 生成 config.json
 */
export function buildConfig(outDir, {
  categories,
  feeds,
  totalVideos,
  totalComics = 0,
  comicTags = [],
  r2Base,
  releaseId,
  generatedAt,
  assetPrefix = '',
}) {
  mkdirSync(join(outDir, 'data'), { recursive: true });

  const config = {
    version: releaseId || new Date().toISOString().slice(0, 10),
    releaseId: releaseId || '',
    generatedAt: generatedAt || new Date().toISOString(),
    assetPrefix,
    cdnBase: 'https://imgosne.qqdanb.cn',
    r2Base: r2Base || '',
    categories,
    feeds,
    totalVideos,
    totalComics,
    comicTags,
  };

  writeFileSync(join(outDir, 'data', 'config.json'), JSON.stringify(config, null, 2));
  return config;
}
