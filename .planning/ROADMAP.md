# Roadmap: 九妖零服务器成本 PWA 视频站

## Overview

这条路线图围绕项目的核心价值展开：先把公开流量牢牢收敛在 Cloudflare Pages + R2 的静态分发边界内，再完成无需登录的浏览与播放主路径，随后补齐 SEO 索引资产，最后用轻量 PWA 缓存和发布校验把体验与成本模型一起稳住。每个 v1 需求都只归属一个阶段，避免重复建设或把问题推到“后面再说”。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: 静态分发底座** - 固化 Pages / R2 / Worker 边界、版本化发布和缓存策略
- [ ] **Phase 2: 公开浏览入口** - 让游客无需登录即可稳定浏览首页、分类、分页和详情入口
- [ ] **Phase 3: 播放与连续消费** - 打通详情页播放、相关推荐和静态评论闭环
- [ ] **Phase 4: SEO 索引资产** - 为公开页与允许索引的详情页建立可抓取、可理解、可提交的 SEO 资产
- [ ] **Phase 5: PWA 与发布护栏** - 提供可安装 PWA，并用轻缓存与发布校验守住体验和成本

## Phase Details

### Phase 1: 静态分发底座
**Goal**: 公开浏览主路径以 Pages 静态壳与 R2 数据为主分发，并拥有可重复、低成本的版本化发布与缓存边界
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. 维护者发布新版本时，前端静态资源、R2 数据和少量 API 可以按同一版本或发布清单一起上线，不会出现页面与数据明显错位。
  2. 公开访客访问首页、分类、详情和播放相关静态资源时，主路径默认由 Pages 静态资源和 R2 对象响应，而不是依赖 Worker / Pages Functions 计算。
  3. HTML、JS、CSS、JSON、封面和 m3u8 都具备清晰且可验证的缓存与失效策略，既能复用缓存，又能在更新后按预期刷新。
**Plans**:
- [x] `01-01` 发布版本基线 - 统一 `RELEASE_ID`、补齐锁文件与共享构建入口
- [x] `01-02` Cloudflare 发布边界 - 去除 Worker 站点托管、用同版 CI 发布 Pages 与 R2
- [x] `01-03` 缓存与运行时一致性 - 固定播放器版本、引入 release-aware 前端与缓存合同

### Phase 2: 公开浏览入口
**Goal**: 公开访客无需账号即可从首页进入分类与详情，并在刷新后继续保持本地浏览连续性
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, STATE-01, STATE-02
**Success Criteria** (what must be TRUE):
  1. 首次访问时，游客会自动获得本地 UID、用户名和头像，整个浏览流程无需注册或服务端会话。
  2. 公开访客可以从首页看到可继续浏览的入口，并在分类 / 标签列表中按稳定顺序分页浏览内容，刷新或翻页后不会明显乱序。
  3. 公开访客可以持续加载更多内容并继续浏览，不会因为缺少登录态或服务端会话而中断。
  4. 公开访客可以通过稳定 URL 直接打开或分享视频详情页，且同一设备刷新后仍保留本地历史、收藏、点赞等轻量状态。
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD: 待 `/gsd:plan-phase 2` 拆解

### Phase 3: 播放与连续消费
**Goal**: 视频详情页完成播放、评论与相关推荐闭环，让访客从一个视频自然继续刷到更多视频
**Depends on**: Phase 1, Phase 2
**Requirements**: PLAY-01, PLAY-02, PLAY-03
**Success Criteria** (what must be TRUE):
  1. 公开访客可以在现代移动端和桌面浏览器中稳定播放视频详情页的 HLS 流。
  2. 视频详情页展示固定数量的相关推荐，访客可以继续跳转浏览并形成连续消费链路。
  3. 视频详情页能够展示静态评论内容；若该视频没有评论，也会显示明确空状态而不是空白或报错。
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD: 待 `/gsd:plan-phase 3` 拆解

### Phase 4: SEO 索引资产
**Goal**: 公开索引页和被允许索引的详情页对搜索引擎可访问、可理解、可提交，同时不破坏静态化成本模型
**Depends on**: Phase 2, Phase 3
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04
**Success Criteria** (what must be TRUE):
  1. 首页、分类页、标签页、作者页和允许公开索引的详情页都使用可抓取的真实 URL，并以非 `#/` 片段路由作为 canonical。
  2. 每类公开索引页输出唯一且与内容匹配的 `title`、`description` 和 `canonical`，不会复用同一套 SEO 文案。
  3. 站点发布后会生成并发布可提交到搜索引擎的 `sitemap` / `sitemap index`，允许索引的视频页同时进入 `video sitemap`。
  4. 被允许索引的视频详情页输出与页面内容一致的结构化视频元数据，便于搜索引擎理解播放信息。
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD: 待 `/gsd:plan-phase 4` 拆解

### Phase 5: PWA 与发布护栏
**Goal**: 站点以轻量缓存策略提供可安装 PWA，并在每次发布后用基础回归护栏及时发现明显故障
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4
**Requirements**: PWA-01, PWA-02, PLAT-04
**Success Criteria** (what must be TRUE):
  1. 支持设备上的公开访客可以将站点安装为 PWA，并在再次打开时直接进入可用的站点壳。
  2. Service Worker 只缓存站点壳和高复用小资源，不会把视频流或大 JSON 错误缓存到导致播放异常或数据长期不更新。
  3. 每次发布后都能执行基础校验，及时发现关键页面、关键 JSON 与播放链路的明显错误，避免坏版本长时间暴露给公开访客。
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] TBD: 待 `/gsd:plan-phase 5` 拆解

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 静态分发底座 | 3/3 | Complete | 2026-03-27 |
| 2. 公开浏览入口 | 0/TBD | Not started | - |
| 3. 播放与连续消费 | 0/TBD | Not started | - |
| 4. SEO 索引资产 | 0/TBD | Not started | - |
| 5. PWA 与发布护栏 | 0/TBD | Not started | - |
