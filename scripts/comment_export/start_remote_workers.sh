#!/usr/bin/env bash

# 启动远端评论抓取 worker。
#
# 使用示例：
#   bash scripts/comment_export/start_remote_workers.sh
#   ROOT_DIR=/opt/zip/jiuyao WORKER_TOTAL=2 bash scripts/comment_export/start_remote_workers.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

for ((worker_index = 0; worker_index < WORKER_TOTAL; worker_index += 1)); do
  start_worker "$worker_index"
done

log_note "全部 worker 启动检查完成"
