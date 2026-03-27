# Stack Research

**Domain:** 低服务器成本的公开 PWA 视频站
**Researched:** 2026-03-27
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Cloudflare Pages | 当前平台能力 | 托管公开站点 HTML、CSS、JS 与静态壳 | 静态资源请求不走 Worker 计费，最符合“公开访问 + 强缓存 + 低成本”的目标 |
| Cloudflare R2 + Custom Domain | 当前平台能力 | 托管视频 JSON、封面、m3u8 与较大静态数据 | 官方支持自定义域名接入 Cloudflare Cache，适合把大部分数据访问从计算层移走 |
| Cloudflare Workers（极薄 API） | Standard usage model | 仅承担后续会员、签名、少量边缘逻辑 | 官方计费说明表明只有命中 Worker 的请求才计费；静态资源路径应尽量不进入 Worker |
| Node.js | 20 LTS | 本地构建、数据整理、CI 与部署脚本运行时 | 当前仓库 CI 已用 Node 20，继续沿用能减少迁移风险 |
| 原生浏览器 PWA 能力 | 当前浏览器标准 | Service Worker、Manifest、离线壳、安装能力 | 当前项目已经有原生实现基础，继续沿用比引入重框架更省成本 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hls.js` | 1.6.15 | 在不原生支持 HLS 的浏览器中播放 HLS 流 | 需要兼容桌面 Chrome 等 MSE 浏览器时使用；必须固定版本，不能继续用 `@latest` |
| `workbox-*` | 7.4.0 | 简化 Service Worker 路由、过期策略和缓存控制 | 当当前手写 `src/frontend/sw.js` 继续变复杂，且需要更稳妥的运行时缓存淘汰逻辑时引入 |
| `sitemap` 或自定义 sitemap 生成脚本 | 8.x 或自研 | 生成 XML sitemap / video sitemap | 当开始做 SEO 可抓取页、视频 sitemap 与 Search Console 提交时使用 |
| JSON-LD 生成脚本 | 自研 | 为详情页或 SEO 着陆页注入 `VideoObject` 结构化数据 | 当需要对可索引详情页补齐视频元信息时使用 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Wrangler 4.x | 部署 Worker、管理 R2、调试 Cloudflare 资源 | 建议把本地和 CI 的 Wrangler 主版本固定，避免部署脚本行为漂移 |
| GitHub Actions | 自动部署 Pages、执行构建检查 | 当前仓库已存在部署工作流，但需要补齐数据发布与一致性校验 |
| Lighthouse / Search Console | 监控 SEO、PWA 与性能信号 | 不一定必须接入 CI，但至少要纳入人工验收 |

## Installation

```bash
# Core
npm install hls.js@1.6.15

# Supporting
npm install workbox-window@7.3.0 workbox-routing@7.3.0 workbox-strategies@7.3.0 sitemap

# Dev dependencies
npm install -D wrangler
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Cloudflare Pages + R2 + 极薄 Worker | 让所有详情页都走 SSR / Pages Functions | 只有当你确认要为大量详情页实时生成 HTML，且愿意接受 Worker 请求成本时才考虑 |
| 原生无框架前端 + 构建脚本 | Next.js / Nuxt / Astro 全栈方案 | 当后续必须做大规模 SEO 预渲染、复杂路由和模板管理时可以考虑迁移，但会增加构建和运行复杂度 |
| 客户端本地用户状态 | D1 / Durable Objects 用户中心 | 只有当“跨设备同步、服务端账号、付费校验”成为核心需求时才值得引入 |
| 预计算推荐与静态分页 | 实时推荐 / 实时排序服务 | 只有当站点增长到需要实时运营策略时才需要；当前目标下属于过度设计 |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `https://cdn.jsdelivr.net/npm/hls.js@latest` | 运行时版本漂移不可控，且没有 SRI；会把播放器兼容问题变成线上随机问题 | 固定具体版本并随站点发布 |
| 让首页、分类页、详情页都经过 Pages Functions 或 Worker | 官方计费明确只有命中 Worker 的请求才计费；热门公开流量如果全进 Worker，会直接破坏低成本模型 | 把公开内容页尽量做成静态资源，仅保留极少量 API 走 Worker |
| 为 70k+ 视频在 Pages Free 里生成 70k+ 独立 HTML 文件 | Pages Free 官方限制每个站点 20,000 文件，长期不可行 | 只为关键 SEO 页面生成静态 HTML；长尾详情页保留模板化路由和更克制的索引策略 |
| 把 likes / history / guest profile 写到服务端 | 当前核心价值不是用户系统，服务端状态会显著增加成本和复杂度 | 继续保留本地存储，等验证真实需求后再同步上云 |
| 一开始引入 D1、Durable Objects、Queues 全家桶 | 这些能力不是当前问题的主解，且会扩大运行成本面和维护面 | 先把 Pages + R2 + 构建链打磨到位 |

## Stack Patterns by Variant

**If 目标是继续保持几乎零运行成本：**
- 用 `Pages + R2 + 静态 JSON + 预计算分页/推荐`
- 因为公开流量主要消耗缓存层，而不是计算层

**If 目标是提升 SEO 但不能让所有详情页进动态渲染：**
- 为首页、分类页、标签页、作者页和一小部分高价值详情页生成静态 HTML
- 因为 Pages Free 有文件数限制，不能把 70k+ 视频都做成独立静态页

**If 后续必须上线支付 / 会员：**
- 保留独立 `api.` Worker 子域或明确 `/api/*` 边界
- 因为商业逻辑必须与公开缓存内容隔离，不能污染静态缓存策略

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js 20 LTS | 当前 `package.json`、GitHub Actions Node 20 | 与现有仓库最一致；迁移到 22 前先验证构建脚本和 Wrangler 行为 |
| `hls.js@1.6.15` | 现代 MSE 浏览器 | 适合继续作为浏览器回退播放器，但必须锁版本 |
| `workbox@7.x` | 原生 Service Worker 项目 | 可逐步替代一部分手写缓存逻辑，不要求全量迁移 |

## Sources

- https://developers.cloudflare.com/pages/platform/limits/ — 验证 Pages Free 的 20,000 文件限制、25 MiB 单文件限制、Functions 计费边界
- https://developers.cloudflare.com/pages/configuration/headers/ — 验证 `_headers` 可用于静态页响应头，且不自动作用于 Pages Functions
- https://developers.cloudflare.com/r2/data-access/public-buckets/ — 验证 R2 自定义域名、缓存能力、`r2.dev` 仅适合非生产
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ — 验证 R2 可通过自定义域名接入 Cloudflare 缓存
- https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/ — 验证 Cache Everything 的收益和对动态内容的风险
- https://developers.cloudflare.com/workers/platform/pricing/ — 验证 Worker 计费边界、静态资源免费、Standard usage 模型
- https://github.com/video-dev/hls.js/releases — 验证 `hls.js` 当前稳定版本线
- https://github.com/GoogleChrome/workbox/releases — 验证 Workbox 当前主版本线
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — 验证 SPA / History API / canonical / prerender 的 SEO 约束

---
*Stack research for: 低服务器成本的公开 PWA 视频站*
*Researched: 2026-03-27*
