#!/usr/bin/env node

/**
 * 对失败清单做二次补抓（低并发重试）。
 *
 * 功能说明：
 * 1) 从错误日志读取失败的 `VID*.json` 文件名
 * 2) 重新请求 m3u8 并回写 `_by_id` + `m3u8/VID*.m3u8`
 * 3) 复用现有共享 key 文件（不重复下载 key）
 *
 * 使用示例：
 *   node /var/zip/jiuyao/scripts/export/retry_failed_m3u8.js
 *
 * 可选环境变量：
 *   SOURCE_DIR=/var/zip/jiuyao/_by_id \
 *   M3U8_DIR=/var/zip/jiuyao/m3u8 \
 *   ERROR_NDJSON=/var/zip/jiuyao/m3u8/_refresh_errors.ndjson \
 *   CONCURRENCY=8 \
 *   RETRIES=8 \
 *   node /var/zip/jiuyao/scripts/export/retry_failed_m3u8.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SOURCE_DIR = process.env.SOURCE_DIR || '/var/zip/jiuyao/_by_id';
const M3U8_DIR = process.env.M3U8_DIR || '/var/zip/jiuyao/m3u8';
const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';
const ERROR_NDJSON = process.env.ERROR_NDJSON || '/var/zip/jiuyao/m3u8/_refresh_errors.ndjson';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 8));
const RETRIES = Math.max(1, Number(process.env.RETRIES || 8));

const INTERFACE_KEY = '65dc07d1b7915c6b2937432b091837a7';
const PARAM_KEY = 'BxJand%xf5h3sycH';
const PARAM_IV = 'BxJand%xf5h3sycH';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCurl(args, binary = false) {
  return new Promise((resolve, reject) => {
    const cp = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];

    cp.stdout.on('data', (chunk) => out.push(chunk));
    cp.stderr.on('data', (chunk) => err.push(chunk));
    cp.on('error', (e) => reject(e));
    cp.on('close', (code) => {
      if (code !== 0) {
        const msg = Buffer.concat(err).toString('utf8').trim() || `curl exit ${code}`;
        reject(new Error(msg));
        return;
      }
      const buf = Buffer.concat(out);
      resolve(binary ? buf : buf.toString('utf8'));
    });
  });
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
  const be = Buffer.from(INTERFACE_KEY, 'utf8');
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

function encryptParams(params) {
  const normalized = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined) normalized[k] = String(v);
  }

  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(PARAM_KEY, 'utf8'),
    Buffer.from(PARAM_IV, 'utf8')
  );

  return Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(normalized), 'utf8')),
    cipher.final(),
  ]).toString('base64');
}

function parseApiResponse(text) {
  const j = JSON.parse(text);
  return {
    raw: j,
    data: j && j.hash && j.data ? decryptResponseData(j.data) : (j.data ?? j),
  };
}

function decodeTokenPayload(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return {
      timestamp: p.timestamp,
      uid: p.uid,
      type: p.type,
      isoTime: new Date(Math.floor(Number(p.timestamp) / 1e6)).toISOString(),
    };
  } catch {
    return null;
  }
}

function extractKeyUri(m3u8Text) {
  const line = String(m3u8Text)
    .split(/\r?\n/)
    .find((s) => s.startsWith('#EXT-X-KEY:'));
  if (!line) return null;
  const m = line.match(/URI="([^"]+)"/);
  return m ? m[1] : null;
}

function replaceKeyUri(m3u8Text, newUri) {
  return String(m3u8Text).replace(/(#EXT-X-KEY:[^\n]*URI=")([^"]+)("[^\n]*)/, `$1${newUri}$3`);
}

function isLikelyAuthError(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  try {
    const j = JSON.parse(t);
    return Number(j.code) === 4010;
  } catch {
    return t.includes('"code":4010') || t.includes('token') || t.includes('4010');
  }
}

function readFailedFiles(ndjsonPath) {
  if (!fs.existsSync(ndjsonPath)) return [];
  const lines = fs.readFileSync(ndjsonPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const set = new Set();
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j && j.fileName && /^VID.+\.json$/i.test(j.fileName)) set.add(j.fileName);
    } catch {
      // 忽略坏行
    }
  }
  return Array.from(set).sort();
}

async function main() {
  const retryErrorPath = path.join(M3U8_DIR, '_retry_errors.ndjson');
  const retrySummaryPath = path.join(M3U8_DIR, '_retry_summary.json');
  fs.writeFileSync(retryErrorPath, '', 'utf8');

  const failedFiles = readFailedFiles(ERROR_NDJSON);
  if (!failedFiles.length) {
    console.log(JSON.stringify({
      message: '没有可补抓的失败项',
      errorNdjson: ERROR_NDJSON,
    }, null, 2));
    return;
  }

  const keyDir = path.join(M3U8_DIR, 'keys');
  const keyFiles = fs.existsSync(keyDir)
    ? fs.readdirSync(keyDir).filter((n) => n.toLowerCase().endsWith('.key')).sort()
    : [];

  if (!keyFiles.length) {
    throw new Error(`共享 key 文件不存在，请先跑主流程: ${keyDir}`);
  }

  // 约定只保留一个共享 key；如果有多个，优先取第一个并继续
  const sharedKeyFileName = keyFiles[0];
  const sharedKeyUri = `keys/${sharedKeyFileName}`;

  let token = '';
  let devID = '';
  let userAgent = '';
  let reloginCount = 0;
  let reloginPromise = null;

  function buildHeaders() {
    return [
      '-H', `Authorization: ${token}`,
      '-H', 'temp: test',
      '-H', `X-User-Agent: ${userAgent}`,
    ];
  }

  async function doLogin(reason = 'retry') {
    devID = `retry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    userAgent = `BuildID=com.abc.Butterfly;SysType=iOS;DevID=${devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`;

    const loginTxt = await runCurl([
      '-sS',
      '-L',
      `${BASE_URL}/api/app/mine/login/h5`,
      '-H', 'Content-Type: application/json',
      '--data', JSON.stringify({
        devID,
        sysType: 'ios',
        cutInfos: '{}',
        isAppStore: false,
      }),
    ]);

    const loginData = parseApiResponse(loginTxt).data;
    if (!loginData || !loginData.token) {
      throw new Error(`登录失败（${reason}）：未拿到 token`);
    }

    token = loginData.token;
    reloginCount += 1;
  }

  async function ensureRelogin(reason, expectedToken) {
    if (expectedToken && token !== expectedToken) return;
    if (reloginPromise) {
      await reloginPromise;
      return;
    }

    reloginPromise = (async () => {
      await doLogin(reason);
      await sleep(80);
    })();

    try {
      await reloginPromise;
    } finally {
      reloginPromise = null;
    }
  }

  async function apiGet(pathname, params = {}, retries = RETRIES) {
    const encrypted = encodeURIComponent(encryptParams(params));
    const url = `${BASE_URL}/api/app${pathname}${encrypted ? `?data=${encrypted}` : ''}`;

    let lastErr = null;
    for (let i = 0; i < retries; i += 1) {
      const currentToken = token;
      try {
        const txt = await runCurl(['-sS', '-L', url, ...buildHeaders()]);
        const parsed = parseApiResponse(txt);
        if (parsed.raw && Number(parsed.raw.code) === 4010) {
          await ensureRelogin(`api4010:${pathname}`, currentToken);
          continue;
        }
        if (parsed.raw && Number(parsed.raw.code) !== 200) {
          throw new Error(`code=${parsed.raw.code} msg=${parsed.raw.msg || ''}`);
        }
        return parsed.data;
      } catch (err) {
        lastErr = err;
      }
      await sleep(80 * (i + 1));
    }

    throw lastErr;
  }

  await doLogin('retry_init');

  let lineUrl = 'https://s12.qqdanb.cn';
  try {
    const domainData = await apiGet('/ping/domain/h5', {});
    const sourceList = domainData.sourceList || [];
    const vidItem = sourceList.find((x) => x.type === 'VID');
    if (vidItem && Array.isArray(vidItem.domain) && vidItem.domain[0]?.url) {
      lineUrl = vidItem.domain[0].url;
    }
  } catch {
    // 使用默认线路
  }

  async function fetchM3u8BySource(sourceURL) {
    let lastErr = null;

    for (let i = 0; i < RETRIES; i += 1) {
      const currentToken = token;
      const url = `${BASE_URL}/api/app/vid/h5/m3u8/${sourceURL}?token=${currentToken}&c=${encodeURIComponent(lineUrl)}`;

      try {
        const txt = await runCurl(['-sS', '-L', url, ...buildHeaders()]);
        if (txt.includes('#EXTM3U')) {
          return { txt, m3u8Url: url, tokenUsed: currentToken };
        }

        if (isLikelyAuthError(txt)) {
          await ensureRelogin('retry_m3u8_auth', currentToken);
          continue;
        }

        lastErr = new Error('m3u8 内容异常（非 EXTM3U）');
      } catch (err) {
        lastErr = err;
      }

      await sleep(100 * (i + 1));
    }

    throw lastErr || new Error('补抓 m3u8 失败');
  }

  const total = failedFiles.length;
  let done = 0;
  let ok = 0;
  let fail = 0;
  let nextIndex = 0;

  async function processOne(fileName, index) {
    const filePath = path.join(SOURCE_DIR, fileName);

    try {
      const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const videoID = String(obj.id || fileName.replace(/^VID/i, '').replace(/\.json$/i, ''));
      const sourceURL = obj.sourceURL || (obj.raw && obj.raw.sourceURL) || null;
      if (!sourceURL) throw new Error('缺少 sourceURL');

      const fetched = await fetchM3u8BySource(sourceURL);
      const keyUri = extractKeyUri(fetched.txt);
      if (!keyUri) throw new Error('m3u8 未找到 #EXT-X-KEY URI');

      const localized = replaceKeyUri(fetched.txt, sharedKeyUri);
      const m3u8Path = path.join(M3U8_DIR, `VID${videoID}.m3u8`);
      fs.writeFileSync(m3u8Path, localized, 'utf8');

      const updated = {
        ...obj,
        m3u8: fetched.m3u8Url,
        lineUrl,
        baseUrl: BASE_URL,
        tokenPayload: decodeTokenPayload(fetched.tokenUsed),
        fetchedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
      ok += 1;
    } catch (err) {
      fail += 1;
      fs.appendFileSync(retryErrorPath, `${JSON.stringify({
        fileName,
        index,
        error: String(err && err.message ? err.message : err),
        time: new Date().toISOString(),
      })}\n`, 'utf8');
    } finally {
      done += 1;
      if (done % 50 === 0 || done === total) {
        log(`补抓进度 ${done}/${total}, ok=${ok}, fail=${fail}`);
      }
    }
  }

  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= total) return;
      await processOne(failedFiles[i], i);
    }
  }

  log(`开始失败补抓: total=${total}, concurrency=${CONCURRENCY}, retries=${RETRIES}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const summary = {
    finishedAt: new Date().toISOString(),
    sourceDir: SOURCE_DIR,
    m3u8Dir: M3U8_DIR,
    total,
    done,
    ok,
    fail,
    reloginCount,
    lineUrl,
    sharedKeyUri,
    errorNdjson: ERROR_NDJSON,
    retryErrorPath,
  };

  fs.writeFileSync(retrySummaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
