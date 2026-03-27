# Architecture Research

**Domain:** 低服务器成本的公开 PWA 视频站
**Researched:** 2026-03-27
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                      Public Web Layer                         │
├───────────────────────────────────────────────────────────────┤
│  Cloudflare Pages                                            │
│  ┌────────────────────┐  ┌─────────────────────────────────┐ │
│  │ App Shell / SEO 页 │  │ CSS / JS / Manifest / Icons     │ │
│  └─────────┬──────────┘  └──────────────┬──────────────────┘ │
│            │                             │                    │
├────────────┴─────────────────────────────┴────────────────────┤
│                       Static Data Layer                       │
├───────────────────────────────────────────────────────────────┤
│  Cloudflare R2 (custom domain behind Cache)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ list JSON    │  │ detail JSON  │  │ m3u8 / images / etc │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                 │                    │             │
├─────────┴─────────────────┴────────────────────┴─────────────┤
│                    Thin Dynamic Boundary                      │
├───────────────────────────────────────────────────────────────┤
│  Cloudflare Worker (/api/* only, future membership/payment)  │
├───────────────────────────────────────────────────────────────┤
│                   Offline Build / Publish Layer               │
├───────────────────────────────────────────────────────────────┤
│  Export scripts → Build scripts → dist/ + r2-data/ + purge   │
└───────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Pages 静态站壳 | 提供首页、分类页、PWA 壳、少量 SEO 页与公共资源 | `dist/` + `_headers` + 可选 `_redirects` |
| R2 数据域名 | 提供 JSON、封面、m3u8 等静态对象 | `r2-data/` 上传到 R2，自定义域名接入缓存 |
| Thin API Worker | 提供后续会员、支付、签名、极少数非缓存接口 | 独立 `api.` 子域或严格 `/api/*` 边界 |
| 离线构建链 | 生成分类分页、详情 JSON、推荐、评论、sitemap 等 | `src/build/*` 与额外 SEO/发布脚本 |
| 客户端状态层 | 管理游客身份、历史、收藏、设置 | `localStorage` + 模块化状态 |

## Recommended Project Structure

```text
src/
├── build/              # 数据与 SEO 构建脚本
│   ├── seo/            # sitemap、JSON-LD、静态 SEO 页生成
│   └── publish/        # 构建产物清单、校验、purge 描述
├── frontend/           # 公开页面壳、PWA、播放器与路由
│   ├── js/
│   ├── css/
│   └── sw.js
├── worker/             # 仅保留 /api/* 边界
└── shared/             # 复用 schema、常量、推荐规则

scripts/
├── export/             # 上游抓取与数据准备
└── deploy/             # R2 上传、purge、发布校验

r2-data/                # R2 发布源目录
dist/                   # Pages 发布目录
```

### Structure Rationale

- **`src/build/seo/`:** SEO 资产不该散落在前端运行时代码里，而应作为构建产物统一生成。
- **`src/worker/`:** 必须保持极薄边界，避免未来把公开页面逻辑误放进 Worker。
- **`scripts/deploy/`:** 需要把数据上传、缓存 purge、版本校验从随手执行的脚本提升为明确发布步骤。

## Architectural Patterns

### Pattern 1: Precompute Everything You Can

**What:** 列表、分页、推荐、详情、评论和 sitemap 尽可能在构建时生成，而不是在请求时实时计算。  
**When to use:** 内容更新频率低、数据规模大、核心目标是低成本时。  
**Trade-offs:** 构建时间会增加，但线上请求成本显著下降。

**Example:**
```ts
// 构建时生成好 feed 和详情 JSON，线上只读静态对象
buildCategories();
buildFeeds();
buildVideoDetails();
buildVideoSitemaps();
```

### Pattern 2: Dynamic Boundary as a Hard Fence

**What:** 公开页面全部静态化，任何会导致写入、鉴权或个性化的请求统一收敛到 `/api/*`。  
**When to use:** 想要把大部分访问完全交给缓存层时。  
**Trade-offs:** 某些“方便的实时功能”会被刻意推迟。

**Example:**
```ts
if (url.pathname.startsWith('/api/')) {
  return handleApi(request);
}
return env.ASSETS.fetch(request);
```

### Pattern 3: Bounded Runtime Cache

**What:** Service Worker 只预缓存壳和高复用资源，对 JSON、图片、m3u8 使用有界、可淘汰的运行时策略。  
**When to use:** PWA 需要更快、更稳，但不能占满用户设备时。  
**Trade-offs:** 需要更细的缓存分类和清理逻辑。

## Data Flow

### Request Flow

```text
[User opens /category/xxx/page/2]
    ↓
[Pages static HTML or app shell]
    ↓
[Client fetches JSON from R2 custom domain]
    ↓
[Detail page fetches video JSON + comments JSON]
    ↓
[Player fetches m3u8 from R2]
```

### State Management

```text
[localStorage]
    ↓ (hydrate)
[store.js / page module state]
    ↓
[UI events] → [history / likes / favorites updates]
    ↓
[persist locally only]
```

### Key Data Flows

1. **Public browse flow:** Pages 提供壳，R2 提供列表 JSON，客户端渲染分类和详情。
2. **Playback flow:** 详情 JSON 提供播放器元信息，播放器再请求 R2 的 m3u8。
3. **SEO flow:** 构建阶段生成 sitemap、重点页面 metadata、结构化数据和可抓取链接。
4. **Release flow:** 数据构建 → 前端构建 → R2 上传 → Pages 部署 → cache purge / 发布校验。

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10k DAU | 现有 Pages + R2 + 极薄 Worker 足够，优先统一部署链和缓存策略 |
| 10k-100k DAU | 优先提升缓存命中、清理客户端缓存、减少 Worker 参与、控制 JSON 粒度和对象大小 |
| 100k+ DAU | 才考虑更细的内容分层、热点页静态化策略、更多自动化 purge / 观测，而不是一开始引入重后端 |

### Scaling Priorities

1. **First bottleneck:** 缓存命中率和文件组织方式，而不是数据库。先优化 JSON 粒度、响应头、Cache Rules、R2 域名接入。
2. **Second bottleneck:** 客户端内存和 Service Worker 策略。长时间刷视频时的缓存与 blob URL 管理会先出问题。

## Anti-Patterns

### Anti-Pattern 1: One HTML File Per Video on Pages Free

**What people do:** 为所有 70k+ 视频都生成一个独立 HTML 文件。  
**Why it's wrong:** Pages Free 官方只支持 20,000 文件，根本承载不了长尾详情页静态文件海。  
**Do this instead:** 首页、分类、标签、作者页与高价值详情页优先静态化，长尾详情保持模板化路由和更保守的索引策略。

### Anti-Pattern 2: SEO by Sending Every Page Through Functions

**What people do:** 为了 title/canonical/JSON-LD，把所有公开页都改成 Pages Functions / Worker 渲染。  
**Why it's wrong:** 会把最大流量面改造成计费面，直接冲掉“低成本运行”的核心价值。  
**Do this instead:** 先用静态构建生成 SEO 资产；把动态逻辑严格限制在低频接口上。

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cloudflare Pages | 静态部署 | `_headers` 适用于静态响应，不自动作用于 Pages Functions |
| Cloudflare R2 | 自定义域名 + Cache Rules | 只有自定义域名场景才能完整使用缓存、WAF 等能力 |
| Cloudflare Cache | 按 URL 类型分层 | `Cache Everything` 很有用，但绝不能套到动态或个性化内容 |
| Google Search | sitemap + canonical + JSON-LD + crawlable links | 需要真实 `<a href>`、History API 路由、正确状态码 |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `src/build/*` ↔ `r2-data/` | 文件输出 | 所有线上静态数据都应来自可重复构建链 |
| `dist/` ↔ `r2-data/` | URL / config 契约 | 前端必须能清晰区分 Pages 壳和 R2 数据域名 |
| `frontend` ↔ `worker` | `/api/*` HTTP | 不允许公开内容页跨越这条边界 |

## Sources

- https://developers.cloudflare.com/pages/platform/limits/ — Pages 文件数、文件大小、Functions 计费边界
- https://developers.cloudflare.com/pages/configuration/headers/ — `_headers` 行为边界
- https://developers.cloudflare.com/r2/data-access/public-buckets/ — R2 自定义域名、缓存与生产访问方式
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ — R2 与 Cloudflare 缓存集成方式
- https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/ — Cache Everything 规则与风险
- https://developers.cloudflare.com/workers/platform/pricing/ — 静态资源与 Worker 请求的成本边界
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — SPA、History API、SSR / prerender 与 canonical 基线
- `.planning/PROJECT.md` — 项目目标与边界
- `.planning/codebase/ARCHITECTURE.md` — 当前已有架构

---
*Architecture research for: 低服务器成本的公开 PWA 视频站*
*Researched: 2026-03-27*
