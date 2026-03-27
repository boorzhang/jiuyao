# 编码约定

**分析日期：** 2026-03-27

## 命名模式

**文件：**
- 业务源码以小写目录 + 小写文件名为主，构建侧集中在 `src/build/*.js`，前端侧集中在 `src/frontend/js/**/*.js`，例如 `src/build/categories.js`、`src/frontend/js/pages/detail.js`。
- 需要绕过仓库级 ESM 设置的脚本与测试使用 `.cjs`，例如 `lib/comment_export_core.cjs`、`tests/comment_export_core.test.cjs`、`scripts/comment_export/comment_export.cjs`。
- 命令式脚本使用短横线命名，入口名直接表达用途，例如 `scripts/build-frontend.js`、`scripts/dev-server.js`、`scripts/upload-r2.sh`、`scripts/export/retry_failed_m3u8.js`。
- 数据目录保留下划线前缀表达系统目录，例如 `_by_id`、`_by_tags`、`comments/_by_id`、`m3u8/_refresh_errors.ndjson`。

**函数：**
- 函数统一使用 `camelCase`，并偏向动词开头，见 `src/build/recommend.js` 的 `buildRecommend` / `gcd`，`src/frontend/js/store.js` 的 `toggleLike` / `getHistory`，`lib/comment_export_core.cjs` 的 `buildAggregateCommentSummary` / `shouldDeferFailedVideo`。
- 事件处理或局部辅助函数也保持 `camelCase`，例如 `src/frontend/js/pages/detail.js` 的 `openDetail`、`playVideo`、`loadComments`。

**变量：**
- 普通变量使用 `camelCase`，例如 `src/build/index.js` 的 `videoMap`、`allVideos`，`src/frontend/js/pages/home.js` 的 `currentCat`、`allLoaded`。
- 常量使用 `UPPER_SNAKE_CASE`，尤其是页大小、目录路径、环境变量默认值，见 `src/build/categories.js` 的 `PAGE_SIZE`，`src/build/feeds.js` 的 `FEED_PAGE_SIZE`，`scripts/comment_export/comment_export.cjs` 的 `BASE_URL`、`OUT_DIR`、`WORKER_TOTAL`。

**类型：**
- 未检测到 TypeScript 或独立类型定义文件；类型约束主要依赖对象结构和少量 JSDoc 注释，例如 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`。
- 类名只在测试替身中使用 `PascalCase`，例如 `tests/store.test.js` 的 `MockStorage`。

## 模块格式与脚本类型

**仓库默认模块格式：**
- `package.json` 声明 `"type": "module"`，因此仓库中的 `.js` 默认按 ESM 处理，使用 `import` / `export`，例如 `src/build/index.js`、`src/frontend/js/app.js`、`scripts/build-frontend.js`。

**CommonJS 边界：**
- 评论导出核心逻辑使用 `.cjs` + `require` / `module.exports`，见 `lib/comment_export_core.cjs` 和归档副本 `scripts/comment_export/comment_export_core.cjs`。
- `scripts/comment_export/comment_export.js` 是 ESM 包装层，只负责 `import './comment_export.cjs'`，用于兼容旧调用方式。

**脚本类型：**
- Node 构建脚本放在 `src/build/*.js` 与 `scripts/*.js`。
- Shell 脚本仅在上传链路出现，见 `scripts/upload-r2.sh`。
- Cloudflare Worker 入口单独保存在 `src/worker/index.js`，这里使用 `export default`，不同于构建与前端模块的纯命名导出风格。

## 代码风格

**格式化：**
- 未检测到 `eslint.config.*`、`.eslintrc*`、`.prettierrc*`、`biome.json`；当前风格来自现有文件而非工具强制。
- `src/build/index.js`、`src/frontend/js/app.js`、`src/frontend/js/store.js`、`scripts/comment_export/comment_export.cjs` 一致使用 2 空格缩进、句末分号、单引号字符串。
- 多行对象和参数列表在需要时保留尾随逗号，见 `scripts/comment_export/comment_export.cjs` 的解构导入、多行对象字面量，以及 `lib/comment_export_core.cjs` 的返回对象。

**Linting：**
- 未检测到仓库内的 lint 命令或配置；`package.json` 只有 `dev`、`build:data`、`build:frontend`、`test`、`upload:r2` 五个脚本。
- 现有约束主要依赖运行时错误、单元测试和人工审阅。

## 导入组织

**顺序：**
1. Node 内建模块优先，见 `src/build/index.js`、`src/frontend/js/app.js`、`tests/categories.test.js`、`scripts/comment_export/comment_export.cjs`。
2. 同目录或相邻目录的相对导入随后出现，见 `src/build/index.js` 对 `./categories.js`、`./feeds.js` 的导入，`src/frontend/js/pages/detail.js` 对 `../api.js`、`./home.js` 的导入。
3. 仓库内未使用路径别名；所有源码和测试都使用显式相对路径，例如 `../src/build/categories.js`、`../lib/comment_export_core.cjs`。

**路径别名：**
- 未检测到 `tsconfig.json`、`jsconfig.json` 或 bundler alias 配置；未来新增模块应继续使用相对路径以匹配 `src/build/*.js`、`src/frontend/js/**/*.js`、`tests/*.test.js` 的现状。

## 错误处理

**模式：**
- 构建与抓取脚本倾向于抛出 `Error`，在顶层统一捕获后输出 `[FATAL]` 并退出非零码，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/retry_failed_m3u8.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`。
- Shell 侧通过 `set -e` 和显式 `exit 1` 处理前置条件失败，见 `scripts/upload-r2.sh`。
- 前端页面以“日志 + 降级 UI”为主，不向上抛异常，见 `src/frontend/js/app.js`、`src/frontend/js/pages/home.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`。
- 构建模块对局部脏数据容忍度较高，常见写法是吞掉无法读取的单个目录或文件后继续处理，见 `src/build/categories.js` 和 `src/build/details.js`。

## 日志与退出码

**日志框架：**
- 未检测到专用日志库；全部使用 `console.log` / `console.error`。

**模式：**
- 进度型脚本用阶段编号输出可读日志，见 `src/build/index.js` 的 `[1/6]` 到 `[8/8]`。
- 长任务脚本封装 `log(...args)`，统一加 ISO 时间戳和 worker 标签，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- 致命错误统一打印 `[FATAL]` 前缀并 `process.exit(1)`，见 `scripts/comment_export/comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/retry_failed_m3u8.js`。
- 前端只在失败点打印中文错误信息，不改变进程退出码，见 `src/frontend/js/app.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/home.js`。

## 注释

**何时注释：**
- 导出脚本习惯在文件头写中文用途说明和使用示例，见 `scripts/comment_export/comment_export.cjs`、`scripts/comment_export/comment_export.js`、`lib/comment_export_core.cjs`。
- 复杂流程前会写中文阶段说明，见 `src/build/index.js` 的步骤注释、`scripts/upload-r2.sh` 的上传阶段说明。
- 前端模块用短中文注释说明交互块，见 `src/frontend/js/pages/detail.js`、`src/frontend/js/store.js`。

**JSDoc / TSDoc：**
- 只在部分构建函数使用 JSDoc，主要出现在 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`；前端模块基本没有 JSDoc。

## 函数设计

**规模：**
- 纯转换函数保持短小，集中在 `src/build/categories.js`、`src/build/recommend.js`、`lib/comment_export_core.cjs`。
- 编排函数允许较长并混合 I/O，例如 `src/build/index.js` 和 `scripts/comment_export/comment_export.cjs`。

**参数：**
- 面向业务实体的纯函数偏向对象参数，便于扩展字段，见 `lib/comment_export_core.cjs` 的 `buildMainCommentParams({...})`、`buildReplyCommentParams({...})`、`shouldDeferFailedVideo({...})`。
- 构建模块仍使用少量位置参数，见 `src/build/feeds.js` 的 `buildFeeds(allVideos, outDir)`、`src/build/categories.js` 的 `buildCategories(videoMap, tagsDir, outDir)`。

**返回值：**
- 纯构建函数返回 plain object / array / boolean，见 `src/build/feeds.js`、`src/build/categories.js`、`lib/comment_export_core.cjs`。
- 写文件型函数通常通过副作用产出结果，只返回计数或摘要对象，见 `src/build/index.js`、`src/build/details.js`、`scripts/comment_export/comment_export.cjs`。

## 模块设计

**导出：**
- ESM 模块偏向命名导出，见 `src/build/*.js`、`src/frontend/js/*.js`。
- CommonJS 模块统一在文件尾部集中 `module.exports = { ... }`，见 `lib/comment_export_core.cjs` 和 `scripts/comment_export/comment_export_core.cjs`。
- 常量会与主函数一起导出供测试复用，见 `src/build/categories.js` 的 `PAGE_SIZE`、`src/build/feeds.js` 的 `FEED_PAGE_SIZE`、`src/build/recommend.js` 的 `STEP` / `REC_COUNT`。

**Barrel 文件：**
- 未检测到 barrel file；所有调用方直接依赖具体模块路径。

## 环境变量

**读取方式：**
- 环境变量全部直接从 `process.env` 读取，没有 `dotenv`、配置工厂或 schema 校验层。
- 命名统一为大写下划线，读取后立即做默认值和类型归一化，见 `src/build/index.js` 的 `JIUYAO_ROOT` / `R2_BASE`，`scripts/comment_export/comment_export.cjs` 的 `OUT_DIR` / `WORKER_TOTAL` / `FORCE_ALL`，`scripts/export/*.js` 的 `BASE_URL` / `CONCURRENCY` / `RETRIES`。
- 布尔值使用字符串比较，例如 `=== '1'`、`!== '0'`，见 `scripts/comment_export/comment_export.cjs` 和 `scripts/export/localize_m3u8_keys.js`。
- 数值统一包裹 `Number(...)` 或专门归一化函数，见 `scripts/comment_export/comment_export.cjs` 的 `normalizeWorkerCount`，`scripts/export/refresh_all_m3u8_with_shared_key.js` 的 `Math.max(1, Number(process.env.CONCURRENCY || 16))`。

**关键变量分布：**
- 数据构建入口 `src/build/index.js` 只认 `JIUYAO_ROOT` 和 `R2_BASE`。
- 评论导出入口 `scripts/comment_export/comment_export.cjs` 维护最多的运行参数，包括 `SOURCE_DIR`、`OUT_DIR`、`PAGE_SIZE`、`ONLY_IDS`、`WORKER_TOTAL`、`WORKER_INDEX`、`BLOCKED_USER_IDS`。
- M3U8 和视频导出脚本参数集中在 `scripts/export/*.js`，如 `SOURCE_DIR`、`M3U8_DIR`、`ERROR_NDJSON`、`TARGET_COUNT`、`MODULE_PAGE_CAP`。

## 数据文件命名

**输入源数据：**
- 原始视频文件使用 `VID{id}.json`，保存在 `_by_id/`，例如 `_by_id/VID614758e5a871e78d083cfd80.json`。
- 分类索引目录按标签 slug 建目录，内部仍是 `VID{id}.json`，例如 `_by_tags/17岁/VID61c5a6539dc8962429c9058e.json`。

**构建输出：**
- 分类分页输出到 `r2-data/data/category/{slug}/page_{n}.json`，例如 `r2-data/data/category/17岁/page_1.json`。
- Feed 分页输出到 `r2-data/data/feed/{recommend|latest}/page_{n}.json`，例如 `r2-data/data/feed/latest/page_1.json`。
- 视频详情直接写成 `r2-data/data/video/{id}.json`，而视频附属资源落在子目录，例如 `r2-data/data/video/61cd1d909dc8962429c90ea7/recommend.json`、`r2-data/data/video/61cd1d909dc8962429c90ea7/comments.json`。
- 作者详情使用 `r2-data/data/author/{uid}.json`，分页使用 `r2-data/data/author/{uid}/page_{n}.json`。
- M3U8 文件统一是 `m3u8/VID{id}.m3u8`。

**运行态与诊断文件：**
- 运行日志和状态文件以 `_` 前缀区分，例如 `comments/_errors.ndjson`、`comments/_summary.json`、`comments/_run.pid`、`comments/_run-2026-03-27.log`、`m3u8/_refresh_summary.json`、`m3u8/_refresh_errors.ndjson`、`m3u8/_retry_errors.ndjson`。

## 脚本复用模式

**纯逻辑抽离：**
- 复杂抓取流程会把可测试逻辑抽到纯函数模块，再由入口脚本做 I/O 编排，见 `lib/comment_export_core.cjs` 与 `scripts/comment_export/comment_export.cjs` 的分层。
- 构建链路同样采用“入口编排 + 子模块产物写入”的模式，见 `src/build/index.js` 对 `src/build/categories.js`、`src/build/feeds.js`、`src/build/recommend.js`、`src/build/details.js`、`src/build/authors.js`、`src/build/config.js` 的调用。

**兼容包装：**
- `scripts/comment_export/comment_export.js` 只做 ESM 包装，真正实现留在 `scripts/comment_export/comment_export.cjs`。
- 归档目录 `scripts/comment_export/` 保留一套与根目录 `lib/`、`tests/` 等价的副本；`cmp` 结果显示 `lib/comment_export_core.cjs` 与 `scripts/comment_export/comment_export_core.cjs` 完全一致，`tests/comment_export_core.test.cjs` 与 `scripts/comment_export/comment_export_core.test.cjs` 也完全一致。

**脚本文档化：**
- `scripts/README.md` 和 `scripts/comment_export/README.md` 会记录用途、推荐阅读顺序和示例命令；新增脚本应继续在对应目录 README 里补充用途和运行方式。

## 测试风格

**测试框架：**
- 统一使用 Node 原生 `node:test` 与 `node:assert/strict`，见 `tests/categories.test.js`、`tests/recommend.test.js`、`tests/comment_export_core.test.cjs`。

**风格：**
- ESM 测试使用 `describe` / `it`，CommonJS 测试使用顶层 `test(...)`，见 `tests/categories.test.js` 与 `tests/comment_export_core.test.cjs`。
- 测试数据通常内联构造，不依赖共享 fixture 目录，见 `tests/categories.test.js` 的 `makeVideo`、`tests/store.test.js` 的 `MockStorage` / `createStore`。
- 文件系统相关测试倾向于使用真实临时目录和真实读写，见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`。

---

*约定分析：2026-03-27*
