#!/usr/bin/env node

/**
 * 解密漫画图片
 * 将加密的漫画图片解密后保存
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const IMG_CDN = 'https://imgosne.qqdanb.cn';
const IMG_KEY = '2019ysapp7527';
const OUT_DIR = '/tmp/comics_decrypted';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function curl(args) {
  const res = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(res.stderr);
  return res.stdout;
}

function decryptImage(buffer) {
  const arr = Buffer.from(buffer);
  const len = Math.min(100, arr.length);
  for (let i = 0; i < len; i++) {
    arr[i] ^= IMG_KEY.charCodeAt(i % IMG_KEY.length);
  }
  return arr;
}

async function fetchAndDecrypt(imagePath) {
  const url = imagePath.startsWith('http') ? imagePath : `${IMG_CDN}/${imagePath}`;
  log('下载:', url);
  
  const bin = curl(['-sL', url]);
  const decrypted = decryptImage(bin);
  
  return decrypted;
}

async function main() {
  const comicsDir = '/tmp/comics_json/_by_id';
  const files = fs.readdirSync(comicsDir).filter(f => f.endsWith('.json'));
  
  fs.mkdirSync(OUT_DIR, { recursive: true });
  
  let totalComics = 0;
  let totalPages = 0;
  
  for (const file of files) {
    const comic = JSON.parse(fs.readFileSync(path.join(comicsDir, file), 'utf8'));
    const comicDir = path.join(OUT_DIR, comic.id);
    fs.mkdirSync(comicDir, { recursive: true });
    
    log(`[${totalComics + 1}/${files.length}] 处理漫画: ${comic.title}, ${comic.chapterCount || 0} 页`);
    totalComics++;
    
    if (!comic.chapters || comic.chapters.length === 0) {
      log(`  无章节数据，跳过`);
      continue;
    }
    
    for (let i = 0; i < comic.chapters.length; i++) {
      const chapter = comic.chapters[i];
      const outFile = path.join(comicDir, `${String(i+1).padStart(3, '0')}.jpg`);
      
      if (fs.existsSync(outFile)) continue;
      
      try {
        const decrypted = await fetchAndDecrypt(chapter.path);
        fs.writeFileSync(outFile, decrypted);
        totalPages++;
      } catch (e) {
        log(`  失败: ${chapter.path}`, e.message);
      }
    }
  }
  
  log(`完成! 共处理 ${totalComics} 部漫画, ${totalPages} 张图片`);
  log('输出目录:', OUT_DIR);
}

main().catch(err => {
  console.error('[FATAL]', err.stack || err);
  process.exit(1);
});
