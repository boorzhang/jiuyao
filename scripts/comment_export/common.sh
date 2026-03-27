#!/usr/bin/env bash

# 远端评论抓取公共函数。
#
# 使用示例：
#   ROOT_DIR=/opt/zip/jiuyao source ./common.sh
#   start_worker 0
#   print_worker_status 0

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/zip/jiuyao}"
SOURCE_DIR="${SOURCE_DIR:-$ROOT_DIR/_by_id}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/comments}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/run}"
NODE_BIN="${NODE_BIN:-node}"
WORKER_TOTAL="${WORKER_TOTAL:-2}"
MAX_DEFERRED_ATTEMPTS="${MAX_DEFERRED_ATTEMPTS:-2}"
WATCHDOG_INTERVAL_SEC="${WATCHDOG_INTERVAL_SEC:-60}"
WATCHDOG_LOG_FILE="${WATCHDOG_LOG_FILE:-$LOG_DIR/comment.watchdog.log}"

log_note() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"
}

ensure_runtime_dirs() {
  mkdir -p "$OUT_DIR" "$OUT_DIR/_by_id" "$LOG_DIR" "$RUN_DIR"
}

worker_pid_file() {
  printf '%s/comment.worker-%s.pid\n' "$RUN_DIR" "$1"
}

worker_log_file() {
  printf '%s/comment.worker-%s.log\n' "$LOG_DIR" "$1"
}

worker_summary_file() {
  printf '%s/_summary.worker-%s.json\n' "$OUT_DIR" "$1"
}

watchdog_pid_file() {
  printf '%s/comment.watchdog.pid\n' "$RUN_DIR"
}

read_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    tr -d ' \n\r\t' < "$pid_file"
  fi
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

print_summary_brief() {
  local summary_file="$1"

  if [[ ! -f "$summary_file" ]]; then
    echo 'summary=missing'
    return 0
  fi

  "$NODE_BIN" -e "
    const fs = require('fs');
    const summary = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const stats = summary.stats || {};
    const extra = summary.summaryKind ? ' kind=' + summary.summaryKind : '';
    console.log(
      'processed=' + (stats.processed || 0) +
      ' fetched=' + (stats.fetchedFromApi || 0) +
      ' skippedExisting=' + (stats.skippedExisting || 0) +
      ' failed=' + (stats.failed || 0) +
      ' deferred=' + (stats.deferredQueued || 0) +
      ' relogin=' + (stats.reloginCount || 0) +
      extra
    );
  " "$summary_file"
}

start_worker() {
  local worker_index="$1"
  local pid_file log_file existing_pid

  ensure_runtime_dirs
  pid_file="$(worker_pid_file "$worker_index")"
  log_file="$(worker_log_file "$worker_index")"
  existing_pid="$(read_pid_file "$pid_file")"

  if is_pid_running "$existing_pid"; then
    log_note "worker-$worker_index 已在运行 pid=$existing_pid"
    return 0
  fi

  nohup env \
    SOURCE_DIR="$SOURCE_DIR" \
    OUT_DIR="$OUT_DIR" \
    MAX_DEFERRED_ATTEMPTS="$MAX_DEFERRED_ATTEMPTS" \
    WORKER_TOTAL="$WORKER_TOTAL" \
    WORKER_INDEX="$worker_index" \
    "$NODE_BIN" "$ROOT_DIR/comment_export.cjs" \
    > "$log_file" 2>&1 < /dev/null &

  echo "$!" > "$pid_file"
  log_note "worker-$worker_index 已启动 pid=$!"
}

stop_worker() {
  local worker_index="$1"
  local pid_file pid

  pid_file="$(worker_pid_file "$worker_index")"
  pid="$(read_pid_file "$pid_file")"

  if is_pid_running "$pid"; then
    kill "$pid"
    log_note "worker-$worker_index 已停止 pid=$pid"
  else
    log_note "worker-$worker_index 当前未运行"
  fi

  rm -f "$pid_file"
}

print_worker_status() {
  local worker_index="$1"
  local pid_file pid

  pid_file="$(worker_pid_file "$worker_index")"
  pid="$(read_pid_file "$pid_file")"

  if is_pid_running "$pid"; then
    printf 'worker-%s running pid=%s ' "$worker_index" "$pid"
  else
    printf 'worker-%s stopped pid=%s ' "$worker_index" "${pid:-none}"
  fi

  print_summary_brief "$(worker_summary_file "$worker_index")"
}
