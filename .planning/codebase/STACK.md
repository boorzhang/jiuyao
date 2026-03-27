# Technology Stack

**Analysis Date:** 2026-03-27

## Languages（语言）

**Primary:**
- JavaScript（ES Modules） - 主应用代码使用 `package.json` 的 `"type": "module"`；前端入口位于 `src/frontend/index.html`、`src/frontend/js/app.js`，数据构建入口位于 `src/build/index.js`，Worker 入口位于 `src/worker/index.js`。
- JavaScript（浏览器原生 API） - PWA 端不依赖前端框架，直接使用浏览器 `fetch`、`localStorage`、Service Worker、ESM；核心文件位于 `src/frontend/js/api.js`、`src/frontend/js/store.js`、`src/frontend/sw.js`。

**Secondary:**
- CommonJS 风格脚本 - 抓取与导出链路大量使用 `require()`、`module.exports` 风格；当前可直接执行的评论链路入口是 `comment_export.cjs`、`lib/comment_export_core.cjs`、`scripts/comment_export/comment_export.cjs`。归档抓取脚本位于 `scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。
- HTML / CSS / JSON - 静态壳与样式位于 `src/frontend/index.html`、`src/frontend/css/styles.css`；构建产物主要输出到 `dist/` 与 `r2-data/`，实际数据文件为大量 JSON 与 `.m3u8`/`.key` 文件。

## Runtime（运行时）

**Environment:**
- Node.js `>=18` - 由 `package.json` 的 `engines.node` 约束，供 `scripts/dev-server.js`、`scripts/build-frontend.js`、`src/build/index.js`、`comment_export.cjs` 等脚本运行。
- Cloudflare Workers Runtime - 由 `wrangler.toml` 定义，Worker 主入口是 `src/worker/index.js`，`compatibility_date` 为 `2024-01-01`。
- 浏览器运行时 - `src/frontend/index.html` 通过 `<script type="module">` 加载 `src/frontend/js/app.js`，并在 `src/frontend/sw.js` 注册 PWA 缓存逻辑。

**Package Manager:**
- npm - 由 `package.json`、`.github/workflows/deploy.yml` 中的 `npm ci` / `npm run build:frontend` / `npm run ...` 体现。
- Lockfile: 缺失；仓库根目录未检测到 `package-lock.json`、`pnpm-lock.yaml` 或 `yarn.lock`。

## Frameworks（框架与平台）

**Core:**
- Cloudflare Workers - 用于处理会员接口与 KV 写入；实现位于 `src/worker/index.js`，绑定配置位于 `wrangler.toml`。
- Cloudflare Pages - 用于部署 `dist/` 静态前端；自动化入口位于 `.github/workflows/deploy.yml`。
- 原生 PWA / 无框架前端 - 页面、状态、路由和缓存均由自定义 JS 实现；入口位于 `src/frontend/index.html`、`src/frontend/js/app.js`、`src/frontend/sw.js`。

**Testing:**
- Node Built-in Test Runner - `package.json` 的 `test` 脚本执行 `node --test 'tests/*.test.js'`。
- 纯逻辑回归测试 - 测试文件集中在 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/store.test.js`、`tests/comment_export_core.test.cjs`，评论抓取脚本归档目录也保留一份 `scripts/comment_export/comment_export_core.test.cjs`。

**Build/Dev:**
- 自定义 Node 构建脚本 - `src/build/index.js` 负责把 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/` 转成 `r2-data/`。
- 静态资源复制脚本 - `scripts/build-frontend.js` 直接把 `src/frontend/` 复制到 `dist/`。
- 本地双端口开发服务器 - `scripts/dev-server.js` 同时提供 `src/frontend/`（`3000`）和 `r2-data/`（`3001`）。
- Wrangler CLI / Cloudflare Action - `scripts/upload-r2.sh` 使用 `npx wrangler r2 object put` 上传对象；`.github/workflows/deploy.yml` 使用 `cloudflare/wrangler-action@v3` 部署 Pages。

## Main Modules（主要模块）

**数据构建链：**
- `src/build/index.js` - 构建总入口，读取原始视频、分类、评论与 m3u8 文件并输出 `r2-data/`。
- `src/build/categories.js` - 生成 `r2-data/data/category/...` 分类分页 JSON。
- `src/build/feeds.js` - 生成推荐与最新 feed 的分页 JSON。
- `src/build/details.js` - 生成 `r2-data/data/video/{id}.json` 与 `comments.json`。
- `src/build/recommend.js`、`src/build/authors.js`、`src/build/config.js` - 分别生成推荐结果、作者页和 `data/config.json`。

**前端壳：**
- `src/frontend/index.html` - 单页应用壳，加载 `hls.js` CDN 和 `js/app.js`。
- `src/frontend/js/app.js` - 启动配置加载、页面初始化、Tab 切换、PWA 注册。
- `src/frontend/js/api.js` - 统一访问 `r2-data` 静态 JSON / m3u8，同时负责图片解密。
- `src/frontend/js/pages/home.js`、`src/frontend/js/pages/douyin.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/mine.js` - 四个主要视图模块。
- `src/frontend/sw.js` - App shell、数据 JSON、图片与 m3u8 的缓存策略。

**抓取与维护脚本：**
- `comment_export.cjs` 与 `lib/comment_export_core.cjs` - 当前评论抓取主链路与可测试纯逻辑。
- `scripts/export/video_json_export_full.js` - 全量视频导出主脚本。
- `scripts/export/localize_m3u8_keys.js` - 本地化 AES key 并去重。
- `scripts/export/refresh_all_m3u8_with_shared_key.js` 与 `scripts/export/retry_failed_m3u8.js` - m3u8 重抓与失败补抓。
- `scripts/upload-r2.sh` - 把 `r2-data/` 上传到 Cloudflare R2。

## Key Dependencies（关键依赖）

**Critical:**
- Node 内置模块 - 代码直接使用 `fs`、`path`、`crypto`、`http`、`child_process`，可见于 `src/build/index.js`、`scripts/dev-server.js`、`comment_export.cjs`、`scripts/export/video_json_export_full.js`。
- `hls.js`（CDN 方式） - 由 `src/frontend/index.html` 通过 `https://cdn.jsdelivr.net/npm/hls.js@latest` 引入，用于浏览器播放 HLS。
- curl 可执行程序 - 抓取脚本通过 `spawnSync('curl', ...)` 或 `spawn('curl', ...)` 发请求；实现位于 `comment_export.cjs`、`scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。

**Infrastructure:**
- `cloudflare/wrangler-action@v3` - 位于 `.github/workflows/deploy.yml`，用于 Pages 部署。
- Wrangler CLI - `scripts/upload-r2.sh` 依赖 `npx wrangler` 上传 `r2-data/data/` 与 `r2-data/m3u8/`。
- GitHub Actions - 自动化入口位于 `.github/workflows/deploy.yml`。

## Scripts（脚本与入口）

**npm scripts:**
- `npm run dev` - 执行 `scripts/dev-server.js`，本地同时提供前端与数据服务。
- `npm run build:data` - 执行 `src/build/index.js`，输出 `r2-data/`。
- `npm run build:frontend` - 执行 `scripts/build-frontend.js`，输出 `dist/`。
- `npm test` - 执行 `node --test 'tests/*.test.js'`。
- `npm run upload:r2` - 执行 `scripts/upload-r2.sh`，把 `r2-data/` 上传到 Cloudflare R2。

**Build / Deploy entrypoints:**
- 数据构建入口：`src/build/index.js`
- 前端构建入口：`scripts/build-frontend.js`
- Worker 部署入口：`src/worker/index.js` + `wrangler.toml`
- Pages 自动部署入口：`.github/workflows/deploy.yml`
- 手工对象存储上传入口：`scripts/upload-r2.sh`

## Configuration（配置）

**Environment:**
- 仓库未检测到已提交的 `.env` 文件；运行参数主要通过 shell 环境变量注入，而不是通过配置文件持久化。
- 数据构建链依赖 `JIUYAO_ROOT`、`R2_BASE`；定义与读取位于 `src/build/index.js`。
- 评论与抓取脚本依赖 `BASE_URL`、`SOURCE_DIR`、`OUT_DIR`、`PAGE_SIZE`、`CONCURRENCY`、`WORKER_TOTAL`、`WORKER_INDEX`、`MAX_DEFERRED_ATTEMPTS`、`BLOCKED_USER_IDS`；定义位于 `comment_export.cjs`。
- m3u8 维护脚本依赖 `M3U8_DIR`、`CLEAN_UNUSED_KEYS`、`RETRIES`、`SAMPLE_COUNT`、`START_INDEX`、`LIMIT`；定义位于 `scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。

**Build:**
- `package.json` - Node 版本约束、npm scripts、模块系统入口。
- `wrangler.toml` - Worker 入口、R2 绑定、KV 绑定、站点静态 bucket 配置。
- `.github/workflows/deploy.yml` - `main` 分支推送后执行前端构建并部署到 Cloudflare Pages。
- `src/build/config.js` - 生成前端运行配置 `r2-data/data/config.json`，内容包含 `cdnBase`、`r2Base`、分类和 feed 元数据。

## Platform Requirements（平台要求）

**Development:**
- Node.js `>=18`，并且最好与 `.github/workflows/deploy.yml` 的 Node `20` 保持兼容。
- 需要 `curl` 命令供 `comment_export.cjs` 与 `scripts/export/*.js` 使用。
- 需要 Bash 与 Wrangler CLI 生态供 `scripts/upload-r2.sh` 使用。
- 本地开发需要存在 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/` 等输入目录，`src/build/index.js` 才能产出完整 `r2-data/`。

**Production:**
- 静态前端部署到 Cloudflare Pages，发布目录是 `dist/`，自动化定义在 `.github/workflows/deploy.yml`。
- 静态数据与 m3u8 文件发布到 Cloudflare R2 桶 `jiuyao-data`，本地源目录是 `r2-data/`，上传命令位于 `scripts/upload-r2.sh`。
- 会员接口运行在 Cloudflare Worker，依赖 `MEMBERSHIP_KV` 绑定；定义位于 `src/worker/index.js` 与 `wrangler.toml`。
- 浏览器端还依赖外部 CDN：`src/frontend/index.html` 的 `hls.js`、`src/frontend/js/api.js` 的图片域名，以及 `r2-data/data/config.json` 里写入的 `r2Base` / `cdnBase`。

---

*Stack analysis: 2026-03-27*
