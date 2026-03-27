import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('首页包含移动端分类横滑提示和桌面端响应式卡片列数', () => {
  const indexHtml = readFileSync('src/frontend/index.html', 'utf-8');
  const homeJs = readFileSync('src/frontend/js/pages/home.js', 'utf-8');
  const stylesCss = readFileSync('src/frontend/css/styles.css', 'utf-8');

  assert.ok(indexHtml.includes('catTabsHint'));
  assert.ok(homeJs.includes('syncCatTabsHint'));
  assert.ok(stylesCss.includes('.cat-tabs-hint'));
  assert.ok(stylesCss.includes('@media (min-width: 768px)'));
  assert.ok(stylesCss.includes('repeat(3, minmax(0, 1fr))'));
  assert.ok(stylesCss.includes('repeat(4, minmax(0, 1fr))'));
});

test('抖音页使用媒体容器和横竖版适配类，保证画面完整可见且不溢出', () => {
  const douyinJs = readFileSync('src/frontend/js/pages/douyin.js', 'utf-8');
  const stylesCss = readFileSync('src/frontend/css/styles.css', 'utf-8');

  assert.ok(douyinJs.includes('sv-media-shell'));
  assert.ok(douyinJs.includes('setSlideMediaOrientation'));
  assert.ok(douyinJs.includes('loadedmetadata'));
  assert.ok(stylesCss.includes('.sv-media-shell'));
  assert.ok(stylesCss.includes('.sv-backdrop'));
  assert.ok(stylesCss.includes('.dy-slide.is-landscape'));
  assert.ok(stylesCss.includes('.dy-slide.is-portrait'));
});

test('本地开发提供 release.json，避免首页启动时把 HTML 当成 manifest 解析', () => {
  assert.equal(existsSync('src/frontend/release.json'), true);

  const releaseJson = JSON.parse(readFileSync('src/frontend/release.json', 'utf-8'));
  assert.equal(releaseJson.dataBase, 'http://localhost:3001');
  assert.equal(typeof releaseJson.releaseId, 'string');
  assert.ok(releaseJson.releaseId.length > 0);
});

test('首页使用非废弃的移动端 PWA meta 标签', () => {
  const indexHtml = readFileSync('src/frontend/index.html', 'utf-8');

  assert.ok(indexHtml.includes('mobile-web-app-capable'));
  assert.ok(!indexHtml.includes('apple-mobile-web-app-capable'));
});
