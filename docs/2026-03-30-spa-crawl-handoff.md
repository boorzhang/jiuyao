# 九妖 SPA 抓取交接手册（2026-03-30）

## 1. 这份文档解决什么问题

这份文档是给下一个会话直接接手“重新抓取目标站最新内容”用的。目标不是解释整个站，而是把当前已经确认过的：

- 入口域名和 API 基址
- 登录、加解密和请求头
- 视频列表、详情、评论、m3u8 的接口形状
- 漫画模块、漫画详情、章节图片链路
- 已踩过的坑和不该再重复试错的点

一次性汇总清楚。

## 2. 本轮确认过的证据来源

当前结论主要来自以下文件和实测：

- `scripts/export/video_json_export_full.js`
- `scripts/export/video_json_export.js`
- `comment_export.cjs`
- `lib/comment_export_core.cjs`
- `scripts/export/scrape_comics.cjs`
- `scripts/frontend/video2.js`
- `scripts/frontend/details-efa47c28.js`
- `src/frontend/js/api.js`
- `docs/2026-03-26-jiuyao-crawl-knowledge.md`
- `docs/2026-03-27-rack002-handoff.md`
- 2026-03-30 当天实际登录目标 API 后对 `modules/list`、`vid/module/{id}`、`media/info` 的在线探测结果

说明：

- 当前工作树里 `scripts/export/decrypt_comic_images.cjs` 和 `src/frontend/comic-reader.html` 已被删除，不要假设它们仍然存在。
- 漫画图片解密规则仍能从 `src/frontend/js/api.js` 确认，不依赖上面两个已删除文件。

## 3. 当前站点拓扑

### 3.1 站点入口

- 历史前台入口：`https://dw370qtmy9es.cloudfront.net/?tid=...`
- 历史分享入口、跳转入口在旧文档里还有别的域名，不应当硬编码成抓取脚本常量

### 3.2 当前可用 API 基址

2026-03-30 实测这两个 CloudFront 基址都还能登录，并且 `modules/list` 返回相同结构：

- `https://d3vfkhk0c6rox6.cloudfront.net`
- `https://d3i0tylhl4ykjk.cloudfront.net`

当前建议：

- 视频抓取默认优先沿用 `d3vfkhk0c6rox6.cloudfront.net`
- 漫画脚本里虽然曾写死 `d3i0tylhl4ykjk.cloudfront.net`，但实测 `d3vfkhk0c6rox6.cloudfront.net` 也能返回漫画模块和漫画详情
- 下个会话开跑前，先做一次登录探测，谁更稳就用谁，不要死守旧 host

## 4. 登录、请求头和加解密

### 4.1 登录接口

- 接口：`POST /api/app/mine/login/h5`
- 请求体字段：
  - `devID`
  - `sysType=ios`
  - `cutInfos={}`
  - `isAppStore=false`

使用示例：

```bash
curl -sS -L 'https://d3vfkhk0c6rox6.cloudfront.net/api/app/mine/login/h5' \
  -H 'Content-Type: application/json' \
  --data '{"devID":"probe_123456","sysType":"ios","cutInfos":"{}","isAppStore":false}'
```

### 4.2 通用请求头

登录成功后，后续接口至少带：

- `Authorization: {token}`
- `temp: test`
- `X-User-Agent: BuildID=com.abc.Butterfly;SysType=iOS;DevID={devID};Ver=1.0.0;DevType=iPhone;Terminal=1;IsH5=1`

### 4.3 GET 参数加密

GET 参数不是明文 query string，而是：

1. 先把参数对象转成 JSON
2. 用 `AES-128-CBC` 加密
3. `key = iv = BxJand%xf5h3sycH`
4. base64 后放到 `?data=...`

### 4.4 `hash=true` 响应解密

接口返回如果是：

```json
{
  "code": 200,
  "data": "...",
  "hash": true
}
```

则需要用站点前端同款派生逻辑解密：

- `INTERFACE_KEY = 65dc07d1b7915c6b2937432b091837a7`
- 最终是派生后的 `AES-256-CBC`

不要自己重新猜算法，直接复用以下任一现成实现：

- `scripts/export/video_json_export_full.js`
- `comment_export.cjs`
- `scripts/export/scrape_comics.cjs`

## 5. 视频抓取接口面

### 5.1 线路接口

- 接口：`GET /api/app/ping/domain/h5`
- 作用：取 `VID` 播放线路
- 当前脚本默认从 `sourceList` 里找 `type === 'VID'` 的第一条域名
- 失败回退值历史上一直是：`https://s12.qqdanb.cn`

### 5.2 模块列表接口

- 接口：`GET /api/app/modules/list`
- 返回重点字段：
  - `homePage`
  - `deepWeb`

2026-03-30 在线探测结果：

- `homePage` 数量：`13`
- `deepWeb` 数量：`1`
- 首屏常见模块名包括：
  - `热门`
  - `国产`
  - `17岁`
  - `乱伦`
  - `国产AV`
  - `主播`
  - `AV`
  - `Only Fans`

### 5.3 模块分页接口

- 接口：`GET /api/app/vid/module/{moduleId}`
- 当前视频抓取脚本确认可用参数：
  - `pageNumber`
  - `pageSize`

视频模块返回里常见字段：

- `allVideoInfo`
- `chosenVideoInfo`
- `hasNext`

漫画模块会额外返回：

- `allMediaInfo`
- `allSection`

### 5.4 推荐流接口

- 接口：`GET /api/app/recommend/vid/list`
- 当前脚本使用参数：
  - `pageNumber`
  - `pageSize`
- 返回里重点字段：
  - `vInfos`
  - `totalPages`

### 5.5 视频详情接口

- 接口：`GET /api/app/vid/info`
- 当前脚本参数：
  - `videoID`

使用示例：

```js
const info = apiGet('/vid/info', { videoID: '67cc03de1564603015afe898' });
```

### 5.6 m3u8 拼接规则

不是单独先从详情接口里拿完整播放 URL，而是当前脚本按下面规则拼：

```text
{BASE_URL}/api/app/vid/h5/m3u8/{sourceURL}?token={JWT}&c={lineUrl}
```

来源说明：

- `sourceURL` 来自视频详情字段
- `token` 来自当前登录
- `c` 来自 `/ping/domain/h5`

这个规则已经同时被以下证据确认：

- `scripts/export/video_json_export_full.js`
- `scripts/frontend/details-efa47c28.js`

## 6. 评论抓取接口面

### 6.1 主评论接口

- 接口：`GET /api/app/comment/list`
- 参数来自 `lib/comment_export_core.cjs`：
  - `objID`
  - `objType=video`
  - `curTime`
  - `pageNumber`
  - `pageSize`

### 6.2 二级回复接口

- 接口：`GET /api/app/comment/info`
- 参数来自 `lib/comment_export_core.cjs`：
  - `objID`
  - `cmtId`
  - `fstID`
  - `curTime`
  - `pageNumber`
  - `pageSize`

### 6.3 当前评论规则

这些规则已经写进 `comment_export.cjs` 和 `lib/comment_export_core.cjs`：

- 只要 `commentCount <= 0`，默认直接跳过 API 抓取
- 默认过滤 `userID = 100001`
- 过滤后如果评论节点为空，则不写 JSON
- 续跑只认：
  - `exportVersion === 2`
  - `fetchStatus === 'ok'`
- `4010`、`curl_transport_error`、登录拿不到 token 会延后重试
- 真正加速依赖多进程分片，不靠单进程 Promise 并发

## 7. 漫画模块当前在线快照

### 7.1 模块 ID

2026-03-30 在线探测到的漫画模块仍然是：

- `moduleId = 67b7f7e5ac310312c98dc12a`
- `moduleName = 漫画`

模块对象里已经带出排序配置：

- `sortRules[0].val = 1`，`name = 最新上架`
- `sortRules[1].val = 2`，`name = 热门推荐`
- `sortRules[2].val = 3`，`name = 最多观看`
- `sortRules[3].val = 7`，`name = 最多收藏`

### 7.2 漫画模块列表接口

直接用：

- `GET /api/app/vid/module/67b7f7e5ac310312c98dc12a`

至少确认过这些参数可用：

- `pageNumber`
- `pageSize`

2026-03-30 在线探测结果：

- 返回字段：
  - `allVideoInfo`
  - `chosenVideoInfo`
  - `allMediaInfo`
  - `allSection`
  - `hasNext`
- `pageNumber=1&pageSize=50` 时：
  - `allMediaInfoCount = 50`
  - `allSectionCount = 8`
  - `hasNext = true`

### 7.3 漫画分区

当前探测到的 `allSection`：

- `全彩涩漫`
- `精选同人`
- `3D漫画`
- `吸晴韩漫`
- `毁童年系列`
- `萝莉控`
- `NTR牛头人`
- `背德禁忌`

### 7.4 漫画条目字段

`allMediaInfo` 里的样本字段已经确认包括：

- `id`
- `title`
- `mediaType`
- `sId`
- `horizontalCover`
- `verticalCover`
- `totalEpisode`
- `countBrowse`
- `tagDetails`

样本结论：

- `mediaType` 当前样本是 `image`
- `horizontalCover` / `verticalCover` 都是 `imgosne.qqdanb.cn` 下的相对路径
- `tagDetails` 可直接提取漫画标签名

### 7.5 漫画详情接口

- 接口：`GET /api/app/media/info`
- 参数：
  - `id`

2026-03-30 实测返回字段中，最关键的是：

- `defaultContent`
- `defaultContent.urlSet`
- `summary`
- `sectionName`
- `countBrowse`
- `countCollect`
- `countLike`
- `tagDetails`

样本探测结果：

- `defaultContent.urlSet` 条数：`30`
- `defaultContent` 里当前能看到：
  - `id`
  - `name`
  - `cover`
  - `urlSet`

### 7.6 漫画图片地址与解密

图片基址：

- `https://imgosne.qqdanb.cn/{path}`

确认点：

- 图片资源本身可以直接公开访问，不需要单独再带站点 token
- 但图片字节前 100 个字节需要按站点同款 XOR 规则解密
- 解密 key 已经在 `src/frontend/js/api.js` 明确写死：
  - `2019ysapp7527`

前端等价逻辑：

```js
const len = Math.min(100, arr.length);
for (let i = 0; i < len; i++) {
  arr[i] ^= IMG_KEY[i % IMG_KEY.length];
}
```

说明：

- 这个规则已经在当前前端图片加载逻辑里被使用
- 所以下个会话抓漫画时，既可以离线把图片解密后落盘，也可以继续走浏览器侧解密

## 8. 漫画接口当前未完全确认的点

这部分非常关键，不要把“探测结果”误当成“协议常量”。

### 8.1 排序参数名还没确认

我已经做过一轮快速探测：

- 对 `GET /api/app/vid/module/{comicModuleId}` 直接传 `sort=1/2/3/7`
- 返回没有报错，但 `allMediaInfo` 变成空数组

这说明两种可能：

- 真正的排序参数名字不是 `sort`
- 或者漫画“查看更多”页根本不是走这个 endpoint

所以：

- 不要直接把 `sort=1` 写进生产抓取脚本当成已确认规则
- 如果下个会话要抓漫画排序页，先抓浏览器真实 XHR，再补参数名

### 8.2 分区参数名还没确认

我试过这些参数名：

- `sectionID`
- `sectionId`
- `sId`

在 `pageNumber=1&pageSize=5` 的探测里，它们都没有表现出明显区别，返回内容和默认第一页一样。

结论：

- 漫画分区切换所用的真实参数名或请求入口仍未最终确认
- 如果要全量按分区抓，优先抓浏览器请求，不要只靠猜参数名

## 9. 现有脚本各自能做什么

### 9.1 视频全量抓取主脚本

- 文件：`scripts/export/video_json_export_full.js`
- 作用：
  - 登录
  - 拉模块列表
  - 跑模块分页
  - 跑推荐分页
  - 汇总去重
  - 输出 `_by_id/VID{id}.json`

使用示例：

```bash
OUT_DIR=/tmp/video_json \
BASE_URL=https://d3vfkhk0c6rox6.cloudfront.net \
node scripts/export/video_json_export_full.js
```

### 9.2 评论抓取主脚本

- 文件：`comment_export.cjs`
- 作用：
  - 基于 `_by_id` 读取视频
  - 只对有评论的视频打评论接口
  - 合并二级回复
  - 过滤站内垃圾用户
  - 支持双 worker 分片续跑

使用示例：

```bash
OUT_DIR=/var/zip/jiuyao/comments \
WORKER_TOTAL=2 \
WORKER_INDEX=0 \
node comment_export.cjs
```

### 9.3 漫画抓取验证脚本

- 文件：`scripts/export/scrape_comics.cjs`
- 当前价值：
  - 已证明漫画列表在 `allMediaInfo`
  - 已证明详情走 `/media/info`
  - 已证明章节图片列表在 `defaultContent.urlSet`
- 当前缺点：
  - 写死 `/tmp` 输出目录
  - 写死旧的 `VIP_TOKEN`
  - 更适合作为参考实现，不适合直接当最终生产脚本

## 10. 下一个会话最务实的执行顺序

建议直接按下面顺序推进，不要一上来就重写整个抓取器。

1. 先做健康探测。
   对 `d3vfkhk0c6rox6.cloudfront.net` 和 `d3i0tylhl4ykjk.cloudfront.net` 分别执行登录 + `modules/list`，选当下更稳的 host。

2. 先更新视频。
   复用 `scripts/export/video_json_export_full.js` 的逻辑，重新扫模块和推荐分页，把新增视频落进 `_by_id/`。

3. 再补视频详情。
   对新增视频调用 `/vid/info`，保证 `sourceURL`、标签、播放字段完整。

4. 再更新评论。
   直接续跑 `comment_export.cjs`，不要另起一套评论协议实现。

5. 漫画先抓默认分页。
   先只抓 `GET /vid/module/{comicModuleId}` 的默认翻页，把 `allMediaInfo` 和 `media/info` 落盘。

6. 漫画排序和分区最后做。
   真要补“最新上架/热门推荐/最多观看/最多收藏”或各分区分页时，先在浏览器抓真实 XHR，再定参数名。

## 11. 不要再重复踩的坑

- 不要把仓库根 `package.json` 的 `"type": "module"` 忽略掉。抓取脚本现在稳定版多数都在 `.cjs`。
- 不要以为单进程里写了 Promise 并发就会变快。底层很多地方还是 `spawnSync('curl')`。
- 不要把单次登录拿到的 token 硬编码进长期脚本。
- 不要把 `sort=1/2/3/7` 当成漫画排序接口已确认规则。
- 不要把已删除的工作树文件当成当前稳定资产。
- 不要把 `commentCount=0`、`VID.domain[0]`、某个分享域名这些经验值当作永远不变的协议。

## 12. 最短交接结论

如果下个会话只看这一段，也够开始做事：

- 当前站点仍是“登录拿 token + GET 参数加密 + `hash=true` 响应解密”的套路。
- 视频更新主入口仍然是：
  - `/modules/list`
  - `/vid/module/{id}`
  - `/recommend/vid/list`
  - `/vid/info`
  - `/comment/list`
  - `/comment/info`
- 漫画模块当前仍可从 `moduleId=67b7f7e5ac310312c98dc12a` 进入。
- 漫画列表当前已确认在 `/vid/module/{comicModuleId}` 的 `allMediaInfo`。
- 漫画详情当前已确认在 `/media/info?id={mediaId}`。
- 漫画章节图片当前已确认在 `defaultContent.urlSet`。
- 漫画图片基址是 `https://imgosne.qqdanb.cn/`，前 100 字节按 `2019ysapp7527` 做 XOR。
- 漫画排序和分区的真实参数名还没最终确认，下一会话要先抓浏览器真实请求再扩。
