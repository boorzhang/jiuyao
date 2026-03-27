#!/bin/bash
# 批量上传 r2-data/ 到 Cloudflare R2

set -e

BUCKET="jiuyao-data"
DATA_DIR="r2-data"

if [ ! -d "$DATA_DIR" ]; then
  echo "错误: $DATA_DIR 目录不存在，请先运行 npm run build:data"
  exit 1
fi

echo "=== 开始上传到 R2 ==="
echo "桶: $BUCKET"
echo "数据目录: $DATA_DIR"

# 上传 data/ 目录
echo ""
echo "[1/2] 上传数据 JSON..."
find "$DATA_DIR/data" -type f | while read -r file; do
  key="${file#$DATA_DIR/}"
  echo "  上传: $key"
  npx wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "application/json"
done

# 上传 m3u8/ 目录
echo ""
echo "[2/2] 上传 M3U8..."
find "$DATA_DIR/m3u8" -type f | while read -r file; do
  key="${file#$DATA_DIR/}"
  ext="${file##*.}"
  case "$ext" in
    m3u8) ct="application/vnd.apple.mpegurl" ;;
    key)  ct="application/octet-stream" ;;
    *)    ct="application/octet-stream" ;;
  esac
  echo "  上传: $key"
  npx wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "$ct"
done

echo ""
echo "=== 上传完成 ==="
