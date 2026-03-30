#!/usr/bin/env node

/**
 * 抓取漫画分类数据
 * 
 * 使用示例：
 *   node /private/var/zip/jiuyao/scripts/export/scrape_comics.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://d3i0tylhl4ykjk.cloudfront.net';
const IMAGE_CDN = 'https://imgosne.qqdanb.cn';
const OUT_DIR = '/tmp/comics_json';
const COMICS_MODULE_ID = '67b7f7e5ac310312c98dc12a';

const INTERFACE_KEY = '65dc07d1b7915c6b2937432b091837a7';
const PARAM_KEY = 'BxJand%xf5h3sycH';
const PARAM_IV = 'BxJand%xf5h3sycH';

const VIP_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3NzQ4MzYxNjMzODQxMTU1MDAsInR5cGUiOjAsInVpZCI6MTA5MDgyMjZ9.R0FCVfpP-Ex2jR8mT7gF775GDm9F4flc6wTQGUKoNl0';

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

function buildHeaders() {
  return [
    '-H', `Authorization: ${VIP_TOKEN}`,
    '-H', 'temp: test',
    '-H', 'X-User-Agent: BuildID=com.abc.Butterfly;SysType=iOS;DevID=test123;Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1',
  ];
}

function apiGet(pathname, params = {}) {
  const encrypted = encodeURIComponent(encryptParams(params));
  const url = `${BASE_URL}/api/app${pathname}${encrypted ? `?data=${encrypted}` : ''}`;

  const txt = curl(['-sS', '-L', url, ...buildHeaders()]);
  const res = parseApiResponse(txt);
  
  if (res.raw && res.raw.code !== 200) {
    throw new Error(`code=${res.raw.code} msg=${res.raw.msg || ''}`);
  }
  return res.data;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureCleanDir(OUT_DIR);
  const byIdDir = path.join(OUT_DIR, '_by_id');
  fs.mkdirSync(byIdDir, { recursive: true });

  log('开始抓取漫画分类，moduleId=', COMICS_MODULE_ID);

  const data = apiGet(`/vid/module/${COMICS_MODULE_ID}`, { pageNumber: 1, pageSize: 50 });

  log('API响应 keys:', Object.keys(data));
  log('allSection 数量:', data.allSection?.length || 0);
  log('allVideoInfo 数量:', data.allVideoInfo?.length || 0);
  log('chosenVideoInfo 数量:', data.chosenVideoInfo?.length || 0);
  log('allMediaInfo 数量:', data.allMediaInfo?.length || 0);
  
  if (data.chosenVideoInfo?.length > 0) {
    log('chosenVideoInfo 示例:', JSON.stringify(data.chosenVideoInfo.slice(0, 2), null, 2));
  }
  if (data.allMediaInfo?.length > 0) {
    log('allMediaInfo 示例:', JSON.stringify(data.allMediaInfo.slice(0, 2), null, 2));
  }

  const allItems = [];
  
  // 漫画数据在 allMediaInfo 中
  const mediaInfoList = data.allMediaInfo || [];
  log(`从 allMediaInfo 获取 ${mediaInfoList.length} 个漫画`);

  // 获取分区信息
  const sections = data.allSection || [];
  const sectionMap = new Map();
  for (const s of sections) {
    sectionMap.set(s.sectionID, s.sectionName);
  }

  for (const item of mediaInfoList) {
    const sectionName = sectionMap.get(item.sId) || item.sectionName || 'uncategorized';
    
    const horizontalCover = item.horizontalCover || '';
    const verticalCover = item.verticalCover || '';
    const coverUrl = horizontalCover || verticalCover ? `https://imgosne.qqdanb.cn/${horizontalCover || verticalCover}` : null;
    
    // 获取漫画章节详情
    let chapters = [];
    try {
      const detailData = apiGet('/media/info', { id: item.id });
      if (detailData.defaultContent?.urlSet) {
        chapters = detailData.defaultContent.urlSet.map(url => ({
          url: `https://imgosne.qqdanb.cn/${url}`,
          path: url,
        }));
      }
    } catch (e) {
      log(`获取章节失败: ${item.title}`, e.message);
    }
    
    allItems.push({
      ...item,
      _section: sectionName,
      _coverUrl: coverUrl,
      _chapters: chapters,
    });
  }

  log(`总共抓取到 ${allItems.length} 个漫画项`);

  let writeCount = 0;
  for (const item of allItems) {
    const id = item.id || item.vid || String(writeCount);
    
    const outObj = {
      id,
      title: item.title || '',
      cover: item._coverUrl,
      horizontalCover: item.horizontalCover ? `https://imgosne.qqdanb.cn/${item.horizontalCover}` : null,
      verticalCover: item.verticalCover ? `https://imgosne.qqdanb.cn/${item.verticalCover}` : null,
      summary: item.summary || '',
      tags: item.tagDetails?.map(t => t.name) || [],
      section: item._section,
      mediaType: item.mediaType || 'image',
      totalEpisode: item.totalEpisode || 1,
      chapters: item._chapters || [],
      chapterCount: (item._chapters || []).length,
      countBrowse: item.countBrowse || 0,
      countCollect: item.countCollect || 0,
      countLike: item.countLike || 0,
      fetchedAt: new Date().toISOString(),
      raw: item,
    };

    const fileBase = `COMIC${String(id)}`;
    const byIdFile = path.join(byIdDir, `${fileBase}.json`);
    fs.writeFileSync(byIdFile, JSON.stringify(outObj, null, 2), 'utf8');

    const dir = path.join(OUT_DIR, '漫画');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${fileBase}.json`), JSON.stringify(outObj, null, 2), 'utf8');

    writeCount += 1;
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    moduleId: COMICS_MODULE_ID,
    outDir: OUT_DIR,
    totalItems: allItems.length,
    sectionCount: sections.length,
    sections: sections.map(s => ({
      name: s.name || s.title,
      count: (s.allVideoInfo || []).length,
    })),
    writeCount,
  };

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  log('完成，摘要:', JSON.stringify(summary, null, 2));

  if (allItems.length > 0) {
    log('\n示例数据（第一个）:');
    console.log(JSON.stringify(allItems[0], null, 2));
  }
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
