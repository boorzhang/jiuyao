# Phase 1: 静态分发底座 - Research

**Researched:** 2026-03-27
**Domain:** Cloudflare Pages + R2 + 极薄 Worker 的静态分发、版本化发布与缓存治理
**Confidence:** HIGH

<user_constraints>
## User Constraints

未检测到本 phase 的 `*-CONTEXT.md`。以下约束来自当前已生效的 `.planning/PROJECT.md`、`.planning/ROADMAP.md`、`.planning/STATE.md`、`CLAUDE.md`、`AGENTS.md`，规划时必须继续遵守：

### Locked Decisions
- 公开浏览主路径必须继续收敛在 Pages + R2 的静态分发边界内，避免 Worker 成为高流量入口。
- v1 不把 70k+ 详情页全量静态化为首发前提，避免撞上 Pages 文件数限制。
- 非付费阶段不上传用户行为数据；游客状态默认仍存客户端本地。
- 当前阶段优先低成本公开访问与播放主路径，不引入重后端、搜索、个性化推荐、支付闭环。

### Claude's Discretion
- 可以决定 R2 与 Pages 的域名拓扑、版本化发布清单结构、缓存规则粒度、R2 上传实现、以及 Phase 1 需要补到什么程度的发布校验。

### Deferred Ideas (OUT OF SCOPE)
- 支付、会员闭环、搜索、个性化推荐、复杂后台管理。
- 70k+ 视频详情页全量静态 HTML。
- 把 PWA 做成重离线产品；PWA 细化治理留到 Phase 5。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | 公开浏览路径在正常访问时不依赖 Worker / Pages Functions 计算，主要由 Pages 静态资源和 R2 数据响应支撑 | 明确 Pages/Worker/R2 域名与路径边界；避免 Functions 进入公开热路径；移除 Worker 静态站点职责 |
| PLAT-02 | 前端发布、R2 数据发布和少量 API 发布具备可重复的版本化流程，避免页面与数据不一致 | 使用单一 `releaseId`、Pages `release.json`、R2 `releases/<releaseId>/...`、可回滚部署记录 |
| PLAT-03 | 公开静态资源、JSON 和 m3u8 具备明确的缓存策略与失效策略，以支持低成本运行目标 | 为 Pages 壳、R2 JSON、m3u8、SW 指定分层缓存策略；优先靠版本化切换，辅以 URL/prefix/tag purge |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 必须继续以 `Cloudflare Pages + R2 + Worker` 为主架构，目标是长期接近零服务器成本运行。
- 公开高流量路径不能重新引回 Worker / Pages Functions；如果要这样做，必须显式说明成本影响。
- 成本是核心约束：R2 尽量压在免费层附近，数据体量尽量控制在 10G 以内，Pages/Worker 计算费用希望长期不超过每月 5 美元。
- 优先用静态 JSON、静态分页、固定顺序 feed、预计算推荐，而不是在线计算。
- v1 不引入支付、用户评论、搜索、个性化推荐和复杂后台。
- 继续使用现有 brownfield 结构，遵守项目现有代码风格与约定，不推荐与项目约束相冲突的新架构。

## Summary

Cloudflare 官方文档把本 phase 的边界说得很清楚：只有“未触发 Functions 的 Pages 静态资源请求”才是免费且无限的静态请求；一旦公开主路径命中 Pages Functions，请求就按 Workers 计量。与此同时，Pages Free 站点仍有 `20,000` 文件上限，R2 想要获得缓存、WAF 与访问控制，必须走自定义域而不是 `r2.dev`。这意味着 Phase 1 不能再接受“Pages / Worker / R2 角色混着用”的现状，必须把公开主路径硬收敛为：Pages 只发静态壳与极少数指针文件，R2 自定义域只发版本化 JSON / m3u8 / key / 封面，Worker 只保留 `/api/*`。

当前仓库已经有若干实现直接破坏 Phase 1 目标：`package.json` 没有 lockfile 但 CI 用 `npm ci`；`wrangler.toml` 仍保留 `[site] bucket = "./dist"` 的 Workers Sites 旧路径；`scripts/upload-r2.sh` 逐对象循环 `wrangler r2 object put`；`src/frontend/index.html` 直接依赖 `hls.js@latest`；`scripts/build-frontend.js` 只是原样复制，完全没有 releaseId 或指纹化；`src/frontend/sw.js` 使用固定 cache name 与固定 app shell 路径，会把版本切换搞成“看起来发了新版本，实际终端还在跑旧壳”。

下面的“releaseId + 双清单发布 + 定向缓存规则”方案，是我根据 Cloudflare 官方缓存/部署能力与当前仓库结构做出的工程推断。它不是泛泛的“可选架构”，而是最适合这个仓库、最符合 PLAT-01/02/03 的可执行路线。

**Primary recommendation:** 使用“`releaseId` 驱动的双清单发布”：Pages 只发布静态壳与 `release.json`，R2 只发布 `releases/<releaseId>/...`，Worker 只保留 `/api/*`，失效优先靠版本切换而不是 `purge everything`。

## Standard Stack

### Core

| Library / Platform | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Cloudflare Pages + `wrangler pages deploy` | `wrangler` `4.77.0` | 发布 `dist/` 静态壳、`release.json`、`_headers` | 官方支持预构建目录直传、部署历史与回滚；静态请求不触发 Functions 时免费且无限 |
| Cloudflare R2 custom domain | Platform | 承载版本化 `data/`、`m3u8/`、`keys/`、可选封面 | 官方要求走自定义域才能拿到缓存/WAF/访问控制；`r2.dev` 仅适合非生产 |
| Cloudflare Cache Rules | Platform | 仅在 R2 数据域上缓存 JSON / m3u8 / key，并分配 Edge TTL | Cloudflare 默认不缓存 HTML/JSON；必须通过规则精确控制而不是全站粗暴缓存 |
| Thin Worker API | `wrangler` `4.77.0` | 只处理 `/api/*` 的少量写路径或鉴权 | 官方计费明确指出 Functions 请求算 Workers；公开热路径必须避开计算 |
| `@aws-sdk/client-s3` | `3.1018.0` | 在 Node/CI 中批量上传 R2 对象并设置 metadata | Cloudflare 官方推荐 S3 API 进行对象上传；比逐对象 Wrangler 更适合批量同步 |
| `hls.js` | `1.6.15` | 前端 HLS 播放器，固定版本 | 现仓库的 `@latest` 会导致不可控漂移；Phase 1 必须先把播放器版本锁死 |

### Supporting

| Library / Capability | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mime` | `4.1.0` | Node 上传脚本里推导 `Content-Type` | 如果改用 Node/S3 API 发布 R2 对象 |
| Pages `_headers` | n/a | 为 HTML、`release.json`、SW、指纹化静态资源设置浏览器缓存与安全头 | Pages 静态壳发布时 |
| R2 bucket CORS policy | n/a | 允许 Pages 域名与 localhost 跨域抓取 JSON / m3u8 / key | Pages 壳与 R2 数据分域时必须配置 |
| Cloudflare Purge by URL / Prefix / Tag | n/a | 做定向失效与紧急回滚，不作为主更新机制 | 仅在变更缓存规则、CORS、或紧急修复时使用 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@aws-sdk/client-s3` | `rclone` | `rclone` 也被 Cloudflare 官方推荐，适合运维同步；但本仓库已有 Node 构建链，Node SDK 更容易和 release manifest、metadata、验证脚本整合 |
| Pages 静态壳 | Worker Static Assets (`[assets]`) | Worker Static Assets 是当前 Workers 标准做法，但会把静态壳和 Worker 重新耦合，不符合本 phase “Pages 壳 + 极薄 Worker”边界 |
| 版本前缀切换 | 广泛 purge | purge 是补救手段，不是主发布策略；高流量站点上全站 purge 会制造回源与一致性风险 |
| 独立数据域精准 Cache Rules | Pages 自定义域上全局 Cache Everything | 会把 Pages HTML 一起卷入缓存，Cloudflare 官方明确提醒这会造成自定义域陈旧内容问题 |

**Installation:**
```bash
npm install --save-dev wrangler@4.77.0
npm install @aws-sdk/client-s3@3.1018.0 mime@4.1.0 hls.js@1.6.15
```

**Version verification:**
```bash
npm view wrangler version time.modified
# version = 4.77.0
# time.modified = 2026-03-24T10:55:21.802Z

npm view @aws-sdk/client-s3 version time.modified
# version = 3.1018.0
# time.modified = 2026-03-26T19:04:05.267Z

npm view mime version time.modified
# version = 4.1.0
# time.modified = 2025-09-12T17:53:01.540Z

npm view hls.js version time.modified
# version = 1.6.15
# time.modified = 2026-03-26T19:19:48.341Z
```

## Architecture Patterns

### Recommended Project Structure

```text
dist/
├── index.html                 # Pages 公开壳；短缓存或 no-store
├── release.json               # 当前发布指针；必须短缓存或 no-store
├── sw.js                      # 与 releaseId 绑定或临时弱化缓存职责
├── _headers                   # Pages 静态资源头部规则
└── assets/
    └── <releaseId>/           # 指纹化或发布前缀化的 JS/CSS/图片等不可变壳资源

r2-data/
└── releases/
    └── <releaseId>/
        ├── data/              # 分类、feed、详情、评论、config
        └── m3u8/              # m3u8 / keys / 可选封面

scripts/release/
├── build-release-manifest.js  # 生成 releaseId 与发布清单
├── publish-r2.js              # 批量上传 + metadata
├── publish-pages.js           # 触发 Pages 部署或生成 deploy metadata
└── verify-release.js          # 部署后一致性检查
```

### Pattern 1: 单一 `releaseId` 作为发布真相

**What:** 每次发布生成一个唯一 `releaseId`，它必须同时写入：

- Pages `release.json`
- Pages 壳中引用的 `/assets/<releaseId>/...`
- R2 前缀 `releases/<releaseId>/...`
- 发布日志/验证脚本

**When to use:** 每一次生产发布、预发布、回滚。

**Example:**
```json
{
  "releaseId": "20260327T213000Z-ab12cd3",
  "pagesDeployment": "2f3e4d5c",
  "r2Prefix": "releases/20260327T213000Z-ab12cd3",
  "workerVersion": "ab12cd3",
  "createdAt": "2026-03-27T21:30:00Z"
}
```

**Source:** 基于 Pages Direct Upload、Pages rollback、Cloudflare purge 能力与当前仓库结构推导。

### Pattern 2: 主域 / 数据域 / API 域明确分层

**What:** 推荐把公开边界拆成三层：

- `www.example.com` 或 Pages 自定义域：只发静态壳、`release.json`、`_headers`
- `data.example.com`：R2 custom domain，只发 `releases/<releaseId>/data/*` 与 `m3u8/*`
- `api.example.com` 或 `www.example.com/api/*`：Worker，仅承载少量 API

**When to use:** 规划域名与 Cache Rules 时。

**Example:**
```text
www.example.com/index.html
www.example.com/release.json
www.example.com/assets/20260327T213000Z-ab12cd3/js/app.js

data.example.com/releases/20260327T213000Z-ab12cd3/data/config.json
data.example.com/releases/20260327T213000Z-ab12cd3/data/video/123.json
data.example.com/releases/20260327T213000Z-ab12cd3/m3u8/VID123.m3u8

api.example.com/membership
```

**Source:** Cloudflare Pages pricing、R2 public bucket/custom domain、Cache Rules 官方文档。

### Pattern 3: 按“资源角色”而不是按“站点整体”设缓存

**What:** 缓存策略要按路径分四类，而不是一句 `Cache Everything`：

- `index.html` / `release.json` / `sw.js`：`no-store` 或 `max-age=0, must-revalidate`
- `/assets/<releaseId>/*`：长浏览器缓存，`immutable`
- `data.example.com/releases/<releaseId>/data/*`：长 Edge TTL + 长浏览器 TTL，必须有 Cache Rules
- `data.example.com/releases/<releaseId>/m3u8/*`：VOD 前提下可长缓存；若播放器或运维上更保守，可先给较短 Edge TTL

**When to use:** 写 `_headers`、设置 R2 metadata、定义 Cache Rules 时。

**Example:**
```text
Pages host:
  /index.html                     -> Cache-Control: no-store
  /release.json                   -> Cache-Control: no-store
  /assets/<releaseId>/*           -> Cache-Control: public, max-age=31556952, immutable

R2 data host:
  /releases/<releaseId>/data/*    -> Eligible for cache + long Edge TTL
  /releases/<releaseId>/m3u8/*    -> Eligible for cache + explicit TTL
```

**Source:** Pages `_headers`、R2 custom domain caching、Default Cache Behavior、Cache Rules 官方文档。

### Anti-Patterns to Avoid

- **Pages 与 Worker 同时承担公开壳：** `wrangler.toml [site]` 和 Cloudflare Pages 并存，会让“谁在服务 `/`”失去单一真相。
- **R2 对象不带 release 前缀：** 只能靠 purge 修复版本错位，回滚也会很痛苦。
- **在 Pages 自定义域上开全局 Cache Everything：** 官方明确提示这会导致 Pages 新内容在自定义域不刷新。
- **继续使用稳定文件名的强缓存 JS/CSS：** 没有 release 前缀或哈希，浏览器与 SW 都会拿到旧壳。
- **把跨域 JSON / m3u8 的 CORS 交给 Worker 兜底：** 这会把本该静态命中的请求重新拖回计算层。

## Current Repo Mismatches

| Location | Current State | Why It Breaks Phase 1 | Required Direction |
|---------|---------------|-----------------------|--------------------|
| `package.json` + `.github/workflows/deploy.yml` | 没有 lockfile，但 CI 固定跑 `npm ci` | 当前部署链本身不可重复 | 先补 lockfile，并把依赖版本纳入发布基线 |
| `wrangler.toml` | 仍有 `[site] bucket = "./dist"`，且 `MEMBERSHIP_KV` 还是 placeholder | Worker 静态托管角色与 Pages 混杂；配置也不可信 | Phase 1 后 Worker 只保留 API；静态壳只由 Pages 发 |
| `scripts/build-frontend.js` | 只是把 `src/frontend/` 原样复制到 `dist/` | 没有 releaseId、没有前缀化静态资源、没有 `_headers` 产物 | 增加 release manifest 与版本化输出 |
| `scripts/upload-r2.sh` | 对每个文件循环执行 `npx wrangler r2 object put` | 官方明确 Wrangler 只适合单对象；批量发布慢且不稳 | 改为 S3 API/Node 批量上传，并统一设置 metadata |
| `src/frontend/index.html` | 直接加载 `https://cdn.jsdelivr.net/npm/hls.js@latest` | 运行时依赖不可重复，供应链与回归都不可控 | 固定版本并纳入仓库或构建产物 |
| `src/frontend/sw.js` | cache name 固定为 `jiuyao-v1` / `jiuyao-data-v1`，预缓存路径也是稳定路径 | 版本切换后极易出现旧壳、旧 JSON、旧策略残留 | Phase 1 先弱化 SW 或让其绑定 `releaseId` |
| `src/build/config.js` | `version` 只是日期字符串，`r2Base` 也不是 release-aware | 不能证明页面与数据属于同一发布 | 改为显式 `releaseId` 与 `r2Prefix` |
| Pages 输出目录 | 未发现 `_headers` / `_redirects` | 浏览器缓存与安全头无法稳定声明 | Pages 发布必须生成 `_headers` |
| `src/frontend/js/api.js` | 仍依赖外部图片域 `https://imgosne.qqdanb.cn` | 公开主路径还未完全收敛到 Pages + R2 | 需要明确：Phase 1 是否把封面也纳入 R2，或把它列为有意识的临时例外 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 批量 R2 发布 | shell 循环 `wrangler r2 object put` | `@aws-sdk/client-s3` 或 `rclone`/AWS CLI | Cloudflare 官方说明 Wrangler 一次只传一个对象，批量上传应走 S3 兼容工具 |
| 版本一致性 | 依靠“先发前端，再手动发数据”的人工顺序 | `releaseId` + release manifest + 指针切换 | 人工顺序无法保证一致性，也无法优雅回滚 |
| 缓存失效 | 发布后直接 `purge everything` | 版本前缀 + 定向 purge（URL / prefix / tag） | 全站 purge 会放大回源压力，且不是稳定更新机制 |
| R2 跨域读取 | 通过 Worker 反代 JSON / m3u8 | R2 custom domain + R2 bucket CORS policy | 反代会把静态热路径重新拖回计算层 |
| Pages 静态资源头部 | 在 Worker 里统一补 header | Pages `_headers` | 官方说明 `_headers` 就是静态资产的标准做法；Worker 只用于函数响应 |
| 播放器稳定性 | 继续依赖 `hls.js@latest` CDN | 锁定版本并纳入仓库/构建 | 版本漂移会破坏可重复发布与回归 |

**Key insight:** 这个 phase 里最不该“自己拼”的，不是某个单独脚本，而是“发布一致性”和“缓存一致性”。这两件事必须由 `releaseId`、域名边界、Cache Rules 和可验证的清单共同约束。

## Common Pitfalls

### Pitfall 1: 在 Pages 自定义域上继续挂全局 Cache Everything
**What goes wrong:** `pages.dev` 已更新，但正式域名长期显示旧 HTML。  
**Why it happens:** Cloudflare 官方在 Pages 调试文档中明确提示，自定义域如果有 Cache Everything 规则，Pages 新内容可能不刷新。  
**How to avoid:** 让 Pages 主域维持默认静态缓存；Cache Everything 只放在 `data.` 域与版本化路径。  
**Warning signs:** `pages.dev` 正常、正式域异常；`CF-Cache-Status` 长期为 `HIT` 但内容不是当前版本。

### Pitfall 2: 以为 JSON / m3u8 会被 Cloudflare 默认缓存
**What goes wrong:** 命中率低，R2 回源多，成本和时延都上升。  
**Why it happens:** Cloudflare 默认不缓存 HTML 和 JSON；很多播放清单路径也不在默认缓存扩展名列表里。  
**How to avoid:** 在 R2 custom domain 上创建精确匹配版本路径的 Cache Rules，并给对象写明确的 `Cache-Control` metadata。  
**Warning signs:** `CF-Cache-Status: BYPASS` / `DYNAMIC`；边缘命中率长期上不去。

### Pitfall 3: R2 分域后忘了配置 CORS 与 CORS 变更后的 purge
**What goes wrong:** 浏览器端 `fetch` / HLS 请求报 CORS 错误，即使对象本身是 public。  
**Why it happens:** R2 custom domain 的 CORS 只会对带 `Origin` 的合法跨域请求返回头；如果在流量已存在后再改 CORS，旧缓存不会立刻带新头。  
**How to avoid:** 预先为 Pages 域名和 localhost 配置 bucket CORS；每次改 CORS 后立刻 purge 相关 hostname。  
**Warning signs:** 本地 curl 看似正常，但浏览器 network 面板没有 `Access-Control-*` 头。

### Pitfall 4: Service Worker 把 Phase 1 的缓存策略“覆盖掉”
**What goes wrong:** 服务器和 CDN 都已更新，但客户端仍然使用旧壳、旧 JSON 或旧策略。  
**Why it happens:** 当前 SW 的 cache name 是固定值，且预缓存列表指向稳定路径；SW 会比 HTTP 缓存更早命中。  
**How to avoid:** Phase 1 先把 SW 最小化，或者让 cache name 与 `releaseId` 强绑定；不要在本 phase 扩大 SW 的缓存面。  
**Warning signs:** 清 SW / 清站点数据后问题消失；新版本只在首次无缓存访问时正常。

### Pitfall 5: Pages 与 R2 独立发布导致页面-数据错位
**What goes wrong:** 新 HTML 读旧 JSON，或旧 HTML 指向已不存在的新数据路径。  
**Why it happens:** 当前仓库没有单一 release manifest，也没有“R2 先上传、Pages 指针后切换”的原子顺序。  
**How to avoid:** 发布顺序固定为“生成 manifest -> 上传 R2 release -> 验证 -> 发布 Pages 壳/`release.json` -> 验证”。  
**Warning signs:** `config.json`、HTML、日志里的版本号对不上；用户在刷新与二次访问之间看到不同行为。

### Pitfall 6: 继续使用逐对象 Wrangler 上传
**What goes wrong:** 发布耗时长、失败难恢复、对象 metadata 不一致。  
**Why it happens:** 官方说明 Wrangler 只适合单对象上传；批量同步应改用 S3 兼容工具。  
**How to avoid:** 改成基于 manifest 的 S3 API 批量上传，并在同一实现里设置 `Content-Type` / `Cache-Control` / 可选 `Cache-Tag`。  
**Warning signs:** CI 时间异常长、半途失败后桶内对象集不完整、metadata 偶发缺失。

## Code Examples

Verified patterns from official sources:

### Pages `_headers` 为指纹化静态资源设置长浏览器缓存
```text
/assets/*
  Cache-Control: public, max-age=31556952, immutable
```
Source: https://developers.cloudflare.com/pages/configuration/headers/

### 通过 Wrangler 直接把预构建目录部署到 Pages
```bash
CLOUDFLARE_ACCOUNT_ID=<ACCOUNT_ID> \
npx wrangler pages deploy dist --project-name=<PROJECT_NAME>
```
Source: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

### 使用 S3 兼容 SDK 上传对象到 R2
```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

await s3.send(new PutObjectCommand({
  Bucket: 'jiuyao-data',
  Key: 'releases/20260327T213000Z-ab12cd3/data/config.json',
  Body: Buffer.from('{}'),
  ContentType: 'application/json',
  CacheControl: 'public, max-age=31536000, immutable',
}));
```
Source: https://developers.cloudflare.com/r2/objects/upload-objects/

### R2 bucket CORS policy 的最小读配置
```json
[
  {
    "AllowedOrigins": [
      "https://www.example.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
Source: https://developers.cloudflare.com/r2/buckets/cors/

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers Sites (`[site]`) 承载静态壳 | Pages 承载静态壳；若必须走 Worker，则改用 Workers Static Assets | Cloudflare 于 2026-01-29 文档中明确将 Workers Sites 标记为 deprecated | 当前 `wrangler.toml` 的 `[site]` 不应继续作为公开主路径基线 |
| `wrangler r2 object put` 循环上传目录 | S3 API / `rclone` / AWS CLI 做批量上传 | Cloudflare 2026-02/03 官方文档明确推荐 S3 API，说明 Wrangler 只支持单对象 | 当前 `scripts/upload-r2.sh` 不能作为 Phase 1 标准发布链 |
| 无版本前缀 + 依赖 purge 修正 | `releaseId` 前缀 + 指针切换 + 定向 purge | 这是基于 Cloudflare 当前 purge/rollback/cache 机制得出的最佳实践推断 | 回滚与一致性会更稳，且不会依赖高风险的 `purge everything` |

**Deprecated/outdated:**
- `hls.js@latest`：不适合作为可重复发布基线，应该锁定具体版本并纳入仓库或构建。
- Workers Sites 作为公开静态壳：官方已标记 deprecated，应尽快退出主路径。
- 手工对象上传：不适合作为大规模数据发布基线。

## Open Questions

1. **数据域名是否采用独立 `data.` 子域名**
   - What we know: R2 custom domain 是缓存/WAF/CORS 的前提；把规则隔离到独立数据域最容易避免误伤 Pages HTML。
   - What's unclear: 用户最终想用同域路径还是独立子域，以及证书/域名管理偏好。
   - Recommendation: 规划阶段默认按独立 `data.` 子域设计；如果最终坚持同域，再单独评估规则冲突与调试成本。

2. **Phase 1 是否把封面图一起迁入 R2**
   - What we know: 当前浏览主路径仍依赖外部图片域 `imgosne.qqdanb.cn`，这削弱了“Pages + R2”边界的一致性。
   - What's unclear: 封面总量、加密解密链路、迁移成本是否适合在 Phase 1 启动。
   - Recommendation: 至少在计划里把它显式写成“临时例外”或“可选子任务”，不要让它保持隐式状态。

3. **Service Worker 在 Phase 1 的最低处理方式**
   - What we know: 现有 SW 会干扰 releaseId 驱动的缓存策略。
   - What's unclear: 是否允许在 Phase 1 临时削弱 SW，而把完整 PWA 体验放到 Phase 5。
   - Recommendation: 规划时优先选择“先弱化缓存职责”，不要在本 phase 一边做版本化发布，一边继续维持旧 SW 行为。

4. **CI 采用哪一类 R2 凭证**
   - What we know: 批量上传的标准做法更偏向 S3 API，而不是 Wrangler 单对象命令。
   - What's unclear: 当前 CI 是否已有 R2 S3 access key/secret，还是只有 Cloudflare API token。
   - Recommendation: 在 Wave 0 先确定凭证模型；一旦选定，就不要同时维护 Wrangler 上传与 S3 上传两套真相。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 构建脚本、验证脚本、发布脚本 | ✓ | `v24.14.0` | CI 可继续固定 `20.x` |
| npm | 依赖安装、测试、CI | ✓ | `11.9.0` | — |
| npx | `wrangler pages deploy` / 临时 CLI | ✓ | `11.9.0` | `npm exec` |
| Bash | 现有上传脚本 | ✓ | `3.2.57` | zsh 调 bash |
| curl | 发布后 smoke check | ✓ | `8.7.1` | Node `fetch` |
| Wrangler CLI (global) | Pages/Worker 部署 | ✗（全局未检测到） | — | 使用 `npx wrangler` |
| Cloudflare API Token / Account ID | Pages 部署、Purge API、部署查询 | 未验证 | — | 无；必须由 CI secrets 提供 |
| R2 S3 access key / secret | 若采用 S3 API 批量上传 | 未验证 | — | 初期可用 `npx wrangler` 启动，但不建议作为长期批量方案 |

**Missing dependencies with no fallback:**
- Cloudflare `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 的可用性未在本地验证。

**Missing dependencies with fallback:**
- 全局 `wrangler` 缺失，但 `npx wrangler` 可直接替代。
- 若暂时没有 R2 S3 access key/secret，可以短期用现有 Wrangler 上传链启动，但 planner 应把“迁到 S3 API 批量上传”列为 Phase 1 计划项，而不是长期搁置。

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in test runner |
| Config file | none |
| Quick run command | `npm test` |
| Full suite command | `npm test && node --test tests/comment_export_core.test.cjs` |

说明：
- 我已在本地执行 `npm test`，15 个测试全部通过。
- 我已额外执行 `node --test tests/comment_export_core.test.cjs`，15 个测试全部通过。
- 当前默认 `npm test` 不包含 `tests/comment_export_core.test.cjs`，这是现有测试基线缺口之一。

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | 公开浏览主路径只由 Pages 静态壳与 R2 数据响应，不经 Worker / Pages Functions 计算 | smoke / config | `node scripts/verify/verify-static-boundary.js` | ❌ Wave 0 |
| PLAT-02 | Pages、R2、Worker（如有）共享同一 `releaseId`，发布后不出现版本错位 | unit + smoke | `node --test tests/release-manifest.test.js && node scripts/verify/verify-release-consistency.js` | ❌ Wave 0 |
| PLAT-03 | HTML、JS/CSS、JSON、m3u8 返回预期缓存头；定向 purge 可生效 | smoke | `node scripts/verify/verify-cache-policy.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && node --test tests/comment_export_core.test.cjs`
- **Phase gate:** Full suite green + `verify-static-boundary` + `verify-release-consistency` + `verify-cache-policy` against preview/production candidate

### Wave 0 Gaps

- [ ] `package.json` 默认 `test` 需要纳入 `tests/comment_export_core.test.cjs`
- [ ] `tests/release-manifest.test.js` — covers `PLAT-02`
- [ ] `tests/cache-header-generation.test.js` — covers `PLAT-03`
- [ ] `scripts/verify/verify-static-boundary.js` — covers `PLAT-01`
- [ ] `scripts/verify/verify-release-consistency.js` — covers `PLAT-02`
- [ ] `scripts/verify/verify-cache-policy.js` — covers `PLAT-03`

## Sources

### Primary (HIGH confidence)

- https://developers.cloudflare.com/pages/platform/limits/ - Pages 文件数、单文件大小、Functions 计费边界
- https://developers.cloudflare.com/pages/functions/pricing/ - Pages Functions 请求按 Workers 计量；静态请求免费且无限
- https://developers.cloudflare.com/pages/configuration/headers/ - `_headers` 用法、适用范围、指纹资源长缓存示例
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/ - `wrangler pages deploy` 的 CI 标准做法
- https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/ - Pages deployment rollback 能力
- https://developers.cloudflare.com/r2/buckets/public-buckets/ - R2 custom domain、`r2.dev` 边界、缓存/WAF/访问控制能力
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ - R2 custom domain 与缓存能力
- https://developers.cloudflare.com/r2/objects/upload-objects/ - S3 API 为推荐上传方式；Wrangler 单对象限制；metadata 支持
- https://developers.cloudflare.com/r2/buckets/cors/ - R2 custom domain 的 CORS 规则与“修改后需要 purge”
- https://developers.cloudflare.com/cache/concepts/default-cache-behavior/ - Cloudflare 默认不缓存 HTML/JSON，缓存受扩展名与头部控制
- https://developers.cloudflare.com/cache/how-to/cache-rules/ - Cache Rules 能力、计划限制、规则化缓存控制
- https://developers.cloudflare.com/cache/how-to/purge-cache/ - purge 方式与单文件 purge 为推荐方法
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-prefix/ - prefix purge 的适用场景与限制
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/ - cache tag purge 的工作流
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-everything/ - 不建议把 purge everything 当作常规更新手段
- https://developers.cloudflare.com/workers/wrangler/deprecations/ - Workers Sites 已 deprecated
- https://developers.cloudflare.com/workers/static-assets/ - Workers 侧的新静态资源基线是 `[assets]`，不是 `[site]`
- Repository audit: `package.json`、`wrangler.toml`、`.github/workflows/deploy.yml`、`scripts/build-frontend.js`、`scripts/upload-r2.sh`、`src/frontend/index.html`、`src/frontend/sw.js`、`src/frontend/js/api.js`、`src/build/config.js`
- Local version verification: `npm view wrangler`, `npm view @aws-sdk/client-s3`, `npm view mime`, `npm view hls.js`

### Secondary (MEDIUM confidence)

- https://developers.cloudflare.com/pages/configuration/debugging-pages/ - 自定义域与 `pages.dev` 差异；Cache Everything 造成 Pages 自定义域陈旧内容的调试建议
- https://developers.cloudflare.com/cache/concepts/customize-cache/ - 用目录、扩展名、查询串标记静态资源的缓存思路

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Cloudflare 官方文档、npm registry 当前版本核实、仓库审计三者一致
- Architecture: MEDIUM - `releaseId + prefix switch` 是基于官方能力与仓库现状推导出的最佳实践，不是 Cloudflare 单篇文档直接给出的模板
- Pitfalls: HIGH - 关键陷阱都能被官方文档或当前仓库实现直接证实

**Research date:** 2026-03-27
**Valid until:** 2026-04-10
