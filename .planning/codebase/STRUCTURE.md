# Codebase Structure

**Analysis Date:** 2026-03-27

## Directory Layout

```text
[project-root]/
├── `src/`                    # 当前主源码：数据构建、前端 SPA、Cloudflare Worker
├── `scripts/`                # 运维与抓取脚本、逆向保留脚本
├── `_by_id/`                 # 原始视频主数据（当前约 75186 个 `VID*.json`）
├── `_by_tags/`               # 按标签分桶的原始视频索引（当前 11 个分类目录）
├── `comments/`               # 评论抓取结果（当前 `comments/_by_id/` 约 7063 个文件）
├── `m3u8/`                   # 本地化播放清单与共享 key（当前约 74520 个 `VID*.m3u8`）
├── `r2-data/`                # 构建后的静态数据与播放资源发布目录
├── `dist/`                   # 前端静态构建产物
├── `tests/`                  # Node 内置测试
├── `lib/`                    # 顶层脚本依赖的共用 CJS 逻辑
├── `site/`                   # 独立静态原型页，不在当前主构建链
├── `html/`                   # 逆向还原页面与抓取的原站静态资源
├── `docs/`                   # 交接、方案与分析文档
├── `.github/`                # CI / 部署工作流
├── `.planning/`              # GSD 规划与代码库映射文档
├── `comment_export.cjs`      # 根级评论导出入口
├── `comment_export.js`       # 根级 ESM 兼容入口
├── `package.json`            # Node 脚本入口定义
└── `wrangler.toml`           # Cloudflare Worker / R2 / site 配置
```

## Directory Purposes

**`src/`:**
- Purpose: 当前主源码目录。
- Contains: `src/build/` 数据构建脚本、`src/frontend/` 浏览器端 SPA、`src/worker/` Cloudflare Worker。
- Key files: `src/build/index.js`、`src/frontend/index.html`、`src/frontend/js/app.js`、`src/worker/index.js`

**`src/build/`:**
- Purpose: 把仓库内原始数据转换成前端静态接口。
- Contains: 分类、feed、详情、推荐、作者和配置构建模块。
- Key files: `src/build/categories.js`、`src/build/feeds.js`、`src/build/details.js`、`src/build/recommend.js`、`src/build/authors.js`、`src/build/config.js`

**`src/frontend/`:**
- Purpose: 运行中的前端应用源码。
- Contains: `index.html`、`css/styles.css`、`js/` 模块、`manifest.json`、`sw.js`
- Key files: `src/frontend/js/api.js`、`src/frontend/js/store.js`、`src/frontend/js/pages/home.js`、`src/frontend/js/pages/douyin.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/mine.js`

**`src/worker/`:**
- Purpose: Cloudflare Worker 入口。
- Contains: 会员接口实现。
- Key files: `src/worker/index.js`

**`scripts/`:**
- Purpose: 仓库级操作脚本与归档下来的抓取/逆向脚本。
- Contains: 构建辅助、导出脚本、评论脚本归档、原站前端分包。
- Key files: `scripts/dev-server.js`、`scripts/build-frontend.js`、`scripts/upload-r2.sh`、`scripts/export/video_json_export_full.js`、`scripts/comment_export/comment_export.cjs`

**`scripts/export/`:**
- Purpose: 视频与播放资源抓取链。
- Contains: 全量视频导出、增量/试验导出、`m3u8` 刷新与 key 本地化。
- Key files: `scripts/export/video_json_export_full.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/localize_m3u8_keys.js`

**`scripts/comment_export/`:**
- Purpose: 评论导出脚本的归档版本与独立说明。
- Contains: `comment_export.cjs`、ESM 包装、core 纯逻辑、README、测试。
- Key files: `scripts/comment_export/README.md`、`scripts/comment_export/comment_export.cjs`、`scripts/comment_export/comment_export_core.cjs`

**`lib/`:**
- Purpose: 给根级 `comment_export.cjs` 提供共用纯逻辑模块。
- Contains: `comment_export_core.cjs`
- Key files: `lib/comment_export_core.cjs`

**`_by_id/`:**
- Purpose: 原始视频事实源。
- Contains: 形如 `VID{id}.json` 的视频详情原始文件。
- Key files: `_by_id/VID614758e5a871e78d083cfd80.json`

**`_by_tags/`:**
- Purpose: 原始视频的分类索引。
- Contains: 标签目录，每个目录下是该标签对应的 `VID*.json` 软索引式副本。
- Key files: `_by_tags/17岁/VID61c5a6539dc8962429c9058e.json`

**`comments/`:**
- Purpose: 评论抓取结果目录。
- Contains: `comments/_by_id/VID*.json`
- Key files: `comments/_by_id/VID61cd1d909dc8962429c90ea7.json`

**`m3u8/`:**
- Purpose: 本地播放清单与共享 key。
- Contains: `VID*.m3u8` 与 `keys/*.key`
- Key files: `m3u8/VID614758e5a871e78d083cfd80.m3u8`、`m3u8/keys/`

**`r2-data/`:**
- Purpose: 发布到对象存储的静态数据树。
- Contains: `r2-data/data/config.json`、分类/作者/feed/视频详情 JSON、`r2-data/m3u8/`
- Key files: `r2-data/data/config.json`、`r2-data/data/category/17岁/page_1.json`、`r2-data/data/feed/recommend/page_1.json`

**`dist/`:**
- Purpose: 前端静态构建产物。
- Contains: 与 `src/frontend/` 等结构的复制结果。
- Key files: `dist/index.html`、`dist/js/app.js`、`dist/sw.js`

**`site/`:**
- Purpose: 单文件静态原型。
- Contains: 一个内联样式的 `index.html`
- Key files: `site/index.html`

**`html/`:**
- Purpose: 逆向分析时保留下来的页面快照和站点资源。
- Contains: `home.html`、`douyin.html`、`movieDetails.html` 及其 `_files/` 资源目录。
- Key files: `html/home.html`、`html/home_files/main-4bc7edc8.1774377359162.js`

**`tests/`:**
- Purpose: Node 内置测试入口。
- Contains: 构建模块和 store 的回归测试。
- Key files: `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/store.test.js`、`tests/comment_export_core.test.cjs`

**`docs/`:**
- Purpose: 人工维护的知识沉淀与交接文档。
- Contains: 项目背景、抓取知识、handoff、superpowers 规划文档。
- Key files: `docs/2026-03-26-jiuyao-crawl-knowledge.md`、`docs/2026-03-27-rack002-handoff.md`

## Key File Locations

**Entry Points:**
- `package.json`: 定义 `dev`、`build:data`、`build:frontend`、`test`、`upload:r2`
- `scripts/dev-server.js`: 本地开发双端口入口
- `src/build/index.js`: 数据构建总入口
- `scripts/build-frontend.js`: 前端复制构建入口
- `comment_export.cjs`: 根级评论抓取入口
- `scripts/export/video_json_export_full.js`: 全量视频抓取入口
- `src/worker/index.js`: Worker 请求入口

**Configuration:**
- `package.json`: Node 脚本与运行时声明
- `wrangler.toml`: Worker 主入口、R2 bucket、KV 和静态站点目录配置
- `src/frontend/manifest.json`: PWA 清单
- `src/build/config.js`: 运行时 `config.json` 生成逻辑
- `.github/workflows/deploy.yml`: `dist/` 的 Cloudflare Pages 发布流程

**Core Logic:**
- `src/build/categories.js`: 分类分页输出
- `src/build/details.js`: 详情与评论输出
- `src/build/authors.js`: 作者聚合和分页输出
- `src/frontend/js/api.js`: 前端全部静态接口路径定义
- `src/frontend/js/store.js`: localStorage 持久化层
- `src/frontend/js/pages/douyin.js`: 短视频滑动流和交互控制
- `lib/comment_export_core.cjs`: 评论导出的纯逻辑抽象

**Testing:**
- `tests/*.test.js`: 主源码测试入口
- `scripts/comment_export/comment_export_core.test.cjs`: 脚本归档目录内的评论逻辑测试

## Naming Conventions

**Files:**
- 源码文件统一使用小写短横线或语义短语 `.js` / `.cjs`，例如 `src/build/details.js`、`scripts/build-frontend.js`
- 页面模块放在 `src/frontend/js/pages/`，以页面语义命名，例如 `home.js`、`douyin.js`、`detail.js`、`mine.js`
- 原始和评论数据文件统一使用 `VID{id}.json`，例如 `_by_id/VID614758e5a871e78d083cfd80.json`
- 静态分页文件使用 `page_<n>.json`，例如 `r2-data/data/feed/recommend/page_1.json`
- 作者扩展页使用目录 + 分页文件，格式为 `r2-data/data/author/<uid>/page_<n>.json`

**Directories:**
- 运行时代码按职责分区：`src/build/`、`src/frontend/`、`src/worker/`
- 操作脚本按域分区：`scripts/export/`、`scripts/comment_export/`、`scripts/frontend/`
- 数据目录使用输入/输出边界命名：原始输入用 `_by_id/`、`_by_tags/`、`comments/`、`m3u8/`，发布输出用 `r2-data/`
- 页面快照和历史原型单独放在 `html/` 与 `site/`，不要与 `src/frontend/` 混放

## Where to Add New Code

**新前端功能：**
- Primary code: `src/frontend/js/pages/` 放页面级逻辑，`src/frontend/js/` 放跨页面 helper
- Tests: `tests/`；如果是纯函数，可直接新增 `tests/<feature>.test.js`

**新数据构建模块：**
- Primary code: `src/build/`
- Integration point: 在 `src/build/index.js` 接入新模块，并把产物写入 `r2-data/data/` 下一个稳定路径

**新抓取 / 导出脚本：**
- Implementation: `scripts/export/` 或 `scripts/comment_export/`
- Shared helpers: 优先抽到 `lib/` 或对应目录下的 `*_core.cjs`，避免把网络 I/O 和纯逻辑混在一个超长文件里

**新 Worker 接口：**
- Implementation: `src/worker/index.js`
- Related config: 如需新绑定，更新 `wrangler.toml`

**新静态资源或 PWA 配置：**
- Implementation: `src/frontend/`
- Build output: 不要直接修改 `dist/`，由 `scripts/build-frontend.js` 重新复制生成

**新参考材料或逆向快照：**
- Implementation: `docs/`、`html/`、`scripts/frontend/`
- Rule: 不要把这类文件放进 `src/`，避免和运行时代码混淆

## Special Directories

**`dist/`:**
- Purpose: 前端构建产物
- Generated: Yes
- Committed: Yes

**`r2-data/`:**
- Purpose: 面向对象存储的发布数据树
- Generated: Yes
- Committed: Yes

**`_by_id/`:**
- Purpose: 视频原始事实源
- Generated: Yes
- Committed: Yes

**`_by_tags/`:**
- Purpose: 原始分类索引
- Generated: Yes
- Committed: Yes

**`comments/`:**
- Purpose: 评论抓取产物
- Generated: Yes
- Committed: Yes

**`m3u8/`:**
- Purpose: 本地化播放清单与 key 产物
- Generated: Yes
- Committed: Yes

**`site/`:**
- Purpose: 独立原型页
- Generated: No
- Committed: Yes

**`html/`:**
- Purpose: 逆向页面快照与资源样本
- Generated: No（当前构建链不再生成）
- Committed: Yes

**`scripts/frontend/`:**
- Purpose: 原站分包证据与逆向输入
- Generated: No（作为归档资产存在）
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: 给后续 agent 提供代码导航文档
- Generated: Yes
- Committed: Yes

---

*Structure analysis: 2026-03-27*
