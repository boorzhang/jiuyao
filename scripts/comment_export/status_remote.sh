#!/usr/bin/env bash

# 查看远端评论抓取状态。
#
# 使用示例：
#   bash scripts/comment_export/status_remote.sh
#   ROOT_DIR=/opt/zip/jiuyao bash scripts/comment_export/status_remote.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

echo "root_dir=$ROOT_DIR"
echo "source_dir=$SOURCE_DIR"
echo "out_dir=$OUT_DIR"
echo "worker_total=$WORKER_TOTAL"

watchdog_pid="$(read_pid_file "$(watchdog_pid_file)")"
if is_pid_running "$watchdog_pid"; then
  echo "watchdog=running pid=$watchdog_pid"
else
  echo "watchdog=stopped pid=${watchdog_pid:-none}"
fi

echo "aggregate $(print_summary_brief "$OUT_DIR/_summary.aggregate.json")"

for ((worker_index = 0; worker_index < WORKER_TOTAL; worker_index += 1)); do
  print_worker_status "$worker_index"
done
