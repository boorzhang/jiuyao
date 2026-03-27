# 测试模式

**分析日期：** 2026-03-27

## 测试框架

**运行器：**
- 仓库使用 Node 内建测试运行器 `node:test`；证据见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/store.test.js`、`tests/comment_export_core.test.cjs`。
- 未检测到 `jest.config.*`、`vitest.config.*` 或其他独立测试配置文件；配置入口直接写在 `package.json`。

**断言库：**
- 全部测试使用 `node:assert/strict`，见 `tests/categories.test.js`、`tests/store.test.js`、`tests/comment_export_core.test.cjs`。

**运行命令：**
```bash
npm test                                 # 执行 `package.json` 中的默认测试入口，仅覆盖 `tests/*.test.js`
node --test tests/comment_export_core.test.cjs
node --test tests/*.test.js tests/comment_export_core.test.cjs
```

## 测试文件组织

**位置：**
- 主测试目录是独立的 `tests/`，而不是与源码同目录共置。
- 归档脚本目录里保留一份镜像测试 `scripts/comment_export/comment_export_core.test.cjs`，但默认命令不会执行它。

**命名：**
- ESM 测试文件统一是 `.test.js`，对应 `src/build/*.js` 的模块，例如 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`。
- CommonJS 测试文件使用 `.test.cjs`，当前只有评论导出核心的 `tests/comment_export_core.test.cjs`。

**结构：**
```text
tests/
├── categories.test.js
├── comment_export_core.test.cjs
├── feeds.test.js
├── recommend.test.js
└── store.test.js
```

## 测试结构

**套件组织：**
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('recommend', () => {
  it('推荐不包含自身，每个视频恰好4条推荐', () => {
    // 准备数据
    // 调用被测函数
    // 断言结果
  });
});
```

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('normalizeWorkerCount 会把非法并发值归一化到 1', () => {
  assert.equal(normalizeWorkerCount('abc'), 1);
});
```

**模式：**
- 构建模块测试遵循“准备临时目录 -> 调用构建函数 -> 读取输出 JSON -> 断言内容 -> `rmSync` 清理”的模式，见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`。
- 单纯逻辑测试直接构造对象字面量，不启动真实网络或子进程，见 `tests/comment_export_core.test.cjs`。
- 需要共享状态时使用 `beforeEach` 重建环境，见 `tests/store.test.js`。

## Mock 与替身

**框架：**
- 未检测到 `sinon`、`jest.mock`、`vi.mock` 等 mocking 框架；全部替身都是手写对象或类。

**模式：**
```javascript
class MockStorage {
  constructor() { this.data = {}; }
  getItem(key) { return this.data[key] ?? null; }
  setItem(key, value) { this.data[key] = String(value); }
}
```

```javascript
const tmpDir = mkdtempSync(join(tmpdir(), 'cat-test-'));
const outDir = mkdtempSync(join(tmpdir(), 'cat-out-'));
```

**适合 mock 的对象：**
- 浏览器专属存储能力通过轻量替身模拟，见 `tests/store.test.js` 的 `MockStorage`。

**不做 mock 的对象：**
- 构建输出文件不会被 mock，而是直接落到临时目录并回读验证，见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`。
- 评论导出核心逻辑不会 mock 子函数；测试直接调用 `lib/comment_export_core.cjs` 导出的纯函数。

## Fixtures 与工厂

**测试数据：**
```javascript
function makeVideo(id, playCount, categoryList = ['测试']) {
  return {
    id,
    title: `视频${id}`,
    raw: { playCount, createdAt: '2024-01-01T00:00:00+08:00' },
  };
}
```

```javascript
const comments = [
  { id: 'c1', userID: 100001, allReplies: [{ id: 'r1', userID: 200001 }] },
  { id: 'c2', userID: 200002, allReplies: [{ id: 'r2', userID: 100001 }] },
];
```

**位置：**
- 未检测到独立 `fixtures/`、`factories/` 或 `mocks/` 目录。
- 所有工厂函数和样本数据都写在各自测试文件顶部，见 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/comment_export_core.test.cjs`。

## 覆盖情况

**要求：**
- 未检测到覆盖率门槛、覆盖率上报脚本或 `--coverage` 命令；`package.json` 没有 coverage 相关脚本。

**查看覆盖率：**
```bash
未检测到仓库内现成命令
```

**当前覆盖重点：**
- `tests/categories.test.js` 覆盖 `src/build/categories.js` 的字段裁剪、排序和分页写出。
- `tests/feeds.test.js` 覆盖 `src/build/feeds.js` 的推荐/最新排序与分页大小。
- `tests/recommend.test.js` 覆盖 `src/build/recommend.js` 的互素常量、去自推荐、覆盖率和确定性。
- `tests/comment_export_core.test.cjs` 覆盖 `lib/comment_export_core.cjs` 的评论参数拼装、过滤、延后重试和 worker 聚合摘要。

## 测试类型

**单元测试：**
- 主体是纯函数或轻 I/O 构建函数的单元测试，文件集中在 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/comment_export_core.test.cjs`。

**轻量集成测试：**
- `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js` 会真实创建目录、写入最小输入文件、再读取生成的 JSON，属于文件系统级轻量集成测试。

**E2E 测试：**
- 未检测到浏览器自动化、PWA 冒烟或脚本链路的端到端测试；仓库中没有 Playwright、Cypress、WebdriverIO 等配置。

## 现有覆盖边界

**默认入口会跑到的内容：**
- `npm test` 当前只执行 `node --test 'tests/*.test.js'`，也就是 `tests/categories.test.js`、`tests/feeds.test.js`、`tests/recommend.test.js`、`tests/store.test.js`。
- 本次分析时运行 `npm test` 得到 15 个测试全部通过。

**需要手工补跑的内容：**
- `tests/comment_export_core.test.cjs` 不在默认 glob 内，需要手工执行 `node --test tests/comment_export_core.test.cjs`。
- 本次分析时运行 `node --test tests/comment_export_core.test.cjs` 得到 15 个测试全部通过。

**当前未覆盖的生产代码：**
- `src/build/authors.js`、`src/build/config.js`、`src/build/details.js`、`src/build/index.js` 没有对应测试文件。
- `src/frontend/js/api.js`、`src/frontend/js/app.js`、`src/frontend/js/imgloader.js`、`src/frontend/js/pages/*.js`、`src/frontend/js/store.js`、`src/frontend/sw.js` 没有直接导入式测试。
- `scripts/comment_export/comment_export.cjs` 与 `scripts/export/*.js`、`scripts/upload-r2.sh` 没有自动化测试。

## 已知缺口

**逻辑替身替代真实模块：**
- `tests/store.test.js` 没有导入 `src/frontend/js/store.js`，而是在测试文件内部复制了一套 `createStore` 逻辑；这说明它验证的是“镜像实现”，不是生产模块本身。

**归档测试副本不可直接运行：**
- `scripts/comment_export/comment_export_core.test.cjs` 与 `tests/comment_export_core.test.cjs` 内容相同，但当前直接执行 `node --test scripts/comment_export/comment_export_core.test.cjs` 会因为 `require('../lib/comment_export_core.cjs')` 找不到目标而失败。
- 因此真正可执行的主测试文件是 `tests/comment_export_core.test.cjs`，归档副本更像文档/镜像资产。

**前端页面缺少交互验证：**
- `src/frontend/js/pages/home.js`、`src/frontend/js/pages/detail.js`、`src/frontend/js/pages/douyin.js`、`src/frontend/js/pages/mine.js` 依赖 DOM、滚动和播放器事件，但仓库里没有 DOM 测试环境或浏览器测试。

**构建总入口缺少回归：**
- `src/build/index.js` 串联了分类、feed、推荐、详情、作者、M3U8 复制与 `config.json` 生成，但当前没有“一次运行验证完整输出树”的回归测试。

## 常见模式

**异步测试：**
```javascript
it('45条视频分3页(20+20+5)，按 playCount 降序', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  // 准备输入
  // 调用 buildCategories
  // 读取输出并断言
});
```

**错误与边界测试：**
```javascript
test('shouldDeferFailedVideo 达到上限或非 4010 错误时不延后', () => {
  assert.equal(
    shouldDeferFailedVideo({
      error: { failureKind: 'network_timeout' },
      deferredAttempt: 0,
      maxDeferredAttempts: 2,
    }),
    false
  );
});
```

## CI / 自动化

**现状：**
- `.github/workflows/deploy.yml` 是部署工作流，不是测试工作流。
- 该工作流当前只做 `actions/checkout`、`actions/setup-node`、`npm ci`、`npm run build:frontend` 和 Cloudflare Pages 部署，没有 `npm test`、没有手工补跑 `tests/comment_export_core.test.cjs`，也没有覆盖率上报。

**结论：**
- 仓库存在本地可运行的 Node 原生测试，但没有自动化测试闸门。
- 默认测试入口与完整测试集合不一致；要获得当前仓库已存在的全部自动化回归，需要同时执行 `npm test` 和 `node --test tests/comment_export_core.test.cjs`。

---

*测试分析：2026-03-27*
