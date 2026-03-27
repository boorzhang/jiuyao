# Pitfalls Research

**Domain:** 低服务器成本的公开 PWA 视频站
**Researched:** 2026-03-27
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: 把公开流量错误地导入 Worker / Functions

**What goes wrong:**  
首页、分类页、详情页如果都经过 Worker 或 Pages Functions，每次访问都会计入计算请求，热门公开流量会直接把成本模型打穿。

**Why it happens:**  
开发者为了方便做 SEO、模板注入或统一路由，倾向于把所有页面放进动态层。

**How to avoid:**  
把公开内容页尽量静态化，只保留 `/api/*` 或单独 `api.` 子域进 Worker；优先在构建期生成 SEO 资产。

**Warning signs:**  
- Worker 请求量和公开 PV 近似 1:1
- 为加一个 meta 标签就需要改 Worker
- Pages 静态命中率很低

**Phase to address:**  
Phase 1 或最早的架构基础 phase

---

### Pitfall 2: 为 70k+ 详情页生成海量静态 HTML 文件

**What goes wrong:**  
Pages Free 官方只有 20,000 文件限制，若为每个视频生成独立 HTML，很快无法部署。

**Why it happens:**  
团队常把“SEO 友好”直接等同于“所有页面都生成静态 HTML”。

**How to avoid:**  
静态化首页、分类、标签、作者页和高价值详情页；长尾页采用更克制的 SEO 策略，不强求一步到位。

**Warning signs:**  
- `dist/` 文件数快速逼近 20k
- 构建时间和部署体积暴涨
- 路线图里出现“全部长尾详情页静态化”目标

**Phase to address:**  
SEO / 信息架构 phase

---

### Pitfall 3: Cache Everything 用在错误的路径上

**What goes wrong:**  
Cloudflare 官方明确警告 `Cache Everything` 会缓存所有 HTML；若规则命中过于宽泛，用户可能拿到不该缓存的动态内容，或者上线后修复无法及时生效。

**Why it happens:**  
为了追求高缓存命中率，容易“一把梭”给整个域名上强缓存。

**How to avoid:**  
把缓存按资源类型分层：HTML、版本化 JS/CSS、列表 JSON、详情 JSON、m3u8、API 各自独立策略；对对象更新和删除引入 purge 流程。

**Warning signs:**  
- 修复上线后用户仍看到旧内容
- 新上传对象仍返回旧 404
- API 或个性化页面意外被缓存

**Phase to address:**  
部署 / 缓存治理 phase

---

### Pitfall 4: 只有 SPA 壳，没有真实可抓取 URL

**What goes wrong:**  
如果站点只靠 JS 在客户端拼页面、用 fragment 路由、缺少 canonical / title / sitemap / 结构化数据，Google 能抓到的有效内容会很弱。

**Why it happens:**  
前端常把“URL 能变”误认为“搜索引擎就能理解”。

**How to avoid:**  
使用真实 `<a href>` 和 History API 路由；为可索引页面生成稳定 URL、title、description、canonical 和 `VideoObject`；提交 sitemap / video sitemap。

**Warning signs:**  
- 详情页只能通过 `#/` 访问
- 页面只有统一标题
- Search Console 中有效索引页很少

**Phase to address:**  
SEO foundation phase

---

### Pitfall 5: Service Worker 缓存无边界膨胀

**What goes wrong:**  
如果把大量图片、JSON、m3u8 甚至视频资源长期塞进 Service Worker cache，浏览器存储会膨胀，移动端更容易卡顿、清缓存或播放异常。

**Why it happens:**  
开发者容易把“PWA”理解成“尽可能多缓存”。

**How to avoid:**  
只预缓存壳和高复用静态资源；运行时缓存加 TTL / LRU；不要离线缓存大体积视频资源；及时回收 `blob:` URL。

**Warning signs:**  
- 长时间刷视频后页面占用持续上升
- 用户反馈“越来越卡”
- Service Worker cache 列表越来越大

**Phase to address:**  
播放体验 / PWA hardening phase

---

### Pitfall 6: 发布链不是单一真相

**What goes wrong:**  
前端、R2 数据、Worker 如果各自独立发布，没有版本一致性校验，很容易出现“页面版本 A + 数据版本 B + API 版本 C”的混合状态。

**Why it happens:**  
项目早期往往先把能跑通的脚本凑起来，后面没有把它们统一成一条可重复流水线。

**How to avoid:**  
明确发布顺序、版本戳、校验步骤和 cache purge；把 Pages 部署、R2 上传与发布后验证整合进同一个流程。

**Warning signs:**  
- 某次发布后详情页字段不匹配
- 本地好用，线上 404
- 需要靠人工记忆多个命令顺序

**Phase to address:**  
Phase 1 基础设施 phase

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 继续保留重复脚本副本 | 短期不必整理目录 | 后续修复要改多处，容易漂移 | 只接受极短期过渡 |
| 直接使用 `@latest` CDN 依赖 | 省去打包和版本管理 | 线上行为不可重复，回归难定位 | 不建议 |
| 手工上传 R2 数据 | 立刻能发布 | 版本不一致、忘传、难回滚 | 只有在非常短期调试阶段可接受 |
| SEO 元信息全靠运行时 JS 注入 | 短期改动少 | 长尾抓取弱、调试复杂 | 仅可作为过渡，不应是最终方案 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Pages `_headers` | 误以为对 Functions 也生效 | 只对静态响应生效；Functions 里的头要在代码中设置 |
| R2 custom domain | 用 `r2.dev` 直接跑生产流量 | 生产必须接自定义域名，才能用缓存、WAF、访问控制 |
| R2 + Cache | 更新对象后不 purge | 对覆盖写和删除都要设计 purge 或版本化策略 |
| Search Console / sitemap | 只提交首页，不提交内容页 sitemap | 生成 sitemap index，并为内容页补齐 video sitemap |
| HLS 播放 | 把播放器脚本和 m3u8 全部交给 SW 长缓存 | 播放器版本锁定，m3u8 缓存策略单独治理 |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 全量加载大 JSON 列表 | 首页或分类页首屏慢、内存涨 | 按分类分页拆文件，避免单对象过大 | 视频数继续增长后很快明显 |
| 详情页同时拉太多附属资源 | 播放前等待长、网络 waterfall 深 | 先拉主详情和播放器必需数据，其余延迟加载 | 移动端和弱网最先暴露 |
| 无界图片 / blob 缓存 | 内存和存储持续上涨 | 限定缓存大小并回收对象 URL | 长会话、连续刷视频时暴露 |
| 所有公开页都进动态层 | 计算成本上升、TTFB 变差 | 公共路径静态化，API 路径单独隔离 | 流量上来后立即体现 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| 会员 API 提前暴露但无真实支付校验 | 任意伪造会员记录 | 商业 phase 前不要开放；上线时接真实验签 |
| 把 token 放进 URL / 日志 / 产物 | 凭证泄露、缓存污染 | 统一脱敏，避免查询串令牌 |
| 对 R2 公开域无缓存和访问策略设计 | 数据可达但行为不可控 | 自定义域名 + WAF / Cache Rules + CORS 策略 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 分类页顺序频繁变化 | 用户找不到上次看到的位置 | 保持稳定分页与顺序 |
| 点进详情页后播放慢且无反馈 | 用户以为站坏了 | 先渲染基础信息，再异步初始化播放器 |
| PWA 安装后离线行为不明确 | 用户误以为视频也能完全离线 | 明确只保证壳和部分小资源离线可用 |

## "Looks Done But Isn't" Checklist

- [ ] **公开详情页:** 有可访问 URL，但还缺 `title` / `description` / `canonical` / JSON-LD
- [ ] **R2 发布:** 对象已上传，但没有 cache purge 或版本化策略
- [ ] **PWA:** 能安装，但缓存没有边界、更新策略不明确
- [ ] **播放链路:** 本地可播，但线上跨域、缓存或播放器版本未锁定
- [ ] **部署闭环:** Pages 能发，R2 能传，但前后版本没有一致性校验

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 公开页全进 Worker | HIGH | 重新切分静态与动态边界，回退高流量路径到静态资源 |
| Cache Everything 误伤动态内容 | MEDIUM | 立即收窄规则、清缓存、加路径白名单 |
| SEO 长期不可抓取 | MEDIUM | 补可抓取路由、sitemap、canonical、标题与结构化数据，再重提 Search Console |
| 发布链版本漂移 | MEDIUM | 为 Pages / R2 / Worker 加统一版本戳和发布后校验 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 公开页全进 Worker | Phase 1 基础部署与边界治理 | 发布后确认公开路由不命中 Worker |
| 70k HTML 文件爆炸 | Phase 2 SEO / 路由策略 | 检查 `dist/` 文件数与静态页范围 |
| 缓存规则误伤 | Phase 1-2 缓存治理 | 通过响应头、purge 流程与回归脚本验证 |
| SPA 不可抓取 | Phase 2 SEO foundation | 用 Search Console / 抓取测试验证 |
| SW 缓存膨胀 | Phase 3 播放与 PWA 优化 | 长会话内存与缓存体积监控 |
| 发布链不同步 | Phase 1 发布流水线 | 发布后自动校验页面、JSON 与 API 版本一致 |

## Sources

- https://developers.cloudflare.com/pages/platform/limits/ — 文件数限制与 Functions 计费边界
- https://developers.cloudflare.com/pages/configuration/headers/ — 静态页头部规则边界
- https://developers.cloudflare.com/r2/data-access/public-buckets/ — R2 自定义域名、缓存与生产访问方式
- https://developers.cloudflare.com/r2/reference/consistency/ — R2 经过缓存后的覆盖写 / 删除 / 404 一致性注意事项
- https://developers.cloudflare.com/cache/how-to/cache-rules/examples/cache-everything/ — Cache Everything 风险
- https://developers.cloudflare.com/workers/platform/pricing/ — 静态资源与 Worker 计费差异
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — SPA 抓取与 prerender 基线
- https://developers.google.com/search/docs/appearance/structured-data/video — 视频结构化数据基线
- https://web.dev/articles/service-worker-caching-and-http-caching — SW cache 与 HTTP cache 分层思路
- `.planning/codebase/CONCERNS.md` — 当前仓库已知问题

---
*Pitfalls research for: 低服务器成本的公开 PWA 视频站*
*Researched: 2026-03-27*
