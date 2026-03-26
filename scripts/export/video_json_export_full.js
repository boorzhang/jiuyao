#!/usr/bin/env node

/**
 * 全量抓取视频列表信息并生成 JSON 文件（按分类目录 + 按ID目录）
 *
 * 使用示例：
 *   node /tmp/video_json_export_full.js
 *
 * 可选环境变量：
 *   OUT_DIR=/tmp/video_json BASE_URL=https://d3vfkhk0c6rox6.cloudfront.net node /tmp/video_json_export_full.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';
const OUT_DIR = process.env.OUT_DIR || '/tmp/video_json';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 50);

const INTERFACE_KEY = '65dc07d1b7915c6b2937432b091837a7';
const PARAM_KEY = 'BxJand%xf5h3sycH';
const PARAM_IV = 'BxJand%xf5h3sycH';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function curl(args) {
  const res = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const msg = (res.stderr || '').trim() || `curl exit ${res.status}`;
    throw new Error(msg);
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

// 解密 hash=true 响应
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

// 加密 GET 参数 data
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

function sanitizeDirName(name) {
  const s = String(name || 'uncategorized').trim();
  const clean = s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return clean || 'uncategorized';
}

function safeFileNameById(id) {
  return `VID${String(id)}`;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureCleanDir(OUT_DIR);
  const byIdDir = path.join(OUT_DIR, '_by_id');
  fs.mkdirSync(byIdDir, { recursive: true });

  function makeDevID() {
    return `full_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function makeUserAgent(did) {
    return `BuildID=com.abc.Butterfly;SysType=iOS;DevID=${did};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`;
  }

  let devID = makeDevID();
  let userAgent = makeUserAgent(devID);
  let token = '';
  let reloginCount = 0;

  // 自动重登：遇到 4010 时刷新 token 继续抓
  function performLogin(options = {}) {
    // 连续 4010 时切换设备标识，避免服务端风控导致 token 一直无效
    if (options.rotateDevID) {
      devID = makeDevID();
      userAgent = makeUserAgent(devID);
      log('切换 devID 以重试登录，newDevID=', devID);
    }
    log('开始登录，devID=', devID);
    const loginTxt = curl([
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
    const login = parseApiResponse(loginTxt).data;
    if (!login || !login.token) throw new Error('登录后未拿到 token');
    return login.token;
  }

  token = performLogin();

  function buildHeaders() {
    return [
      '-H', `Authorization: ${token}`,
      '-H', 'temp: test',
      '-H', `X-User-Agent: ${userAgent}`,
    ];
  }

  function apiGet(pathname, params = {}, retries = 8) {
    const encrypted = encodeURIComponent(encryptParams(params));
    const url = `${BASE_URL}/api/app${pathname}${encrypted ? `?data=${encrypted}` : ''}`;

    let lastErr = null;
    let consecutive4010 = 0;
    for (let i = 0; i < retries; i += 1) {
      try {
        const txt = curl(['-sS', '-L', url, ...buildHeaders()]);
        const res = parseApiResponse(txt);
        if (res.raw && res.raw.code === 4010) {
          reloginCount += 1;
          consecutive4010 += 1;
          log(`检测到 4010，执行重登（第 ${reloginCount} 次）`);
          token = performLogin({ rotateDevID: consecutive4010 >= 2 });
          continue;
        }
        consecutive4010 = 0;
        if (res.raw && res.raw.code !== 200) {
          throw new Error(`code=${res.raw.code} msg=${res.raw.msg || ''}`);
        }
        return res.data;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!lastErr) {
      throw new Error(`请求失败：连续 4010 超出重试次数，path=${pathname}`);
    }
    throw lastErr;
  }

  // 读取线路 c 参数（失败就用默认）
  let lineUrl = 'https://s12.qqdanb.cn';
  try {
    const domainData = apiGet('/ping/domain/h5', {});
    const sourceList = domainData.sourceList || [];
    const vidItem = sourceList.find((x) => x.type === 'VID');
    if (vidItem && Array.isArray(vidItem.domain) && vidItem.domain[0]?.url) {
      lineUrl = vidItem.domain[0].url;
    }
  } catch (e) {
    log('读取线路失败，使用回退 c=', lineUrl, '原因:', e.message);
  }

  const modulesData = apiGet('/modules/list', {});
  const moduleTargets = [
    ...(modulesData.homePage || []),
    ...(modulesData.deepWeb || []),
  ];

  // id -> { seed, categories:Set }
  const seedMap = new Map();

  function addSeed(video, category) {
    if (!video || !video.id) return;
    const id = String(video.id);
    const old = seedMap.get(id);
    if (!old) {
      seedMap.set(id, {
        seed: video,
        categories: new Set([category || 'uncategorized']),
      });
    } else {
      old.seed = { ...old.seed, ...video };
      old.categories.add(category || 'uncategorized');
    }
  }

  // 抓模块分页（全量）
  let modulePages = 0;
  for (const mod of moduleTargets) {
    const category = mod.moduleName || mod.name || `module_${mod.id}`;
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 500) {
      const data = apiGet(`/vid/module/${mod.id}`, { pageNumber: page, pageSize: PAGE_SIZE });
      const arr = [
        ...(Array.isArray(data.allVideoInfo) ? data.allVideoInfo : []),
        ...(Array.isArray(data.chosenVideoInfo) ? data.chosenVideoInfo : []),
      ];

      const beforeSize = seedMap.size;
      for (const v of arr) addSeed(v, category);
      const added = seedMap.size - beforeSize;

      hasNext = Boolean(data.hasNext);
      page += 1;
      modulePages += 1;

      if (modulePages % 20 === 0) {
        log(`模块分页进度=${modulePages}, 当前去重视频=${seedMap.size}`);
      }

      // 防止极端情况下 hasNext 异常常真：如果这一页一条都没新增，且页码很大，提前中断
      if (page > 120 && added === 0) {
        hasNext = false;
      }

      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // 抓推荐分页（全量）
  const recFirst = apiGet('/recommend/vid/list', { pageNumber: 1, pageSize: PAGE_SIZE });
  for (const v of recFirst.vInfos || []) addSeed(v, '推荐');
  const totalPages = Number(recFirst.totalPages || 1);

  for (let p = 2; p <= totalPages; p += 1) {
    const pageData = apiGet('/recommend/vid/list', { pageNumber: p, pageSize: PAGE_SIZE });
    for (const v of pageData.vInfos || []) addSeed(v, '推荐');
    if (p % 20 === 0) {
      log(`推荐分页进度=${p}/${totalPages}, 当前去重视频=${seedMap.size}`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  log('种子全量抓取完成，去重视频总数=', seedMap.size);

  // 将每个视频写到 _by_id + 分类目录
  const tokenPayload = (() => {
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
  })();

  let writeCount = 0;
  for (const [id, rec] of seedMap.entries()) {
    const info = rec.seed || { id };
    const categories = Array.from(rec.categories || []).map(sanitizeDirName);

    const sourceURL = info.sourceURL || null;
    const m3u8 = sourceURL
      ? `${BASE_URL}/api/app/vid/h5/m3u8/${sourceURL}?token=${token}&c=${encodeURIComponent(lineUrl)}`
      : null;

    const outObj = {
      id: info.id || id,
      vid: info.vid || null,
      title: info.title || '',
      newsType: info.newsType || null,
      mediaType: info.mediaType || null,
      categoryList: categories,
      sourceURL,
      previewURL: info.previewURL || null,
      m3u8,
      lineUrl,
      baseUrl: BASE_URL,
      tokenPayload,
      fetchedAt: new Date().toISOString(),
      raw: info,
    };

    const fileBase = safeFileNameById(outObj.id);
    const byIdFile = path.join(byIdDir, `${fileBase}.json`);
    fs.writeFileSync(byIdFile, JSON.stringify(outObj, null, 2), 'utf8');

    const folderList = categories.length ? categories : ['uncategorized'];
    for (const c of folderList) {
      const dir = path.join(OUT_DIR, c);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${fileBase}.json`), JSON.stringify(outObj, null, 2), 'utf8');
    }

    writeCount += 1;
    if (writeCount % 1000 === 0) {
      log(`落盘进度=${writeCount}/${seedMap.size}`);
    }
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    outDir: OUT_DIR,
    modulePages,
    recommendPages: totalPages,
    totalUniqueVideos: seedMap.size,
    writeCount,
    lineUrl,
    categoryCount: new Set(
      Array.from(seedMap.values()).flatMap((x) => Array.from(x.categories || []))
    ).size,
    categories: Array.from(
      new Set(
        Array.from(seedMap.values()).flatMap((x) => Array.from(x.categories || []))
      )
    ),
  };

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  log('完成，摘要:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
