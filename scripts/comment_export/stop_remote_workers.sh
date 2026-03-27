#!/usr/bin/env bash

# 停止远端评论抓取 worker。
#
# 使用示例：
#   bash scripts/comment_export/stop_remote_workers.sh
#   ROOT_DIR=/opt/zip/jiuyao WORKER_TOTAL=2 bash scripts/comment_export/stop_remote_workers.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

for ((worker_index = 0; worker_index < WORKER_TOTAL; worker_index += 1)); do
  stop_worker "$worker_index"
done

rm -f "$(watchdog_pid_file)"
log_note "全部 worker 停止检查完成"
