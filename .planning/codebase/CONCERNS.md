# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**评论导出链路存在双份源码，且维护面已经分叉：**
- Issue: 根目录的 `comment_export.cjs` 与 `scripts/comment_export/comment_export.cjs` 内容完全相同，`lib/comment_export_core.cjs` 与 `scripts/comment_export/comment_export_core.cjs` 也完全相同；同一逻辑需要在两套路径上同步维护。
- Files: `comment_export.cjs`、`scripts/comment_export/comment_export.cjs`、`lib/comment_export_core.cjs`、`scripts/comment_export/comment_export_core.cjs`
- Impact: 任一修复都需要多点修改，极易出现一套代码修了、另一套未修的回归；当前工作树已经同时出现根目录版和 `scripts/comment_export/` 版并存的状态，后续很难判断哪一套是权威入口。
- Fix approach: 合并为单一源码位置，另一套入口只保留薄包装或直接删除；把共用逻辑继续收敛到一个模块，并让测试只覆盖这一份实现。

**前端源码、构建产物、历史产物同时留在主仓，来源边界不清：**
- Issue: 正式构建脚本只会把 `src/frontend/` 原样复制到 `dist/`，但仓库里还同时存在 `site/index.html` 和 `scripts/frontend/*.js` 这一套独立前端产物。
- Files: `src/frontend/`、`scripts/build-frontend.js`、`dist/`、`site/index.html`、`scripts/frontend/detail-eec62bb6.js`、`scripts/frontend/details-efa47c28.js`
- Impact: 新人很难判断应该修改 `src/frontend/`、`site/` 还是 `scripts/frontend/`；历史产物长期滞留会制造“改了文件但发布没有生效”的假象。
- Fix approach: 明确唯一前端源目录，只保留构建输出所需目录；把 `site/` 和 `scripts/frontend/` 定义为归档或删除对象，避免继续作为活跃代码路径出现。

**导出脚本对认证、加解密和网络调用做了多份复制实现：**
- Issue: 评论导出、视频导出、m3u8 修复和 key 本地化脚本都各自维护 `curl` 调用、登录、token 刷新、参数加密和响应解密逻辑。
- Files: `comment_export.cjs`、`scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/retry_failed_m3u8.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`、`scripts/export/localize_m3u8_keys.js`
- Impact: 任何上游接口改动都会造成多处同时失效；错误处理策略无法统一，导致脚本之间的重试、日志和输出格式持续漂移。
- Fix approach: 提取共享 API 客户端和鉴权模块，统一封装登录、解密、重试和日志协议；脚本只保留各自业务编排。

## Known Bugs

**GitHub Actions 的部署作业在当前仓库状态下无法执行 `npm ci`：**
- Symptoms: `npm ci` 直接报 `EUSAGE`，提示缺少 `package-lock.json` 或 `npm-shrinkwrap.json`；而部署工作流固定使用 `npm ci`。
- Files: `package.json`、`.github/workflows/deploy.yml`
- Trigger: 任何触发 `.github/workflows/deploy.yml` 的 `main` 分支推送。
- Workaround: 补充锁文件并保持提交，或者把 CI 安装步骤改成与仓库现状一致的安装方式。

**`scripts/comment_export/` 下的入口脚本和测试脚本当前不可执行：**
- Symptoms: `scripts/comment_export/comment_export.cjs` 使用 `require('./lib/comment_export_core.cjs')`，但目录内不存在 `lib/`；`scripts/comment_export/comment_export_core.test.cjs` 使用 `require('../lib/comment_export_core.cjs')`，同样无法解析，触发 `MODULE_NOT_FOUND`。
- Files: `scripts/comment_export/comment_export.cjs`、`scripts/comment_export/comment_export_core.test.cjs`、`scripts/comment_export/comment_export_core.cjs`
- Trigger: 直接运行 `node scripts/comment_export/comment_export.cjs` 或执行 `node --test scripts/comment_export/comment_export_core.test.cjs`。
- Workaround: 仅使用根目录入口 `comment_export.cjs` 和 `tests/comment_export_core.test.cjs`，避免调用 `scripts/comment_export/` 这套副本。

## Security Considerations

**会员 Worker 没有任何真实支付校验，且对外完全开放：**
- Risk: 只要能向 `/api/membership` 发起 POST，就可以为任意邮箱写入会员信息；`paymentToken` 被读取但从未校验，`plan` 也没有白名单拒绝逻辑，响应头对所有来源返回 `Access-Control-Allow-Origin: *`。
- Files: `src/worker/index.js`、`wrangler.toml`
- Current mitigation: 仅检查了 `email` 和 `plan` 是否为空，并把数据直接写入 `MEMBERSHIP_KV`。
- Recommendations: 接入真实支付网关验签或服务端订单校验；限制允许的来源域名；不要直接以邮箱明文作为 KV key；对 `plan` 做严格枚举校验并记录审计日志。

**导出脚本把登录 token 拼进 m3u8 查询串，凭证会落入 URL、日志和缓存：**
- Risk: m3u8 URL 形如 `...?token=...&c=...`，一旦写入 JSON、错误文件、代理日志或命令输出，token 会以明文 URL 形式扩散；多份脚本还会解析 token payload 并保留时间戳、uid 等派生信息。
- Files: `scripts/export/video_json_export.js`、`scripts/export/video_json_export_full.js`、`scripts/export/retry_failed_m3u8.js`、`scripts/export/refresh_all_m3u8_with_shared_key.js`
- Current mitigation: 通过重新登录和重试保证抓取成功，但没有做 token 脱敏、轮换隔离或日志裁剪。
- Recommendations: 避免把认证信息放进查询串；统一改为请求头或短期签名；所有日志和落盘 JSON 都应移除 token 与 token payload。

**前端运行时依赖未锁定的第三方 CDN 脚本：**
- Risk: 页面直接加载 `https://cdn.jsdelivr.net/npm/hls.js@latest`，没有版本钉死，也没有 SRI；每次用户访问都可能拿到不同版本代码，且供应链风险完全暴露在运行时。
- Files: `src/frontend/index.html`
- Current mitigation: 未检测到本地镜像、版本锁定或完整性校验。
- Recommendations: 固定具体版本并添加完整性校验，或直接把播放器依赖纳入仓库构建产物，避免运行时依赖 `@latest`。

## Performance Bottlenecks

**数据构建是单进程全量内存加载，数据量上来后会直接撞内存和 I/O 上限：**
- Problem: 构建入口先把 `_by_id` 下全部 JSON 一次性 `JSON.parse` 进 `Map`，再派生 feed、分类、推荐、作者和详情；随后又用 `cpSync` 递归复制整棵 `m3u8/` 目录。
- Files: `src/build/index.js`
- Cause: 采用“一次读全量、一次算全量、一次复制全量”的本地批处理模式，没有流式处理、增量构建或脏数据检测。
- Improvement path: 改成分阶段增量构建；为 `_by_id`、评论和 m3u8 引入变更检测；复制阶段按文件清单增量同步，而不是每次全量 `cpSync`。

**图片解密缓存会持续生成 `blob:` URL，但不会回收：**
- Problem: `decryptImageUrl()` 在缓存命中前会不断创建新的 `blob:` URL；超过 `MAX_IMG_CACHE` 时只删除 `Map` 键，不调用 `URL.revokeObjectURL()`。
- Files: `src/frontend/js/api.js`
- Cause: 当前实现把“页面可能仍在引用”作为理由永久保留对象 URL，但没有任何生命周期管理。
- Improvement path: 为图片元素建立引用计数或卸载回调；缓存淘汰时显式 `revokeObjectURL`；必要时改成基于 `ImageBitmap` 或短生命周期对象池的方案。

## Fragile Areas

**评论构建对坏数据是静默跳过，失败不会显式暴露：**
- Files: `src/build/details.js`
- Why fragile: 读取 `comments/_by_id/VID*.json` 失败后直接进入空 `catch`，不会记录具体视频、错误原因或失败统计；生产数据会“少了评论但构建仍然成功”。
- Safe modification: 先把解析失败写入单独错误清单，再决定是否让构建失败；不要继续扩大这个静默分支。
- Test coverage: 未检测到覆盖 `src/build/details.js` 的测试；现有 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js` 都不触达评论构建逻辑。

**发布链路依赖多个本地脚本和平台配置拼装，没有单一真相：**
- Files: `package.json`、`scripts/upload-r2.sh`、`wrangler.toml`、`.github/workflows/deploy.yml`
- Why fragile: 前端发布靠 GitHub Actions + Pages，数据发布靠手工 `bash scripts/upload-r2.sh`，Worker 配置单独放在 `wrangler.toml`，且 `kv_namespaces.id` 仍是 `placeholder-kv-id`；任一环节忘记执行都会产生“前端版本、R2 数据、Worker 逻辑”三者不同步。
- Safe modification: 把前端、数据、Worker 的发布步骤收敛到同一套流水线和同一份环境校验；修改部署相关逻辑时必须同时验证三条链路。
- Test coverage: 未检测到针对 `scripts/upload-r2.sh`、`wrangler.toml` 或 Pages/Worker 集成的自动化测试。

## Scaling Limits

**仓库根目录直接承载超大数据集，Git 与本地开发都会被数据体积拖垮：**
- Current capacity: 当前工作树中 `r2-data/` 约 5.4G，`m3u8/` 约 4.5G，`_by_id/` 约 302M，`_by_tags/` 约 302M，`comments/` 约 58M。
- Limit: 当视频数继续增长时，`git status`、打包、备份、CI 拉取、文件索引和本地搜索都会持续变慢；`src/build/index.js` 的全量内存模型也会同步放大。
- Scaling path: 把大数据目录迁出应用仓库，转为对象存储或独立数据仓；应用仓只保留 schema、生成器和小型测试样本。

**静态数据接口没有分页缓存治理和失效策略，前端内存占用只会增加：**
- Current capacity: `src/frontend/js/api.js` 的 JSON 缓存 `Map` 没有上限；图片解密缓存虽然有 `MAX_IMG_CACHE=500`，但对象 URL 不回收。
- Limit: 长时间会话、快速刷视频或多分类切换会持续积累内存占用，移动端更容易出现卡顿和回收抖动。
- Scaling path: 给 JSON 缓存增加 TTL / LRU；为图片缓存引入 URL 回收与页面卸载清理。

## Dependencies at Risk

**`curl` 和 `wrangler` 是核心运行依赖，但没有被仓库显式锁定：**
- Risk: 评论导出、视频导出、m3u8 修复都直接通过 `child_process` 调 `curl`；R2 上传通过 `npx wrangler r2 object put` 完成。两者都不在 `package.json` 依赖中，也没有版本锁文件约束。
- Impact: 不同机器上的 `curl` 行为、TLS 兼容性、代理设置和 `wrangler` 版本都会影响结果，排障时很难复现同一问题。
- Migration plan: 把网络访问迁到 Node 原生 HTTP/`fetch`，把 Cloudflare CLI 版本固定进项目依赖或容器环境，并补充机器可读的环境检查。

**运行时播放器依赖 `hls.js@latest`，升级风险不可控：**
- Risk: 版本漂移完全由 CDN 决定，发布过程和回归测试都无法固定同一播放器版本。
- Impact: 某次上游发布就可能让 `src/frontend/js/pages/detail.js` 和 `src/frontend/js/pages/douyin.js` 的播放行为变化，但仓库内没有任何代码变更记录。
- Migration plan: 锁定具体版本并纳入构建，或改用仓库内受控的播放器包。

## Missing Critical Features

**缺少一条可重复执行的端到端发布流水线：**
- Problem: 仓库有 `build:data`、`build:frontend`、`upload:r2` 和 Worker 配置，但自动化部署只覆盖 `build:frontend` + Pages；`build:data`、R2 上传和 Worker 发布都没有进入同一条 CI 流水线。
- Blocks: 不能稳定地产出“前端、数据、Worker 同版本”的发布结果；任何环境切换都需要人工记忆多个脚本与平台步骤。

**缺少部署前环境校验和配置一致性检查：**
- Problem: `wrangler.toml` 中 `MEMBERSHIP_KV` 的命名空间 id 仍是 `placeholder-kv-id`，仓库里也没有检测脚本去阻止错误配置进入部署。
- Blocks: Worker 一旦接入正式发布链路，就有机会在错误命名空间、错误账号或未初始化环境上运行。

## Test Coverage Gaps

**评论导出核心测试存在，但默认测试命令根本不会执行：**
- What's not tested: `tests/comment_export_core.test.cjs` 和 `scripts/comment_export/comment_export_core.test.cjs`
- Files: `package.json`、`tests/comment_export_core.test.cjs`、`scripts/comment_export/comment_export_core.test.cjs`
- Risk: 评论导出最复杂的纯逻辑没有纳入 `npm test` 默认回归；相关重构即使破坏核心逻辑，也不会在常规测试里暴露。
- Priority: High

**`store` 测试没有覆盖真实模块，只覆盖了一份内联复制版：**
- What's not tested: `src/frontend/js/store.js`
- Files: `src/frontend/js/store.js`、`tests/store.test.js`
- Risk: `tests/store.test.js` 在文件内部重新实现了一套 `createStore()`，后续若真实模块与测试副本发生漂移，测试仍然会绿，但线上行为已经变了。
- Priority: High

**Worker、Service Worker、数据构建细节和上传脚本没有自动化回归：**
- What's not tested: `src/worker/index.js`、`src/frontend/sw.js`、`src/build/details.js`、`scripts/upload-r2.sh`、`scripts/export/*.js`、`src/frontend/js/pages/*.js`
- Files: `src/worker/index.js`、`src/frontend/sw.js`、`src/build/details.js`、`scripts/upload-r2.sh`、`scripts/export/video_json_export.js`、`scripts/export/retry_failed_m3u8.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`
- Risk: 支付、缓存、评论构建、上传和播放链路的回归只能靠手工验证；一旦出现平台差异或接口变更，问题会在部署后才暴露。
- Priority: High

---

*Concerns audit: 2026-03-27*
