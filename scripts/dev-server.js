import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const FRONTEND_DIR = join(ROOT, 'src', 'frontend');
const DATA_DIR = join(ROOT, 'r2-data');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.key': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
};

function serve(dir, req, res) {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';

  const filePath = join(dir, decodeURIComponent(pathname));
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(filePath));
  return true;
}

// 前端服务 (port 3000)
const frontendServer = createServer((req, res) => {
  if (!serve(FRONTEND_DIR, req, res)) {
    // SPA fallback
    const indexPath = join(FRONTEND_DIR, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(indexPath));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

// 数据服务 (port 3001)
const dataServer = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }
  if (!serve(DATA_DIR, req, res)) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('Not Found');
  }
});

frontendServer.listen(3000, () => {
  console.log('前端服务: http://localhost:3000');
});

dataServer.listen(3001, () => {
  console.log('数据服务: http://localhost:3001');
});
