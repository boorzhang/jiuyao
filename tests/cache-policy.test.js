import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('_headers 为 HTML、release 指针和静态资产定义分层缓存', () => {
  const headersFile = readFileSync('src/frontend/_headers', 'utf-8');

  assert.ok(headersFile.includes('/release.json'));
  assert.ok(headersFile.includes('/assets/*'));
  assert.ok(headersFile.includes('Cache-Control: no-store'));
  assert.ok(headersFile.includes('immutable'));
});

test('Service Worker 按 releaseId 分代缓存，并保持 m3u8 network-only / JSON network-first', () => {
  const swFile = readFileSync('src/frontend/sw.js', 'utf-8');

  assert.ok(swFile.includes('releaseId'));
  assert.ok(swFile.includes('network only'));
  assert.ok(swFile.includes('network-first'));
  assert.ok(swFile.includes('.m3u8'));
});
