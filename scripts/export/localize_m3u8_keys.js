#!/usr/bin/env node

/**
 * 批量本地化 m3u8 的 AES-128 key，并按内容去重：
 * 1) 从 m3u8 中解析 `#EXT-X-KEY` 的 URI
 * 2) 获取 key（支持远端 URI，也支持已本地化的 keys/*.key）
 * 3) 按 key 内容 SHA256 生成唯一 key 文件名
 * 4) 把 m3u8 的 URI 改为本地相对路径
 * 5) 可选清理未被任何 m3u8 引用的旧 key 文件
 *
 * key 命名规则：
 *   keys/key_<sha256>.key
 *
 * 使用示例：
 *   node /var/zip/jiuyao/scripts/export/localize_m3u8_keys.js
 *
 * 可选环境变量：
 *   M3U8_DIR=/var/zip/jiuyao/m3u8 \
 *   BASE_URL=https://d3vfkhk0c6rox6.cloudfront.net \
 *   CLEAN_UNUSED_KEYS=1 \
 *   node /var/zip/jiuyao/scripts/export/localize_m3u8_keys.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const M3U8_DIR = process.env.M3U8_DIR || '/var/zip/jiuyao/m3u8';
const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';
const CLEAN_UNUSED_KEYS = String(process.env.CLEAN_UNUSED_KEYS || '1') !== '0';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function runCurl(args, asBinary = false) {
  const res = spawnSync('curl', args, {
    encoding: asBinary ? 'buffer' : 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const stderr = asBinary ? String(res.stderr || '') : (res.stderr || '');
    throw new Error(stderr.trim() || `curl exit ${res.status}`);
  }
  return res.stdout;
}

function concatBuffers(...buffers) {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = Buffer.alloc(total);
  let p = 0;
  for (const b of buffers) {
    b.copy(out, p);
    p += b.length;
  }
  return out;
}

function decryptResponseData(data) {
  // 站点接口 hash=true 响应的解密参数
  const interfaceKey = '65dc07d1b7915c6b2937432b091837a7';
  const be = Buffer.from(interfaceKey, 'utf8');
  const t = Buffer.from(String(data).trim(), 'base64');
  const i = t.subarray(0, 12);
  const n = concatBuffers(be, i);
  const half = n.length >> 1;

  const c = crypto.createHash('sha256').update(n).digest().subarray(8, 24);
  const r = concatBuffers(c, n.subarray(0, half));
  const d = concatBuffers(n.subarray(half), c);

  const A = crypto.createHash('sha256').update(r).digest();
  const m = crypto.createHash('sha256').update(d).digest();
  const key = concatBuffers(A.subarray(0, 8), m.subarray(8, 24), A.subarray(24));
  const iv = concatBuffers(m.subarray(0, 4), A.subarray(12, 20), m.subarray(28));

  const payload = t.subarray(12);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function parseApiResponse(text) {
  const j = JSON.parse(text);
  return {
    raw: j,
    data: j && j.hash && j.data ? decryptResponseData(j.data) : (j.data ?? j),
  };
}

function loginAndBuildHeaders() {
  // 仅在需要从远端下载 key 时登录，避免不必要请求
  const devID = `m3u8key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userAgent = `BuildID=com.abc.Butterfly;SysType=iOS;DevID=${devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`;

  const loginTxt = runCurl([
    '-sS',
    '-L',
    `${BASE_URL}/api/app/mine/login/h5`,
    '-H',
    'Content-Type: application/json',
    '--data',
    JSON.stringify({
      devID,
      sysType: 'ios',
      cutInfos: '{}',
      isAppStore: false,
    }),
  ]);

  const loginData = parseApiResponse(String(loginTxt)).data;
  if (!loginData || !loginData.token) {
    throw new Error('登录失败：未拿到 token');
  }

  return [
    '-H', `Authorization: ${loginData.token}`,
    '-H', 'temp: test',
    '-H', `X-User-Agent: ${userAgent}`,
  ];
}

function extractKeyUri(line) {
  // 从 `#EXT-X-KEY:...URI="..."...` 提取 URI
  const m = line.match(/URI="([^"]+)"/);
  return m ? m[1] : null;
}

function replaceKeyUri(line, newUri) {
  return line.replace(/URI="([^"]+)"/, `URI="${newUri}"`);
}

function toAbsoluteKeyUrl(uri) {
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith('/')) return `${BASE_URL}${uri}`;
  return `${BASE_URL}/${uri}`;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveLocalKeyPath(relUri) {
  // 防止路径穿越，确保 key 路径在 M3U8_DIR 内
  const normalized = path.normalize(path.join(M3U8_DIR, relUri));
  const root = path.normalize(`${M3U8_DIR}${path.sep}`);
  if (!normalized.startsWith(root)) return null;
  return normalized;
}

function main() {
  if (!fs.existsSync(M3U8_DIR)) {
    throw new Error(`目录不存在: ${M3U8_DIR}`);
  }

  const files = fs.readdirSync(M3U8_DIR)
    .filter((name) => name.toLowerCase().endsWith('.m3u8'))
    .sort();

  if (!files.length) {
    throw new Error(`目录内没有 .m3u8 文件: ${M3U8_DIR}`);
  }

  const keyDir = path.join(M3U8_DIR, 'keys');
  fs.mkdirSync(keyDir, { recursive: true });

  let cachedHeaders = null;
  function getHeaders() {
    if (!cachedHeaders) {
      cachedHeaders = loginAndBuildHeaders();
    }
    return cachedHeaders;
  }

  const referencedKeyFiles = new Set();
  const results = [];

  for (const fileName of files) {
    const m3u8Path = path.join(M3U8_DIR, fileName);
    const text = fs.readFileSync(m3u8Path, 'utf8');
    const lines = text.split(/\r?\n/);

    const keyLineIndex = lines.findIndex((line) => line.startsWith('#EXT-X-KEY:'));
    if (keyLineIndex < 0) {
      results.push({ fileName, skipped: 'missing_key_line' });
      continue;
    }

    const oldLine = lines[keyLineIndex];
    const oldUri = extractKeyUri(oldLine);
    if (!oldUri) {
      results.push({ fileName, skipped: 'missing_key_uri' });
      continue;
    }

    let keyBuffer = null;
    let keySource = '';

    // 优先复用已本地化 key；否则从远端下载
    if (oldUri.startsWith('keys/')) {
      const localPath = resolveLocalKeyPath(oldUri);
      if (!localPath || !fs.existsSync(localPath)) {
        throw new Error(`${fileName} 引用的本地 key 不存在：${oldUri}`);
      }
      keyBuffer = fs.readFileSync(localPath);
      keySource = oldUri;
    } else {
      const keyUrl = toAbsoluteKeyUrl(oldUri);
      keyBuffer = runCurl(['-sS', '-L', keyUrl, ...getHeaders()], true);
      keySource = keyUrl;
    }

    if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length === 0) {
      throw new Error(`${fileName} 获取 key 失败：内容为空`);
    }

    const hash = sha256Hex(keyBuffer);
    const canonicalKeyName = `key_${hash}.key`;
    const canonicalKeyPath = path.join(keyDir, canonicalKeyName);
    const newUri = `keys/${canonicalKeyName}`;

    // 只在新 hash 出现时写入新 key
    if (!fs.existsSync(canonicalKeyPath)) {
      fs.writeFileSync(canonicalKeyPath, keyBuffer);
    } else {
      const existing = fs.readFileSync(canonicalKeyPath);
      if (!existing.equals(keyBuffer)) {
        throw new Error(`检测到 hash 冲突：${canonicalKeyName}`);
      }
    }

    lines[keyLineIndex] = replaceKeyUri(oldLine, newUri);
    fs.writeFileSync(m3u8Path, lines.join('\n'), 'utf8');

    referencedKeyFiles.add(canonicalKeyName);
    results.push({
      fileName,
      oldUri,
      newUri,
      keySource,
      keyHash: hash,
      keySize: keyBuffer.length,
    });

    log(`已处理 ${fileName} -> ${newUri}`);
  }

  const removedUnused = [];
  if (CLEAN_UNUSED_KEYS) {
    // 删除未被任何 m3u8 引用的 key，保证目录只保留有效版本
    const allKeyFiles = fs.readdirSync(keyDir)
      .filter((name) => name.toLowerCase().endsWith('.key'));

    for (const keyName of allKeyFiles) {
      if (!referencedKeyFiles.has(keyName)) {
        fs.unlinkSync(path.join(keyDir, keyName));
        removedUnused.push(keyName);
      }
    }
  }

  console.log(JSON.stringify({
    m3u8Dir: M3U8_DIR,
    keyDir,
    totalM3u8: files.length,
    referencedKeyCount: referencedKeyFiles.size,
    removedUnusedCount: removedUnused.length,
    removedUnused,
    results,
  }, null, 2));
}

main();
