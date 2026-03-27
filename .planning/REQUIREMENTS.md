# Requirements: 九妖零服务器成本 PWA 视频站

**Defined:** 2026-03-27
**Core Value:** 在几乎不依赖传统服务器的前提下，让公开访客可以低成本、稳定、持续地发现并播放大量视频内容

## v1 Requirements

### Discovery

- [ ] **DISC-01**: 公开访客可以访问首页并看到可继续浏览的内容入口（如最新、热门、分类或标签入口）
- [ ] **DISC-02**: 公开访客可以在分类 / 标签列表中按稳定顺序分页浏览视频，不因刷新或翻页出现明显乱序
- [ ] **DISC-03**: 公开访客可以持续加载更多内容并继续浏览，不需要登录或服务端会话
- [ ] **DISC-04**: 公开访客可以通过稳定 URL 打开单个视频详情页，而不是依赖不可分享的临时状态

### Playback

- [ ] **PLAY-01**: 公开访客可以在现代移动端和桌面浏览器中播放视频详情页的 HLS 流
- [ ] **PLAY-02**: 公开访客在视频详情页可以看到固定数量的相关推荐，并能继续跳转浏览
- [ ] **PLAY-03**: 公开访客可以在详情页查看静态评论内容；若该视频没有评论，也能得到明确的空状态

### SEO

- [ ] **SEO-01**: 首页、分类页、标签页、作者页和允许公开索引的详情页具备可抓取的真实 URL，不使用 `#/` 片段路由作为 canonical
- [ ] **SEO-02**: 每类公开索引页输出唯一且与内容匹配的 `title`、`description` 和 `canonical`
- [ ] **SEO-03**: 站点生成并发布可提交到搜索引擎的 sitemap / sitemap index；被允许索引的视频页生成 video sitemap
- [ ] **SEO-04**: 被允许索引的视频详情页输出与页面内容一致的结构化视频元数据

### PWA

- [ ] **PWA-01**: 支持设备上的公开访客可以将站点安装为 PWA，并在再次打开时直接进入站点壳
- [ ] **PWA-02**: PWA 只缓存站点壳和高复用小资源，不因离线缓存策略导致视频播放或数据更新异常

### Local State

- [ ] **STATE-01**: 首次访问的游客会在本地获得默认 UID、用户名和头像，不需要服务端注册
- [ ] **STATE-02**: 同一设备上的游客可以在刷新后保留本地历史、收藏、点赞和其他轻量状态

### Platform

- [ ] **PLAT-01**: 公开浏览路径在正常访问时不依赖 Worker / Pages Functions 计算，主要由 Pages 静态资源和 R2 数据响应支撑
- [ ] **PLAT-02**: 前端发布、R2 数据发布和少量 API 发布具备可重复的版本化流程，避免页面与数据不一致
- [ ] **PLAT-03**: 公开静态资源、JSON 和 m3u8 具备明确的缓存策略与失效策略，以支持低成本运行目标
- [ ] **PLAT-04**: 发布后存在基础校验，能够发现关键页面、关键 JSON 与播放链路的明显错误

## v2 Requirements

### Membership

- **MEMB-01**: 用户可以开通会员并完成支付
- **MEMB-02**: 系统仅在会员开通时采集 email、开通时间、时长与付费金额
- **MEMB-03**: 会员状态有服务端校验，不能被客户端伪造

### Search

- **SRCH-01**: 用户可以按关键词搜索视频
- **SRCH-02**: 搜索结果支持基本排序和分页

### Sync

- **SYNC-01**: 用户可以跨设备同步历史、收藏和个人状态
- **SYNC-02**: 用户可以显式登录并恢复自己的数据

### Personalization

- **PERS-01**: 系统可以根据用户行为提供个性化推荐
- **PERS-02**: 系统可以基于用户状态调整首页或详情页推荐内容

## Out of Scope

| Feature | Reason |
|---------|--------|
| 用户发评论 / UGC 写入 | 会引入审核、风控、写路径和长期维护成本，不符合当前低成本目标 |
| 服务端游客状态同步 | 当前阶段优先本地状态，不引入数据库和账号体系 |
| 首发即上线支付 / 会员闭环 | 需要先验证公开访问、流量与成本模型 |
| 首发即做在线搜索基础设施 | 与固定分类 / 分页 / 推荐主路径相比，优先级更低且成本更高 |
| 首发即做个性化推荐 | 需要行为采集与服务端计算，不符合当前静态化优先目标 |
| 直播、弹幕、实时互动 | 会显著扩大系统复杂度和运行成本 |
| 把全部 70k+ 详情页都做成独立静态 HTML | 受 Pages Free 文件数限制约束，不能作为默认首发方案 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 2 | Pending |
| DISC-02 | Phase 2 | Pending |
| DISC-03 | Phase 2 | Pending |
| DISC-04 | Phase 2 | Pending |
| PLAY-01 | Phase 3 | Pending |
| PLAY-02 | Phase 3 | Pending |
| PLAY-03 | Phase 3 | Pending |
| SEO-01 | Phase 4 | Pending |
| SEO-02 | Phase 4 | Pending |
| SEO-03 | Phase 4 | Pending |
| SEO-04 | Phase 4 | Pending |
| PWA-01 | Phase 5 | Pending |
| PWA-02 | Phase 5 | Pending |
| STATE-01 | Phase 2 | Pending |
| STATE-02 | Phase 2 | Pending |
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 1 | Pending |
| PLAT-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
