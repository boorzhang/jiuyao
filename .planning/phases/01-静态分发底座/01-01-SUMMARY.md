---
phase: 01-静态分发底座
plan: 01
subsystem: release-pipeline
tags: [release-id, build, r2-data, pages]
provides:
  - 统一的 RELEASE_ID 解析与 release manifest 生成能力
  - 可复用的 build:data / build:frontend / build:release 入口
  - 默认测试入口覆盖 .js 与 .cjs 两类测试文件
affects: [phase-1-foundation, deploy, cache]
tech-stack:
  added: [package-lock.json]
  patterns: [shared-release-manifest, release-scoped-assets, fixture-based-build-test]
key-files:
  created: [scripts/lib/release.js, scripts/build-release.js, package-lock.json]
  modified: [scripts/build-frontend.js, src/build/index.js, src/build/config.js, package.json, tests/release-manifest.test.js, tests/build-release.test.js]
key-decisions:
  - "发布版本号统一按 RELEASE_ID > GITHUB_SHA 前 12 位 > UTC 时间戳 解析"
  - "前端高复用静态资源从 /assets/<releaseId>/... 输出，为后续 immutable 缓存做准备"
requirements-completed: [PLAT-02]
duration: 12min
completed: 2026-03-27
---

# Phase 01 Plan 01: 发布版本基线 Summary

**建立了可重复的 release 基线：前端壳、R2 数据和发布清单现在可以共享同一个 `releaseId`。**

## Performance
- **Duration:** 12 min
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- 新增 `scripts/lib/release.js`，统一解析 `RELEASE_ID` 并生成 `release manifest`
- 把 `src/build/index.js` 和 `scripts/build-frontend.js` 改造成可复用函数，支持 `build:release`
- 让 `dist/release.json` 和 `r2-data/data/config.json` 输出相同的 `releaseId`
- 补上 `package-lock.json`，让 `npm ci` 具备可执行基础
- 把默认测试入口扩展到 `tests/*.test.cjs`，并新增 release 相关 fixture 回归

## Task Commits
1. **TDD RED: 新增 release 测试** - `fe9acd2`
2. **Task 1: 共享 release 工具与数据版本字段** - `fb112a3`
3. **Task 2: 统一 build:release 入口与锁文件** - `f3775e7`
4. **Task 3: 收紧 release 构建 fixture 回归** - `d30497a`

## Files Created/Modified
- `scripts/lib/release.js` - 提供 releaseId 解析、manifest 生成和 JSON 写入工具
- `scripts/build-release.js` - 统一编排前端构建、数据构建和 `dist/release.json`
- `scripts/build-frontend.js` - 输出 `/assets/<releaseId>/...` 静态资源路径
- `src/build/index.js` - 暴露 `buildData()`，支持传入 `releaseId` 和 `generatedAt`
- `src/build/config.js` - 将 `releaseId`、`generatedAt`、`assetPrefix` 写入 `config.json`
- `package.json` - 新增 `build:release`，并让默认测试入口包含 `.cjs`
- `package-lock.json` - 提供 `npm ci` 所需锁文件
- `tests/release-manifest.test.js` - 覆盖 releaseId 解析与 manifest 结构
- `tests/build-release.test.js` - 用最小 fixture 验证统一发布构建

## Decisions & Deviations
- 按 TDD 先提交了失败测试，再补最小实现并回跑转绿
- `build-frontend.js` 当前保留了 root 级复制，同时额外输出 release 作用域资产目录；这样能先满足 Phase 1 的版本化需求，不阻断后续 Wave 2/3 继续收紧 Pages 缓存策略
- 构建 fixture 从 1 条视频调整为 2 条视频，避免触发现有推荐生成器的单条数据边界死循环；这次没有修改推荐算法本身，因为不属于 `01-01` 的目标

## Issues Encountered
- `tests/build-release.test.js` 初始 fixture 只有 1 个视频，导致 `buildRecommend()` 无法完成 4 条相关推荐分配。已通过把 fixture 调整为 2 条视频规避，不影响当前发布基线目标。

## Next Phase Readiness
- `01-02` 现在可以基于统一 `releaseId` 收拢 Cloudflare Pages / R2 / Worker 的发布边界
- `01-03` 现在可以让前端运行时真正读取 `release.json`，并把缓存策略绑定到 release 作用域路径
