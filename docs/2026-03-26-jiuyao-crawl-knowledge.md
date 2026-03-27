# 九妖站点抓取知识沉淀（2026-03-26）

## 1. 当前成果概览

- 工作根目录：`/var/zip/jiuyao`
- 站点前台入口：`https://dw370qtmy9es.cloudfront.net/?tid=...`
- 实际 API 基址：`https://d3vfkhk0c6rox6.cloudfront.net`
- 视频全量抓取已完成：`75186` 个唯一视频
- 视频主数据目录：`/var/zip/jiuyao/_by_id`
- 视频分类目录已落盘，共 `11` 个分类
- 评论抓取脚本已完成规则升级，但全站评论尚未重跑完；当前只有样本验证结果
- 当前评论规则版本：`exportVersion = 2`

## 2. 当前目录结构

```text
/var/zip/jiuyao
├── _by_id/                     # 视频主数据，按 VID{id}.json
├── 热门/ 国产/ 乱伦/ ...       # 视频分类目录
├── _summary.json               # 视频全量抓取摘要
├── comment_export.js           # 评论抓取主脚本
├── lib/comment_export_core.js  # 评论抓取纯逻辑
├── tests/comment_export_core.test.js
├── comments/
│   ├── _by_id/                 # 评论结果，按 VID{id}.json
│   ├── _summary.json           # 评论抓取摘要
│   └── _errors.ndjson          # 评论抓取错误日志（按需生成）
├── docs/
│   └── 2026-03-26-jiuyao-crawl-knowledge.md
└── scripts/
    ├── export/                 # 从 /tmp 归档的抓取脚本
    ├── frontend/               # 从 /tmp 归档的前端分包证据
    └── README.md
```

## 3. 已确认的站点逆向结论

### 3.1 入口与 API

- 前台入口域名和 API 域名不是同一个
- 页面入口是 CloudFront 静态站
- 业务 API 统一走：`https://d3vfkhk0c6rox6.cloudfront.net/api/app/...`

### 3.2 登录接口

- 接口：`POST /api/app/mine/login/h5`
- 请求体示例：

```json
{
  "devID": "full_时间戳_随机串",
  "sysType": "ios",
  "cutInfos": "{}",
  "isAppStore": false
}
```

- 登录成功后拿到 `token`
- 后续接口使用的关键请求头：
  - `Authorization: {token}`
  - `temp: test`
  - `X-User-Agent: BuildID=com.abc.Butterfly;SysType=iOS;DevID={devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`

### 3.3 已确认接口

#### 视频相关

- `GET /api/app/ping/domain/h5`
- `GET /api/app/modules/list`
- `GET /api/app/vid/module/{id}`
- `GET /api/app/recommend/vid/list`
- `GET /api/app/vid/info`
- `GET /api/app/vid/h5/m3u8/{sourceURL}?token={JWT}&c={lineUrl}`

#### 评论相关

- 主评论：`GET /api/app/comment/list`
  - 参数：`objID`, `objType=video`, `curTime`, `pageNumber`, `pageSize`
- 二级回复：`GET /api/app/comment/info`
  - 参数：`objID`, `cmtId`, `fstID`, `curTime`, `pageNumber`, `pageSize`

## 4. 加解密规则

### 4.1 GET 参数加密

前端和抓取脚本一致，`GET` 参数会先组装成 JSON，再走 `AES-128-CBC`：

- `PARAM_KEY = BxJand%xf5h3sycH`
- `PARAM_IV = BxJand%xf5h3sycH`

然后 base64 后作为 `?data=` 传给接口。

### 4.2 `hash=true` 响应解密

接口返回如果带 `hash=true`，需要按前端同款逻辑解密：

- `INTERFACE_KEY = 65dc07d1b7915c6b2937432b091837a7`
- 实际解密流程是脚本里实现的自定义派生逻辑 + `AES-256-CBC`
- 现成实现可直接复用：
  - `/var/zip/jiuyao/comment_export.js`
  - `/var/zip/jiuyao/scripts/export/video_json_export_full.js`

## 5. m3u8 地址生成规则

这个规则已经从前端分包里确认过，核心证据在：

- `/var/zip/jiuyao/scripts/frontend/details-efa47c28.js`

前端等价逻辑：

```js
`${baseUrl}/api/app/vid/h5/m3u8/${sourceURL}?token=${token}&c=${videoRoadLine.url}`
```

抓取脚本的实现也是同一规则：

```text
m3u8 = BASE_URL + /api/app/vid/h5/m3u8/{sourceURL}?token={JWT}&c={lineUrl}
```

说明：

- `sourceURL` 来自视频信息里的源地址字段
- `token` 是登录接口返回的 JWT
- `c` 是线路参数，通常从 `/ping/domain/h5` 的 `VID` 线路里取，当前抓到的线路回退值是 `https://s12.qqdanb.cn`

## 6. 视频全量抓取流程

当前全量抓取脚本主版本是：

- `/var/zip/jiuyao/scripts/export/video_json_export_full.js`

流程如下：

1. 登录拿 token
2. 调 `/ping/domain/h5` 取线路 `c`
3. 调 `/modules/list` 拿首页模块和深网模块
4. 遍历 `/vid/module/{id}` 全分页抓种子视频
5. 遍历 `/recommend/vid/list` 全分页补推荐视频
6. 按 `id` 去重
7. 为每个视频拼出完整 `m3u8`
8. 写入 `_by_id/VID{id}.json`
9. 同时按分类目录落盘一份
10. 写 `_summary.json`

### 6.1 当前视频抓取统计

来自 `/var/zip/jiuyao/_summary.json`：

- `modulePages = 1480`
- `recommendPages = 145`
- `totalUniqueVideos = 75186`
- `writeCount = 75186`
- `categoryCount = 11`
- `lineUrl = https://s12.qqdanb.cn`

### 6.2 当前分类分布

- `热门`: `25000`
- `国产`: `20226`
- `乱伦`: `12323`
- `国产AV`: `5138`
- `推荐`: `4487`
- `AV`: `2013`
- `欧美`: `1839`
- `Only_Fans`: `1384`
- `17岁`: `1255`
- `主播`: `1255`
- `暗网`: `266`

总和与 `_by_id` 文件数一致，均为 `75186`。

### 6.3 单视频 JSON 结构

视频文件大致包含这些字段：

```json
{
  "id": "67cc03de1564603015afe898",
  "vid": null,
  "title": "...",
  "newsType": "SP",
  "mediaType": "video",
  "categoryList": ["热门", "推荐"],
  "sourceURL": "...",
  "previewURL": "...",
  "m3u8": "https://d3vfkhk0c6rox6.cloudfront.net/api/app/vid/h5/m3u8/...",
  "lineUrl": "https://s12.qqdanb.cn",
  "baseUrl": "https://d3vfkhk0c6rox6.cloudfront.net",
  "tokenPayload": {
    "timestamp": 1774..., 
    "uid": 111..., 
    "type": 0,
    "isoTime": "..."
  },
  "fetchedAt": "...",
  "raw": { "...": "..." }
}
```

说明：`tokenPayload.isoTime` 是脚本按 JWT 里时间戳换算出来的记录字段，可用于观察 token 生成时间，但不要直接把它当成精确失效时间。

## 7. 评论抓取流程

当前评论脚本：

- `/var/zip/jiuyao/comment_export.js`
- `/var/zip/jiuyao/lib/comment_export_core.js`
- `/var/zip/jiuyao/tests/comment_export_core.test.js`

流程如下：

1. 从 `/var/zip/jiuyao/_by_id` 读取视频主数据
2. 先读取视频里的 `raw.commentCount`
3. 只有 `commentCount > 0` 才请求 `/comment/list`
4. 若主评论节点提示有更多回复，则继续请求 `/comment/info`
5. 合并预览回复和分页抓到的回复
6. 过滤掉 `userID = 100001` 的评论和回复
7. 如果过滤后评论数组为空，则不写 JSON 文件
8. 只把错误写到 `_errors.ndjson`
9. 正常输出写到 `comments/_by_id/VID{id}.json`

## 8. 当前评论规则

### 8.1 已实现规则

- `BLOCKED_USER_IDS` 默认包含 `100001`
- 所有 `userID = 100001` 的主评论和回复都过滤掉
- 如果最终 `comments` 为空，则删除/不写该视频 JSON
- 如果 `/comment/list` 或评论抓取链路因为“纯 `4010` 耗尽”失败，不立刻记最终失败
- 这类视频会先进入延后重试队列，排到本轮队尾再抓
- 当前延后重试上限：`MAX_DEFERRED_ATTEMPTS = 2`
- 只有超过延后重试上限后仍失败，才写入 `_errors.ndjson`
- 为避免旧格式文件误判可续跑结果，续跑只接受：
  - `exportVersion === 2`
  - `fetchStatus === 'ok'`

### 8.2 当前样本验证结果

- 有评论样本：
  - `/var/zip/jiuyao/comments/_by_id/VID67cc03de1564603015afe898.json`
  - 结果确认不含 `userID = 100001`
  - `counts.filteredCommentNodes = 1`
  - `mainCommentsFetched = 2`
  - `replyCommentsFetched = 4`
- 空评论样本：
  - `VID66f3d3f0036ad9f79eb225a1.json` 不存在
  - 说明“空评论不写文件”规则生效

### 8.3 当前评论摘要

当前 `/var/zip/jiuyao/comments/_summary.json` 还是样本跑的摘要，不代表全站评论已抓完：

- `totalVideos = 2`
- `fetchedFromApi = 1`
- `skippedByCount = 1`
- `failed = 0`
- `filteredCommentNodes = 1`

## 9. 风控与稳定性处理

### 9.1 `4010` 处理

视频和评论脚本都已经实现：

- 遇到 `4010` 自动重登
- 连续 `4010` 时轮换 `devID`
- 重建 `X-User-Agent`
- 对短时风控窗口导致的“连续 `4010` 耗尽”，评论脚本现在会延后重试，而不是立刻记死失败

这套逻辑已经写进：

- `/var/zip/jiuyao/comment_export.js`
- `/var/zip/jiuyao/scripts/export/video_json_export_full.js`

### 9.2 请求节流

评论脚本当前默认：

- `REQUEST_DELAY_MS = 25`
- `REPLY_DELAY_MS = 15`

视频脚本当前分页间隔是几十毫秒级，足够快，但如果后续风控变严，需要优先调大延时，而不是先并发。

## 10. 前端证据文件与用途

这些文件已从 `/tmp` 归档到 `/var/zip/jiuyao/scripts`，供后续会话直接复用。

### 10.1 核心导出脚本

- `scripts/export/video_json_export.js`
  - 早期版本，用于先抓 1000+ 视频验证链路
- `scripts/export/video_json_export_full.js`
  - 当前全量视频导出主脚本

### 10.2 核心前端证据

- `scripts/frontend/video2.js`
  - 视频相关 API 封装，包含 `/vid/info`、`/comment/list` 等接口名
- `scripts/frontend/details-efa47c28.js`
  - 视频详情页主证据，确认了 `m3u8` 拼接规则、评论页入口、线路切换等关键逻辑
- `scripts/frontend/index-2be5d30c.js`
  - 视频列表卡片，说明列表页如何跳转到 `/movieDetails`
- `scripts/frontend/index-678098ae.js`
  - 试看结束后的购买弹层逻辑
- `scripts/frontend/index-90da781d.js`
  - VIP/预售/线路切换相关逻辑，能解释 `videoRoadLine`

### 10.3 辅助前端证据

- `scripts/frontend/video1.js`
- `scripts/frontend/detail-eec62bb6.js`
- `scripts/frontend/index-cc49e040.js`
- `scripts/frontend/index-d92403ea.js`

这些不是当前抓视频/评论的最小必需文件，但属于同一次逆向里保留下来的上下文材料，给下一会话做进一步定位时有参考价值。

### 10.4 明确排除项

以下内容没有归档到 `scripts`：

- `/tmp/index-homepage-sort-check.js`
  - 明显是另一个小说站项目，不属于当前目标站
- `/tmp/login_resp.json`
  - 只是一次登录响应，token 会过期，不适合作为脚本资产保留
- `/tmp/video_json`
  - 数据输出目录，不是脚本代码

## 11. 继续运行的常用命令

### 11.1 跑评论样本

```bash
CLEAN=1 \
OUT_DIR=/var/zip/jiuyao/comments \
ONLY_IDS=67cc03de1564603015afe898,66f3d3f0036ad9f79eb225a1 \
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node /var/zip/jiuyao/comment_export.js
```

### 11.2 全量重跑评论

```bash
CLEAN=1 \
OUT_DIR=/var/zip/jiuyao/comments \
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node /var/zip/jiuyao/comment_export.js
```

### 11.3 只抓一部分视频的评论

```bash
MAX_VIDEOS=1000 \
OUT_DIR=/var/zip/jiuyao/comments \
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node /var/zip/jiuyao/comment_export.js
```

### 11.4 指定延后重试上限

```bash
MAX_DEFERRED_ATTEMPTS=2 \
OUT_DIR=/var/zip/jiuyao/comments \
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node /var/zip/jiuyao/comment_export.js
```

### 11.5 强制忽略 `commentCount` 直接打评论接口

```bash
FORCE_ALL=1 \
MAX_VIDEOS=100 \
OUT_DIR=/var/zip/jiuyao/comments \
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node /var/zip/jiuyao/comment_export.js
```

### 11.6 跑评论逻辑测试

```bash
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node --test /var/zip/jiuyao/tests/comment_export_core.test.js
```

### 11.7 检查评论脚本语法

```bash
/Users/ivan/.nvm/versions/node/v24.14.0/bin/node --check /var/zip/jiuyao/comment_export.js
```

## 12. 下一会话优先建议

如果另一个 Codex 会话继续优化 comments，建议按这个顺序：

1. 先读本文件和 `scripts/README.md`
2. 再读：
   - `/var/zip/jiuyao/comment_export.js`
   - `/var/zip/jiuyao/lib/comment_export_core.js`
   - `/var/zip/jiuyao/scripts/frontend/details-efa47c28.js`
   - `/var/zip/jiuyao/scripts/frontend/video2.js`
3. 决定是：
   - 继续单线程稳定抓
   - 还是做更稳的断点续跑/速率控制/错误重试策略

## 13. 当前仍未完全确认的点

这些是经验结论，不要当协议常量：

- m3u8 里的 `token` 真实失效窗口还没做系统化测时
- `commentCount = 0` 是否永远等于接口一定无评论，当前脚本按经验做了“跳过优化”
- `VID` 线路是否只有第一条可用，当前默认取 `/ping/domain/h5` 里第一条 `VID.domain[0].url`
- 某些分类目录里的视频是否会因为站点后续改版继续增长，需要重新跑视频全量脚本验证
