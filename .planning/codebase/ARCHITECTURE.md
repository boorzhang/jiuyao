# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**整体模式：** 离线数据生产管线 + 静态前端 SPA + 对象存储分发 + 轻量 Cloudflare Worker 辅助接口。

**关键特征：**
- 应用运行时几乎不依赖传统后端服务；`src/frontend/js/api.js` 只读取静态 JSON 与 `m3u8` 文件。
- “后端职责”主要体现在离线 Node 脚本：`scripts/export/*.js`、`comment_export.cjs`、`src/build/*.js` 负责抓取、清洗、建模和发布产物生成。
- 前端、数据和播放资源是分线部署的：`dist/` 提供站点壳，`r2-data/` 提供 JSON 与媒体清单，`src/worker/index.js` 只补一个会员接口并可托管静态站点。

## Layers

**离线抓取 / 导出层：**
- Purpose: 从上游站点抓取视频、评论和播放清单，落盘成仓库内原始数据。
- Location: `scripts/export/video_json_export_full.js`、`scripts/export/video_json_export.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/localize_m3u8_keys.js`、`comment_export.cjs`、`scripts/comment_export/comment_export.cjs`
- Contains: 登录、接口参数加密/解密、分页抓取、失败重试、结果写盘。
- Depends on: `curl`、Node `fs/path/crypto/child_process`、上游 `api/app/*` 接口。
- Used by: `src/build/index.js` 消费其输出目录 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`。

**数据构建层：**
- Purpose: 把仓库内的原始视频、标签、评论和播放文件转换成前端可直接读取的静态数据接口。
- Location: `src/build/index.js`、`src/build/categories.js`、`src/build/feeds.js`、`src/build/details.js`、`src/build/recommend.js`、`src/build/authors.js`、`src/build/config.js`
- Contains: 分类分页、推荐 feed、详情页数据、作者分页、评论裁剪、构建配置。
- Depends on: `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`
- Used by: `r2-data/` 产物目录，随后由 `src/frontend/js/api.js` 与 `scripts/upload-r2.sh` 消费。

**前端应用层：**
- Purpose: 在浏览器中提供主页、短视频流、个人中心、详情页和播放体验。
- Location: `src/frontend/index.html`、`src/frontend/js/app.js`、`src/frontend/js/pages/*.js`、`src/frontend/js/api.js`、`src/frontend/js/store.js`、`src/frontend/sw.js`
- Contains: SPA 壳、模块级状态、localStorage 持久化、Hls.js 播放、图片解密、PWA 缓存。
- Depends on: `r2-data/data/*`、`r2-data/m3u8/*`、远端图片 CDN `https://imgosne.qqdanb.cn`
- Used by: `scripts/build-frontend.js` 复制到 `dist/`，或由 `scripts/dev-server.js` 本地直接服务 `src/frontend/`。

**Worker / 托管层：**
- Purpose: 提供极薄的会员接口，并把构建后的静态站点交给 Cloudflare 运行。
- Location: `src/worker/index.js`、`wrangler.toml`
- Contains: `POST /api/membership`、KV 写入、CORS、Cloudflare 站点绑定。
- Depends on: Cloudflare KV `MEMBERSHIP_KV`、`dist/`
- Used by: 浏览器端会员开通流程（当前前端尚未直接接入），以及部署配置。

**发布 / 运维脚本层：**
- Purpose: 把前端壳与数据产物发布到不同目标。
- Location: `scripts/build-frontend.js`、`scripts/upload-r2.sh`、`.github/workflows/deploy.yml`
- Contains: 前端复制构建、R2 对象上传、Cloudflare Pages 部署。
- Depends on: `dist/`、`r2-data/`、Wrangler CLI
- Used by: 本地发布和 CI。

**参考 / 原型资产层：**
- Purpose: 保存逆向分析素材、历史静态原型和抓取到的前端分包，不进入当前主构建链。
- Location: `html/`、`site/index.html`、`scripts/frontend/*.js`、`docs/*.md`
- Contains: 还原页面、原站 JS 分包、交接文档和设计说明。
- Depends on: 无固定运行依赖。
- Used by: 人工分析、需求追溯、后续脚本优化。

## Data Flow

**视频主数据流：**

1. `scripts/export/video_json_export_full.js` 登录上游接口，抓取模块列表、模块分页和详情数据。
2. 脚本把结果写到 `_by_id/VID*.json` 与 `_by_tags/<tag>/VID*.json`，并生成 `_summary.json`。
3. `src/build/index.js` 读取 `_by_id/` 与 `_by_tags/`，把原始模型拆成 `r2-data/data/category/*`、`r2-data/data/feed/*`、`r2-data/data/video/*.json`、`r2-data/data/author/*`、`r2-data/data/config.json`。
4. `src/frontend/js/api.js` 以静态 URL 形式读取这些 JSON；`src/frontend/js/pages/home.js`、`src/frontend/js/pages/douyin.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/mine.js` 直接消费。

**评论数据流：**

1. `comment_export.cjs` 或 `scripts/comment_export/comment_export.cjs` 以 `_by_id/` 为输入源，按视频评论数决定是否抓取评论。
2. 评论脚本将结果写入 `comments/_by_id/VID*.json`，并依赖 `lib/comment_export_core.cjs` 或 `scripts/comment_export/comment_export_core.cjs` 做分片、过滤、延后重试和聚合。
3. `src/build/details.js` 在构建详情数据时读取 `comments/_by_id/VID*.json`，将可展示的评论裁剪成 `r2-data/data/video/<id>/comments.json`。
4. `src/frontend/js/pages/detail.js` 与 `src/frontend/js/pages/douyin.js` 通过 `api.videoComments(id)` 展示评论浮层。

**播放资源流：**

1. `scripts/export/video_json_export_full.js` 在原始视频对象中写入远端 `m3u8` 地址。
2. `scripts/export/refresh_all_m3u8_with_shared_key.js` 重新抓取所有播放清单，把文件写到 `m3u8/VID*.m3u8`，并统一共享 `m3u8/keys/*.key`。
3. `scripts/export/localize_m3u8_keys.js` 可以补充把 `#EXT-X-KEY` 改成仓库内相对路径。
4. `src/build/index.js` 复制 `m3u8/` 到 `r2-data/m3u8/`。
5. `src/frontend/js/api.js` 通过 `api.m3u8Url(id)` 生成 `m3u8` 地址，`src/frontend/js/pages/detail.js` 与 `src/frontend/js/pages/douyin.js` 使用原生 HLS 或 Hls.js 播放。
6. `src/frontend/sw.js` 对 `m3u8` 采用 network-only，避免播放清单被旧缓存污染。

**本地开发流：**

1. `npm run dev` 调用 `scripts/dev-server.js`。
2. 该脚本在 `3000` 端口服务 `src/frontend/`，在 `3001` 端口服务 `r2-data/`。
3. `src/frontend/js/api.js` 在 `localhost` 环境下自动把 `R2_BASE` 指向 `http://localhost:3001`。
4. 浏览器端因此可以直接命中本地构建产物，不需要单独应用服务器。

**发布流：**

1. `npm run build:frontend` 调用 `scripts/build-frontend.js`，将 `src/frontend/` 复制为 `dist/`。
2. `.github/workflows/deploy.yml` 使用 `cloudflare/wrangler-action@v3` 将 `dist/` 发布到 Cloudflare Pages。
3. `npm run build:data` 调用 `src/build/index.js` 生成 `r2-data/`。
4. `scripts/upload-r2.sh` 逐个把 `r2-data/data/*` 与 `r2-data/m3u8/*` 上传到 R2 bucket `jiuyao-data`。
5. `wrangler.toml` 同时声明 `site.bucket = "./dist"` 与 `r2_buckets`，说明 Worker/站点托管与数据对象存储是并行部署单元。

**状态管理：**
- 页面级瞬时状态放在模块级变量中，例如 `src/frontend/js/pages/home.js` 的 `currentCat/currentPage`、`src/frontend/js/pages/douyin.js` 的 `dy` 对象、`src/frontend/js/pages/detail.js` 的 `currentVideo`。
- 用户持久化状态放在 `src/frontend/js/store.js`，通过 localStorage 保存点赞、收藏、关注、历史和游客用户信息。
- 离线缓存由 `src/frontend/sw.js` 负责：应用壳 cache-first，`/data/*` network-first，远端封面 cache-first。

## Key Abstractions

**原始视频对象：**
- Purpose: 作为全仓库最上游的事实来源，保留上游接口字段和站点播放信息。
- Examples: `_by_id/VID614758e5a871e78d083cfd80.json`、`_summary.json`
- Pattern: 每个视频一个 `VID{id}.json`，同时保留 `raw`、`categoryList`、`sourceURL`、`m3u8` 等字段，供后续构建多次重用。

**列表卡片模型 `slimVideo`：**
- Purpose: 为列表页、推荐区、作者作品区提供轻量视频视图模型。
- Examples: `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`、`src/build/authors.js`
- Pattern: 所有列表型 JSON 复用 `slimVideo(v)` 输出，字段集合稳定，避免前端在多个列表端点处理不同形状。

**详情目录模型：**
- Purpose: 把单视频相关资源收敛到一个目录前缀下。
- Examples: `r2-data/data/video/<id>.json`、`r2-data/data/video/<id>/recommend.json`、`r2-data/data/video/<id>/comments.json`
- Pattern: 详情主文件放在 `data/video/<id>.json`，衍生数据放在同名子目录 `data/video/<id>/`。

**作者分页模型：**
- Purpose: 用静态文件模拟作者主页分页接口。
- Examples: `r2-data/data/author/<uid>.json`、`r2-data/data/author/<uid>/page_<n>.json`
- Pattern: 首页文件包含 profile + 第 1 页视频，后续页按目录分页。

**运行时配置模型：**
- Purpose: 为前端提供分类、feed 总页数、总视频量和资源基地址。
- Examples: `src/build/config.js`、`r2-data/data/config.json`
- Pattern: 启动先读 `config.json`，然后前端才初始化页面与 `R2_BASE`。

**评论导出纯逻辑：**
- Purpose: 将容易测试的评论分片、过滤和聚合逻辑与网络抓取解耦。
- Examples: `lib/comment_export_core.cjs`、`scripts/comment_export/comment_export_core.cjs`
- Pattern: I/O 留在主脚本，纯函数留在 core 文件，便于 `tests/comment_export_core.test.cjs` 与 `scripts/comment_export/comment_export_core.test.cjs` 回归。

## Entry Points

**本地开发入口：**
- Location: `scripts/dev-server.js`
- Triggers: `npm run dev`
- Responsibilities: 同时服务前端源码目录 `src/frontend/` 和数据目录 `r2-data/`，提供 SPA fallback 和跨域头。

**数据构建入口：**
- Location: `src/build/index.js`
- Triggers: `npm run build:data`
- Responsibilities: 扫描 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`，生成 `r2-data/` 的完整静态数据树。

**前端构建入口：**
- Location: `scripts/build-frontend.js`
- Triggers: `npm run build:frontend`
- Responsibilities: 把 `src/frontend/` 原样复制到 `dist/`；当前没有 bundler 和转译层。

**视频抓取入口：**
- Location: `scripts/export/video_json_export_full.js`
- Triggers: 手工运行脚本
- Responsibilities: 生成 `_by_id/`、`_by_tags/` 与 `_summary.json`，是后续所有数据构建的上游输入。

**评论抓取入口：**
- Location: `comment_export.cjs`、`comment_export.js`
- Triggers: 手工运行脚本
- Responsibilities: 生成 `comments/_by_id/`，支持 `WORKER_TOTAL` / `WORKER_INDEX` 分片。

**播放清单刷新入口：**
- Location: `scripts/export/refresh_all_m3u8_with_shared_key.js`
- Triggers: 手工运行脚本
- Responsibilities: 为 `_by_id/` 视频生成本地 `m3u8/VID*.m3u8` 与共享 `key` 文件。

**Worker 运行入口：**
- Location: `src/worker/index.js`
- Triggers: Cloudflare Worker 请求流量
- Responsibilities: 处理 `POST /api/membership`，其余路径返回 404；静态托管配置由 `wrangler.toml` 绑定 `dist/`。

## Error Handling

**Strategy:** 以“尽量继续生成产物”为主，浏览器端与构建端普遍采用宽松容错，抓取脚本对远端失败增加重登、分片与延后重试。

**Patterns:**
- 构建脚本对缺失评论和解析失败采用跳过策略，例如 `src/build/details.js` 只在评论文件存在且可解析时生成 `comments.json`。
- 前端请求失败通常只 `console.error` 或回退为空 UI，例如 `src/frontend/js/pages/home.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`。
- 评论导出比其他脚本更严格，`comment_export.cjs` 使用 `failureKind`、`shouldDeferFailedVideo()`、worker 汇总等机制处理 4010、传输错误和延后重试。
- Worker API 统一使用 `jsonResponse()` 返回 `{ ok: false, error }`，错误边界收敛在 `src/worker/index.js`。

## Cross-Cutting Concerns

**Logging:** 统一使用 `console.log` / `console.error`。抓取脚本会带时间戳和 worker 标签，例如 `scripts/export/video_json_export_full.js` 与 `comment_export.cjs`。

**Validation:** 主要依靠文件存在性检查、默认值和字符串化处理，而不是集中式 schema 校验。典型位置包括 `src/build/details.js`、`src/build/categories.js`、`lib/comment_export_core.cjs`。

**Authentication:** 运行时前端没有应用鉴权；抓取脚本通过上游 `login/h5` 接口动态获取 token；会员数据写入则由 `src/worker/index.js` 使用 Cloudflare KV。

---

*Architecture analysis: 2026-03-27*
