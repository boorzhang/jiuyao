#!/usr/bin/env bash

# 远端评论抓取 watchdog。
#
# 使用示例：
#   bash scripts/comment_export/watchdog.sh
#   ROOT_DIR=/opt/zip/jiuyao WATCHDOG_INTERVAL_SEC=60 bash scripts/comment_export/watchdog.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

ensure_runtime_dirs
echo "$$" > "$(watchdog_pid_file)"
trap 'rm -f "$(watchdog_pid_file)"' EXIT

log_note "watchdog 启动 interval=${WATCHDOG_INTERVAL_SEC}s worker_total=${WORKER_TOTAL}" | tee -a "$WATCHDOG_LOG_FILE"

while true; do
  for ((worker_index = 0; worker_index < WORKER_TOTAL; worker_index += 1)); do
    pid="$(read_pid_file "$(worker_pid_file "$worker_index")")"
    if ! is_pid_running "$pid"; then
      log_note "检测到 worker-$worker_index 未运行，准备重启" | tee -a "$WATCHDOG_LOG_FILE"
      start_worker "$worker_index" | tee -a "$WATCHDOG_LOG_FILE"
    fi
  done

  sleep "$WATCHDOG_INTERVAL_SEC"
done
