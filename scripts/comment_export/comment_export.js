#!/usr/bin/env node

/**
 * 评论导出脚本的 ESM 入口包装层。
 *
 * 使用示例：
 *   OUT_DIR=/var/zip/jiuyao/comments \
 *   /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.js
 *
 *   OUT_DIR=/var/zip/jiuyao/comments \
 *   /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.cjs
 */
import './comment_export.cjs';
