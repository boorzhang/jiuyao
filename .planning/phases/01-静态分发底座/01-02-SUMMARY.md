---
phase: 01-静态分发底座
plan: 02
subsystem: cloudflare-boundary
tags: [cloudflare, pages, r2, worker, github-actions]
provides:
  - Worker 去站点化配置
  - release 前缀化的 R2 dry-run 上传脚本
  - 使用统一 RELEASE_ID 的 Pages + R2 发布流水线
affects: [phase-1-foundation, deploy, cache, infra]
tech-stack:
  added: [Cloudflare 边界文档]
  patterns: [pages-r2-worker-boundary, release-scoped-r2-upload, ci-release-propagation]
key-files:
  created: [docs/cloudflare-static-boundary.md]
  modified: [wrangler.toml, scripts/upload-r2.sh, .github/workflows/deploy.yml, tests/cloudflare-boundary.test.js, .planning/phases/01-静态分发底座/01-02-PLAN.md]
key-decisions:
  - "Worker 不再托管公开站点壳，公开读流量保持在 Pages + R2"
  - "R2 上传一律写到 releases/<releaseId>/...，并在脚本层固化缓存头和 --dry-run"
requirements-completed: [PLAT-02, PLAT-01]
duration: 15min
completed: 2026-03-27
---

# Phase 01 Plan 02: Cloudflare 发布边界 Summary

**把公开高流量路径从 Worker 剥离出来，并让 CI 能用同一个 `RELEASE_ID` 同版发布 Pages 与 R2。**

## Performance
- **Duration:** 15 min
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- 移除了 `wrangler.toml` 里的 `[site]`，明确 Worker 只保留 API 入口
- 新增 [cloudflare-static-boundary.md](/private/var/zip/jiuyao/docs/cloudflare-static-boundary.md)，把 Pages / R2 / Worker 的职责和禁止事项写死
- 把 `scripts/upload-r2.sh` 改成 release 前缀上传，支持 `--dry-run`，并按 JSON / m3u8 / key 写入不同缓存头
- 把 GitHub Actions 改成统一 `RELEASE_ID`、`build:release`、`upload:r2`、`pages deploy dist/` 的一条线

## Task Commits
1. **TDD RED: 新增 Cloudflare 边界测试** - `27b3696`
2. **Task 1: Worker 去站点化与边界文档** - `d88b8dd`
3. **Task 2: release 前缀化的 R2 上传脚本** - `3b64a45`
4. **Task 3: 同版发布的 GitHub Actions 流水线** - `5db473c`

## Files Created/Modified
- `wrangler.toml` - 去掉 `[site]`，避免 Worker 托管公开静态站点
- `docs/cloudflare-static-boundary.md` - 记录 Pages / R2 / Worker 的硬边界和发布顺序
- `scripts/upload-r2.sh` - 支持 `RELEASE_ID`、`--dry-run` 和资源级缓存头
- `.github/workflows/deploy.yml` - 在 CI 中统一 `RELEASE_ID`、`DATA_BASE` 和发布顺序
- `tests/cloudflare-boundary.test.js` - 固定去站点化、上传前缀和 CI 流程的回归检查

## Decisions & Deviations
- 原计划 frontmatter 一度把 `PLAT-03` 挂在 `01-02` 上，但实际 HTML / JS / CSS 的缓存闭环还依赖 `01-03` 的 `_headers` 与前端 release-aware 改造，因此在执行后把 `01-02-PLAN.md` 的 requirements 收紧为 `PLAT-01, PLAT-02`
- `upload:r2 --dry-run` 在真实仓库上会枚举大量对象，因此这次验证只把它跑到命令完成，不额外打印全量对象清单到总结里

## Issues Encountered
- `tests/cloudflare-boundary.test.js` 最初要求脚本中出现固定前缀字符串，但 `scripts/upload-r2.sh` 一开始只通过变量拼接 key。后续把 `DATA_PREFIX` / `M3U8_PREFIX` 写成显式常量后解决。

## Next Phase Readiness
- `01-03` 现在可以在不改变 Cloudflare 发布边界的前提下，继续补 `_headers`、Service Worker 与前端 release 指针逻辑
- Phase 1 的公开读路径边界已经固定，后续不会再把首页、JSON 或 m3u8 引回 Worker
