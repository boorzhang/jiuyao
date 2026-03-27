import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('首页改为加载仓库内固定版本的 HLS 播放器', () => {
  const indexHtml = readFileSync('src/frontend/index.html', 'utf-8');

  assert.ok(!indexHtml.includes('hls.js@latest'));
  assert.ok(indexHtml.includes('/vendor/hls.min.js'));
  assert.equal(existsSync('src/frontend/vendor/hls.min.js'), true);
});

test('前端启动先读取 release.json，并把版本基址传给 API 层', () => {
  const appJs = readFileSync('src/frontend/js/app.js', 'utf-8');
  const apiJs = readFileSync('src/frontend/js/api.js', 'utf-8');

  assert.ok(appJs.includes('/release.json'));
  assert.ok(appJs.includes('applyReleaseConfig'));
  assert.ok(appJs.includes('releaseId='));
  assert.ok(apiJs.includes('clearCache'));
  assert.ok(apiJs.includes('setR2Base'));
});
