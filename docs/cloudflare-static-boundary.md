# Cloudflare 静态分发边界

## 目标

公开高流量读路径必须继续留在 `Cloudflare Pages + R2`，不要把首页、分类页、详情页、JSON 或 m3u8 再重新代理到 Worker / Pages Functions。

## 运行边界

### Pages

Pages 只负责公开站点壳和静态前端入口：

- `/`
- `/index.html`
- `/css/*`
- `/js/*`
- `/manifest.json`
- `/release.json`

### R2

R2 只负责 release 作用域的数据与播放对象：

- `/releases/<releaseId>/data/*`
- `/releases/<releaseId>/m3u8/*`

### Worker

Worker 只负责低频 API：

- `/api/*`

## 明确禁止

- 禁止把 `/data/*` 重新代理到 Worker
- 禁止把 `/m3u8/*` 重新代理到 Worker
- 禁止让首页、分类页或详情页经过 Worker / Pages Functions 计算
- 禁止让 Pages 和 Worker 同时托管同一个 `dist/`

## 发布顺序

1. 计算统一 `RELEASE_ID`
2. 构建 `dist/` 与 `r2-data/`
3. 把 `r2-data/` 上传到 `releases/<releaseId>/...`
4. 发布 Pages，使 `release.json` 指向同一版本

## 运维提示

- `MEMBERSHIP_KV` 仍然保留在 Worker，但必须替换 `placeholder-kv-id`
- `R2_PUBLIC_BASE` 推荐在 CI 里以变量形式提供，并在构建时拼出 `DATA_BASE=<public-base>/releases/<releaseId>`
