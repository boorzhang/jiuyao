<!-- GSD:project-start source:PROJECT.md -->
## Project

**九妖零服务器成本 PWA 视频站**

这是一个面向公开访客的 PWA 视频站项目，基于现有抓取数据、静态 JSON、Cloudflare Pages、R2 和极薄 Worker 架构运行。它的目标不是做重交互社区，而是在尽量接近零服务器成本的前提下，让用户可以稳定地浏览 70k+ 视频、进入详情页播放、查看静态评论与相关推荐，并把整站尽可能做成可缓存、可部署、可被搜索引擎理解的静态站。

**Core Value:** 在几乎不依赖传统服务器的前提下，让公开访客可以低成本、稳定、持续地发现并播放大量视频内容。

### Constraints

- **Hosting**: 必须以 Cloudflare Pages + R2 + Worker 为主架构 — 目标是长期接近零服务器成本运行
- **Cost**: R2 成本目标控制在免费层附近，数据体量尽量压在 10G 以内；Pages/Worker 计算费用希望长期不超过每月 5 美元 — 成本控制是核心目标
- **Scalability**: 目标支持 70k+ 视频和 10k+ DAU 访问量 — 架构必须优先考虑缓存命中和静态分发
- **Architecture**: 尽量使用静态 JSON、静态分页、固定顺序 feed 与预计算推荐 — 通过离线计算换线上低算力
- **User Data**: 非付费阶段不上传用户行为数据；游客用户名、UID、头像、点赞、收藏、播放记录等默认存客户端本地 — 避免引入服务端状态成本和隐私负担
- **SEO**: 公开内容页需要尽量 SEO 友好 — 目标是让站点可被抓取和索引，而不是纯客户端黑盒
- **Scope**: v1 不做支付、用户评论、搜索、个性化推荐和复杂后台 — 先把公开访问与低成本运行打透
- **Recommendation Logic**: 最新页按最新排序，推荐页按热门排序，详情页相关推荐固定 4 条并尽量全覆盖所有视频 ID — 算法简单、稳定、低计算
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages（语言）
- JavaScript（ES Modules） - 主应用代码使用 `package.json` 的 `"type": "module"`；前端入口位于 `src/frontend/index.html`、`src/frontend/js/app.js`，数据构建入口位于 `src/build/index.js`，Worker 入口位于 `src/worker/index.js`。
- JavaScript（浏览器原生 API） - PWA 端不依赖前端框架，直接使用浏览器 `fetch`、`localStorage`、Service Worker、ESM；核心文件位于 `src/frontend/js/api.js`、`src/frontend/js/store.js`、`src/frontend/sw.js`。
- CommonJS 风格脚本 - 抓取与导出链路大量使用 `require()`、`module.exports` 风格；当前可直接执行的评论链路入口是 `comment_export.cjs`、`lib/comment_export_core.cjs`、`scripts/comment_export/comment_export.cjs`。归档抓取脚本位于 `scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。
- HTML / CSS / JSON - 静态壳与样式位于 `src/frontend/index.html`、`src/frontend/css/styles.css`；构建产物主要输出到 `dist/` 与 `r2-data/`，实际数据文件为大量 JSON 与 `.m3u8`/`.key` 文件。
## Runtime（运行时）
- Node.js `>=18` - 由 `package.json` 的 `engines.node` 约束，供 `scripts/dev-server.js`、`scripts/build-frontend.js`、`src/build/index.js`、`comment_export.cjs` 等脚本运行。
- Cloudflare Workers Runtime - 由 `wrangler.toml` 定义，Worker 主入口是 `src/worker/index.js`，`compatibility_date` 为 `2024-01-01`。
- 浏览器运行时 - `src/frontend/index.html` 通过 `<script type="module">` 加载 `src/frontend/js/app.js`，并在 `src/frontend/sw.js` 注册 PWA 缓存逻辑。
- npm - 由 `package.json`、`.github/workflows/deploy.yml` 中的 `npm ci` / `npm run build:frontend` / `npm run ...` 体现。
- Lockfile: 缺失；仓库根目录未检测到 `package-lock.json`、`pnpm-lock.yaml` 或 `yarn.lock`。
## Frameworks（框架与平台）
- Cloudflare Workers - 用于处理会员接口与 KV 写入；实现位于 `src/worker/index.js`，绑定配置位于 `wrangler.toml`。
- Cloudflare Pages - 用于部署 `dist/` 静态前端；自动化入口位于 `.github/workflows/deploy.yml`。
- 原生 PWA / 无框架前端 - 页面、状态、路由和缓存均由自定义 JS 实现；入口位于 `src/frontend/index.html`、`src/frontend/js/app.js`、`src/frontend/sw.js`。
- Node Built-in Test Runner - `package.json` 的 `test` 脚本执行 `node --test 'tests/*.test.js'`。
- 纯逻辑回归测试 - 测试文件集中在 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/store.test.js`、`tests/comment_export_core.test.cjs`，评论抓取脚本归档目录也保留一份 `scripts/comment_export/comment_export_core.test.cjs`。
- 自定义 Node 构建脚本 - `src/build/index.js` 负责把 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/` 转成 `r2-data/`。
- 静态资源复制脚本 - `scripts/build-frontend.js` 直接把 `src/frontend/` 复制到 `dist/`。
- 本地双端口开发服务器 - `scripts/dev-server.js` 同时提供 `src/frontend/`（`3000`）和 `r2-data/`（`3001`）。
- Wrangler CLI / Cloudflare Action - `scripts/upload-r2.sh` 使用 `npx wrangler r2 object put` 上传对象；`.github/workflows/deploy.yml` 使用 `cloudflare/wrangler-action@v3` 部署 Pages。
## Main Modules（主要模块）
- `src/build/index.js` - 构建总入口，读取原始视频、分类、评论与 m3u8 文件并输出 `r2-data/`。
- `src/build/categories.js` - 生成 `r2-data/data/category/...` 分类分页 JSON。
- `src/build/feeds.js` - 生成推荐与最新 feed 的分页 JSON。
- `src/build/details.js` - 生成 `r2-data/data/video/{id}.json` 与 `comments.json`。
- `src/build/recommend.js`、`src/build/authors.js`、`src/build/config.js` - 分别生成推荐结果、作者页和 `data/config.json`。
- `src/frontend/index.html` - 单页应用壳，加载 `hls.js` CDN 和 `js/app.js`。
- `src/frontend/js/app.js` - 启动配置加载、页面初始化、Tab 切换、PWA 注册。
- `src/frontend/js/api.js` - 统一访问 `r2-data` 静态 JSON / m3u8，同时负责图片解密。
- `src/frontend/js/pages/home.js`、`src/frontend/js/pages/douyin.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/mine.js` - 四个主要视图模块。
- `src/frontend/sw.js` - App shell、数据 JSON、图片与 m3u8 的缓存策略。
- `comment_export.cjs` 与 `lib/comment_export_core.cjs` - 当前评论抓取主链路与可测试纯逻辑。
- `scripts/export/video_json_export_full.js` - 全量视频导出主脚本。
- `scripts/export/localize_m3u8_keys.js` - 本地化 AES key 并去重。
- `scripts/export/refresh_all_m3u8_with_shared_key.js` 与 `scripts/export/retry_failed_m3u8.js` - m3u8 重抓与失败补抓。
- `scripts/upload-r2.sh` - 把 `r2-data/` 上传到 Cloudflare R2。
## Key Dependencies（关键依赖）
- Node 内置模块 - 代码直接使用 `fs`、`path`、`crypto`、`http`、`child_process`，可见于 `src/build/index.js`、`scripts/dev-server.js`、`comment_export.cjs`、`scripts/export/video_json_export_full.js`。
- `hls.js`（CDN 方式） - 由 `src/frontend/index.html` 通过 `https://cdn.jsdelivr.net/npm/hls.js@latest` 引入，用于浏览器播放 HLS。
- curl 可执行程序 - 抓取脚本通过 `spawnSync('curl', ...)` 或 `spawn('curl', ...)` 发请求；实现位于 `comment_export.cjs`、`scripts/export/video_json_export_full.js`、`scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。
- `cloudflare/wrangler-action@v3` - 位于 `.github/workflows/deploy.yml`，用于 Pages 部署。
- Wrangler CLI - `scripts/upload-r2.sh` 依赖 `npx wrangler` 上传 `r2-data/data/` 与 `r2-data/m3u8/`。
- GitHub Actions - 自动化入口位于 `.github/workflows/deploy.yml`。
## Scripts（脚本与入口）
- `npm run dev` - 执行 `scripts/dev-server.js`，本地同时提供前端与数据服务。
- `npm run build:data` - 执行 `src/build/index.js`，输出 `r2-data/`。
- `npm run build:frontend` - 执行 `scripts/build-frontend.js`，输出 `dist/`。
- `npm test` - 执行 `node --test 'tests/*.test.js'`。
- `npm run upload:r2` - 执行 `scripts/upload-r2.sh`，把 `r2-data/` 上传到 Cloudflare R2。
- 数据构建入口：`src/build/index.js`
- 前端构建入口：`scripts/build-frontend.js`
- Worker 部署入口：`src/worker/index.js` + `wrangler.toml`
- Pages 自动部署入口：`.github/workflows/deploy.yml`
- 手工对象存储上传入口：`scripts/upload-r2.sh`
## Configuration（配置）
- 仓库未检测到已提交的 `.env` 文件；运行参数主要通过 shell 环境变量注入，而不是通过配置文件持久化。
- 数据构建链依赖 `JIUYAO_ROOT`、`R2_BASE`；定义与读取位于 `src/build/index.js`。
- 评论与抓取脚本依赖 `BASE_URL`、`SOURCE_DIR`、`OUT_DIR`、`PAGE_SIZE`、`CONCURRENCY`、`WORKER_TOTAL`、`WORKER_INDEX`、`MAX_DEFERRED_ATTEMPTS`、`BLOCKED_USER_IDS`；定义位于 `comment_export.cjs`。
- m3u8 维护脚本依赖 `M3U8_DIR`、`CLEAN_UNUSED_KEYS`、`RETRIES`、`SAMPLE_COUNT`、`START_INDEX`、`LIMIT`；定义位于 `scripts/export/localize_m3u8_keys.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- `package.json` - Node 版本约束、npm scripts、模块系统入口。
- `wrangler.toml` - Worker 入口、R2 绑定、KV 绑定、站点静态 bucket 配置。
- `.github/workflows/deploy.yml` - `main` 分支推送后执行前端构建并部署到 Cloudflare Pages。
- `src/build/config.js` - 生成前端运行配置 `r2-data/data/config.json`，内容包含 `cdnBase`、`r2Base`、分类和 feed 元数据。
## Platform Requirements（平台要求）
- Node.js `>=18`，并且最好与 `.github/workflows/deploy.yml` 的 Node `20` 保持兼容。
- 需要 `curl` 命令供 `comment_export.cjs` 与 `scripts/export/*.js` 使用。
- 需要 Bash 与 Wrangler CLI 生态供 `scripts/upload-r2.sh` 使用。
- 本地开发需要存在 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/` 等输入目录，`src/build/index.js` 才能产出完整 `r2-data/`。
- 静态前端部署到 Cloudflare Pages，发布目录是 `dist/`，自动化定义在 `.github/workflows/deploy.yml`。
- 静态数据与 m3u8 文件发布到 Cloudflare R2 桶 `jiuyao-data`，本地源目录是 `r2-data/`，上传命令位于 `scripts/upload-r2.sh`。
- 会员接口运行在 Cloudflare Worker，依赖 `MEMBERSHIP_KV` 绑定；定义位于 `src/worker/index.js` 与 `wrangler.toml`。
- 浏览器端还依赖外部 CDN：`src/frontend/index.html` 的 `hls.js`、`src/frontend/js/api.js` 的图片域名，以及 `r2-data/data/config.json` 里写入的 `r2Base` / `cdnBase`。
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## 命名模式
- 业务源码以小写目录 + 小写文件名为主，构建侧集中在 `src/build/*.js`，前端侧集中在 `src/frontend/js/**/*.js`，例如 `src/build/categories.js`、`src/frontend/js/pages/detail.js`。
- 需要绕过仓库级 ESM 设置的脚本与测试使用 `.cjs`，例如 `lib/comment_export_core.cjs`、`tests/comment_export_core.test.cjs`、`scripts/comment_export/comment_export.cjs`。
- 命令式脚本使用短横线命名，入口名直接表达用途，例如 `scripts/build-frontend.js`、`scripts/dev-server.js`、`scripts/upload-r2.sh`、`scripts/export/retry_failed_m3u8.js`。
- 数据目录保留下划线前缀表达系统目录，例如 `_by_id`、`_by_tags`、`comments/_by_id`、`m3u8/_refresh_errors.ndjson`。
- 函数统一使用 `camelCase`，并偏向动词开头，见 `src/build/recommend.js` 的 `buildRecommend` / `gcd`，`src/frontend/js/store.js` 的 `toggleLike` / `getHistory`，`lib/comment_export_core.cjs` 的 `buildAggregateCommentSummary` / `shouldDeferFailedVideo`。
- 事件处理或局部辅助函数也保持 `camelCase`，例如 `src/frontend/js/pages/detail.js` 的 `openDetail`、`playVideo`、`loadComments`。
- 普通变量使用 `camelCase`，例如 `src/build/index.js` 的 `videoMap`、`allVideos`，`src/frontend/js/pages/home.js` 的 `currentCat`、`allLoaded`。
- 常量使用 `UPPER_SNAKE_CASE`，尤其是页大小、目录路径、环境变量默认值，见 `src/build/categories.js` 的 `PAGE_SIZE`，`src/build/feeds.js` 的 `FEED_PAGE_SIZE`，`scripts/comment_export/comment_export.cjs` 的 `BASE_URL`、`OUT_DIR`、`WORKER_TOTAL`。
- 未检测到 TypeScript 或独立类型定义文件；类型约束主要依赖对象结构和少量 JSDoc 注释，例如 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`。
- 类名只在测试替身中使用 `PascalCase`，例如 `tests/store.test.js` 的 `MockStorage`。
## 模块格式与脚本类型
- `package.json` 声明 `"type": "module"`，因此仓库中的 `.js` 默认按 ESM 处理，使用 `import` / `export`，例如 `src/build/index.js`、`src/frontend/js/app.js`、`scripts/build-frontend.js`。
- 评论导出核心逻辑使用 `.cjs` + `require` / `module.exports`，见 `lib/comment_export_core.cjs` 和归档副本 `scripts/comment_export/comment_export_core.cjs`。
- `scripts/comment_export/comment_export.js` 是 ESM 包装层，只负责 `import './comment_export.cjs'`，用于兼容旧调用方式。
- Node 构建脚本放在 `src/build/*.js` 与 `scripts/*.js`。
- Shell 脚本仅在上传链路出现，见 `scripts/upload-r2.sh`。
- Cloudflare Worker 入口单独保存在 `src/worker/index.js`，这里使用 `export default`，不同于构建与前端模块的纯命名导出风格。
## 代码风格
- 未检测到 `eslint.config.*`、`.eslintrc*`、`.prettierrc*`、`biome.json`；当前风格来自现有文件而非工具强制。
- `src/build/index.js`、`src/frontend/js/app.js`、`src/frontend/js/store.js`、`scripts/comment_export/comment_export.cjs` 一致使用 2 空格缩进、句末分号、单引号字符串。
- 多行对象和参数列表在需要时保留尾随逗号，见 `scripts/comment_export/comment_export.cjs` 的解构导入、多行对象字面量，以及 `lib/comment_export_core.cjs` 的返回对象。
- 未检测到仓库内的 lint 命令或配置；`package.json` 只有 `dev`、`build:data`、`build:frontend`、`test`、`upload:r2` 五个脚本。
- 现有约束主要依赖运行时错误、单元测试和人工审阅。
## 导入组织
- 未检测到 `tsconfig.json`、`jsconfig.json` 或 bundler alias 配置；未来新增模块应继续使用相对路径以匹配 `src/build/*.js`、`src/frontend/js/**/*.js`、`tests/*.test.js` 的现状。
## 错误处理
- 构建与抓取脚本倾向于抛出 `Error`，在顶层统一捕获后输出 `[FATAL]` 并退出非零码，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/retry_failed_m3u8.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。
- Shell 侧通过 `set -e` 和显式 `exit 1` 处理前置条件失败，见 `scripts/upload-r2.sh`。
- 前端页面以“日志 + 降级 UI”为主，不向上抛异常，见 `src/frontend/js/app.js`、`src/frontend/js/pages/home.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`。
- 构建模块对局部脏数据容忍度较高，常见写法是吞掉无法读取的单个目录或文件后继续处理，见 `src/build/categories.js` 和 `src/build/details.js`。
## 日志与退出码
- 未检测到专用日志库；全部使用 `console.log` / `console.error`。
- 进度型脚本用阶段编号输出可读日志，见 `src/build/index.js` 的 `[1/6]` 到 `[8/8]`。
- 长任务脚本封装 `log(...args)`，统一加 ISO 时间戳和 worker 标签，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- 致命错误统一打印 `[FATAL]` 前缀并 `process.exit(1)`，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- 前端只在失败点打印中文错误信息，不改变进程退出码，见 `src/frontend/js/app.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/home.js`。
## 注释
- 导出脚本习惯在文件头写中文用途说明和使用示例，见 `scripts/comment_export/comment_export.cjs`、`scripts/comment_export/comment_export.js`、`lib/comment_export_core.cjs`。
- 复杂流程前会写中文阶段说明，见 `src/build/index.js` 的步骤注释、`scripts/upload-r2.sh` 的上传阶段说明。
- 前端模块用短中文注释说明交互块，见 `src/frontend/js/pages/detail.js`、`src/frontend/js/store.js`。
- 只在部分构建函数使用 JSDoc，主要出现在 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`；前端模块基本没有 JSDoc。
## 函数设计
- 纯转换函数保持短小，集中在 `src/build/categories.js`、`src/build/recommend.js`、`lib/comment_export_core.cjs`。
- 编排函数允许较长并混合 I/O，例如 `src/build/index.js` 和 `scripts/comment_export/comment_export.cjs`。
- 面向业务实体的纯函数偏向对象参数，便于扩展字段，见 `lib/comment_export_core.cjs` 的 `buildMainCommentParams({...})`、`buildReplyCommentParams({...})`、`shouldDeferFailedVideo({...})`。
- 构建模块仍使用少量位置参数，见 `src/build/feeds.js` 的 `buildFeeds(allVideos, outDir)`、`src/build/categories.js` 的 `buildCategories(videoMap, tagsDir, outDir)`。
- 纯构建函数返回 plain object / array / boolean，见 `src/build/feeds.js`、`src/build/categories.js`、`lib/comment_export_core.cjs`。
- 写文件型函数通常通过副作用产出结果，只返回计数或摘要对象，见 `src/build/index.js`、`src/build/details.js`、`scripts/comment_export/comment_export.cjs`。
## 模块设计
- ESM 模块偏向命名导出，见 `src/build/*.js`、`src/frontend/js/*.js`。
- CommonJS 模块统一在文件尾部集中 `module.exports = { ... }`，见 `lib/comment_export_core.cjs` 和 `scripts/comment_export/comment_export_core.cjs`。
- 常量会与主函数一起导出供测试复用，见 `src/build/categories.js` 的 `PAGE_SIZE`、`src/build/feeds.js` 的 `FEED_PAGE_SIZE`、`src/build/recommend.js` 的 `STEP` / `REC_COUNT`。
- 未检测到 barrel file；所有调用方直接依赖具体模块路径。
## 环境变量
- 环境变量全部直接从 `process.env` 读取，没有 `dotenv`、配置工厂或 schema 校验层。
- 命名统一为大写下划线，读取后立即做默认值和类型归一化，见 `src/build/index.js` 的 `JIUYAO_ROOT` / `R2_BASE`，`scripts/comment_export/comment_export.cjs` 的 `OUT_DIR` / `WORKER_TOTAL` / `FORCE_ALL`，`scripts/export/*.js` 的 `BASE_URL` / `CONCURRENCY` / `RETRIES`。
- 布尔值使用字符串比较，例如 `=== '1'`、`!== '0'`，见 `scripts/comment_export/comment_export.cjs` 和 `scripts/export/localize_m3u8_keys.js`。
- 数值统一包裹 `Number(...)` 或专门归一化函数，见 `scripts/comment_export/comment_export.cjs` 的 `normalizeWorkerCount`，`scripts/export/refresh_all_m3u8_with_shared_key.js` 的 `Math.max(1, Number(process.env.CONCURRENCY || 16))`。
- 数据构建入口 `src/build/index.js` 只认 `JIUYAO_ROOT` 和 `R2_BASE`。
- 评论导出入口 `scripts/comment_export/comment_export.cjs` 维护最多的运行参数，包括 `SOURCE_DIR`、`OUT_DIR`、`PAGE_SIZE`、`ONLY_IDS`、`WORKER_TOTAL`、`WORKER_INDEX`、`BLOCKED_USER_IDS`。
- M3U8 和视频导出脚本参数集中在 `scripts/export/*.js`，如 `SOURCE_DIR`、`M3U8_DIR`、`ERROR_NDJSON`、`TARGET_COUNT`、`MODULE_PAGE_CAP`。
## 数据文件命名
- 原始视频文件使用 `VID{id}.json`，保存在 `_by_id/`，例如 `_by_id/VID614758e5a871e78d083cfd80.json`。
- 分类索引目录按标签 slug 建目录，内部仍是 `VID{id}.json`，例如 `_by_tags/17岁/VID61c5a6539dc8962429c9058e.json`。
- 分类分页输出到 `r2-data/data/category/{slug}/page_{n}.json`，例如 `r2-data/data/category/17岁/page_1.json`。
- Feed 分页输出到 `r2-data/data/feed/{recommend|latest}/page_{n}.json`，例如 `r2-data/data/feed/latest/page_1.json`。
- 视频详情直接写成 `r2-data/data/video/{id}.json`，而视频附属资源落在子目录，例如 `r2-data/data/video/61cd1d909dc8962429c90ea7/recommend.json`、`r2-data/data/video/61cd1d909dc8962429c90ea7/comments.json`。
- 作者详情使用 `r2-data/data/author/{uid}.json`，分页使用 `r2-data/data/author/{uid}/page_{n}.json`。
- M3U8 文件统一是 `m3u8/VID{id}.m3u8`。
- 运行日志和状态文件以 `_` 前缀区分，例如 `comments/_errors.ndjson`、`comments/_summary.json`、`comments/_run.pid`、`comments/_run-2026-03-27.log`、`m3u8/_refresh_summary.json`、`m3u8/_refresh_errors.ndjson`、`m3u8/_retry_errors.ndjson`。
## 脚本复用模式
- 复杂抓取流程会把可测试逻辑抽到纯函数模块，再由入口脚本做 I/O 编排，见 `lib/comment_export_core.cjs` 与 `scripts/comment_export/comment_export.cjs` 的分层。
- 构建链路同样采用“入口编排 + 子模块产物写入”的模式，见 `src/build/index.js` 对 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`、`src/build/details.js`、`src/build/authors.js`、`src/build/config.js` 的调用。
- `scripts/comment_export/comment_export.js` 只做 ESM 包装，真正实现留在 `scripts/comment_export/comment_export.cjs`。
- 归档目录 `scripts/comment_export/` 保留一套与根目录 `lib/`、`tests/` 等价的副本；`cmp` 结果显示 `lib/comment_export_core.cjs` 与 `scripts/comment_export/comment_export_core.cjs` 完全一致，`tests/comment_export_core.test.cjs` 与 `scripts/comment_export/comment_export_core.test.cjs` 也完全一致。
- `scripts/README.md` 和 `scripts/comment_export/README.md` 会记录用途、推荐阅读顺序和示例命令；新增脚本应继续在对应目录 README 里补充用途和运行方式。
## 测试风格
- 统一使用 Node 原生 `node:test` 与 `node:assert/strict`，见 `tests/categories.test.js`、`tests/recommend.test.js`、`tests/comment_export_core.test.cjs`。
- ESM 测试使用 `describe` / `it`，CommonJS 测试使用顶层 `test(...)`，见 `tests/categories.test.js` 与 `tests/comment_export_core.test.cjs`。
- 测试数据通常内联构造，不依赖共享 fixture 目录，见 `tests/categories.test.js` 的 `makeVideo`、`tests/store.test.js` 的 `MockStorage` / `createStore`。
- 文件系统相关测试倾向于使用真实临时目录和真实读写，见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`。
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- 应用运行时几乎不依赖传统后端服务；`src/frontend/js/api.js` 只读取静态 JSON 与 `m3u8` 文件。
- “后端职责”主要体现在离线 Node 脚本：`scripts/export/*.js`、`comment_export.cjs`、`src/build/*.js` 负责抓取、清洗、建模和发布产物生成。
- 前端、数据和播放资源是分线部署的：`dist/` 提供站点壳，`r2-data/` 提供 JSON 与媒体清单，`src/worker/index.js` 只补一个会员接口并可托管静态站点。
## Layers
- Purpose: 从上游站点抓取视频、评论和播放清单，落盘成仓库内原始数据。
- Location: `scripts/export/video_json_export_full.js`、`scripts/export/video_json_export.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/localize_m3u8_keys.js`、`comment_export.cjs`、`scripts/comment_export/comment_export.cjs`
- Contains: 登录、接口参数加密/解密、分页抓取、失败重试、结果写盘。
- Depends on: `curl`、Node `fs/path/crypto/child_process`、上游 `api/app/*` 接口。
- Used by: `src/build/index.js` 消费其输出目录 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`。
- Purpose: 把仓库内的原始视频、标签、评论和播放文件转换成前端可直接读取的静态数据接口。
- Location: `src/build/index.js`、`src/build/categories.js`、`src/build/feeds.js`、`src/build/details.js`、`src/build/recommend.js`、`src/build/authors.js`、`src/build/config.js`
- Contains: 分类分页、推荐 feed、详情页数据、作者分页、评论裁剪、构建配置。
- Depends on: `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`
- Used by: `r2-data/` 产物目录，随后由 `src/frontend/js/api.js` 与 `scripts/upload-r2.sh` 消费。
- Purpose: 在浏览器中提供主页、短视频流、个人中心、详情页和播放体验。
- Location: `src/frontend/index.html`、`src/frontend/js/app.js`、`src/frontend/js/pages/*.js`、`src/frontend/js/api.js`、`src/frontend/js/store.js`、`src/frontend/sw.js`
- Contains: SPA 壳、模块级状态、localStorage 持久化、Hls.js 播放、图片解密、PWA 缓存。
- Depends on: `r2-data/data/*`、`r2-data/m3u8/*`、远端图片 CDN `https://imgosne.qqdanb.cn`
- Used by: `scripts/build-frontend.js` 复制到 `dist/`，或由 `scripts/dev-server.js` 本地直接服务 `src/frontend/`。
- Purpose: 提供极薄的会员接口，并把构建后的静态站点交给 Cloudflare 运行。
- Location: `src/worker/index.js`、`wrangler.toml`
- Contains: `POST /api/membership`、KV 写入、CORS、Cloudflare 站点绑定。
- Depends on: Cloudflare KV `MEMBERSHIP_KV`、`dist/`
- Used by: 浏览器端会员开通流程（当前前端尚未直接接入），以及部署配置。
- Purpose: 把前端壳与数据产物发布到不同目标。
- Location: `scripts/build-frontend.js`、`scripts/upload-r2.sh`、`.github/workflows/deploy.yml`
- Contains: 前端复制构建、R2 对象上传、Cloudflare Pages 部署。
- Depends on: `dist/`、`r2-data/`、Wrangler CLI
- Used by: 本地发布和 CI。
- Purpose: 保存逆向分析素材、历史静态原型和抓取到的前端分包，不进入当前主构建链。
- Location: `html/`、`site/index.html`、`scripts/frontend/*.js`、`docs/*.md`
- Contains: 还原页面、原站 JS 分包、交接文档和设计说明。
- Depends on: 无固定运行依赖。
- Used by: 人工分析、需求追溯、后续脚本优化。
## Data Flow
- 页面级瞬时状态放在模块级变量中，例如 `src/frontend/js/pages/home.js` 的 `currentCat/currentPage`、`src/frontend/js/pages/douyin.js` 的 `dy` 对象、`src/frontend/js/pages/detail.js` 的 `currentVideo`。
- 用户持久化状态放在 `src/frontend/js/store.js`，通过 localStorage 保存点赞、收藏、关注、历史和游客用户信息。
- 离线缓存由 `src/frontend/sw.js` 负责：应用壳 cache-first，`/data/*` network-first，远端封面 cache-first。
## Key Abstractions
- Purpose: 作为全仓库最上游的事实来源，保留上游接口字段和站点播放信息。
- Examples: `_by_id/VID614758e5a871e78d083cfd80.json`、`_summary.json`
- Pattern: 每个视频一个 `VID{id}.json`，同时保留 `raw`、`categoryList`、`sourceURL`、`m3u8` 等字段，供后续构建多次重用。
- Purpose: 为列表页、推荐区、作者作品区提供轻量视频视图模型。
- Examples: `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`、`src/build/authors.js`
- Pattern: 所有列表型 JSON 复用 `slimVideo(v)` 输出，字段集合稳定，避免前端在多个列表端点处理不同形状。
- Purpose: 把单视频相关资源收敛到一个目录前缀下。
- Examples: `r2-data/data/video/<id>.json`、`r2-data/data/video/<id>/recommend.json`、`r2-data/data/video/<id>/comments.json`
- Pattern: 详情主文件放在 `data/video/<id>.json`，衍生数据放在同名子目录 `data/video/<id>/`。
- Purpose: 用静态文件模拟作者主页分页接口。
- Examples: `r2-data/data/author/<uid>.json`、`r2-data/data/author/<uid>/page_<n>.json`
- Pattern: 首页文件包含 profile + 第 1 页视频，后续页按目录分页。
- Purpose: 为前端提供分类、feed 总页数、总视频量和资源基地址。
- Examples: `src/build/config.js`、`r2-data/data/config.json`
- Pattern: 启动先读 `config.json`，然后前端才初始化页面与 `R2_BASE`。
- Purpose: 将容易测试的评论分片、过滤和聚合逻辑与网络抓取解耦。
- Examples: `lib/comment_export_core.cjs`、`scripts/comment_export/comment_export_core.cjs`
- Pattern: I/O 留在主脚本，纯函数留在 core 文件，便于 `tests/comment_export_core.test.cjs` 与 `scripts/comment_export/comment_export_core.test.cjs` 回归。
## Entry Points
- Location: `scripts/dev-server.js`
- Triggers: `npm run dev`
- Responsibilities: 同时服务前端源码目录 `src/frontend/` 和数据目录 `r2-data/`，提供 SPA fallback 和跨域头。
- Location: `src/build/index.js`
- Triggers: `npm run build:data`
- Responsibilities: 扫描 `_by_id/`、`_by_tags/`、`comments/_by_id/`、`m3u8/`，生成 `r2-data/` 的完整静态数据树。
- Location: `scripts/build-frontend.js`
- Triggers: `npm run build:frontend`
- Responsibilities: 把 `src/frontend/` 原样复制到 `dist/`；当前没有 bundler 和转译层。
- Location: `scripts/export/video_json_export_full.js`
- Triggers: 手工运行脚本
- Responsibilities: 生成 `_by_id/`、`_by_tags/` 与 `_summary.json`，是后续所有数据构建的上游输入。
- Location: `comment_export.cjs`、`comment_export.js`
- Triggers: 手工运行脚本
- Responsibilities: 生成 `comments/_by_id/`，支持 `WORKER_TOTAL` / `WORKER_INDEX` 分片。
- Location: `scripts/export/refresh_all_m3u8_with_shared_key.js`
- Triggers: 手工运行脚本
- Responsibilities: 为 `_by_id/` 视频生成本地 `m3u8/VID*.m3u8` 与共享 `key` 文件。
- Location: `src/worker/index.js`
- Triggers: Cloudflare Worker 请求流量
- Responsibilities: 处理 `POST /api/membership`，其余路径返回 404；静态托管配置由 `wrangler.toml` 绑定 `dist/`。
## Error Handling
- 构建脚本对缺失评论和解析失败采用跳过策略，例如 `src/build/details.js` 只在评论文件存在且可解析时生成 `comments.json`。
- 前端请求失败通常只 `console.error` 或回退为空 UI，例如 `src/frontend/js/pages/home.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`。
- 评论导出比其他脚本更严格，`comment_export.cjs` 使用 `failureKind`、`shouldDeferFailedVideo()`、worker 汇总等机制处理 4010、传输错误和延后重试。
- Worker API 统一使用 `jsonResponse()` 返回 `{ ok: false, error }`，错误边界收敛在 `src/worker/index.js`。
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
