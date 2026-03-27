#!/usr/bin/env node

/**
 * 全量导出视频评论数据。
 *
 * 使用示例：
 *   OUT_DIR=/var/zip/jiuyao/comments \
 *   /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.js
 *
 *   ONLY_IDS=67cc03de1564603015afe898,614758e5a871e78d083cfd80 \
 *   OUT_DIR=/var/zip/jiuyao/comments \
 *   /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.js
 *
 *   WORKER_TOTAL=2 WORKER_INDEX=0 \
 *   OUT_DIR=/var/zip/jiuyao/comments \
 *   /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.cjs
 *
 * 常用环境变量：
 *   SOURCE_DIR=/var/zip/jiuyao/_by_id
 *   OUT_DIR=/var/zip/jiuyao/comments
 *   PAGE_SIZE=15
 *   MAX_VIDEOS=100
 *   ONLY_IDS=id1,id2
 *   FORCE_ALL=1
 *   FORCE_REFETCH=1
 *   CLEAN=1
 *   REQUEST_DELAY_MS=25
 *   REPLY_DELAY_MS=15
 *   CONCURRENCY=2
 *   WORKER_TOTAL=2
 *   WORKER_INDEX=0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const {
  buildAggregateCommentSummary,
  buildMainCommentParams,
  buildReplyCommentParams,
  buildSkippedCommentFile,
  filterBlockedComments,
  getSourceCommentCount,
  mergeReplies,
  normalizeWorkerCount,
  pickShardItems,
  shouldDeferFailedVideo,
  shouldWriteCommentFile,
  shouldFetchComments,
  toSafeString,
} = require('./lib/comment_export_core.cjs');

const BASE_URL = process.env.BASE_URL || 'https://d3vfkhk0c6rox6.cloudfront.net';
const SOURCE_DIR = process.env.SOURCE_DIR || '/var/zip/jiuyao/_by_id';
const OUT_DIR = process.env.OUT_DIR || '/var/zip/jiuyao/comments';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 15);
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 0);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 25);
const REPLY_DELAY_MS = Number(process.env.REPLY_DELAY_MS || 15);
const MAX_DEFERRED_ATTEMPTS = Number(process.env.MAX_DEFERRED_ATTEMPTS || 2);
const CONCURRENCY = normalizeWorkerCount(process.env.CONCURRENCY || 1);
const WORKER_TOTAL = normalizeWorkerCount(process.env.WORKER_TOTAL || 1);
const RAW_WORKER_INDEX = Number(process.env.WORKER_INDEX);
const WORKER_INDEX =
  Number.isInteger(RAW_WORKER_INDEX) &&
  RAW_WORKER_INDEX >= 0 &&
  RAW_WORKER_INDEX < WORKER_TOTAL
    ? RAW_WORKER_INDEX
    : 0;
const FORCE_ALL = process.env.FORCE_ALL === '1';
const FORCE_REFETCH = process.env.FORCE_REFETCH === '1';
const CLEAN = process.env.CLEAN === '1';
const EXPORT_VERSION = 2;
const BLOCKED_USER_IDS = new Set(
  toSafeString(process.env.BLOCKED_USER_IDS || '100001')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
const ONLY_IDS = new Set(
  toSafeString(process.env.ONLY_IDS)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const INTERFACE_KEY = '65dc07d1b7915c6b2937432b091837a7';
const PARAM_KEY = 'BxJand%xf5h3sycH';
const PARAM_IV = 'BxJand%xf5h3sycH';

function log(...args) {
  const workerLabel = WORKER_TOTAL > 1 ? `worker-${WORKER_INDEX}` : 'main';
  console.log(`[${new Date().toISOString()}][${workerLabel}]`, ...args);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tagLoginError(error) {
  if (!error || error.failureKind) {
    return error;
  }

  if (error instanceof SyntaxError) {
    error.failureKind = 'login_response_parse_error';
  }

  return error;
}

function curl(args) {
  const res = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const message = (res.stderr || '').trim() || `curl exit ${res.status}`;
    const error = new Error(message);
    error.failureKind = 'curl_transport_error';
    error.curlExitCode = res.status;
    throw error;
  }
  return res.stdout;
}

function concatBuffers(...buffers) {
  const total = buffers.reduce((sum, item) => sum + item.length, 0);
  const out = Buffer.alloc(total);
  let offset = 0;
  for (const item of buffers) {
    item.copy(out, offset);
    offset += item.length;
  }
  return out;
}

// 解密站点的 hash 响应。
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

// 加密 GET 参数 data。
function encryptParams(params) {
  const normalized = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined) {
      normalized[key] = String(value);
    }
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
  const json = JSON.parse(text);
  return {
    raw: json,
    data: json && json.hash && json.data ? decryptResponseData(json.data) : (json.data ?? json),
  };
}

function makeDevID() {
  return `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeUserAgent(devID) {
  return `BuildID=com.abc.Butterfly;SysType=iOS;DevID=${devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`;
}

function safeFileNameById(id) {
  return `VID${toSafeString(id)}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureOutputDir(dir) {
  if (CLEAN && WORKER_TOTAL === 1) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
  ensureDir(path.join(dir, '_by_id'));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  writeJson(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

function removeFileIfExists(filePath) {
  fs.rmSync(filePath, { force: true });
}

function appendNdjson(filePath, data) {
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, 'utf8');
}

function readSourceFiles(sourceDir) {
  return fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function pickSourceFiles(sourceFiles) {
  let filtered = sourceFiles;

  if (ONLY_IDS.size > 0) {
    filtered = filtered.filter((fileName) => ONLY_IDS.has(fileName.replace(/^VID/, '').replace(/\.json$/, '')));
  }

  if (MAX_VIDEOS > 0) {
    filtered = filtered.slice(0, MAX_VIDEOS);
  }

  return filtered;
}

function isFinishedOutput(output) {
  return output && output.exportVersion === EXPORT_VERSION && output.fetchStatus === 'ok';
}

function createSummaryBase(totalVideos) {
  return {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    baseUrl: BASE_URL,
    sourceDir: SOURCE_DIR,
    outDir: OUT_DIR,
    exportVersion: EXPORT_VERSION,
    totalVideos,
    forceAll: FORCE_ALL,
    forceRefetch: FORCE_REFETCH,
    blockedUserIds: Array.from(BLOCKED_USER_IDS),
    pageSize: PAGE_SIZE,
    requestDelayMs: REQUEST_DELAY_MS,
    replyDelayMs: REPLY_DELAY_MS,
    maxDeferredAttempts: MAX_DEFERRED_ATTEMPTS,
    concurrency: WORKER_TOTAL > 1 ? WORKER_TOTAL : CONCURRENCY,
    workerIndex: WORKER_TOTAL > 1 ? WORKER_INDEX : null,
    workerTotal: WORKER_TOTAL,
    onlyIds: Array.from(ONLY_IDS),
    stats: {
      processed: 0,
      fetchedFromApi: 0,
      skippedByCount: 0,
      skippedExisting: 0,
      omittedEmpty: 0,
      failed: 0,
      mainPagesFetched: 0,
      replyRequests: 0,
      replyPagesFetched: 0,
      mainCommentsFetched: 0,
      replyCommentsFetched: 0,
      totalCommentNodesFetched: 0,
      filteredCommentNodes: 0,
      deferredQueued: 0,
      deferredRecovered: 0,
      deferredFailed: 0,
      reloginCount: 0,
    },
  };
}

async function main() {
  ensureOutputDir(OUT_DIR);

  const outByIdDir = path.join(OUT_DIR, '_by_id');
  const summaryPath = path.join(
    OUT_DIR,
    WORKER_TOTAL > 1 ? `_summary.worker-${WORKER_INDEX}.json` : '_summary.json'
  );
  const errorPath = path.join(OUT_DIR, '_errors.ndjson');
  const aggregateSummaryPath = path.join(OUT_DIR, '_summary.aggregate.json');
  const defaultSummaryPath = path.join(OUT_DIR, '_summary.json');

  let devID = makeDevID();
  let userAgent = makeUserAgent(devID);
  let token = '';
  let reloginCount = 0;

  function performLogin({ rotateDevID = false, retries = 4 } = {}) {
    let nextRotateDevID = rotateDevID;
    let lastError = null;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      if (nextRotateDevID) {
        devID = makeDevID();
        userAgent = makeUserAgent(devID);
        log('切换 devID 以重试登录，newDevID=', devID);
      }

      log('开始登录，devID=', devID);

      try {
        const loginText = curl([
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

        const login = parseApiResponse(loginText).data;
        if (!login || !login.token) {
          const error = new Error('登录后未拿到 token');
          error.failureKind = 'login_missing_token';
          throw error;
        }

        return login.token;
      } catch (error) {
        lastError = tagLoginError(error);

        if (attempt < retries - 1) {
          log(
            `登录失败，准备重试，attempt=${attempt + 1}/${retries},`,
            `reason=${lastError.failureKind || 'unknown'}`
          );
          nextRotateDevID = true;
          continue;
        }
      }
    }

    throw lastError || new Error('登录失败');
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

    let lastError = null;
    let consecutive4010 = 0;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const text = curl(['-sS', '-L', url, ...buildHeaders()]);
        const result = parseApiResponse(text);

        if (result.raw && result.raw.code === 4010) {
          reloginCount += 1;
          consecutive4010 += 1;
          log(`检测到 4010，执行重登（第 ${reloginCount} 次）`);
          token = performLogin({ rotateDevID: consecutive4010 >= 2 });
          continue;
        }

        consecutive4010 = 0;

        if (result.raw && result.raw.code !== 200) {
          throw new Error(`code=${result.raw.code} msg=${result.raw.msg || ''}`);
        }

        return result.data;
      } catch (error) {
        lastError = error;
      }
    }

    if (!lastError) {
      const error = new Error(`请求失败：path=${pathname}`);
      error.failureKind = 'auth_4010_exhausted';
      error.pathName = pathname;
      error.retries = retries;
      throw error;
    }

    throw lastError;
  }

  function persistSummary(summary) {
    summary.stats.reloginCount = reloginCount;
    writeJsonAtomic(summaryPath, summary);

    if (WORKER_TOTAL > 1) {
      const workerSummaryFiles = fs
        .readdirSync(OUT_DIR)
        .filter((name) => /^_summary\.worker-\d+\.json$/.test(name))
        .sort();
      const workerSummaries = workerSummaryFiles.map((name) =>
        loadJson(path.join(OUT_DIR, name))
      );
      const aggregateSummary = buildAggregateCommentSummary(workerSummaries);

      if (aggregateSummary) {
        writeJsonAtomic(aggregateSummaryPath, aggregateSummary);
        writeJsonAtomic(defaultSummaryPath, aggregateSummary);
      }
    }
  }

  async function fetchRepliesForComment(videoId, comment) {
    const previewReplies = Array.isArray(comment.Info) ? comment.Info : [];
    const expectedReplyCount = Math.max(0, Number(comment.commCount || 0) - 1);
    const replySeedId = previewReplies[0] && previewReplies[0].id;

    let replyRequests = 0;
    let replyPagesFetched = 0;
    let fetchedReplies = [];

    if (expectedReplyCount > previewReplies.length && replySeedId) {
      let pageNumber = 1;
      let hasNext = true;

      while (hasNext) {
        const replyData = apiGet(
          '/comment/info',
          buildReplyCommentParams({
            parentComment: {
              ...comment,
              objID: comment.objID || videoId,
              Info: previewReplies,
            },
            pageNumber,
            pageSize: PAGE_SIZE,
            now: new Date().toISOString(),
          })
        );

        const list = Array.isArray(replyData.list) ? replyData.list : [];
        fetchedReplies = fetchedReplies.concat(list);
        replyRequests += 1;
        replyPagesFetched += 1;
        hasNext = Boolean(replyData.hasNext);
        pageNumber += 1;

        if (hasNext) {
          await delay(REPLY_DELAY_MS);
        }
      }
    }

    return {
      allReplies: mergeReplies(previewReplies, fetchedReplies),
      replyRequests,
      replyPagesFetched,
    };
  }

  async function fetchCommentsForVideo(video) {
    let pageNumber = 1;
    let hasNext = true;
    let totalFromApi = 0;
    let mainPagesFetched = 0;
    const mainList = [];

    while (hasNext) {
      const pageData = apiGet(
        '/comment/list',
        buildMainCommentParams({
          videoId: video.id,
          objType: 'video',
          pageNumber,
          pageSize: PAGE_SIZE,
          now: new Date().toISOString(),
        })
      );

      const list = Array.isArray(pageData.list) ? pageData.list : [];
      totalFromApi = Number(pageData.total || totalFromApi || 0);
      mainList.push(...list);
      mainPagesFetched += 1;
      hasNext = Boolean(pageData.hasNext);
      pageNumber += 1;

      if (hasNext) {
        await delay(REQUEST_DELAY_MS);
      }
    }

    let replyRequests = 0;
    let replyPagesFetched = 0;
    const comments = [];

    for (const comment of mainList) {
      const replyResult = await fetchRepliesForComment(video.id, comment);
      replyRequests += replyResult.replyRequests;
      replyPagesFetched += replyResult.replyPagesFetched;
      comments.push({
        ...comment,
        allReplies: replyResult.allReplies,
      });
    }

    const unfilteredReplyCount = comments.reduce(
      (sum, comment) => sum + (Array.isArray(comment.allReplies) ? comment.allReplies.length : 0),
      0
    );
    const filteredComments = filterBlockedComments(comments, BLOCKED_USER_IDS);
    const filteredReplyCount = filteredComments.reduce(
      (sum, comment) => sum + (Array.isArray(comment.allReplies) ? comment.allReplies.length : 0),
      0
    );
    const unfilteredNodeCount = comments.length + unfilteredReplyCount;
    const filteredNodeCount = filteredComments.length + filteredReplyCount;

    return {
      fetchStatus: 'ok',
      fetchReason: 'comment_count_positive',
      counts: {
        sourceCommentCount: getSourceCommentCount(video),
        totalFromApi,
        mainCommentsFetched: filteredComments.length,
        replyCommentsFetched: filteredReplyCount,
        totalCommentNodesFetched: filteredNodeCount,
        filteredCommentNodes: unfilteredNodeCount - filteredNodeCount,
      },
      pagination: {
        mainPagesFetched,
        replyRequests,
        replyPagesFetched,
      },
      comments: filteredComments,
    };
  }

  // 多 worker 模式下按稳定分片拆开任务，避免重复抓取同一视频。
  const sourceFiles = pickShardItems(
    pickSourceFiles(readSourceFiles(SOURCE_DIR)),
    {
      workerIndex: WORKER_INDEX,
      workerTotal: WORKER_TOTAL,
    }
  );
  const pendingTasks = sourceFiles.map((fileName) => ({
    fileName,
    deferredAttempt: 0,
  }));
  const summary = createSummaryBase(sourceFiles.length);
  log(
    `启动抓取，分片=${WORKER_INDEX + 1}/${WORKER_TOTAL},`,
    `分片任务数=${sourceFiles.length},`,
    `并发配置=${WORKER_TOTAL > 1 ? WORKER_TOTAL : CONCURRENCY}`
  );
  persistSummary(summary);

  while (pendingTasks.length > 0) {
    const task = pendingTasks.shift();
    const { fileName, deferredAttempt } = task;
    const sourcePath = path.join(SOURCE_DIR, fileName);
    const outputPath = path.join(outByIdDir, fileName);
    const video = loadJson(sourcePath);

    if (!FORCE_REFETCH && fs.existsSync(outputPath)) {
      try {
        const existing = loadJson(outputPath);
        if (isFinishedOutput(existing)) {
          summary.stats.skippedExisting += 1;
          summary.stats.processed += 1;
          if (summary.stats.processed % 200 === 0) {
            log(`续跑跳过进度=${summary.stats.processed}/${sourceFiles.length}`);
            persistSummary(summary);
          }
          continue;
        }
      } catch (error) {
        // 已有坏文件时继续重抓。
      }
    }

    try {
      const sourceCommentCount = getSourceCommentCount(video);

      if (!shouldFetchComments({ commentCount: sourceCommentCount, forceAll: FORCE_ALL })) {
        summary.stats.skippedByCount += 1;
        removeFileIfExists(outputPath);
      } else {
        const fetched = await fetchCommentsForVideo(video);
        summary.stats.fetchedFromApi += 1;
        summary.stats.mainPagesFetched += fetched.pagination.mainPagesFetched;
        summary.stats.replyRequests += fetched.pagination.replyRequests;
        summary.stats.replyPagesFetched += fetched.pagination.replyPagesFetched;
        summary.stats.mainCommentsFetched += fetched.counts.mainCommentsFetched;
        summary.stats.replyCommentsFetched += fetched.counts.replyCommentsFetched;
        summary.stats.totalCommentNodesFetched += fetched.counts.totalCommentNodesFetched;
        summary.stats.filteredCommentNodes += fetched.counts.filteredCommentNodes || 0;

        if (shouldWriteCommentFile(fetched.comments)) {
          const out = {
            exportVersion: EXPORT_VERSION,
            id: toSafeString(video.id),
            title: toSafeString(video.title),
            categoryList: Array.isArray(video.categoryList) ? video.categoryList : [],
            objType: 'video',
            sourceCommentCount,
            fetchStatus: fetched.fetchStatus,
            fetchReason: fetched.fetchReason,
            fetchedAt: new Date().toISOString(),
            counts: fetched.counts,
            pagination: fetched.pagination,
            comments: fetched.comments,
          };

          writeJson(outputPath, out);
        } else {
          summary.stats.omittedEmpty += 1;
          removeFileIfExists(outputPath);
        }

        if (deferredAttempt > 0) {
          summary.stats.deferredRecovered += 1;
        }
      }
    } catch (error) {
      if (
        shouldDeferFailedVideo({
          error,
          deferredAttempt,
          maxDeferredAttempts: MAX_DEFERRED_ATTEMPTS,
        })
      ) {
        summary.stats.deferredQueued += 1;
        pendingTasks.push({
          fileName,
          deferredAttempt: deferredAttempt + 1,
        });
        log(
          `延后重试=${fileName},`,
          `deferredAttempt=${deferredAttempt + 1}/${MAX_DEFERRED_ATTEMPTS},`,
          `reason=${error.failureKind || 'unknown'}`
        );
        persistSummary(summary);

        if (pendingTasks.length > 0) {
          await delay(REQUEST_DELAY_MS);
        }
        continue;
      }

      const errorRecord = {
        at: new Date().toISOString(),
        fileName,
        id: toSafeString(video.id),
        title: toSafeString(video.title),
        deferredAttempt,
        failureKind: error?.failureKind || null,
        message: error && error.stack ? error.stack : String(error),
      };

      removeFileIfExists(outputPath);
      appendNdjson(errorPath, errorRecord);
      summary.stats.failed += 1;

      if (deferredAttempt > 0) {
        summary.stats.deferredFailed += 1;
      }
    }

    summary.stats.processed += 1;

    if (summary.stats.processed % 100 === 0) {
      log(
        `处理进度=${summary.stats.processed}/${sourceFiles.length},`,
        `API抓取=${summary.stats.fetchedFromApi},`,
        `空评论跳过=${summary.stats.skippedByCount},`,
        `失败=${summary.stats.failed}`
      );
      persistSummary(summary);
    }

    if (pendingTasks.length > 0) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  summary.finishedAt = new Date().toISOString();
  persistSummary(summary);
  log('评论抓取完成，摘要=', JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[FATAL]', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
