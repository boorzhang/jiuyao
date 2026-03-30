import test from 'node:test';
import assert from 'node:assert/strict';

let releaseLib;
try {
  releaseLib = await import('../scripts/lib/release.js');
} catch {
  releaseLib = null;
}

test('resolveReleaseId 优先使用显式的 RELEASE_ID', () => {
  assert.equal(typeof releaseLib?.resolveReleaseId, 'function');

  const releaseId = releaseLib.resolveReleaseId({
    RELEASE_ID: 'manual-release',
    GITHUB_SHA: 'abcdef1234567890',
  });

  assert.equal(releaseId, 'manual-release');
});

test('resolveReleaseId 在未提供 RELEASE_ID 时回退到 GITHUB_SHA 前 12 位', () => {
  assert.equal(typeof releaseLib?.resolveReleaseId, 'function');

  const releaseId = releaseLib.resolveReleaseId({
    GITHUB_SHA: '1234567890abcdef1234567890abcdef',
  });

  assert.equal(releaseId, '1234567890ab');
});

test('buildReleaseManifest 生成完整的发布清单字段', () => {
  assert.equal(typeof releaseLib?.buildReleaseManifest, 'function');

  const manifest = releaseLib.buildReleaseManifest({
    releaseId: 'release-001',
    generatedAt: '2026-03-27T12:34:56.000Z',
    dataBase: 'https://static.example.com/releases/release-001',
    apiBase: 'https://api.example.com',
    assetPrefix: '/assets/release-001',
  });

  assert.deepEqual(manifest, {
    releaseId: 'release-001',
    generatedAt: '2026-03-27T12:34:56.000Z',
    pagesBase: '',
    dataBase: 'https://static.example.com/releases/release-001',
    m3u8Base: '',
    apiBase: 'https://api.example.com',
    assetPrefix: '/assets/release-001',
  });
});
