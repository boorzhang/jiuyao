# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services（外部 API 与服务）

**上游业务 API（CloudFront 转发）:**
- 九妖业务接口 - 主要用于登录、取线路、拉模块、取视频详情、取评论和拼接 m3u8；调用实现位于 `comment_export.cjs`、`scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`，背景说明位于 `docs/2026-03-26-jiuyao-crawl-knowledge.md` 与 `docs/2026-03-27-rack002-handoff.md`。
  - SDK/Client: 无官方 SDK；仓库通过 `curl` + 手写 `crypto` 加解密直接请求 `https://d3vfkhk0c6rox6.cloudfront.net/api/app/...`。
  - Auth: 无固定环境密钥；运行时先调用 `POST /api/app/mine/login/h5` 获取 `token`，基址由环境变量 `BASE_URL` 控制。
- 前台静态入口 - `docs/2026-03-26-jiuyao-crawl-knowledge.md` 与 `docs/2026-03-27-rack002-handoff.md` 记录了 `https://dw370qtmy9es.cloudfront.net/?tid=...`，当前仓库不直接依赖它提供数据，但它是逆向和验证来源。
  - SDK/Client: 不适用。
  - Auth: 不适用。

**对象存储与边缘平台（Cloudflare）:**
- Cloudflare R2 - `wrangler.toml` 把桶 `jiuyao-data` 绑定为 `R2_DATA`，手工上传脚本位于 `scripts/upload-r2.sh`，构建源目录为 `r2-data/`。
  - SDK/Client: `npx wrangler r2 object put`。
  - Auth: 本地/CI 侧依赖 Wrangler 所用 Cloudflare 凭据；仓库内未提交凭据文件。
- Cloudflare KV - `wrangler.toml` 把命名空间绑定为 `MEMBERSHIP_KV`，`src/worker/index.js` 在 `POST /api/membership` 时写入会员信息。
  - SDK/Client: Worker 运行时绑定 `env.MEMBERSHIP_KV`。
  - Auth: Cloudflare Worker 运行时绑定，不通过应用层环境变量明文传递。
- Cloudflare Pages - `dist/` 静态目录通过 `.github/workflows/deploy.yml` 部署到 Pages 项目 `jiuyao`。
  - SDK/Client: `cloudflare/wrangler-action@v3`。
  - Auth: GitHub Actions secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。

**媒体与第三方 CDN:**
- 图片 CDN - 前端默认图片基址是 `https://imgosne.qqdanb.cn`；来源位于 `src/build/config.js` 与 `src/frontend/js/api.js`，缓存策略位于 `src/frontend/sw.js`。
  - SDK/Client: 浏览器 `fetch`。
  - Auth: 无。
- HLS 播放库 CDN - `src/frontend/index.html` 从 `https://cdn.jsdelivr.net/npm/hls.js@latest` 加载 `hls.js`。
  - SDK/Client: 浏览器 `<script>`。
  - Auth: 无。
- 线路域名 - 抓取脚本通过 `/api/app/ping/domain/h5` 获取 `VID` 线路，回退值记录为 `https://s12.qqdanb.cn`；逻辑位于 `scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
  - SDK/Client: 仍然通过上游 API 返回的数据使用。
  - Auth: 依赖上游登录 token。

## Data Storage（数据存储）

**Databases:**
- Cloudflare KV - `src/worker/index.js` 以邮箱为 key 写入会员计划、到期时间和创建时间。
  - Connection: Worker 绑定 `MEMBERSHIP_KV`，定义在 `wrangler.toml`。
  - Client: `env.MEMBERSHIP_KV.put(...)`。
- 传统数据库 - 未检测到 `PostgreSQL`、`MySQL`、`SQLite`、ORM 或数据库客户端依赖。

**File Storage:**
- Cloudflare R2 - 生产静态数据目标存储；上传入口是 `scripts/upload-r2.sh`，绑定定义在 `wrangler.toml`。
- 本地文件系统 - 仓库直接依赖本地目录作为数据中转层：
  - 原始视频输入：`_by_id/`
  - 分类输入：`_by_tags/`
  - 评论输出：`comments/_by_id/`
  - m3u8 与 key：`m3u8/`、`m3u8/keys/`
  - 构建产物：`r2-data/`
  - 前端产物：`dist/`

**Caching:**
- 浏览器 Cache Storage - `src/frontend/sw.js` 维护 `CACHE_NAME`、`COVER_CACHE`、`DATA_CACHE` 三类缓存。
- 进程内内存缓存 - `src/frontend/js/api.js` 使用 `Map` 缓存 JSON 请求与图片解密结果。
- 服务器侧 Redis / Memcached - 未检测到。

## Authentication & Identity（鉴权与身份）

**Auth Provider:**
- 上游自定义登录 - `comment_export.cjs`、`scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js` 都会先调用 `POST /api/app/mine/login/h5` 获取运行期 token。
  - Implementation: 请求体包含 `devID`、`sysType`、`cutInfos`、`isAppStore`；后续请求通过 `Authorization: {token}`、`temp: test`、`X-User-Agent: ...` 发往 `BASE_URL/api/app/...`，同时用 `AES-128-CBC` 生成 `?data=` 参数并按自定义派生逻辑解密 `hash=true` 响应。
- 前端本地身份 - `src/frontend/js/store.js` 不接外部认证系统，而是在 `localStorage` 中生成游客用户对象并保存 `membership`、点赞、历史、收藏、关注。
  - Implementation: `getUser()` 使用 `crypto.randomUUID()` 或随机串生成本地 UID。
- 会员接口身份 - `src/worker/index.js` 接受 `email`、`paymentToken`、`plan`，当前只校验 `email` 和 `plan`，不会向外部支付网关校验 `paymentToken`。
  - Implementation: 直接把会员状态写入 `MEMBERSHIP_KV`。

## Monitoring & Observability（监控与可观测性）

**Error Tracking:**
- None - 未检测到 Sentry、Datadog、Rollbar、OpenTelemetry 等平台集成。

**Logs:**
- 控制台日志 - 构建、抓取、开发服务器和 Worker 主要使用 `console.log` / `console.error`；实现位于 `src/build/index.js`、`scripts/dev-server.js`、`comment_export.cjs`、`scripts/export/*.js`。
- 摘要与错误文件 - 抓取链路把统计信息写入 `comments/_summary*.json`、`m3u8/_refresh_summary.json`、`m3u8/_retry_summary.json`，错误写入 `comments/_errors.ndjson`、`m3u8/_refresh_errors.ndjson`、`m3u8/_retry_errors.ndjson`。

## CI/CD & Deployment（持续集成与部署）

**Hosting:**
- Cloudflare Pages - `.github/workflows/deploy.yml` 在 `push` 到 `main` 后部署 `dist/`。
- Cloudflare Worker - `wrangler.toml` 指向 `src/worker/index.js`，同时绑定 KV 和 `site.bucket = "./dist"`。
- Cloudflare R2 - `scripts/upload-r2.sh` 手工把 `r2-data/` 内容上传到桶 `jiuyao-data`。
- 服务器执行边界 - `docs/2026-03-27-rack002-handoff.md` 记录了评论抓取迁移到 `root@rack002:/opt/zip/jiuyao` 的运行方式，说明抓取脚本既可本地运行，也可在远端 Linux 主机运行。

**CI Pipeline:**
- GitHub Actions - 定义于 `.github/workflows/deploy.yml`。
- 流程 - `actions/checkout@v4` → `actions/setup-node@v4`（Node `20`）→ `npm ci` → `npm run build:frontend` → `cloudflare/wrangler-action@v3 pages deploy dist/ --project-name=jiuyao`。

## Environment Configuration（环境配置）

**Required env vars:**
- 上游 API / 导出脚本:
  - `BASE_URL` - 见 `comment_export.cjs`、`scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
  - `SOURCE_DIR`、`OUT_DIR`、`PAGE_SIZE` - 见 `comment_export.cjs` 与 `scripts/export/video_json_export_full.js`。
  - `CONCURRENCY`、`WORKER_TOTAL`、`WORKER_INDEX`、`MAX_DEFERRED_ATTEMPTS`、`BLOCKED_USER_IDS` - 见 `comment_export.cjs`。
  - `M3U8_DIR`、`CLEAN_UNUSED_KEYS`、`RETRIES`、`SAMPLE_COUNT`、`START_INDEX`、`LIMIT` - 见 `scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- 构建链:
  - `JIUYAO_ROOT`、`R2_BASE` - 见 `src/build/index.js`。
- CI:
  - `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` - 见 `.github/workflows/deploy.yml`。

**Secrets location:**
- GitHub Actions secrets - Cloudflare Pages 发布凭据放在仓库 CI secrets 中，文件位于 `.github/workflows/deploy.yml`。
- 运行时 shell 环境 - 抓取与导出脚本通过命令行环境变量接收基址、目录和并发参数。
- 已提交 secrets 文件 - 未检测到 `.env`、`credentials.*`、`secrets.*` 之类的已提交密钥文件。

## Data File Input/Output（数据文件输入输出）

**Incoming:**
- `src/build/index.js` 从 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/` 读取原始视频、分类、评论与流媒体文件。
- `comment_export.cjs` 从 `_by_id/` 读取视频元数据，然后把评论输出到 `comments/_by_id/`。
- `scripts/export/refresh_all_m3u8_with_shared_key.js` 与 `scripts/export/retry_failed_m3u8.js` 从 `_by_id/` 读视频主数据，从上游接口重新取 m3u8 和 key。

**Outgoing:**
- `src/build/index.js` 生成 `r2-data/data/` 与 `r2-data/m3u8/`，供 `scripts/upload-r2.sh` 上传。
- `scripts/build-frontend.js` 生成 `dist/`，供 `.github/workflows/deploy.yml` 部署到 Pages。
- `comment_export.cjs` 生成 `comments/_by_id/*.json`、`comments/_summary*.json`、`comments/_errors.ndjson`。
- `scripts/export/localize_m3u8_keys.js` 在 `m3u8/keys/` 生成去重后的 `.key` 文件，并回写 `.m3u8`。
- `scripts/export/refresh_all_m3u8_with_shared_key.js` 与 `scripts/export/retry_failed_m3u8.js` 生成 `m3u8/*.m3u8`、`m3u8/keys/*.key`、摘要文件和错误日志。

## Webhooks & Callbacks（Webhook 与回调）

**Incoming:**
- `POST /api/membership` - `src/worker/index.js` 提供的 Worker HTTP 入口；它是业务 API，而不是第三方 webhook。
- 其他 webhook - 未检测到支付回调、对象存储回调、GitHub webhook 接收端或队列消费者。

**Outgoing:**
- 上游业务 API 调用 - `comment_export.cjs` 与 `scripts/export/*.js` 会发往 `https://d3vfkhk0c6rox6.cloudfront.net/api/app/...`，包括 `/mine/login/h5`、`/ping/domain/h5`、`/modules/list`、`/vid/module/{id}`、`/recommend/vid/list`、`/vid/info`、`/comment/list`、`/comment/info`、`/vid/h5/m3u8/{sourceURL}`。
- Cloudflare 控制面 API - `.github/workflows/deploy.yml` 的 `cloudflare/wrangler-action@v3` 与 `scripts/upload-r2.sh` 的 `npx wrangler r2 object put` 都会向 Cloudflare Pages / R2 控制面发请求。

## Deployment Boundaries（部署边界）

**静态前端边界:**
- `dist/` 是 Pages 产物，只包含 `src/frontend/` 复制后的静态页面、CSS、JS、`manifest.json` 与 `sw.js`；构建入口位于 `scripts/build-frontend.js`。

**静态数据边界:**
- `r2-data/` 是对象存储产物，包含 `data/` JSON 索引和 `m3u8/` 播放资源；构建入口位于 `src/build/index.js`，上传入口位于 `scripts/upload-r2.sh`。

**Worker 边界:**
- `src/worker/index.js` 独立处理 `POST /api/membership`，不参与前端页面渲染，也不直接参与 `_by_id/` 到 `r2-data/` 的构建链。

**抓取执行边界:**
- `comment_export.cjs` 与 `scripts/export/*.js` 依赖本地文件系统和 `curl`，适合在开发机或远端 Linux 主机执行；`docs/2026-03-27-rack002-handoff.md` 明确给出了 `rack002` 续跑方案。

---

*Integration audit: 2026-03-27*
