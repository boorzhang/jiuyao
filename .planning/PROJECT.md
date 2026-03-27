# 九妖零服务器成本 PWA 视频站

## What This Is

这是一个面向公开访客的 PWA 视频站项目，基于现有抓取数据、静态 JSON、Cloudflare Pages、R2 和极薄 Worker 架构运行。它的目标不是做重交互社区，而是在尽量接近零服务器成本的前提下，让用户可以稳定地浏览 70k+ 视频、进入详情页播放、查看静态评论与相关推荐，并把整站尽可能做成可缓存、可部署、可被搜索引擎理解的静态站。

## Core Value

在几乎不依赖传统服务器的前提下，让公开访客可以低成本、稳定、持续地发现并播放大量视频内容。

## Requirements

### Validated

- ✓ 公开访客可以浏览静态首页、分类页和详情页内容 — existing
- ✓ 前端已经具备 PWA 基础能力，包括 Service Worker 与可安装外壳 — existing
- ✓ 视频详情页已经具备 HLS 播放基础链路，可从静态数据和 m3u8 资源播放视频 — existing
- ✓ 站点已经具备基于静态 JSON 的分类分页、最新列表、热门推荐和详情相关推荐能力 — existing
- ✓ 评论数据已经支持离线抓取、构建为静态文件并在前端展示只读评论 — existing
- ✓ 用户本地状态已经支持游客身份、点赞、收藏、关注和播放记录落在客户端 localStorage — existing
- ✓ 仓库已经具备本地开发、数据构建、前端构建、Cloudflare Pages 部署和 R2 上传脚本基础 — existing

### Active

- [ ] 公开访客可以围绕“首页/分类/详情/播放/评论/相关推荐/PWA 安装”这条路径顺畅使用站点
- [ ] 站点在 70k+ 视频规模下仍保持以静态 JSON + R2 为主的数据分发模型，避免高计算后端
- [ ] 页面与资源尽可能命中 Cloudflare 缓存，优先把 HTML、CSS、JS、JSON、封面和 m3u8 的成本压到免费层附近
- [ ] Cloudflare Pages、R2 与 Worker 的整体部署方案可稳定运行，并以低计算量支撑 10k+ 日活目标
- [ ] 站点在现有静态化架构下尽量提升 SEO 友好度，至少保证公开页可访问、可抓取、可索引

### Out of Scope

- 会员支付与付费开通闭环 — 延后到站点验证出真实日活和成本压力之后再做
- 服务端用户账号体系 — 前期用户身份和行为数据全部保留在客户端，不引入重后端
- 用户发评论或其它 UGC 互动 — 前期只展示抓取后的静态评论，不开放写入
- 搜索功能 — 当前内容组织依赖固定分类、固定分页、最新和热门分发
- 个性化推荐 — 当前推荐策略保持简单，优先使用热门和固定覆盖逻辑
- 实时统计、复杂埋点和精细运营后台 — 前期优先低成本运行，而不是运营系统建设
- 高频内容更新机制 — 当前以静态构建与分发为主，不把实时更新作为 v1 目标
- 复杂审核、风控和多角色后台管理 — 当前阶段不引入这类高维护成本系统

## Context

当前仓库是一个 brownfield 项目，已经存在可运行的前端、数据构建脚本、评论抓取脚本、Cloudflare Pages 部署流程和极薄的 Cloudflare Worker 会员接口。现有数据主要来自 `_by_id/`、`_by_tags/`、`comments/` 和 `m3u8/`，构建后产物输出到 `r2-data/`，前端源码位于 `src/frontend/`，构建后发布到 `dist/`。

项目当前已经明确采用“离线抓取与构建、线上静态分发、极薄运行时”的总体结构。用户希望保留这种结构，并继续朝着“绝大多数请求直接命中 Pages 或 R2 缓存、尽量少走 Worker 计算”的方向演进。

当前最重要的不是做完整商业闭环，而是把公开访问路径跑通并压低成本：首页/分类页进入、分页继续浏览、进入详情页、播放 m3u8、查看静态评论与相关推荐、持续刷更多内容、支持 PWA 安装。支付、会员、邮箱采集等功能确认放到后续 phase。

现有实现已经有一些明确风险需要纳入后续规划，包括：部署流水线还没有把前端、R2 数据和 Worker 完整串成单一真相；评论导出脚本存在重复实现；默认测试覆盖不完整；SEO 与缓存策略还需要围绕 Cloudflare 静态分发继续打磨。

## Constraints

- **Hosting**: 必须以 Cloudflare Pages + R2 + Worker 为主架构 — 目标是长期接近零服务器成本运行
- **Cost**: R2 成本目标控制在免费层附近，数据体量尽量压在 10G 以内；Pages/Worker 计算费用希望长期不超过每月 5 美元 — 成本控制是核心目标
- **Scalability**: 目标支持 70k+ 视频和 10k+ DAU 访问量 — 架构必须优先考虑缓存命中和静态分发
- **Architecture**: 尽量使用静态 JSON、静态分页、固定顺序 feed 与预计算推荐 — 通过离线计算换线上低算力
- **User Data**: 非付费阶段不上传用户行为数据；游客用户名、UID、头像、点赞、收藏、播放记录等默认存客户端本地 — 避免引入服务端状态成本和隐私负担
- **SEO**: 公开内容页需要尽量 SEO 友好 — 目标是让站点可被抓取和索引，而不是纯客户端黑盒
- **Scope**: v1 不做支付、用户评论、搜索、个性化推荐和复杂后台 — 先把公开访问与低成本运行打透
- **Recommendation Logic**: 最新页按最新排序，推荐页按热门排序，详情页相关推荐固定 4 条并尽量全覆盖所有视频 ID — 算法简单、稳定、低计算

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 面向公开访客开放访问 | 项目目标是公开可访问的视频站，而不是私有工具 | — Pending |
| 以静态资源分发为主，不建设传统服务端 | 成本控制是最高优先级，必须尽量避免长期算力费用 | — Pending |
| 用户行为数据默认只存客户端本地 | 避免服务端存储、隐私和同步成本，同时匹配当前架构 | — Pending |
| 评论仅做静态展示，不开放用户写入 | 降低后端复杂度、审核成本和滥用风险 | — Pending |
| 支付和会员闭环延后到后续 phase | 先验证公开访问、部署稳定性、缓存策略和成本模型 | — Pending |
| 推荐算法保持简单可预计算 | 当前优先低成本、可缓存和可解释，而不是个性化效果 | — Pending |
| 继续使用 Cloudflare Pages 部署前端、R2 存放 JSON 与 m3u8、Worker 只承担极薄接口职责 | 这与现有代码和目标成本模型最一致 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after initialization*
