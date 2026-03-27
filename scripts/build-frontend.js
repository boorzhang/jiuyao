import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src', 'frontend');
const DIST = join(ROOT, 'dist');

mkdirSync(DIST, { recursive: true });
cpSync(SRC, DIST, { recursive: true });

console.log(`前端文件已复制到 ${DIST}`);
