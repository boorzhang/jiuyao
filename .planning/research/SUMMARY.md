# Project Research Summary

**Project:** 九妖零服务器成本 PWA 视频站
**Domain:** 面向公开访客、强静态分发、低成本运行的视频内容站
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

这类项目最稳妥的路线不是把站点做成“轻量版视频网站后端”，而是坚持“离线预计算 + 静态分发 + 极薄动态边界”的结构。Cloudflare 官方计费和平台限制非常明确：静态资源路径几乎不消耗 Worker 成本，但一旦让公开页广泛命中 Worker / Pages Functions，请求和 CPU 都会开始计费；同时 Pages Free 站点还有 20,000 文件上限，这意味着不能天真地为 70k+ 视频都生成独立静态 HTML。

对这个项目最有价值的做法，是把首页、分类、标签、作者页、少量高价值详情页和整个 PWA 壳做成强缓存静态资源；把列表 JSON、详情 JSON、静态评论、m3u8 等全部通过 R2 自定义域名分发；把任何真正需要写入或鉴权的逻辑严格收口到极薄的 `/api/*` Worker。这样能把绝大多数公开访问成本锁定在 Pages + R2 + CDN cache 层，而不是计算层。

最大的风险不是“技术做不到”，而是边界失守：为了方便 SEO 把所有详情页改成 Functions、为了省事给整个域名上 Cache Everything、为了做 PWA 把大资源无界缓存、为了追求完整 SEO 一次性生成超出 Pages 限制的长尾静态页。路线图必须优先处理这些边界问题，再去补播放体验、SEO 资产和后续商业化能力。

## Key Findings

### Recommended Stack

当前最匹配目标的方案仍然是 `Cloudflare Pages + R2 custom domain + 极薄 Worker + Node 构建链 + 原生 PWA`。不建议在这个阶段引入重 SSR 框架、数据库或服务端用户系统。播放器层必须把 `hls.js` 固定到明确版本；Service Worker 如果继续变复杂，可以引入 Workbox 7.x，但不是首要前提。

**Core technologies:**
- Cloudflare Pages: 托管公开静态壳与 SEO 页 — 让公开流量尽量不进入 Worker
- Cloudflare R2: 托管 JSON / m3u8 / 封面等大对象 — 通过自定义域名接入 Cloudflare Cache
- Thin Worker: 只保留后续会员 / 支付 / 少量边缘逻辑 — 避免高流量路径计费
- Node 20 LTS: 继续承担数据构建、发布和 CI — 与现有仓库兼容

### Expected Features

这个站点的 table stakes 并不是“账号体系 + 搜索 + 社区”，而是“公开可访问的浏览路径 + 稳定播放 + 低成本持续浏览”。用户首先需要能进入首页 / 分类页，继续翻页，点开详情页播放，查看相关推荐和静态评论，并且能把站点装成 PWA。

**Must have (table stakes):**
- 公开可访问的首页 / 分类 / 详情 / 播放路径 — 用户的主流程
- 基础 SEO 资产：真实 URL、title、description、canonical、sitemap / video sitemap — 公开站的流量入口
- 静态评论、相关推荐和本地历史 / 收藏 — 保障持续浏览体验

**Should have (competitive):**
- 极低成本缓存命中模型 — 项目真正的竞争力
- 长尾相关推荐尽量全覆盖 — 比单纯热门推荐更适合当前目标

**Defer (v2+):**
- 会员支付 / 邮箱采集
- 服务端账号体系
- 全站搜索
- 个性化推荐

### Architecture Approach

推荐的系统边界是：Pages 负责公开壳和少量 SEO 页，R2 负责所有列表 / 详情 / 评论 / m3u8 静态对象，Worker 只保留在 `/api/*`，而构建链负责生成分页、推荐、SEO 资产和发布清单。

**Major components:**
1. Pages 静态站壳 — 公开入口、PWA 壳、部分 SEO 着陆页
2. R2 数据域名 — JSON、封面、m3u8、评论等静态对象
3. Thin Worker API — 后续会员和少量写路径
4. 离线构建与发布链 — 统一产出 `dist/`、`r2-data/`、sitemap 和版本校验

### Critical Pitfalls

1. **把公开页全送进 Worker / Functions** — 会直接破坏低成本模型
2. **为 70k+ 视频生成海量 Pages 静态页** — 会撞上 20,000 文件上限
3. **错误使用 Cache Everything** — 会造成动态误缓存和 stale 内容
4. **只有 SPA 壳，没有真实可抓取 URL** — SEO 会长期失效
5. **Service Worker 缓存无边界膨胀** — 长会话播放和移动端体验会先出问题

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: 部署边界与静态分发基础
**Rationale:** 所有后续工作都依赖稳定的 Pages / R2 / Worker 边界，否则成本与发布一致性先失控。  
**Delivers:** 统一发布链、域名与缓存策略、公开静态路由边界、版本校验。  
**Addresses:** 公开浏览、低成本运行、可持续部署。  
**Avoids:** 公开页全进 Worker、发布链版本漂移、错误缓存规则。

### Phase 2: SEO 友好的公开浏览面
**Rationale:** 公开访问站点若没有可抓取 URL、metadata 和 sitemap，SEO 目标无法成立。  
**Delivers:** 可抓取路由、标题 / 描述 / canonical、sitemap / video sitemap、重点页面 SEO 策略。  
**Uses:** 静态构建与 Pages 头部规则。  
**Implements:** 首页 / 分类 / 标签 / 作者 / 重点详情页的信息架构。

### Phase 3: 详情页播放与持续浏览体验
**Rationale:** 用户真正感知价值的核心是“点进去能播，并且能继续刷下去”。  
**Delivers:** 稳定播放器链路、相关推荐、静态评论、内存受控的 PWA 缓存策略。  
**Uses:** R2 数据域名、固定版本播放器、受控 SW 缓存。  
**Implements:** 详情页主流程。

### Phase 4: 成本治理与质量硬化
**Rationale:** 70k+ 视频与 10k+ DAU 目标下，缓存命中、测试覆盖和回归验证要系统化。  
**Delivers:** 部署回归、缓存 purge 策略、播放 / JSON / SEO 验收、关键测试补齐。  
**Uses:** 当前测试基础与发布流水线。  
**Implements:** 可持续运维和低成本保障。

### Phase 5: 验证后商业化能力
**Rationale:** 支付和会员只有在前四阶段证明流量与成本模型成立后才值得接入。  
**Delivers:** 会员支付、邮箱采集、订单与会员状态校验。  
**Implements:** 少量动态写路径，而不是重构整站。

### Phase Ordering Rationale

- 先处理静态 / 动态边界和发布链，因为这是成本模型的地基。
- 再做 SEO 和公开浏览面，因为没有可抓取入口，公开站目标不成立。
- 播放与持续浏览体验放在其后，因为它依赖前两阶段的静态与数据边界。
- 质量硬化在主流程跑通后补齐，避免一开始就掉进局部优化。
- 商业化最后做，符合用户已明确的范围边界。

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** SEO 覆盖策略需要权衡“静态页数量限制”和“长尾索引价值”
- **Phase 3:** 播放器与 Service Worker 的缓存边界需要更细化验证
- **Phase 5:** 支付 / 会员 / 邮箱采集涉及新的外部集成与合规边界

Phases with standard patterns (skip research-phase):
- **Phase 1:** Pages / R2 / Worker 边界与发布链属于标准 Cloudflare 实践
- **Phase 4:** 测试补齐、发布校验和 purge 流程属于常规工程化工作

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 关键结论直接来自 Cloudflare / Google 官方文档 |
| Features | HIGH | 主要由用户目标、现有代码与官方 SEO / PWA约束共同决定 |
| Architecture | HIGH | 静态优先 + 薄动态边界与当前代码和官方计费模型高度一致 |
| Pitfalls | HIGH | 平台限制、计费边界和当前仓库问题都很明确 |

**Overall confidence:** HIGH

### Gaps to Address

- **长尾 SEO 覆盖范围：** 规划阶段要决定“哪些详情页值得静态化或索引”，而不是默认全部覆盖
- **R2 对象大小与 JSON 粒度：** 规划阶段要明确列表 / 详情 / 评论文件拆分策略
- **播放器与缓存细节：** 执行阶段要做真实设备与弱网验证

## Sources

### Primary (HIGH confidence)
- https://developers.cloudflare.com/pages/platform/limits/ — Pages 文件限制、Functions 计费边界
- https://developers.cloudflare.com/pages/configuration/headers/ — `_headers` 行为边界
- https://developers.cloudflare.com/r2/data-access/public-buckets/ — R2 自定义域名与缓存使用方式
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ — R2 与 Cloudflare 缓存集成
- https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/ — 强缓存规则与风险
- https://developers.cloudflare.com/workers/platform/pricing/ — Worker / 静态资源计费差异
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — JS SEO 基线
- https://developers.google.com/search/docs/appearance/structured-data/video — 视频结构化数据基线
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps — video sitemap 基线

### Secondary (MEDIUM confidence)
- https://web.dev/articles/service-worker-caching-and-http-caching — SW cache 与 HTTP cache 分层策略
- https://github.com/video-dev/hls.js/releases — 播放器稳定版本线
- https://github.com/GoogleChrome/workbox/releases — Workbox 版本线

### Tertiary (LOW confidence)
- 无。当前关键结论没有依赖单一社区帖子或未验证说法。

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
