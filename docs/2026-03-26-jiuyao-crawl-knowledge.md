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
;`${baseUrl}/api/app/vid/h5/m3u8/${sourceURL}?token=${token}&c=${videoRoadLine.url}`
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

## 14. 站点启动的时候需要的点击动作和获取VIP账号信息token的方案

curl -H "Host: d3vfkhk0c6rox6.cloudfront.net" -H "sec-fetch-site: cross-site" -H "accept: application/json, text/plain, _/_" -H "origin: https://dw370qtmy9es.cloudfront.net" -H "sec-fetch-mode: cors" -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "referer: https://dw370qtmy9es.cloudfront.net/" -H "sec-fetch-dest: empty" -H "accept-language: zh-CN,zh-Hans;q=0.9" -H "priority: u=3, i" --compressed "https://d3vfkhk0c6rox6.cloudfront.net/api/app/ping/check"

还有 奇怪的 请求
curl -X CONNECT "https://nghusuc.com"

需要从他的pwa开始启动的入口
https://dw370qtmy9es.cloudfront.net/?tid=8694839559480938mmzpnqd0&dc=1GeePYQk

一路抓取browser 的真实请求xhr 来一路分析到 点 动画，漫画，三级片 分类时的具体 api接口在哪里，只确定漫画的图片地址格式都是：
curl -H "Host: imgosne.qqdanb.cn" -H "Sec-Fetch-Site: cross-site" -H "Accept: application/json, text/plain, _/_" -H "Origin: https://dw370qtmy9es.cloudfront.net" -H "Sec-Fetch-Mode: cors" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "Referer: https://dw370qtmy9es.cloudfront.net/" -H "Sec-Fetch-Dest: empty" -H "Accept-Language: zh-CN,zh-Hans;q=0.9" -H "Priority: u=3, i" --compressed "https://imgosne.qqdanb.cn/v3/image/1dd/ty/1hb/cz/87c9236237515f73ce4831c6385b2e4a.jpg"

提示：漫画章节内容里全是图片，图片是可以直接访问的，不需要VIP权限，比如上面的
https://imgosne.qqdanb.cn/v3/image/1dd/ty/1hb/cz/87c9236237515f73ce4831c6385b2e4a.jpg
可以用来推导漫画章节和里面的内容图片有多少，怎么抓取

分享漫画：
https://d2wu14ta6bwns9.cloudfront.net/?pc=4VJXNK

购买过VIP的ios本地描述文件安装的webclip版本的入口URL：
https://5w8cj.com/?dc=1GeePYQk&tid=8694839559480938mmzpnqd0
这个地址会跳转到可用的地址，看看是否自动登录后还是VIP身份。

账号凭证
用户ID：10908226
用户名：辜如智
限时永久卡会员
到期时间：2053.08.09

充值记录
账单编号：WNSY03250120160T5YC
状态：支付成功
2026-03-25 01:20:33

永久官方地址 https://91porn01.cc

### 注意：这个SPA站的VIP账号登录方法：

3-30号新发现
进入 我的-右上角的设置-账号找回-再点图片识别找回
选择上传我们 src/img/vip.jpg 就可以登录成下面的VIP账户：
用户ID：10908226
用户名：辜如智
限时永久卡会员
到期时间：2053.08.09

safari浏览器手动登录成功VIP后，Charles 抓取到了访问我的页面的请求信息
请检查请求的和解密发现下是否有VIP的token

curl -H "Host: d3i0tylhl4ykjk.cloudfront.net" -H "accept: _/_" -H "origin: https://dw370qtmy9es.cloudfront.net" -H "sec-fetch-site: cross-site" -H "x-user-agent: BuildID=com.abc.Butterfly;SysType=pc;DevID=890FDC60208B6BAC1774771247746;Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1" -H "temp: test" -H "sec-fetch-mode: cors" -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3NzQ4MzYxNjMzODQxMTU1MDAsInR5cGUiOjAsInVpZCI6MTA5MDgyMjZ9.R0FCVfpP-Ex2jR8mT7gF775GDm9F4flc6wTQGUKoNl0" -H "sec-fetch-dest: empty" -H "referer: https://dw370qtmy9es.cloudfront.net/" -H "accept-language: zh-CN,zh-Hans;q=0.9" -H "priority: u=3, i" --compressed "https://d3i0tylhl4ykjk.cloudfront.net/api/app/mine/info"

返回结果是

{
"code": 200,
"data": "IjBZWTVZwOJBRlzqJpUH7o3HbAZE1HMOk7gaSJMHQIAgbSepseoqCS2ahKAcZG4B5Ptmecn1cGMjMB+PKPgDhTBfbaAkjWRL9mOebPAgL9zLvguiQCxB1Co4fYbGkjuU52nigjwKCRGW7jNwkQy85qtfTq+qXWeZOyjQUOIb/Vif4jp6W13jmZic4+pciKFoXYoHUU3b+h6gUj+DaXoNtkvhNthxPiW6Mi+gtCi/PZ4Pe2+aWPoNmW0fft7Y3njs8VuvsEXRiO0yRZRW5CW41idxB+p1Elx8lBezJeroxyz53ii/sjaKC33wDjKYuSJ/qo6cnS2MCGCmq895qdKQfAkqQSt8oRZytNI02rZ/TITKP00jeZubfLLeoi6Avb1OJ+NqkpTf1aATzDYMJ+qFpXaKBw2pjQmAsj3tbKZCtrTIyH7qFDw/uQ/oIa7J9nCiYG2MmikUyN29A338lQUpQPtyBpB5rGmR+yUzjRnCm1/mltLa3A4qjcGGC3D2cUvaI3r5s4wYwS1ytbZuLFiINCUaT26og7T2utBLncX4+RSoKdQQS7WhhWG5f24gRg54Egk4FTDn0X6NBQwmKU196GAIrF4oe48kc4O5Zkef3e4hU6dWpFyeJgntZokudWiWfgL2GxDch6kf8UMkx1CIyJNwMuOw1ACo1OH3c3e5EC7MqMjXkcRkagLDID+MdYRAsD3eAYI8h2N9YA71gVwfPUIHO+Q48WlzDinWnsM9U44zseF75NU0a2ZHeocSs6Qfe7GxEENQ2Jze/A0N7E6NwycNBt5OsPboF1O047egb0hKy8KLjRr+9nyS1iaSB4Tu4m+0uW9wPK8S8CjBmGXHp93p9G8fKgaJdfPfnsvWLGLVySFvk9mn5GsTFqEijpWUMOxrVwYSB3BDEbD09/E0mZZAwoPsrOcCMLoTIUEC9hK9jJ9ZCdlB6oOGAwus0mrbTZqWDPMnveUBTVSK46Wt0kzzyf6ijkhOitPcpv+77m7uuSTPPdmgh/k6NNfZuMaTBvNllRlCftDf4zuZ0riWk8kpm0qn3KePJtjlELxIEL6uTBGoVzn5amOu/qPffocAeFiRo8FXLTNh3E68Kmm3fLVAxQhapUB6ORxT92ntW/ST/db6vfnzyz6bmgf8Q1czDvNStGO57pB+80Yu5pHA0ACAreYlxPhANk8gg/4bl1bM6frSYAJb+RorQnR5L1tMxoyseQVGecbh7hyvli+KIFNYyIiT/zuNGuLTkGtSWCaqmp/rqwvrN1vyQ8C22t9J6WMohhYNXOHglJnnhnmwnrq2RdBWEhCUrLSWySK4W0DrVO0TxC9vOBz1MqpxOhIgogrOJPyeGb5DfjFFUsmYrr5oewNpl8Xman/LXTOZ25ORbQAOpuCI8EDhuMoOgzZdJ7en4GL0O8usJj+vFBdYgjAenWqeBp4LsNjxMiUHU4AdONlR6KT2eS321fU4P1NNPIQQuIT88oK0+bP/VUONju8IAJD+q2rjO7Vc86C/tyAMnTAUXHgZiGd03zf4kpc5sxeUXRo/k+nP/B0qNoxaBdWIwqUY+UawDkTf5AnwcIZNSnk366MpUCKlUl7qvExTVRhSk4FFpt2PBFjD3N98ATNzeG7Yv8IUnLlg9aIs34LEtHEUfTZlA/OXpBys/5ifpt0KYcwkGVkBcXM5A2nnqFrRENA9XyBm9kE84b2Pj2xa8v8yXpFviwBfHpnD+tH35A+D4JDtxdekvrj4dIFrelUq8H+R7UdW7Lyss9p4dZtOdhriVYQriayF34MHHz+kBBBRiwxUvgU02bpy7L0pkH6G9+/eqsz6BgpP3EAYyoNsyXOIIQBoh7gbTZ1hpB+oCDbI3E9apXMYF0zOzi+JPqhzdS7vpW0lBjYcd6WfeLPBX4Eakd72JkrLnO+9KZ0FCoxAX5f8YkrKzZXFrEf+Fnu+BEHSIQZZoR6+bFX02z91d2anVO1PyMWEtj4GQpyAhjHFBNnBEwxin0DqxTvthq2NZQRw4Hlne4nytwTdAbzesAg2u0/9tteclT1P3rGxeuUKl7zYcGMBQ5CdF37SqynxUTcLwev2y620ZWh9TDy9NqDnM4niZUK8cA93EfuZ3TTIr7ecfnqjzYSzjZAEFzEjCxjW+cScxN9sGOqzfhiHXTA9Ek57AHPWyOsQJYNior4lXeXakU5n/OI9ct0pead/E9OBdTz2yxfn+3Gpd4qAnzmMZustUDn7l4t7L7meeUbhjZL5Zkaef9FevByhi9Ikc8trrY824rZ8mBAHfaH/3mRHFkJZgTqgeXwd0pfajvmlmQZo66llPzvN9spZif48x/sN+NFGeCZkhaj+m05WcyulPpjMFDnfMyCRf+HbXfB2QF2mS35MV7Ts9pBfS/8LbR8h1BcHH6m5evDkaV/OTUsx9uQTzhWZAmIBQG5SgzLXXybt/lnM3RtOi4Ww6lBRdeiZiIfBVx0OFXiv6HIIf8d29mcE1eARnCc6vyFnZesPSnwMuz4naO1rgDRMPcGVJxvkdrxpemUIb/fE8WxvGhnBqGSMmSNbeyVfnqk4oFzPkPx4yOPFF5kMp6OyvakyCVsuiutJZ23V5EWgFutRoP4wRZ4vnLLGiaP9xZHtKMhXPA6bAUPbzKkOJquxH4fXDXF9t0l7WNyGfu0DO8eHCHwjzakddmeqjGVRGCR61gP/159NjNchUTIBkJ1qis5OIbAwSVsCVCvgzSnXbgRP5JOEBve4rHfEkMnJD6UJQKeTmCu3Ncmks34UKmk7UBTscB9JwLnqIfbZXIhG/jQncg/hD1GiShFLRYewq3phepviUGc94AHBkuGFwDmj09EHwkPw/EJrxO0bSkuVJFfD0CWLEw8iTvBqiaSvX9uL4OSndX0lK3Z3YDR/p96QUxqpiGoJsWByDhv43oPI7c5jGGDC0HF6P43oWiTiVyt7v7R7IHlvqMGKbSMoZ8AfrsbgfpnStvCTVgnEtK/yyOWbr71zv1aVlUfA3akM6lOo46fjZI/iYwYfMpGkTtvsSZaGiZiK+3sDclnYTe6n+Ly4bs9pzNOX8kkdbZG/Q0gOnjYeXodsxDJ97oJ0X+5Ydj+yv3nCmqmbSvz64wblSWNCqramOviiV15EF0Ui+zmKe3FeHCysR30khoWA9E1K2pPTDakeU1qepSzSwkgYfWT26mciK1kCI06gJgEPfRrreJWr2NRcilLureXawqKvDNXxoaVKaeb4B31cpszs1IibH4IqqEeQuQfn/1/C3EJoDGuDNwsPdMrLE8Ie9DI85CJh2qvCHT0OJt/LTdUqYDfmeBYPNqhQTc78g0CCWa0kkZN4jxAvH2q20O+DlHc5mLyRTLyV8DZb52mKqPyCI2aWoYoq1VtezpxF+RdRKSVIh2yNFUsJF7vqGnUb9qiEg41ngzlIHUzv8sPUNyIdNJ6QcfKuQxz8sMYew4SYNL39IQecDPlcws6KiXpfcitzJqFt0/qncshCX8EBmiUO9oFsh9CpkYagrn4+9sJ/UNR7E7RPRfYgFblGmZWXFoMr1A4S0nqPnUDlu9vmM8sSJxplJSDjkJA9H/qTjxeIyXmky/Q0F582J0Ot0bueGzfRneyFX1CyyZWjIr2VQkG1nYJoCcTAdKqbq+97SUm/fUGNtJealilg83TWLT7BYy0O9j3L65va7wUKNlVA8aTs3QbDwPd0xj+pFIFGGDK6Augl70YPH5VpY/i1fXtbXH0EJqTdEk+zmxFJSXYi8CuDFvy7sAzGdCV04stYEu8PB4kyPIX8z6HFeBfaqg+0Zk6BxotWmq5F4CT1yQFZvWWbHWr5emR+NNdDhlw4rtw=",
"hash": true,
"msg": "success",
"time": "2026-03-30T03:11:26.729Z",
"tip": ""
}

还有

curl -H "Host: d3i0tylhl4ykjk.cloudfront.net" -H "accept: _/_" -H "origin: https://dw370qtmy9es.cloudfront.net" -H "sec-fetch-site: cross-site" -H "x-user-agent: BuildID=com.abc.Butterfly;SysType=pc;DevID=890FDC60208B6BAC1774771247746;Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1" -H "temp: test" -H "sec-fetch-mode: cors" -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3NzQ4MzYxNjMzODQxMTU1MDAsInR5cGUiOjAsInVpZCI6MTA5MDgyMjZ9.R0FCVfpP-Ex2jR8mT7gF775GDm9F4flc6wTQGUKoNl0" -H "sec-fetch-dest: empty" -H "referer: https://dw370qtmy9es.cloudfront.net/" -H "accept-language: zh-CN,zh-Hans;q=0.9" -H "priority: u=3, i" --compressed "https://d3i0tylhl4ykjk.cloudfront.net/api/app/video_gold_coin/list?data=3yz90UWhDG0IlUqiRfBgy%2FyVg8RQU4B%2FXlxW7sNSedEDbymM1TpX%2FKG1gublIEeM"

返回结果是

{
"code": 200,
"data": "HazT6JYB4NSR9fvdyzetGXtWPMMxMDuviLT2jyIeUgfGxJLutWdZSRljyG4r8Gl9vVaaAlMIDWb99M30rT/Vrqg15mhEzFHexdvPk0mlpqnFxw8yABbGUZC8DWabFr7K74Ala/7stKcOMtkC5UU63s2KGCtC5PEy5w2OTfioCuxpWJKhn+HhQeQ0eycQLNE7iY4szEUdqIFs0OWQx7x8S1kXGIZGdFsh+G7EAEBjrIxqA2JTt/Hwgn1osedBls/gfsFK/u2OBc2AcZ6il+iirdIg+oCnE6b0P0POwBzGKKTFBatuPT/m5Z7RwUNkQitrKfai4GR1x/1QwA7sDARvvj8HyC6kgDyphA5Xa+DlA0EFs58lW6ul0J/G90T9PXibOSLK1f3rCh/E8x4JTAwAYkoFGkvqFh1p8Gw1qEQDvbWiYGCtNvrIGhMP4i4GL6SZrdDNeuTebJirFH9MBANCbd992vmwIr3i7E3I9XllZQJ0+A/Cl8GyY7+1H/pbl5M6LLZ086VNMDPNB4Z5Cuq/oO8DGFh7dOkEx+KnE6osYp0xCIqR4DVqw4qwgI2/3rh8WSHbxognWtWeogWuf7trQsv96Oj4ZYF4eJ/PhATedPqBshOiMIW1nMAfMT6GR22iUkuBZDRbUQrlEGWBDM3iL8LHpuB2A49T1gLo0F2+hfn8OrCh1QojqYvfqye3eFompLkwQgaGrsGxwfxMqzy7U423n4mJPe5f8GWnZpb7Px6af9B/3HH9a3ftSWfSq9p5YVog9f6tviiY/noEAeytRZ9HJfdDEPedGh5WrF9szzRKOshZ2OTj3X3jANiakZDlqXt5ufpWITXHXwOs304cowpQAydePGmcPzjrUxyQAHm+xiOAb/RhfrWoqQwAeHkgABkvZg5NASQkcdE6MvN9A84kX7TkVhq8dmaOnQeL8JGXl2QL3otphVQwyrO7wwYS+6KPRuJ5RzWr2zXaXcDa4LboivI3VBREn3bhqei92d51+whD5u5qsk5kzovS2BzERYPFJ92CG/qF22il8QAXSK/1kJs+0ozCnGU+pEmR3xZ7vJAaPsfJBBnp1WVsZ/FJc4eHMIUM/IRrZ80C2X6F7qyLTtJJ9VQeiXIc5JE0kcpM8tTl9NDnNudG7uyYS/YxHO1yZj9ohgFPB7ymJUJ/GVqNBo/yh9B+SKpSQsvoDuQ9gBETaICjtyQ+a+x8NFqxeXwpIuYlxfwfJbVr12GFymuPZzeR7Aj3xIqU3i85hbWrUyECkFQpv3GgCB3F32IF94bwFZqyWSjCMwYgPD3gMHxjkAaAwMBqRmC2TYrABScvzOXla/W+LCTK4+1PHRM9rEhXvlp9OEfrN7wT1ikcYnh7yhoR4r9IZT7M10uWJt1rOXn8m4a+OnQtVQLOLOoOCe/uFRe1QZzhCw+Mzn9MO2WK9VykvXB6rtHhlXEpucfJaRHUk08iIxD1jy+MbBwbSsrUTsN9I5pkyxsZ/v1MgXp5GIFNRHN2D9TsASC5NR9gRq+XkO0FsR+VZX7LvFkQB8kM9VVThZ2KSmnRUW7uOmORQF/UfDjmx3IWwTGIyHNBvOf9/RWDQfU1SSz90iULwWaMgT+1uyCxWeIUrXky8exmBuFaCuDRo4YODLMFVvdiIDcXftZWSvnKopwGphJWTf3l2OcnmxpRWtE2xL2fRqGhq2tG/MVqgNRxSayjcZRMqylz6K1DeVniAvE9tG8T271dmW/JvL45eWc4hdIwfV6MNdqvT4j+ZyomTNgSRiY7MNvpZNNqc0rW+e+zoGOn7EGCyaYDU4pOj3KmhGDES3+7rK/tLb17Le/UssENc7OwjquEvy6fNvQr46+NyiQuKzjeq0AVWPgroJiCIfhaoivXbtorUHVXv8NZao7h5qAqgVHHzQVYjd1/paYLKLVRyLasUIk3lso5Nzrql2EqXppyd8cEE+yp796nFL5mj06dmp36W5bDUEE6y+R+Rq1QwK9PO1BEJ4H3A2opDBxXLznl9kBPuSUw5YxV/Dw32BOnuxNToE2kstEfJYeEdTqCxsfnRwcUW2K+hLUNxZ0CgfAC6A29mmrg0/1NLzDn2Trnd/aFP7FhI9WEoXM8R0q0PWYSqEp6iuD5L62h0NvPXj3TfRn8+a5Hbma06SEtVmnUoeUW2NCqpUssDICo7xEtfl59iPQAVh2J4T8Cg8ZOQ+cvjKPdHLEW/aTCBGgexRXde15Capp6cW77e2MCD6IGk1jq2dYD17fp2tYY/eEmaXPzXFzTnzxCMpR/K/ROfNr0fMRVNVK6SueKjF+r4AwONX19OPOI9hl9OJORT2SvWaZDnJY68yizGX5vlN8X2rFMiVmBva8G/mfJv3muQMz2/psZ7/+pBu5z6XiZbG2xaWeKgS+AlnAGAwP2mbsj4ZV3vkKnxdFd8Zlhd4bgXD6dVv3LwtbaSMhrUfOd+PrO6zcq7NaWa9Yj4mvxVbpwx9xr2WfTTwOJwu5fc75g7bwYkVFVvgcwdZgG4oyOK8OSpHZzA961LwA9FO9VLaKfdgbewnzDOnzLB/TPVvda22i361zbe5Hu9/v6ShimxEEGWXEUjsS2kr4kr5YjRtvkXInXjnFh/D70+a2owtsuHxr2t+NFQv719XfOnMRUfkYAVrpCRFMIHUAiSAzMVS1fIs1tdpfR406j3KFebvl/UVYJiu/UrGRMNMYw2Exls1vTQchZ81P8wJVeMoRJqW1goMxiFYMojGS8CpmGmoyhmqfVxZgudi9tIQIcIWu06oLq9pZFTYizRbg6VfG7XWIv+ojTjUvpqqdJ0258L0RsxiwPr4WuAFJCKBFohDB8OzgPLJnVX+nfYp4HSoooxdVhp7IedlG1s5Zq6hqH6LBbksWf3pdO6yCfJXOQhuk9TPwqL2a5prweGV/kcEMGhuVLCzMigK1PFOKhT1/TrbEEn2CFQfET4eEfkGIKK34rgZelCIiEH9aNgXQrFjyO9PT4sNzxOwtsiR727T0mqh4CZuppdd8yZNy0jPZiL2O0kcR+HZkbu10Fci1CLBW6ny46R1dP3Y/xgNtNJ3VayiOr/2QegYQgi3KvedgkWFLZYBh/ag7u4zmspPzsXx3W+/RxYwFa17RQxc/eE3wC6WEH6tq0ELu5CGhFcIEeewET0F6mqyY0gunX7Kao+r650c+HFshMjhiMoHU6mriG1+p/Vcep2PvCquYe//9MyhdDDGOq2Swu06FnP8xTwg4RkOKodJvfQM9ct4KK1fCf1dPRZw2Ouh+yT+Cr2U9ZyiudJwYdpBqK9N120miUY8GnbLbioviOFxlajU7M1YhkPHUwiO4Tk/4gM0lfmHY0cZT57537odVxfxyqHHcBaEKMe89RCxSvUvlMQoX05lLtbnacMMGsW6rmCm3ruU1saBqBewrKM6N4mWcA3xfqtKllLHRxB5rga67NLl89cEKq4kqCJMLWAoJXbrLqP5ZImnbSIKwOF0Q/GfpHxYs+9r6T61CoFFFPl11Bxb76eP6ri3W0+E/fNnkD7O+fRI37zeG/llbjG10mEiVe3wnQRvyol5YenFQrnMaqyb5wjKWEYvE13OfGMoxXMl/evrOkMiC1LfUE7JNJwDrtWfTyrt6ZaNyxb9f3qNYeda2Dbk3d2HY/2ShbJwe+B48cMMu6y81QLLra7vfsNlF2ZEUV4JHBFC6Lu3/WbeKTXv3kEsu8gmS+bAoKGJBIYtGehMeDK/iwS5ERCDnGdpATcEwJetqf2Qd4nH8b6fYS9rouEQJRWpeS1FzzlwMt/eOCyA68X+LCJFG5e/TAiaS4QcOjJ481ZwuL04sRcPwKRMFpU8av0dgOf4evgVBHoWSUvP7AMXguMgodk/Mz2ExThcdyzStBIurwrlBJfW/PAouMlOHR1Sl9nCweCsvKA0vXuiVpcCNGygTGuJHktJm8sTeWY7EFyXArzJZDril0I0FEhVo8P36kvxEphVCOvEP6GWijU7CjDaUBwpox7aZvqk+xog4HpDejejbn4z8Bp/AfFSaj4SqiC8ZtMHPDS7lqJekM/FmCkTQMft4bqiFKa6KHiyr9JiWV7QRZ0y7Y20GKEoDSyqUV9ctKpV80ZSkgeIpqlLliJlZ3xbyTvO16j7niBsXrDlb8rVm3xVivAxM3UeFSG1gP8A0NQFgzxjP1+kkPXs9Q13B0bJGVS1US0uKIDjxKFQ8VCOz12ugeQdgTYxnXiVCHb8Z7dYti00f4XU0s6CSyLsmJ2/takYMILuUqgw6DHkzorBx9iS5YSNujnRunm3S0eDOYx7W9WAtr9rsBNuceiQerClbN7Wto8vEjFj6xXJmCs1TngVmyvhuNr6mefb+Nj4xRuEF9AcMQKlCybbqz3/y8fHdIV7diU+4jyPc/YnI8zx+ecNzERrjnzM4ar3N8S6K0AuoSjLrGuJwe8FAZbrkwdulkVblp5ed8egjP1Bcm4cuCTdGloju860SKvUxOPvNC/J0oA8WD9SVKv9NG6ZOsv+wDKPQlcYECGXUigUahFh9H1Zu2SQerQYHQmPFYVBXbjhad88tzpll1wOU5Nsf0+5njPvjXYn+GbX+mqxS3K5rkA9aN5Iwa+BWm8uTeq+eyK6CgBsTaRVpJ1U/4aI+AK7mtHkhkR1l0OieVhxyRPaosaSPqq+VYbnTzcwtI3p1iAfzG42IAD/DibigtmBzlxn/btVHIUnw1zW7xEtluvx6IcdvR2kxm1OtzBIX0T93SNXWPc7AU6GYLklUnQunWhp0DaBB94jwCfMMUcVgonyAr3BgC5RfPTQIAFN3XTd0tTOylfJiJuwZ0AYZ74fvYRUAUySotlKFwHZmkqx78wyZbrQTSN567sPM74G48vu4Xx+YzyYUp8jv5bNBYuF2wjXsBKeTpEP55HiYuHKsojrNxfsevbUW0FjnNj73wrB/Ykm5oNYqHnhyi60l/AJ2spkJmU6kiDpabBTH6A7OwtTC3x8GNc43jNaIIzVtXM9Jv6l2cgEZKS1wjIWLZCI/rio3X76HP4Vg9894SIBnVymwfD0doBz1ivh/3CJkJTKdUOakbfD0XY0/QGmCm+yZxXS6X9S1U3Tabn+wSlVcsDjiL5zTBM7dqHLaJ/rOw9J7SPhN/oefsMWBFvd/2Qw+Ly9tYh87ylaLDAXgxLbfjm6gilM0NRZsz3WC+m8PINZMnCw8wNa07WKLUGrOU",
"hash": true,
"msg": "success",
"time": "2026-03-30T03:11:26.292Z",
"tip": ""
}

还有

curl -H "Host: d3i0tylhl4ykjk.cloudfront.net" -H "accept: _/_" -H "origin: https://dw370qtmy9es.cloudfront.net" -H "sec-fetch-site: cross-site" -H "x-user-agent: BuildID=com.abc.Butterfly;SysType=pc;DevID=890FDC60208B6BAC1774771247746;Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1" -H "temp: test" -H "sec-fetch-mode: cors" -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3NzQ4MzYxNjMzODQxMTU1MDAsInR5cGUiOjAsInVpZCI6MTA5MDgyMjZ9.R0FCVfpP-Ex2jR8mT7gF775GDm9F4flc6wTQGUKoNl0" -H "sec-fetch-dest: empty" -H "referer: https://dw370qtmy9es.cloudfront.net/" -H "accept-language: zh-CN,zh-Hans;q=0.9" -H "priority: u=3, i" --compressed "https://d3i0tylhl4ykjk.cloudfront.net/api/app/product/advanceStatus"

返回结果是

{
"code": 200,
"data": "Cs3+Dv3/UQOiY7ouDoym899aLfYv2PTwyjcNiiBM3ziTr/zWVY+BwybTsbqIt7v55BTLxlTvNDR8redPccWdTYAawpT5WbtBUdV5W4SvYzt5I4LBGIy4rdIw3LKJOBz1rzRwjV9lx36CsCRyEsNhgXBZ9LUuNn9MErr+xMxZthMtM7itGw4j/WoRpIl5+BNjggBYeWRdEDVfKeA7pmVojI4l0BWsMYx9/CdIM7vRqxbpK/+m93mn2gqxZkI8BXhFF42kTDMuYF2zqGKirtVQCNItO2VTncq3swWGv3MIcj9+0myZkBrHy6124zKBK86uzUlw7kJSxlw1XGl/zra7wBGf8i+SPrf+NyxJQriWYeQ8wnR9mpD90/Z5vAgU6FMdC9U0UPKksafCJzV0nW4DmrE6/5gqUBTE1zMjmR9lMkS7vHgU6pkVDzizX7mN41zJzpJYYvJSzEN/iykkccthph1kZTBZ5ob8qaKsnMIlBKauCORU1eWgewjdBKWrONaqS5gbO9vueSVEnCmubM36zfnvqC6GENGc6gG5lXqIt/wraBnY5E2XAYA0Q56YCYCK1FFjr3KrIlz4eIkoACaMI/j1uedagUkNRAVzQkzn///ZuS6nelPRCDzXpzL/Ap4cLTs7j1HhWsrpnBpuf085Arwoz2sojA7+kC7nAg==",
"hash": true,
"msg": "success",
"time": "2026-03-30T03:11:26.281Z",
"tip": ""
}

还有
curl -H "Host: d3i0tylhl4ykjk.cloudfront.net" -H "accept: _/_" -H "origin: https://dw370qtmy9es.cloudfront.net" -H "sec-fetch-site: cross-site" -H "x-user-agent: BuildID=com.abc.Butterfly;SysType=pc;DevID=890FDC60208B6BAC1774771247746;Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1" -H "temp: test" -H "sec-fetch-mode: cors" -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15" -H "authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOjE3NzQ4MzYxNjMzODQxMTU1MDAsInR5cGUiOjAsInVpZCI6MTA5MDgyMjZ9.R0FCVfpP-Ex2jR8mT7gF775GDm9F4flc6wTQGUKoNl0" -H "sec-fetch-dest: empty" -H "referer: https://dw370qtmy9es.cloudfront.net/" -H "accept-language: zh-CN,zh-Hans;q=0.9" -H "priority: u=3, i" --compressed "https://d3i0tylhl4ykjk.cloudfront.net/api/app/ping/checkMessageTip"

返回结果是

{
"code": 200,
"data": "a3+lFEbfKrE6M7rq9EuFvfTxJgTdEPEsczilB7kyuhhAFXRkjQVGjZqoaaU=",
"hash": true,
"msg": "success",
"time": "2026-03-30T03:11:26.400Z",
"tip": ""
}
