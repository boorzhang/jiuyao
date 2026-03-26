#!/usr/bin/env node

/**
 * 批量抓取视频信息并生成 JSON 文件
 *
 * 使用示例：
 *   node /tmp/video_json_export.js
 *
 * 可选环境变量：
 *   BASE_URL=https://d3vfkhk0c6rox6.cloudfront.net node /tmp/video_json_export.js
 *   OUT_DIR=/tmp/video_json TARGET_COUNT=1200 node /tmp/video_json_export.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';
const OUT_DIR = process.env.OUT_DIR || '/tmp/video_json';
const TARGET_COUNT = Number(process.env.TARGET_COUNT || 1200);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 50);
const MODULE_PAGE_CAP = Number(process.env.MODULE_PAGE_CAP || 200);

// 站点前端里固定的加解密参数
const INTERFACE_KEY = '65dc07d1b7915c6b2937432b091837a7';
const PARAM_KEY = 'BxJand%xf5h3sycH';
const PARAM_IV = 'BxJand%xf5h3sycH';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function curl(url, headers = []) {
  const args = ['-sS', '-L', url];
  for (const h of headers) {
    args.push('-H', h);
  }
  const res = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const err = (res.stderr || '').trim() || `curl exit ${res.status}`;
    throw new Error(err);
  }
  return res.stdout;
}

function curlPostJson(url, jsonBody, headers = []) {
  const args = ['-sS', '-L', url, '-H', 'Content-Type: application/json'];
  for (const h of headers) {
    args.push('-H', h);
  }
  args.push('--data', JSON.stringify(jsonBody));
  const res = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const err = (res.stderr || '').trim() || `curl exit ${res.status}`;
    throw new Error(err);
  }
  return res.stdout;
}

function concatBuffers(...buffers) {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = Buffer.alloc(total);
  let pos = 0;
  for (const b of buffers) {
    b.copy(out, pos);
    pos += b.length;
  }
  return out;
}

// 解密接口返回的 hash=true 数据
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
  const plain = Buffer.from(JSON.stringify(normalized), 'utf8');
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64');
}

function parseApiResponse(text) {
  const j = JSON.parse(text);
  const data = j && j.hash && j.data ? decryptResponseData(j.data) : (j.data ?? j);
  return { raw: j, data };
}

function sanitizeDirName(name) {
  const s = String(name || 'uncategorized').trim();
  const clean = s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return clean || 'uncategorized';
}

function safeFileNameById(id) {
  return `VID${String(id)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const devID = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  log('开始登录，devID=', devID);

  const loginTxt = curlPostJson(
    `${BASE_URL}/api/app/mine/login/h5`,
    {
      devID,
      sysType: 'ios',
      cutInfos: '{}',
      isAppStore: false,
    }
  );
  const login = parseApiResponse(loginTxt).data;
  const token = login.token;
  if (!token) {
    throw new Error('登录成功但未拿到 token');
  }

  const userAgent = `BuildID=com.abc.Butterfly;SysType=iOS;DevID=${devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`;
  const commonHeaders = [
    `Authorization: ${token}`,
    'temp: test',
    `X-User-Agent: ${userAgent}`,
  ];

  // GET 封装，带简单重试
  function apiGet(pathname, params = {}, retries = 3) {
    const encrypted = encodeURIComponent(encryptParams(params));
    const url = `${BASE_URL}/api/app${pathname}${encrypted ? `?data=${encrypted}` : ''}`;

    let lastErr = null;
    for (let i = 0; i < retries; i += 1) {
      try {
        const txt = curl(url, commonHeaders);
        const res = parseApiResponse(txt);
        if (res.raw && res.raw.code !== 200) {
          throw new Error(`code=${res.raw.code} msg=${res.raw.msg || ''}`);
        }
        return res.data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  // 获取线路参数 c（拿不到就回退）
  let lineUrl = 'https://s12.qqdanb.cn';
  try {
    const domainData = apiGet('/ping/domain/h5', {});
    const sourceList = domainData.sourceList || [];
    const vidItem = sourceList.find((x) => x.type === 'VID');
    if (vidItem && Array.isArray(vidItem.domain) && vidItem.domain[0]?.url) {
      lineUrl = vidItem.domain[0].url;
    }
  } catch (e) {
    log('读取 /ping/domain/h5 失败，使用回退线路:', lineUrl, '原因:', e.message);
  }

  const modulesData = apiGet('/modules/list', {});
  const homeModules = modulesData.homePage || [];
  log('分类数量(homePage)=', homeModules.length);

  // 维护种子池：id -> { seed, categories:Set }
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

  // 先抓推荐流，补充热度视频
  try {
    const recFirst = apiGet('/recommend/vid/list', { pageNumber: 1, pageSize: PAGE_SIZE });
    const totalPages = Number(recFirst.totalPages || 1);
    for (const v of recFirst.vInfos || []) addSeed(v, '推荐');

    const recPageCap = Math.min(totalPages, 30);
    for (let p = 2; p <= recPageCap; p += 1) {
      const pageData = apiGet('/recommend/vid/list', { pageNumber: p, pageSize: PAGE_SIZE });
      for (const v of pageData.vInfos || []) addSeed(v, '推荐');
      if (p % 5 === 0) log(`推荐流分页进度: ${p}/${recPageCap}, 去重视频=${seedMap.size}`);
      if (seedMap.size >= TARGET_COUNT) break;
    }
  } catch (e) {
    log('抓取推荐流失败，继续分类抓取。原因:', e.message);
  }

  // 按分类分页抓取
  for (const mod of homeModules) {
    const category = mod.moduleName || `module_${mod.id}`;
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= MODULE_PAGE_CAP) {
      const data = apiGet(`/vid/module/${mod.id}`, { pageNumber: page, pageSize: PAGE_SIZE });
      const arr = [
        ...(Array.isArray(data.allVideoInfo) ? data.allVideoInfo : []),
        ...(Array.isArray(data.chosenVideoInfo) ? data.chosenVideoInfo : []),
      ];

      for (const v of arr) addSeed(v, category);

      hasNext = Boolean(data.hasNext);
      page += 1;

      if ((page - 1) % 5 === 0) {
        log(`分类[${category}] 抓到第 ${page - 1} 页, 去重视频=${seedMap.size}`);
      }

      // 到达目标后继续多抓一点，避免后续详情失败导致不足
      if (seedMap.size >= TARGET_COUNT + 200) {
        hasNext = false;
      }

      // 小延迟，降低风控概率
      await sleep(80);
    }

    if (seedMap.size >= TARGET_COUNT + 200) break;
  }

  log('种子抓取完成，去重视频总数=', seedMap.size);

  // 拉详情并写文件
  const allIds = Array.from(seedMap.keys());
  const targetIds = allIds.slice(0, Math.max(TARGET_COUNT, Math.min(seedMap.size, TARGET_COUNT + 100)));
  log('准备拉取详情数量=', targetIds.length);

  let okCount = 0;
  let failCount = 0;

  // 额外按 ID 保存一份，方便统一检索
  const byIdDir = path.join(OUT_DIR, '_by_id');
  fs.mkdirSync(byIdDir, { recursive: true });

  for (let i = 0; i < targetIds.length; i += 1) {
    const id = targetIds[i];
    const rec = seedMap.get(id);
    const categories = Array.from(rec.categories || []).map(sanitizeDirName);

    let info = null;
    try {
      info = apiGet('/vid/info', { videoID: id });
    } catch (e) {
      // 详情失败时回退种子信息，保证尽量落盘
      info = rec.seed || { id };
      failCount += 1;
    }

    const sourceURL = info.sourceURL || rec.seed?.sourceURL || null;
    const m3u8 = sourceURL
      ? `${BASE_URL}/api/app/vid/h5/m3u8/${sourceURL}?token=${token}&c=${encodeURIComponent(lineUrl)}`
      : null;

    // 每个视频一个 JSON，包含原始信息和可播放地址
    const outObj = {
      id: info.id || id,
      vid: info.vid || null,
      title: info.title || rec.seed?.title || '',
      newsType: info.newsType || rec.seed?.newsType || null,
      mediaType: info.mediaType || rec.seed?.mediaType || null,
      categoryList: categories,
      sourceURL,
      previewURL: info.previewURL || rec.seed?.previewURL || null,
      m3u8,
      lineUrl,
      baseUrl: BASE_URL,
      tokenPayload: (() => {
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
      })(),
      fetchedAt: new Date().toISOString(),
      raw: info,
    };

    const fileBase = safeFileNameById(outObj.id);

    // 主文件：按 ID
    fs.writeFileSync(
      path.join(byIdDir, `${fileBase}.json`),
      JSON.stringify(outObj, null, 2),
      'utf8'
    );

    // 分类文件：同一视频可以出现在多个分类目录
    for (const c of categories.length ? categories : ['uncategorized']) {
      const dir = path.join(OUT_DIR, c);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${fileBase}.json`), JSON.stringify(outObj, null, 2), 'utf8');
    }

    okCount += 1;

    if ((i + 1) % 50 === 0 || i + 1 === targetIds.length) {
      log(`详情进度 ${i + 1}/${targetIds.length}, 成功落盘=${okCount}, 详情失败回退=${failCount}`);
    }

    await sleep(40);
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    outDir: OUT_DIR,
    targetCount: TARGET_COUNT,
    seedUniqueCount: seedMap.size,
    processedCount: targetIds.length,
    writeCount: okCount,
    detailFallbackCount: failCount,
    lineUrl,
    categories: Array.from(
      new Set(
        Array.from(seedMap.values()).flatMap((x) => Array.from(x.categories || []))
      )
    ),
  };

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  log('完成。摘要文件:', path.join(OUT_DIR, '_summary.json'));
  log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
