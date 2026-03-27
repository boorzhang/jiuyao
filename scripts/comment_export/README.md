# comment_export 脚本归档

这个目录用于固定保存当前可用的评论抓取脚本，方便其他会话或服务器环境直接复用，不必再从仓库根目录里手工找依赖关系。

## 文件说明

- `comment_export.cjs`
  - 当前评论抓取主脚本
  - 已支持 `WORKER_TOTAL` / `WORKER_INDEX` 分片
- `comment_export.js`
  - 兼容入口
  - 内部会转到 `comment_export.cjs`
- `comment_export_core.cjs`
  - 纯逻辑工具
  - 包含评论过滤、延后重试、并发分片辅助函数
- `comment_export_core.test.cjs`
  - 核心回归测试
- `common.sh`
  - 远端启动、停止、状态查看、watchdog 共用函数
- `start_remote_workers.sh`
  - 启动远端两个评论抓取 worker
- `stop_remote_workers.sh`
  - 停止远端两个评论抓取 worker
- `status_remote.sh`
  - 查看聚合摘要和每个 worker 当前状态
- `watchdog.sh`
  - 定时检查 worker 是否掉线
  - 掉线时自动拉起

## 当前规则

1. 过滤 `userID = 100001`
2. 如果过滤后评论为空，则不写 JSON
3. 对 `4010` 耗尽错误做延后重试
4. 对 `curl_transport_error` 也做延后重试
5. 对登录返回缺少 `token` 或登录响应解析异常也做重试
6. 续跑只认可 `exportVersion === 2` 且 `fetchStatus === 'ok'`

## 使用示例

### 单进程续跑

```bash
cd /var/zip/jiuyao
OUT_DIR=/var/zip/jiuyao/comments MAX_DEFERRED_ATTEMPTS=2 node comment_export.cjs
```

### 双分片续跑

```bash
cd /var/zip/jiuyao
OUT_DIR=/var/zip/jiuyao/comments MAX_DEFERRED_ATTEMPTS=2 WORKER_TOTAL=2 WORKER_INDEX=0 node comment_export.cjs
OUT_DIR=/var/zip/jiuyao/comments MAX_DEFERRED_ATTEMPTS=2 WORKER_TOTAL=2 WORKER_INDEX=1 node comment_export.cjs
```

### 总摘要文件

双分片运行时，脚本会自动维护：

- `comments/_summary.worker-0.json`
- `comments/_summary.worker-1.json`
- `comments/_summary.aggregate.json`
- `comments/_summary.json`

## 远端运维脚本用法

### 启动 worker

```bash
cd /opt/zip/jiuyao/scripts/comment_export
bash start_remote_workers.sh
```

### 查看状态

```bash
cd /opt/zip/jiuyao/scripts/comment_export
bash status_remote.sh
```

### 启动 watchdog

```bash
cd /opt/zip/jiuyao/scripts/comment_export
nohup bash watchdog.sh > /opt/zip/jiuyao/logs/comment.watchdog.stdout.log 2>&1 < /dev/null &
```

### 停止 worker

```bash
cd /opt/zip/jiuyao/scripts/comment_export
bash stop_remote_workers.sh
```
