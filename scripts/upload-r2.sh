#!/bin/bash
# 按 release 前缀上传 r2-data/ 到 Cloudflare R2。
#
# 使用示例：
#   RELEASE_ID=20260327-demo bash scripts/upload-r2.sh
#   RELEASE_ID=20260327-demo bash scripts/upload-r2.sh --dry-run

set -euo pipefail

BUCKET="${BUCKET:-jiuyao-data}"
DATA_DIR="${DATA_DIR:-r2-data}"
DRY_RUN=0

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

if [ -z "${RELEASE_ID:-}" ]; then
  echo "错误: 缺少 RELEASE_ID，请先设置统一发布版本号"
  exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "错误: $DATA_DIR 目录不存在，请先运行 npm run build:release 或 npm run build:data"
  exit 1
fi

RELEASE_PREFIX="releases/$RELEASE_ID"
DATA_PREFIX="releases/$RELEASE_ID/data"
M3U8_PREFIX="releases/$RELEASE_ID/m3u8"
JSON_CACHE_CONTROL="public, max-age=300, s-maxage=3600, stale-while-revalidate=300"
M3U8_CACHE_CONTROL="public, max-age=60, s-maxage=600, stale-while-revalidate=60"
KEY_CACHE_CONTROL="public, max-age=86400, s-maxage=86400"

echo "=== 开始上传到 R2 ==="
echo "桶: $BUCKET"
echo "数据目录: $DATA_DIR"
echo "RELEASE_ID: $RELEASE_ID"
echo "上传前缀: $RELEASE_PREFIX"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "模式: --dry-run"
fi

upload_object() {
  local key="$1"
  local file="$2"
  local content_type="$3"
  local cache_control="$4"

  echo "  上传: $key"
  echo "    Content-Type: $content_type"
  echo "    Cache-Control: $cache_control"

  if [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi

  npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" \
    --content-type "$content_type" \
    --cache-control "$cache_control"
}

echo ""
echo "[1/2] 上传数据 JSON..."
if [ -d "$DATA_DIR/data" ]; then
  find "$DATA_DIR/data" -type f | sort | while read -r file; do
    rel_path="${file#$DATA_DIR/}"
    key="${rel_path/data/$DATA_PREFIX}"
    upload_object "$key" "$file" "application/json" "$JSON_CACHE_CONTROL"
  done
fi

echo ""
echo "[2/2] 上传 M3U8..."
if [ -d "$DATA_DIR/m3u8" ]; then
  find "$DATA_DIR/m3u8" -type f | sort | while read -r file; do
    rel_path="${file#$DATA_DIR/}"
    key="${rel_path/m3u8/$M3U8_PREFIX}"
    ext="${file##*.}"

    case "$ext" in
      json)
        content_type="application/json"
        cache_control="$JSON_CACHE_CONTROL"
        ;;
      m3u8)
        content_type="application/vnd.apple.mpegurl"
        cache_control="$M3U8_CACHE_CONTROL"
        ;;
      key)
        content_type="application/octet-stream"
        cache_control="$KEY_CACHE_CONTROL"
        ;;
      *)
        content_type="application/octet-stream"
        cache_control="$KEY_CACHE_CONTROL"
        ;;
    esac

    upload_object "$key" "$file" "$content_type" "$cache_control"
  done
fi

echo ""
echo "=== 上传完成 ==="
