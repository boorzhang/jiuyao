---
phase: 01-静态分发底座
plan: 03
subsystem: frontend-runtime-cache
tags: [release-json, service-worker, cache-control, vendor]
provides:
  - release-aware 前端启动链
  - Pages `_headers` 缓存合同
  - 按 `releaseId` 分代的 Service Worker 缓存策略
affects: [phase-1-foundation, runtime, cache, pwa]
tech-stack:
  added: [Cloudflare Pages `_headers`, 固定版 HLS vendor 入口]
  patterns: [release-manifest-bootstrap, release-scoped-sw-cache, pages-cache-contract]
key-files:
  created: [src/frontend/_headers, src/frontend/vendor/hls.min.js, tests/cache-policy.test.js, tests/frontend-release.test.js]
  modified: [src/frontend/index.html, src/frontend/js/app.js, src/frontend/js/api.js, src/frontend/sw.js, scripts/build-frontend.js]
key-decisions:
  - "浏览器启动先读取 `release.json`，再决定当前数据基址并初始化页面"
  - "HTML / release.json / sw.js 使用 no-store，`/assets/*` 使用 immutable，SW 缓存名带上 releaseId"
requirements-completed: [PLAT-03]
duration: 17min
completed: 2026-03-27
---

# Phase 01 Plan 03: 缓存与运行时一致性 Summary

**把浏览器运行时切到 release-aware 模式：前端现在会先读取 `release.json`，再按当前 `releaseId` 使用正确的数据前缀和缓存分层。**

## Performance
- **Duration:** 17 min
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- 把 [index.html](/private/var/zip/jiuyao/src/frontend/index.html) 中的 `hls.js@latest` 替换成仓库内 [hls.min.js](/private/var/zip/jiuyao/src/frontend/vendor/hls.min.js) 固定入口
- 在 [app.js](/private/var/zip/jiuyao/src/frontend/js/app.js) 中新增 `release.json` 启动流程，先应用 manifest 再读取 `config.json`
- 在 [api.js](/private/var/zip/jiuyao/src/frontend/js/api.js) 中把数据与 m3u8 URL 统一改成基于 manifest 的前缀构造，并在 release 切换时清空 JSON / 图片内存缓存
- 新增 [src/frontend/_headers](/private/var/zip/jiuyao/src/frontend/_headers)，把 HTML / release 指针 / sw.js 和 immutable 资产拆成不同缓存合同
- 重写 [sw.js](/private/var/zip/jiuyao/src/frontend/sw.js)，让缓存名带 `releaseId`，并维持 m3u8 `network only`、JSON `network-first`、站点壳 `cache-first`
- 补上 [tests/frontend-release.test.js](/private/var/zip/jiuyao/tests/frontend-release.test.js) 和 [tests/cache-policy.test.js](/private/var/zip/jiuyao/tests/cache-policy.test.js) 锁定运行时与缓存边界

## Task Commits
1. **Task 1-3: release-aware 前端与缓存合同** - `c485291`

## Files Created/Modified
- [src/frontend/index.html](/private/var/zip/jiuyao/src/frontend/index.html) - 使用本地固定版 HLS vendor 入口
- [src/frontend/js/app.js](/private/var/zip/jiuyao/src/frontend/js/app.js) - 启动时先读取 `release.json`，并把 `releaseId` 传给 Service Worker
- [src/frontend/js/api.js](/private/var/zip/jiuyao/src/frontend/js/api.js) - release-aware 数据基址、m3u8 地址和缓存清理
- [src/frontend/sw.js](/private/var/zip/jiuyao/src/frontend/sw.js) - release 分代缓存与三层缓存策略
- [src/frontend/_headers](/private/var/zip/jiuyao/src/frontend/_headers) - Pages 侧缓存头合同
- [src/frontend/vendor/hls.min.js](/private/var/zip/jiuyao/src/frontend/vendor/hls.min.js) - 固定版本 HLS vendor 入口文件
- [scripts/build-frontend.js](/private/var/zip/jiuyao/scripts/build-frontend.js) - 让 `/vendor/*` 在构建后也进入 `/assets/<releaseId>/vendor/*`
- [tests/frontend-release.test.js](/private/var/zip/jiuyao/tests/frontend-release.test.js) - 固定 release 启动链与 HLS vendor 引用
- [tests/cache-policy.test.js](/private/var/zip/jiuyao/tests/cache-policy.test.js) - 固定 `_headers` 与 SW 缓存合同

## Decisions & Deviations
- `src/frontend/index.html` 源码继续写 `/vendor/hls.min.js`，但构建产物会被 [build-frontend.js](/private/var/zip/jiuyao/scripts/build-frontend.js) 改写到 `/assets/<releaseId>/vendor/...`，这样 vendor 也能吃到 immutable 缓存
- 当前执行环境无法直接把完整 `hls.min.js` bundle 下载进仓库，所以 [src/frontend/vendor/hls.min.js](/private/var/zip/jiuyao/src/frontend/vendor/hls.min.js) 先落成“固定版本入口文件”，把 runtime 漂移从 `@latest` 收紧为锁定到 `1.5.17` 的双 CDN 回退路径；后续若环境允许出站下载，可再替换成完整自托管 bundle

## Issues Encountered
- 直接使用 `curl` 下载固定版 `hls.min.js` 在当前环境里长时间无返回，因此这次没有把完整第三方 bundle 原样 vendoring 到仓库，只完成了版本固定与本地入口收口

## Next Phase Readiness
- Phase 1 所需的发布版本、Cloudflare 边界和缓存策略都已落地，公开浏览入口可以直接建立在稳定的静态分发合同上
- 下一步可以进入 `Phase 2: 公开浏览入口` 的计划与实现，不必再回头重做 release / cache 基建
