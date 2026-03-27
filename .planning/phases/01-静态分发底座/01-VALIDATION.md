---
phase: 1
slug: 01-静态分发底座
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 1 — Validation Strategy

> 针对“静态分发底座”阶段的执行期验证合同。目标是用快速、可重复的本地检查守住发布边界、版本一致性与缓存策略。

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Config file** | `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && node --test tests/build-release.test.js tests/cloudflare-boundary.test.js tests/cache-policy.test.js tests/frontend-release.test.js` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && node --test tests/build-release.test.js tests/cloudflare-boundary.test.js tests/cache-policy.test.js tests/frontend-release.test.js`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PLAT-02 | unit | `node --test tests/release-manifest.test.js` | ❌ phase | ⬜ pending |
| 01-01-02 | 01 | 1 | PLAT-02 | smoke | `node --test tests/build-release.test.js` | ❌ phase | ⬜ pending |
| 01-01-03 | 01 | 1 | PLAT-02 | unit | `npm test` | ✅ existing | ⬜ pending |
| 01-02-01 | 02 | 2 | PLAT-01 | unit | `node --test tests/cloudflare-boundary.test.js` | ❌ phase | ⬜ pending |
| 01-02-02 | 02 | 2 | PLAT-03 | unit | `node --test tests/cloudflare-boundary.test.js` | ❌ phase | ⬜ pending |
| 01-02-03 | 02 | 2 | PLAT-02 | unit | `node --test tests/cloudflare-boundary.test.js tests/build-release.test.js` | ❌ phase | ⬜ pending |
| 01-03-01 | 03 | 2 | PLAT-02 | unit | `node --test tests/frontend-release.test.js` | ❌ phase | ⬜ pending |
| 01-03-02 | 03 | 2 | PLAT-03 | unit | `node --test tests/cache-policy.test.js` | ❌ phase | ⬜ pending |
| 01-03-03 | 03 | 2 | PLAT-03 | smoke | `npm test && node --test tests/cache-policy.test.js tests/frontend-release.test.js` | ❌ phase | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- [x] Node 原生测试框架已存在，不需要新增测试框架
- [x] `package.json` 已具备统一测试入口，可在 Phase 1 内扩展覆盖范围
- [x] 不需要额外安装浏览器驱动、数据库或外部服务

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pages 生产域名仅服务静态站点壳，不再经 Worker 托管 | PLAT-01 | 域名与 Cloudflare 资源绑定不在仓库内 | 在 Cloudflare Dashboard 检查 Pages 项目绑定的生产域名，确认公开页面解析到 Pages，而不是 Worker `route` |
| R2 自定义域指向预期 bucket，且公开读取 `releases/<releaseId>/data/*` 与 `m3u8/*` | PLAT-01, PLAT-03 | R2 自定义域和公开访问策略属于外部平台配置 | 在 Cloudflare Dashboard 打开 R2 Bucket 和 Custom Domains，确认域名、公开策略和路径前缀符合发布文档 |
| Worker 仅暴露 `/api/*` 低频接口 | PLAT-01 | Worker route 规则属于外部平台配置 | 在 Dashboard 查看 Worker 路由或单独 API 域，确认没有 `/`、`/data/*`、`/m3u8/*` 之类公开读路径 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or existing test infrastructure
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-03-27
