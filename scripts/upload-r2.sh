#!/bin/bash
# 增量上传 r2-data/ 到 Cloudflare R2（固定前缀，不含 releaseId）。
# 通过本地清单 .r2-uploaded.txt 跟踪已上传文件，只上传新增的。
#
# 使用示例：
#   bash scripts/upload-r2.sh
#   bash scripts/upload-r2.sh --dry-run
#   bash scripts/upload-r2.sh --full        # 强制全量上传

set -euo pipefail

BUCKET="${BUCKET:-jiuyao-data}"
DATA_DIR="${DATA_DIR:-r2-data}"
MANIFEST=".r2-uploaded.txt"
DRY_RUN=0
FULL=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --full) FULL=1 ;;
  esac
done

if [ ! -d "$DATA_DIR" ]; then
  echo "错误: $DATA_DIR 目录不存在，请先运行 npm run build:data"
  exit 1
fi

JSON_CACHE="public, max-age=300, s-maxage=3600, stale-while-revalidate=300"
M3U8_CACHE="public, max-age=60, s-maxage=600, stale-while-revalidate=60"
KEY_CACHE="public, max-age=86400, s-maxage=86400"

echo "=== 开始增量上传到 R2 ==="
echo "桶: $BUCKET"
echo "数据目录: $DATA_DIR"
if [ "$FULL" -eq 1 ]; then echo "模式: 全量上传"; fi
if [ "$DRY_RUN" -eq 1 ]; then echo "模式: --dry-run"; fi

# 列出所有本地文件（相对于 DATA_DIR）
LOCAL_LIST=$(mktemp)
trap 'rm -f "$LOCAL_LIST" "$TO_UPLOAD"' EXIT
find "$DATA_DIR" -type f | sed "s|^$DATA_DIR/||" | sort > "$LOCAL_LIST"
TOTAL=$(wc -l < "$LOCAL_LIST" | tr -d ' ')
echo "本地文件总数: $TOTAL"

# 计算需要上传的文件
TO_UPLOAD=$(mktemp)
if [ "$FULL" -eq 1 ] || [ ! -f "$MANIFEST" ]; then
  cp "$LOCAL_LIST" "$TO_UPLOAD"
else
  EXISTING=$(wc -l < "$MANIFEST" | tr -d ' ')
  echo "已上传清单: $EXISTING 个文件"
  # comm -23: 只在左边（本地有、清单没有）
  sort "$MANIFEST" | comm -23 "$LOCAL_LIST" - > "$TO_UPLOAD"
fi

UPLOAD_COUNT=$(wc -l < "$TO_UPLOAD" | tr -d ' ')
SKIP_COUNT=$((TOTAL - UPLOAD_COUNT))
echo "需要上传: $UPLOAD_COUNT, 跳过: $SKIP_COUNT"
echo ""

if [ "$UPLOAD_COUNT" -eq 0 ]; then
  echo "=== 没有新文件需要上传 ==="
  exit 0
fi

N=0
while IFS= read -r rel_path; do
  N=$((N + 1))
  file="$DATA_DIR/$rel_path"
  ext="${file##*.}"

  case "$ext" in
    m3u8) content_type="application/vnd.apple.mpegurl"; cache_control="$M3U8_CACHE" ;;
    key)  content_type="application/octet-stream"; cache_control="$KEY_CACHE" ;;
    json) content_type="application/json"; cache_control="$JSON_CACHE" ;;
    *)    content_type="application/octet-stream"; cache_control="$KEY_CACHE" ;;
  esac

  echo "  [$N/$UPLOAD_COUNT] $rel_path"

  if [ "$DRY_RUN" -eq 0 ]; then
    npx wrangler r2 object put "$BUCKET/$rel_path" \
      --file "$file" \
      --content-type "$content_type" \
      --cache-control "$cache_control"
  fi

  echo "$rel_path" >> "$MANIFEST"
done < "$TO_UPLOAD"

# 排序清单去重
if [ -f "$MANIFEST" ]; then
  sort -u "$MANIFEST" -o "$MANIFEST"
fi

echo ""
echo "=== 上传完成 ==="
echo "总文件: $TOTAL, 跳过: $SKIP_COUNT, 新上传: $UPLOAD_COUNT"
