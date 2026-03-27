import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('wrangler 配置不再使用 [site] 托管 dist', () => {
  const wranglerToml = readFileSync('wrangler.toml', 'utf-8');
  assert.ok(!wranglerToml.includes('[site]'));
  assert.ok(wranglerToml.includes('main = "src/worker/index.js"'));
});

test('Cloudflare 静态边界文档存在并明确 Pages / R2 / Worker 职责', () => {
  const docPath = 'docs/cloudflare-static-boundary.md';
  assert.equal(existsSync(docPath), true);

  const content = readFileSync(docPath, 'utf-8');
  assert.ok(content.includes('Pages'));
  assert.ok(content.includes('R2'));
  assert.ok(content.includes('Worker'));
  assert.ok(content.includes('禁止把 `/data/*`'));
});

test('R2 上传脚本使用 release 前缀、dry-run 和分层缓存头', () => {
  const script = readFileSync('scripts/upload-r2.sh', 'utf-8');

  assert.ok(script.includes('releases/$RELEASE_ID/data'));
  assert.ok(script.includes('releases/$RELEASE_ID/m3u8'));
  assert.ok(script.includes('--dry-run'));
  assert.ok(script.includes('max-age=300'));
  assert.ok(script.includes('max-age=60'));
  assert.ok(script.includes('max-age=86400'));
});

test('GitHub Actions 使用统一 RELEASE_ID 执行 build:release 与 upload:r2', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf-8');

  assert.ok(workflow.includes('RELEASE_ID'));
  assert.ok(workflow.includes('npm ci'));
  assert.ok(workflow.includes('npm run build:release'));
  assert.ok(workflow.includes('npm run upload:r2'));
  assert.ok(workflow.includes('pages deploy dist/'));
});
