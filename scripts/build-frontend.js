import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveReleaseId } from './lib/release.js';

/**
 * 构建前端静态壳，并把高复用静态资源复制到带 releaseId 的资产目录。
 *
 * 使用示例：
 * ```bash
 * RELEASE_ID=20260327-demo node scripts/build-frontend.js
 * ```
 */
export function buildFrontend({
  root = process.cwd(),
  releaseId = resolveReleaseId(process.env),
} = {}) {
  const srcDir = join(root, 'src', 'frontend');
  const distDir = join(root, 'dist');
  const assetDir = join(distDir, 'assets', releaseId);
  const assetPrefix = `/assets/${releaseId}`;

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  cpSync(srcDir, distDir, { recursive: true });

  copyAssetDir(srcDir, assetDir, 'css');
  copyAssetDir(srcDir, assetDir, 'js');
  copyAssetDir(srcDir, assetDir, 'vendor');

  const indexPath = join(srcDir, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf-8');
    writeFileSync(join(distDir, 'index.html'), rewriteIndexHtml(html, assetPrefix));
  }

  console.log(`前端文件已构建到 ${distDir}`);
  console.log(`静态资源前缀: ${assetPrefix}`);

  return {
    distDir,
    releaseId,
    assetPrefix,
  };
}

function copyAssetDir(srcDir, assetDir, dirName) {
  const source = join(srcDir, dirName);
  if (!existsSync(source)) {
    return;
  }

  const target = join(assetDir, dirName);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function rewriteIndexHtml(html, assetPrefix) {
  return html
    .replace(/(["'])\/css\//g, `$1${assetPrefix}/css/`)
    .replace(/(["'])css\//g, `$1${assetPrefix}/css/`)
    .replace(/(["'])\/js\//g, `$1${assetPrefix}/js/`)
    .replace(/(["'])js\//g, `$1${assetPrefix}/js/`)
    .replace(/(["'])\/vendor\//g, `$1${assetPrefix}/vendor/`)
    .replace(/(["'])vendor\//g, `$1${assetPrefix}/vendor/`);
}

const isMainModule = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  buildFrontend();
}
