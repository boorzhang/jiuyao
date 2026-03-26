# scripts 目录说明

这个目录用于归档本轮逆向和抓取过程中，原本散落在 `/tmp` 的有用脚本，方便其他会话直接复用。

## 目录结构

```text
/var/zip/jiuyao/scripts
├── export/
│   ├── video_json_export.js
│   └── video_json_export_full.js
├── frontend/
│   ├── video1.js
│   ├── video2.js
│   ├── detail-eec62bb6.js
│   ├── details-efa47c28.js
│   ├── index-2be5d30c.js
│   ├── index-678098ae.js
│   ├── index-90da781d.js
│   ├── index-cc49e040.js
│   └── index-d92403ea.js
└── README.md
```

## 文件用途

### export

- `video_json_export.js`
  - 早期验证版导出脚本
  - 适合快速验证登录、加解密、模块列表、m3u8 拼接是否仍然有效
- `video_json_export_full.js`
  - 全量视频导出主脚本
  - 用它产出了当前的 `75186` 条视频数据

### frontend

- `video2.js`
  - 最直接的视频接口封装证据
  - 含 `/vid/info`、`/comment/list`、`/recommend/vid/list` 等 API 名称
- `details-efa47c28.js`
  - 最关键的详情页分包
  - 含 m3u8 播放地址拼接、评论页加载、线路切换逻辑
- `index-2be5d30c.js`
  - 列表卡片到详情页的跳转关系
- `index-678098ae.js`
  - 试看结束和购买逻辑
- `index-90da781d.js`
  - VIP、预售、线路切换相关逻辑
- `video1.js`
  - 视频列表状态管理
- `detail-eec62bb6.js`
  - 图片/封面详情相关分包，上下文材料
- `index-cc49e040.js`
  - 分享弹层相关分包，上下文材料
- `index-d92403ea.js`
  - 广告轮播分包，上下文材料

## 明确没有复制的内容

- `/tmp/index-homepage-sort-check.js`
  - 与当前目标站无关
- `/tmp/login_resp.json`
  - 临时登录响应，不适合作为长期资产
- `/tmp/video_json`
  - 数据目录，不是脚本

## 推荐阅读顺序

如果目标是继续优化视频/评论抓取，建议先读：

1. `export/video_json_export_full.js`
2. `frontend/video2.js`
3. `frontend/details-efa47c28.js`
4. `/var/zip/jiuyao/comment_export.js`
5. `/var/zip/jiuyao/lib/comment_export_core.js`
