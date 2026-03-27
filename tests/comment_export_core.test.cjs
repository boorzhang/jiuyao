const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMainCommentParams,
  buildReplyCommentParams,
  buildSkippedCommentFile,
  filterBlockedComments,
  isExhausted4010Error,
  isTransientTransportError,
  mergeReplies,
  shouldDeferFailedVideo,
  shouldWriteCommentFile,
  shouldFetchComments,
} = require('../lib/comment_export_core');

test('shouldFetchComments 仅在评论数大于 0 或强制抓取时返回 true', () => {
  assert.equal(shouldFetchComments({ commentCount: 5 }), true);
  assert.equal(shouldFetchComments({ commentCount: 0 }), false);
  assert.equal(shouldFetchComments({ commentCount: -3 }), false);
  assert.equal(shouldFetchComments({ commentCount: 0, forceAll: true }), true);
});

test('buildMainCommentParams 生成前端同款主评论参数', () => {
  const now = '2026-03-26T10:00:00.000Z';
  assert.deepEqual(
    buildMainCommentParams({
      videoId: 'vid_001',
      pageNumber: 2,
      pageSize: 15,
      now,
    }),
    {
      objID: 'vid_001',
      objType: 'video',
      curTime: now,
      pageNumber: '2',
      pageSize: '15',
    }
  );
});

test('buildReplyCommentParams 生成二级回复参数', () => {
  const now = '2026-03-26T10:00:00.000Z';
  const parentComment = {
    id: 'comment_01',
    objID: 'vid_001',
    Info: [{ id: 'reply_01' }],
  };

  assert.deepEqual(
    buildReplyCommentParams({
      parentComment,
      pageNumber: 3,
      pageSize: 15,
      now,
    }),
    {
      objID: 'vid_001',
      cmtId: 'comment_01',
      fstID: 'reply_01',
      curTime: now,
      pageNumber: '3',
      pageSize: '15',
    }
  );
});

test('mergeReplies 会按 id 去重并保持原始顺序', () => {
  const previewReplies = [
    { id: 'r1', content: '预览 1' },
    { id: 'r2', content: '预览 2' },
  ];
  const fetchedReplies = [
    { id: 'r2', content: '重复 2' },
    { id: 'r3', content: '新增 3' },
  ];

  assert.deepEqual(mergeReplies(previewReplies, fetchedReplies), [
    { id: 'r1', content: '预览 1' },
    { id: 'r2', content: '预览 2' },
    { id: 'r3', content: '新增 3' },
  ]);
});

test('buildSkippedCommentFile 会生成空评论输出结构', () => {
  const out = buildSkippedCommentFile({
    video: {
      id: 'vid_001',
      title: '测试视频',
      categoryList: ['国产'],
      raw: { commentCount: 0 },
    },
    fetchedAt: '2026-03-26T10:00:00.000Z',
    reason: 'comment_count_non_positive',
  });

  assert.equal(out.id, 'vid_001');
  assert.equal(out.fetchStatus, 'skipped');
  assert.equal(out.fetchReason, 'comment_count_non_positive');
  assert.equal(out.sourceCommentCount, 0);
  assert.deepEqual(out.comments, []);
  assert.equal(out.counts.mainCommentsFetched, 0);
  assert.equal(out.counts.replyCommentsFetched, 0);
  assert.equal(out.pagination.mainPagesFetched, 0);
});

test('filterBlockedComments 会过滤 userID 为 100001 的主评论和回复', () => {
  const comments = [
    {
      id: 'c1',
      userID: 100001,
      allReplies: [
        { id: 'r1', userID: 200001 },
      ],
    },
    {
      id: 'c2',
      userID: 200002,
      allReplies: [
        { id: 'r2', userID: 100001 },
        { id: 'r3', userID: 200003 },
      ],
    },
  ];

  assert.deepEqual(filterBlockedComments(comments, new Set(['100001'])), [
    {
      id: 'c2',
      userID: 200002,
      allReplies: [
        { id: 'r3', userID: 200003 },
      ],
    },
  ]);
});

test('shouldWriteCommentFile 仅在评论数组非空时返回 true', () => {
  assert.equal(shouldWriteCommentFile([{ id: 'c1' }]), true);
  assert.equal(shouldWriteCommentFile([]), false);
  assert.equal(shouldWriteCommentFile(null), false);
});

test('isExhausted4010Error 仅识别纯 4010 耗尽错误', () => {
  assert.equal(isExhausted4010Error({ failureKind: 'auth_4010_exhausted' }), true);
  assert.equal(isExhausted4010Error({ failureKind: 'network_timeout' }), false);
  assert.equal(isExhausted4010Error(new Error('普通错误')), false);
});

test('isTransientTransportError 识别 curl 传输层瞬时错误', () => {
  assert.equal(isTransientTransportError({ failureKind: 'curl_transport_error' }), true);
  assert.equal(isTransientTransportError({ failureKind: 'auth_4010_exhausted' }), false);
  assert.equal(isTransientTransportError(new Error('普通错误')), false);
});

test('shouldDeferFailedVideo 在未达到延后上限前会延后纯 4010 耗尽错误', () => {
  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'auth_4010_exhausted' },
      deferredAttempt: 0,
      maxDeferredAttempts: 2,
    }),
    true
  );

  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'auth_4010_exhausted' },
      deferredAttempt: 1,
      maxDeferredAttempts: 2,
    }),
    true
  );

  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'curl_transport_error' },
      deferredAttempt: 0,
      maxDeferredAttempts: 2,
    }),
    true
  );
});

test('shouldDeferFailedVideo 达到上限或非 4010 错误时不延后', () => {
  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'auth_4010_exhausted' },
      deferredAttempt: 2,
      maxDeferredAttempts: 2,
    }),
    false
  );

  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'network_timeout' },
      deferredAttempt: 0,
      maxDeferredAttempts: 2,
    }),
    false
  );
});
