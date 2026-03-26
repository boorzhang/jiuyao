#!/usr/bin/env node

/**
 * 全量重抓 `_by_id` 下视频的 m3u8，并统一使用共享 key 文件。
 *
 * 功能说明：
 * 1) 从 `/var/zip/jiuyao/_by_id` 读取全部 `VID*.json`
 * 2) 重新请求每个视频的 m3u8（带新 token）
 * 3) 仅在首次遇到 key 时下载一次，后续直接复用
 * 4) m3u8 中 `#EXT-X-KEY` 统一改为本地相对路径
 * 5) 回写 `_by_id` 对应 JSON 的 m3u8 地址
 * 6) 最后抽样若干条，远端再取 key 做 hash 比较
 *
 * key 命名规则：
 *   keys/key_<sha256>.key
 *
 * 使用示例：
 *   node /var/zip/jiuyao/scripts/export/refresh_all_m3u8_with_shared_key.js
 *
 * 可选环境变量：
 *   SOURCE_DIR=/var/zip/jiuyao/_by_id \
 *   M3U8_DIR=/var/zip/jiuyao/m3u8 \
 *   BASE_URL=https://d3vfkhk0c6rox6.cloudfront.net \
 *   CONCURRENCY=16 \
 *   RETRIES=5 \
 *   SAMPLE_COUNT=8 \
 *   START_INDEX=0 \
 *   LIMIT=0 \
 *   node /var/zip/jiuyao/scripts/export/refresh_all_m3u8_with_shared_key.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SOURCE_DIR = process.env.SOURCE_DIR || '/var/zip/jiuyao/_by_id';
const M3U8_DIR = process.env.M3U8_DIR || '/var/zip/jiuyao/m3u8';
const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';

const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 16));
const RETRIES = Math.max(1, Number(process.env.RETRIES || 5));
const SAMPLE_COUNT = Math.max(1, Number(process.env.SAMPLE_COUNT || 8));
const START_INDEX = Math.max(0, Number(process.env.START_INDEX || 0));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0));

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

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
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

function buildDevID(prefix = 'refreshall') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const startedAt = new Date().toISOString();

  fs.mkdirSync(M3U8_DIR, { recursive: true });
  const keyDir = path.join(M3U8_DIR, 'keys');
  fs.mkdirSync(keyDir, { recursive: true });

  const summaryPath = path.join(M3U8_DIR, '_refresh_summary.json');
  const errorPath = path.join(M3U8_DIR, '_refresh_errors.ndjson');
  fs.writeFileSync(errorPath, '', 'utf8');

  const allFiles = fs.readdirSync(SOURCE_DIR)
    .filter((f) => /^VID.+\.json$/i.test(f))
    .sort();

  const sliced = LIMIT > 0
    ? allFiles.slice(START_INDEX, START_INDEX + LIMIT)
    : allFiles.slice(START_INDEX);

  if (!sliced.length) {
    throw new Error('没有可处理的 _by_id 文件');
  }

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

  async function doLogin(reason = 'init') {
    devID = buildDevID('refreshall');
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
    log(`登录成功，reason=${reason}, reloginCount=${reloginCount}, devID=${devID}`);
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

  await doLogin('init');

  let lineUrl = 'https://s12.qqdanb.cn';
  try {
    const domainData = await apiGet('/ping/domain/h5', {});
    const sourceList = domainData.sourceList || [];
    const vidItem = sourceList.find((x) => x.type === 'VID');
    if (vidItem && Array.isArray(vidItem.domain) && vidItem.domain[0]?.url) {
      lineUrl = vidItem.domain[0].url;
    }
  } catch (e) {
    log('读取线路失败，使用默认线路', lineUrl, '原因:', e.message);
  }

  let sharedKeyHash = null;
  let sharedKeyFileName = null;
  let sharedKeyPath = null;
  let sharedKeyUri = null;
  let sharedKeyInitPromise = null;
  let keyInitCount = 0;

  async function fetchM3u8BySource(sourceURL) {
    let lastErr = null;

    for (let i = 0; i < RETRIES; i += 1) {
      const currentToken = token;
      const url = `${BASE_URL}/api/app/vid/h5/m3u8/${sourceURL}?token=${currentToken}&c=${encodeURIComponent(lineUrl)}`;

      try {
        const txt = await runCurl(['-sS', '-L', url, ...buildHeaders()]);
        if (txt.includes('#EXTM3U')) {
          return {
            m3u8Text: txt,
            m3u8Url: url,
            tokenUsed: currentToken,
          };
        }

        if (isLikelyAuthError(txt)) {
          await ensureRelogin('m3u8_auth_error', currentToken);
          continue;
        }

        lastErr = new Error('m3u8 内容异常（非 EXTM3U）');
      } catch (err) {
        lastErr = err;
      }

      await sleep(80 * (i + 1));
    }

    throw lastErr || new Error('抓取 m3u8 失败');
  }

  async function fetchKeyBuffer(keyUriFromM3u8) {
    const keyUrl = /^https?:\/\//i.test(keyUriFromM3u8)
      ? keyUriFromM3u8
      : keyUriFromM3u8.startsWith('/')
        ? `${BASE_URL}${keyUriFromM3u8}`
        : `${BASE_URL}/${keyUriFromM3u8}`;

    let lastErr = null;

    for (let i = 0; i < RETRIES; i += 1) {
      const currentToken = token;
      try {
        const keyBuf = await runCurl(['-sS', '-L', keyUrl, ...buildHeaders()], true);
        if (Buffer.isBuffer(keyBuf) && keyBuf.length > 0) {
          return keyBuf;
        }
        lastErr = new Error('key 内容为空');
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        if (msg.includes('4010') || msg.includes('token')) {
          await ensureRelogin('key_auth_error', currentToken);
        }
        lastErr = err;
      }

      await sleep(80 * (i + 1));
    }

    throw lastErr || new Error('获取 key 失败');
  }

  async function ensureSharedKeyInitialized(keyUriFromM3u8) {
    if (sharedKeyUri) return;

    if (sharedKeyInitPromise) {
      await sharedKeyInitPromise;
      return;
    }

    sharedKeyInitPromise = (async () => {
      const keyBuf = await fetchKeyBuffer(keyUriFromM3u8);
      const hash = sha256Hex(keyBuf);
      const fileName = `key_${hash}.key`;
      const filePath = path.join(keyDir, fileName);

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, keyBuf);
      }

      sharedKeyHash = hash;
      sharedKeyFileName = fileName;
      sharedKeyPath = filePath;
      sharedKeyUri = `keys/${fileName}`;
      keyInitCount += 1;
    })();

    try {
      await sharedKeyInitPromise;
    } finally {
      sharedKeyInitPromise = null;
    }
  }

  const total = sliced.length;
  let done = 0;
  let ok = 0;
  let fail = 0;
  let missingSource = 0;

  const samplePool = [];
  let sampleSeen = 0;

  async function processOne(fileName, index) {
    const filePath = path.join(SOURCE_DIR, fileName);

    try {
      const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const videoID = String(obj.id || fileName.replace(/^VID/i, '').replace(/\.json$/i, ''));
      const sourceURL = obj.sourceURL || (obj.raw && obj.raw.sourceURL) || null;

      if (!sourceURL) {
        missingSource += 1;
        throw new Error('缺少 sourceURL');
      }

      const fetched = await fetchM3u8BySource(sourceURL);

      const oldKeyUri = extractKeyUri(fetched.m3u8Text);
      if (!oldKeyUri) {
        throw new Error('m3u8 未找到 #EXT-X-KEY URI');
      }

      await ensureSharedKeyInitialized(oldKeyUri);

      const localizedText = replaceKeyUri(fetched.m3u8Text, sharedKeyUri);
      const m3u8Path = path.join(M3U8_DIR, `VID${videoID}.m3u8`);
      fs.writeFileSync(m3u8Path, localizedText, 'utf8');

      const updated = {
        ...obj,
        m3u8: fetched.m3u8Url,
        lineUrl,
        baseUrl: BASE_URL,
        tokenPayload: decodeTokenPayload(fetched.tokenUsed),
        fetchedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');

      sampleSeen += 1;
      const sampleItem = { videoID, sourceURL, fileName };
      if (samplePool.length < SAMPLE_COUNT) {
        samplePool.push(sampleItem);
      } else {
        const j = Math.floor(Math.random() * sampleSeen);
        if (j < SAMPLE_COUNT) samplePool[j] = sampleItem;
      }

      ok += 1;
    } catch (err) {
      fail += 1;
      fs.appendFileSync(errorPath, `${JSON.stringify({
        fileName,
        index,
        error: String(err && err.message ? err.message : err),
        time: new Date().toISOString(),
      })}\n`, 'utf8');
    } finally {
      done += 1;
      if (done % 100 === 0 || done === total) {
        log(`进度 ${done}/${total}, ok=${ok}, fail=${fail}, missingSource=${missingSource}`);
      }
    }
  }

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= total) return;
      await processOne(sliced[i], i + START_INDEX);
    }
  }

  log(`开始全量重抓: total=${total}, concurrency=${CONCURRENCY}, retries=${RETRIES}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (!sharedKeyUri || !sharedKeyPath) {
    throw new Error('未能初始化共享 key，全部任务可能失败');
  }

  const removedKeyFiles = [];
  for (const keyName of fs.readdirSync(keyDir).filter((n) => n.toLowerCase().endsWith('.key'))) {
    if (keyName !== sharedKeyFileName) {
      fs.unlinkSync(path.join(keyDir, keyName));
      removedKeyFiles.push(keyName);
    }
  }

  const sampleResults = [];
  for (const s of samplePool) {
    try {
      const fetched = await fetchM3u8BySource(s.sourceURL);
      const keyUri = extractKeyUri(fetched.m3u8Text);
      if (!keyUri) {
        sampleResults.push({ ...s, ok: false, reason: 'missing_key_uri' });
        continue;
      }

      const keyBuf = await fetchKeyBuffer(keyUri);
      const hash = sha256Hex(keyBuf);
      sampleResults.push({
        ...s,
        ok: hash === sharedKeyHash,
        keyHash: hash,
        expected: sharedKeyHash,
      });
    } catch (e) {
      sampleResults.push({
        ...s,
        ok: false,
        reason: String(e && e.message ? e.message : e),
      });
    }
  }

  const sampleOkCount = sampleResults.filter((x) => x.ok).length;

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    sourceDir: SOURCE_DIR,
    m3u8Dir: M3U8_DIR,
    keyDir,
    total,
    done,
    ok,
    fail,
    missingSource,
    reloginCount,
    lineUrl,
    keyInitCount,
    sharedKeyUri,
    sharedKeyHash,
    sharedKeyPath,
    removedKeyFilesCount: removedKeyFiles.length,
    removedKeyFiles,
    sampleCount: sampleResults.length,
    sampleOkCount,
    sampleResults,
    errorPath,
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  log('全量任务完成，摘要文件:', summaryPath);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
