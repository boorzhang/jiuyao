import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let buildReleaseMod;
try {
  buildReleaseMod = await import('../scripts/build-release.js');
} catch {
  buildReleaseMod = null;
}

function writeJson(filePath, data) {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function createFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'jiuyao-build-release-'));

  mkdirSync(join(root, 'src', 'frontend', 'css'), { recursive: true });
  mkdirSync(join(root, 'src', 'frontend', 'js'), { recursive: true });
  mkdirSync(join(root, '_by_id'), { recursive: true });
  mkdirSync(join(root, '_by_tags', '测试分类'), { recursive: true });
  mkdirSync(join(root, 'comments', '_by_id'), { recursive: true });
  mkdirSync(join(root, 'm3u8'), { recursive: true });

  writeFileSync(
    join(root, 'src', 'frontend', 'index.html'),
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Fixture</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>`
  );
  writeFileSync(join(root, 'src', 'frontend', 'css', 'styles.css'), 'body { color: #111; }');
  writeFileSync(join(root, 'src', 'frontend', 'js', 'app.js'), 'console.log("fixture");');
  writeFileSync(join(root, 'src', 'frontend', 'manifest.json'), '{"name":"fixture"}');

  const video = {
    id: 'video-001',
    title: '测试视频',
    newsType: 'SP',
    categoryList: ['测试分类'],
    raw: {
      title: '测试视频',
      cover: 'cover/video-001.jpg',
      playCount: 123,
      playTime: 66,
      likeCount: 4,
      commentCount: 0,
      collectCount: 0,
      coins: 0,
      originCoins: 0,
      freeArea: true,
      tags: [{ name: '标签A', id: 'tag-a' }],
      publisher: {
        uid: 'author-001',
        name: '作者A',
        portrait: '',
      },
      createdAt: '2026-03-26T08:00:00.000Z',
    },
  };

  writeJson(join(root, '_by_id', 'VIDvideo-001.json'), video);
  writeFileSync(join(root, '_by_tags', '测试分类', 'VIDvideo-001.json'), '{}');
  writeFileSync(join(root, 'm3u8', 'VIDvideo-001.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\n');

  return root;
}

test('buildRelease 同时生成 dist/release.json 与 r2-data/data/config.json，且 releaseId 一致', async () => {
  assert.equal(typeof buildReleaseMod?.buildRelease, 'function');

  const root = createFixtureRoot();
  try {
    const result = await buildReleaseMod.buildRelease({
      root,
      releaseId: 'test-release-001',
      generatedAt: '2026-03-27T10:00:00.000Z',
      dataBase: 'https://static.example.com/releases/test-release-001',
      apiBase: 'https://api.example.com',
    });

    const releasePath = join(root, 'dist', 'release.json');
    const configPath = join(root, 'r2-data', 'data', 'config.json');
    const indexPath = join(root, 'dist', 'index.html');
    const assetJsPath = join(root, 'dist', 'assets', 'test-release-001', 'js', 'app.js');
    const m3u8Path = join(root, 'r2-data', 'm3u8', 'VIDvideo-001.m3u8');

    assert.equal(result.releaseId, 'test-release-001');
    assert.equal(existsSync(releasePath), true);
    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(assetJsPath), true);
    assert.equal(existsSync(m3u8Path), true);

    const releaseJson = JSON.parse(readFileSync(releasePath, 'utf-8'));
    const configJson = JSON.parse(readFileSync(configPath, 'utf-8'));
    const indexHtml = readFileSync(indexPath, 'utf-8');

    assert.equal(releaseJson.releaseId, 'test-release-001');
    assert.equal(configJson.releaseId, 'test-release-001');
    assert.equal(configJson.generatedAt, '2026-03-27T10:00:00.000Z');
    assert.equal(configJson.r2Base, 'https://static.example.com/releases/test-release-001');
    assert.match(indexHtml, /\/assets\/test-release-001\/css\/styles\.css/);
    assert.match(indexHtml, /\/assets\/test-release-001\/js\/app\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
