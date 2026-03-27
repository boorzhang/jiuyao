# 项目说明

- 先阅读 `CLAUDE.md`，其中包含本项目由 GSD 生成的项目背景、技术栈、代码约定、架构摘要和工作流约束。
- 默认使用中文简体回复。
- 生成代码时：
  - 注释使用中文
  - 提供使用示例

# 工作方式

- 这是一个 brownfield 项目，核心目标是把公开访问流量继续收敛在 `Cloudflare Pages + R2 + 极薄 Worker` 的静态分发边界内。
- 任何会把公开高流量路径重新引入 Worker / Functions 计算的方案，都应先明确说明成本影响。
- 优先遵守 `.planning/PROJECT.md`、`.planning/REQUIREMENTS.md`、`.planning/ROADMAP.md`、`.planning/STATE.md` 中的当前项目上下文。
