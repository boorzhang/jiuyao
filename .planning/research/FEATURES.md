# Feature Research

**Domain:** 低服务器成本的公开 PWA 视频站
**Researched:** 2026-03-27
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 首页 / 分类页 / 标签页可稳定浏览 | 公开视频站最基本的入口能力 | LOW | 必须有固定分页、可继续加载、URL 可分享 |
| 详情页可直接播放 HLS 视频 | 用户进入视频站后默认预期就是能播放 | MEDIUM | 重点在播放器稳定性、首屏速度、m3u8 可达性 |
| 详情页有相关推荐 | 用户看完要能继续消费内容 | LOW | 当前“固定 4 条 + 尽量全覆盖 ID”足够支撑 v1 |
| 静态评论可查看 | 能增强内容可信度和停留时间 | LOW | 前期只读即可，不要开放写入 |
| PWA 安装与基础离线壳 | 既能提升回访体验，也有“像 App” 的基本预期 | MEDIUM | 只缓存壳和小型静态资源，不缓存大量视频资源 |
| SEO 友好的公开链接 | 公开站如果不可抓取，流量和分发会受限 | MEDIUM | 至少保证可爬取 URL、title、description、canonical、sitemap |
| 本地历史 / 收藏 / 游客身份 | 用户继续刷内容时需要基本连续性 | LOW | 保留本地即可，不需要服务端同步 |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 极低成本运行模型 | 同等内容规模下，长期成本更可控 | MEDIUM | 这是项目最核心的差异化，不是普通功能点 |
| 强缓存 + 静态预计算 | 高命中率、低延迟、低 Worker 压力 | MEDIUM | 会直接影响可持续运营成本 |
| 长尾相关推荐尽量覆盖所有 ID | 比纯热门推荐更能让长尾内容获得曝光 | LOW | 适合当前“简单算法、低计算”目标 |
| 公开页 SEO 资产化 | 让首页、分类页、少量重点详情页可持续带自然流量 | MEDIUM | 不要求一开始覆盖全部 70k 长尾 |
| 无服务端用户数据路径 | 降低合规、隐私与维护负担 | LOW | 和当前用户目标高度一致 |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 全站搜索 | 用户直觉上会想要搜内容 | 需要索引、召回、排序和更新链路，和“极低成本、固定数据”目标冲突 | 先把分类、标签、作者页、相关推荐做强 |
| 用户评论 / UGC | 能提升互动 | 会引入审核、风控、写路径、存储与滥用问题 | 先保留静态评论展示 |
| 个性化推荐 | 看起来更“聪明” | 需要服务端行为采集与实时计算，直接扩大成本面 | 保持热门 / 最新 / 固定覆盖推荐 |
| 服务端账号体系 | 便于同步收藏与历史 | 会引入认证、密码找回、隐私和数据库成本 | 继续使用本地游客身份 |
| 为所有详情页做 SSR 或函数渲染 | 看起来有利于 SEO | 会把公开流量变成 Worker 计费流量，还会抬高部署复杂度 | 只对关键 SEO 页面做静态化，长尾保持模板化 |
| 离线缓存大量 JSON / m3u8 / 视频资源 | 乍看可以增强“App 感” | 会迅速占用浏览器存储并造成缓存污染、播放问题 | 只缓存壳和高复用小资源 |

## Feature Dependencies

```text
公开可访问路由
    └──requires──> 稳定静态部署
                       └──requires──> Pages / R2 / 域名 / 头部规则

详情页播放
    └──requires──> m3u8 可达 + JSON 详情数据
                       └──requires──> 数据构建链稳定

SEO 可抓取页
    └──requires──> 可发现 URL + 标题/描述/canonical + sitemap
                       └──enhances──> 首页/分类/详情流量获取

本地历史/收藏
    └──enhances──> 连续浏览体验

用户评论 / 个性化推荐 / 服务端账号
    └──conflicts──> 低成本、无状态、纯静态优先目标
```

### Dependency Notes

- **公开可访问路由 requires 稳定静态部署：** 只有把 Pages、R2、域名、缓存头和发布链跑通，公开流量路径才可靠。
- **详情页播放 requires m3u8 可达 + JSON 详情数据：** 详情播放不是纯前端问题，依赖数据构建和对象存储一致性。
- **SEO 可抓取页 enhances 首页/分类/详情流量：** 需要显式 URL、title、meta、canonical、内部链接和 sitemap，不是单靠客户端渲染。
- **UGC / 个性化 / 服务端账号 conflicts 低成本目标：** 它们会把项目从“静态内容站”拉向“状态型应用”。

## MVP Definition

### Launch With (v1)

- [ ] 公开首页、分类页、标签页、作者页与详情页可访问 — 基本浏览路径必须成立
- [ ] 详情页稳定播放 HLS 视频 — 这是核心用户价值
- [ ] 静态评论与相关推荐可展示 — 让用户可以继续刷下去
- [ ] 本地历史、收藏、游客身份可用 — 保持轻量连续体验
- [ ] PWA 安装、基础离线壳与缓存策略可用 — 强化回访体验
- [ ] 基础 SEO 资产就位：可发现 URL、`title`、`description`、`canonical`、sitemap / video sitemap、结构化数据策略 — 保障公开站基本可索引
- [ ] Pages + R2 + Worker 的低成本部署链闭环 — 先证明能稳、能省钱、能持续发布

### Add After Validation (v1.x)

- [ ] 为高价值页面集生成静态 SEO 着陆页 — 当自然流量值得继续投入时再扩大
- [ ] 更细的缓存治理与 purge 策略 — 当部署频率和数据修复次数变多时补齐
- [ ] 轻量观测与成本看板 — 当 DAU 上来后再做精确优化

### Future Consideration (v2+)

- [ ] 会员支付 / 邮箱采集 / 开通时长与金额记录 — 只有当访问量证明值得商业化时才做
- [ ] 服务端账号与跨设备同步 — 只有当本地状态已经不足以满足核心用户体验时再做
- [ ] 全站搜索 — 需要单独评估索引成本与内容质量
- [ ] 个性化推荐 — 需要单独评估行为采集、隐私和成本模型

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 公开浏览路径（首页/分类/详情） | HIGH | MEDIUM | P1 |
| HLS 播放链路 | HIGH | MEDIUM | P1 |
| 静态评论 + 相关推荐 | HIGH | LOW | P1 |
| PWA 壳与安装 | MEDIUM | MEDIUM | P1 |
| SEO 基础资产 | HIGH | MEDIUM | P1 |
| 低成本部署闭环 | HIGH | MEDIUM | P1 |
| 本地历史 / 收藏 / 游客身份 | MEDIUM | LOW | P2 |
| 高价值页面静态 SEO 扩展 | MEDIUM | MEDIUM | P2 |
| 会员支付 | LOW（当前阶段） | HIGH | P3 |
| 全站搜索 | MEDIUM | HIGH | P3 |
| 个性化推荐 | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: 必须先做，否则项目核心价值不成立
- P2: 上线后增强
- P3: 明确后置

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| 内容浏览 | 常见采集站会给很多分页入口 | 短视频站会强调持续下滑消费 | 保留分类分页 + 详情相关推荐 + 可持续加载 |
| SEO | 传统内容站依赖静态 HTML | 纯 SPA 往往索引弱 | 先做可抓取入口页和有限静态化，不追求一步到位覆盖全部长尾 |
| 用户系统 | 很多站要求账号或会话 | 一些站无状态匿名访问 | 当前坚持匿名公开访问 + 本地状态 |
| 互动 | 评论、点赞、弹幕常见 | 互动成本高 | 当前仅保留静态评论和本地状态 |

## Sources

- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — SPA、History API、canonical、title、prerender 基线
- https://developers.google.com/search/docs/appearance/structured-data/video — 视频页结构化数据基线
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps — 视频 sitemap 的关键字段与抓取前提
- `.planning/PROJECT.md` — 当前项目目标与边界
- `.planning/codebase/ARCHITECTURE.md` — 当前已有功能与数据流
- `.planning/codebase/CONCERNS.md` — 当前项目已知结构风险

---
*Feature research for: 低服务器成本的公开 PWA 视频站*
*Researched: 2026-03-27*
