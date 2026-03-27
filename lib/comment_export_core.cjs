/**
 * 评论导出脚本的纯逻辑工具。
 *
 * 使用示例：
 *   const {
 *     buildMainCommentParams,
 *     shouldFetchComments,
 *   } = require('./lib/comment_export_core');
 *
 *   const params = buildMainCommentParams({
 *     videoId: 'abc123',
 *     pageNumber: 1,
 *     pageSize: 15,
 *     now: new Date().toISOString(),
 *   });
 *
 *   const shouldFetch = shouldFetchComments({ commentCount: 3 });
 */

function toSafeString(value) {
  return String(value ?? '').trim();
}

function normalizeWorkerCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function pickShardItems(items = [], { workerIndex = 0, workerTotal = 1 } = {}) {
  const normalizedWorkerTotal = normalizeWorkerCount(workerTotal);
  const normalizedWorkerIndex =
    Number.isInteger(Number(workerIndex)) &&
    Number(workerIndex) >= 0 &&
    Number(workerIndex) < normalizedWorkerTotal
      ? Number(workerIndex)
      : 0;

  return items.filter((_, index) => index % normalizedWorkerTotal === normalizedWorkerIndex);
}

function pickEarliestIsoTime(values = []) {
  return values
    .filter(Boolean)
    .sort()[0] || null;
}

function pickLatestIsoTime(values = []) {
  const filtered = values.filter(Boolean).sort();
  return filtered[filtered.length - 1] || null;
}

function sumStats(workerSummaries = []) {
  const stats = {
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
  };

  for (const summary of workerSummaries) {
    const inputStats = summary?.stats || {};
    for (const key of Object.keys(stats)) {
      stats[key] += Number(inputStats[key] || 0);
    }
  }

  return stats;
}

function buildAggregateCommentSummary(workerSummaries = []) {
  const summaries = workerSummaries
    .filter(Boolean)
    .sort((a, b) => Number(a?.workerIndex || 0) - Number(b?.workerIndex || 0));

  if (summaries.length === 0) {
    return null;
  }

  const first = summaries[0];
  const allFinished = summaries.every((item) => Boolean(item?.finishedAt));

  return {
    startedAt: pickEarliestIsoTime(summaries.map((item) => item?.startedAt)),
    finishedAt: allFinished ? pickLatestIsoTime(summaries.map((item) => item?.finishedAt)) : null,
    baseUrl: toSafeString(first?.baseUrl),
    sourceDir: toSafeString(first?.sourceDir),
    outDir: toSafeString(first?.outDir),
    exportVersion: Number(first?.exportVersion || 0),
    totalVideos: summaries.reduce((sum, item) => sum + Number(item?.totalVideos || 0), 0),
    forceAll: Boolean(first?.forceAll),
    forceRefetch: Boolean(first?.forceRefetch),
    blockedUserIds: Array.isArray(first?.blockedUserIds) ? first.blockedUserIds : [],
    pageSize: Number(first?.pageSize || 0),
    requestDelayMs: Number(first?.requestDelayMs || 0),
    replyDelayMs: Number(first?.replyDelayMs || 0),
    maxDeferredAttempts: Number(first?.maxDeferredAttempts || 0),
    concurrency: summaries.reduce(
      (max, item) => Math.max(max, Number(item?.concurrency || item?.workerTotal || 1)),
      1
    ),
    workerIndex: null,
    workerTotal: summaries.reduce(
      (max, item) => Math.max(max, Number(item?.workerTotal || 1)),
      1
    ),
    onlyIds: Array.isArray(first?.onlyIds) ? first.onlyIds : [],
    summaryKind: 'aggregate',
    workers: summaries.map((item) => ({
      workerIndex: Number(item?.workerIndex || 0),
      totalVideos: Number(item?.totalVideos || 0),
      startedAt: toSafeString(item?.startedAt),
      finishedAt: item?.finishedAt || null,
      stats: item?.stats || {},
    })),
    stats: sumStats(summaries),
  };
}

function getSourceCommentCount(video) {
  const count = Number(video?.raw?.commentCount ?? video?.commentCount ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function shouldFetchComments({ commentCount, forceAll = false }) {
  return Boolean(forceAll) || Number(commentCount) > 0;
}

function buildMainCommentParams({
  videoId,
  objType = 'video',
  pageNumber,
  pageSize,
  now,
}) {
  return {
    objID: toSafeString(videoId),
    objType: toSafeString(objType || 'video'),
    curTime: toSafeString(now),
    pageNumber: toSafeString(pageNumber),
    pageSize: toSafeString(pageSize),
  };
}

function buildReplyCommentParams({
  parentComment,
  pageNumber,
  pageSize,
  now,
}) {
  const firstReplyId = parentComment?.Info?.[0]?.id;
  return {
    objID: toSafeString(parentComment?.objID),
    cmtId: toSafeString(parentComment?.id),
    fstID: toSafeString(firstReplyId),
    curTime: toSafeString(now),
    pageNumber: toSafeString(pageNumber),
    pageSize: toSafeString(pageSize),
  };
}

function mergeReplies(previewReplies = [], fetchedReplies = []) {
  const merged = [];
  const seen = new Set();

  for (const reply of [...previewReplies, ...fetchedReplies]) {
    const replyId = toSafeString(reply?.id);
    if (!replyId || seen.has(replyId)) continue;
    seen.add(replyId);
    merged.push(reply);
  }

  return merged;
}

function isBlockedUser(comment, blockedUserIds = new Set()) {
  return blockedUserIds.has(toSafeString(comment?.userID));
}

function filterBlockedComments(comments = [], blockedUserIds = new Set()) {
  const out = [];

  for (const comment of comments) {
    if (isBlockedUser(comment, blockedUserIds)) {
      continue;
    }

    const nextComment = { ...comment };
    const replies = Array.isArray(comment?.allReplies) ? comment.allReplies : [];
    nextComment.allReplies = replies.filter((reply) => !isBlockedUser(reply, blockedUserIds));
    out.push(nextComment);
  }

  return out;
}

function shouldWriteCommentFile(comments) {
  return Array.isArray(comments) && comments.length > 0;
}

function isExhausted4010Error(error) {
  return error?.failureKind === 'auth_4010_exhausted';
}

function isTransientTransportError(error) {
  return error?.failureKind === 'curl_transport_error';
}

function isRetryableLoginError(error) {
  return (
    error?.failureKind === 'login_missing_token' ||
    error?.failureKind === 'login_response_parse_error'
  );
}

function shouldDeferFailedVideo({
  error,
  deferredAttempt = 0,
  maxDeferredAttempts = 0,
}) {
  const isRetryableError =
    isExhausted4010Error(error) ||
    isTransientTransportError(error) ||
    isRetryableLoginError(error);

  return isRetryableError && Number(deferredAttempt) < Number(maxDeferredAttempts);
}

function buildSkippedCommentFile({ video, fetchedAt, reason }) {
  const sourceCommentCount = getSourceCommentCount(video);

  return {
    id: toSafeString(video?.id),
    title: toSafeString(video?.title),
    categoryList: Array.isArray(video?.categoryList) ? video.categoryList : [],
    objType: 'video',
    sourceCommentCount,
    fetchStatus: 'skipped',
    fetchReason: toSafeString(reason),
    fetchedAt: toSafeString(fetchedAt),
    counts: {
      sourceCommentCount,
      totalFromApi: 0,
      mainCommentsFetched: 0,
      replyCommentsFetched: 0,
      totalCommentNodesFetched: 0,
    },
    pagination: {
      mainPagesFetched: 0,
      replyRequests: 0,
      replyPagesFetched: 0,
    },
    comments: [],
  };
}

module.exports = {
  buildAggregateCommentSummary,
  buildMainCommentParams,
  buildReplyCommentParams,
  buildSkippedCommentFile,
  filterBlockedComments,
  getSourceCommentCount,
  isExhausted4010Error,
  isRetryableLoginError,
  isTransientTransportError,
  isBlockedUser,
  mergeReplies,
  normalizeWorkerCount,
  pickShardItems,
  shouldDeferFailedVideo,
  shouldWriteCommentFile,
  shouldFetchComments,
  toSafeString,
};
