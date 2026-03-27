import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 生成 config.json
 */
export function buildConfig(outDir, { categories, feeds, totalVideos, r2Base }) {
  mkdirSync(join(outDir, 'data'), { recursive: true });

  const config = {
    version: new Date().toISOString().slice(0, 10),
    cdnBase: 'https://imgosne.qqdanb.cn',
    r2Base: r2Base || '',
    categories,
    feeds,
    totalVideos,
  };

  writeFileSync(join(outDir, 'data', 'config.json'), JSON.stringify(config, null, 2));
  return config;
}
