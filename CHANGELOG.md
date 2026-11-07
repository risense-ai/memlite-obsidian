# Changelog

## 0.1.0 — 2026-11-07

首个版本。memlite ↔ Obsidian 单向桥：导入器 + 导出器 + 校验。

### 新增

- `import <vault>`：Obsidian vault → memlite 一次性快照导入
  - 字段映射：frontmatter id/tags/project/created/importance/kind/title + 自定义键平铺进 extra
  - 目录结构 ↔ 因果链互转（目录条 kind=Context；folder note 合并）
  - 三级去重：frontmatter.id（12 hex）→ sha1(title+content) → obsidian_path
  - `--write-id` 回填 frontmatter.id；`--dry-run` 预告；`--project` 兜底；单条失败不阻塞整批
- `export <output>`：memlite → Obsidian vault 一次性导出
  - 因果树 → 目录树（有子 → 文件+同名目录；无子 → 文件）
  - 文件名清洗（禁字/全角/超长/冲突 `-1`）与 frontmatter 生成
  - 默认拒绝覆盖非空目录，`--overwrite` 先清空
- `status <vault>`：vault 各文件相对当前库的 synced/outdated/missing 三态
- 互通保证：导出 → 再导入 → 幂等（逐条 id/title/content/tags/project/ts/parent/source_hash 等价）
- 依赖 `@rsrsai/memlite@^0.1.0`（file 装配）；主类能力扩展见 memlite-js 仓 7366d32 与后续提交（putFull / remember id+ts+extra / update extra+project / attach 升根）

### 边界

- 空 vault / 空文件 / 二进制 / 循环软链 / 非法 id / 撞固定字段的 frontmatter 键——详见 [docs/edge-cases.md](./docs/edge-cases.md)

### 未含（按计划）

- GitHub Actions CI 与 npm 发布（仓库未建，待用户明确）
- M4 watch 模式（可选里程碑）
