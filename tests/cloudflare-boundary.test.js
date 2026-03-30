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

test('R2 上传脚本使用固定前缀、增量上传和分层缓存头', () => {
  const script = readFileSync('scripts/upload-r2.sh', 'utf-8');

  // 固定前缀（不含 release）
  assert.ok(!script.includes('releases/$RELEASE_ID'));
  assert.ok(script.includes('--dry-run'));
  assert.ok(script.includes('--full'));
  assert.ok(script.includes('.r2-uploaded.txt'));
  assert.ok(script.includes('max-age=300'));
  assert.ok(script.includes('max-age=60'));
  assert.ok(script.includes('max-age=86400'));
});

test('GitHub Actions 执行 build:release 并部署到 Pages', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf-8');

  assert.ok(workflow.includes('RELEASE_ID'));
  assert.ok(workflow.includes('npm ci'));
  assert.ok(workflow.includes('npm run build:release'));
  assert.ok(workflow.includes('pages deploy dist/'));
});
