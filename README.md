# memlite-obsidian

> memlite ↔ Obsidian 单向桥梁——两个单向工具（导入/导出），不是双向同步。
> 基于 [`@rsrsai/memlite`](https://github.com/risense-ai/memlite-js)。

## 状态

**M1 导入器 + M2 导出器已实现**（0.1.0，37 测试绿，互通幂等已真机验证）。CI 与 npm 发布待仓库创建。M4 watch 模式未做（可选里程碑）。

## 心智模型

**两个工作区，单向流动，互不污染**：

- **Obsidian = 人的长期知识库**（人写、整理、维护）
- **memlite = AI 的工作记忆**（AI 读、召回、沉淀）
- **导入 = 人主动喂给 AI**（一次性快照）
- **导出 = AI 把结论沉淀给人**（一次性快照，覆盖式）

**绝不做双向实时同步**——冲突语义混乱、删除方向歧义、相互污染。

## 安装

```bash
npm install -g @rsrsai/memlite-obsidian   # 发布后
# 或本仓开发：pnpm install && npm run build && node dist/cli.js
```

## 用法

```bash
# 把 Obsidian vault 导入 memlite（首次加 --write-id 回填 frontmatter.id）
memlite-obsidian import ~/Documents/my-vault/ --project my-proj --write-id

# 把 memlite 库导出成 Obsidian vault（默认拒绝覆盖非空目录）
memlite-obsidian export ~/Documents/memlite-vault/

# 校验：vault 里哪些文件已入 memlite（= synced  ~ outdated  + missing）
memlite-obsidian status ~/Documents/my-vault/
```

公共参数：`--data-dir <dir>`（memlite 数据目录；缺省 env `MEMLITE_DATA` > 项目级 > 用户级 `~/memlite-data`）、`--json`。

## 行为速览

- **目录 ↔ 因果链**：vault 目录 = memlite 父条（kind=Context）；`X.md` + `X/` 同名 = folder note 并入目录条；顶层散落文件 = 根条
- **三级去重**：frontmatter `id`（12 位 hex）→ `sha1(title+content)` → `obsidian_path`；重复导入零重复条
- **wikilinks 不解析为因果**——保留原文
- **互通幂等**：导出 → 再导入 → 逐条等价（id/title/content/tags/project/ts/parent/因果链）

## 文档

- [方案](./docs/proposal.md)——定位、字段映射、边界、风险
- [计划与进度](./docs/plan-progress.md)——M1–M4 里程碑勾选状态
- [集成契约](./docs/integration.md)——与 memlite-js 的依赖接口
- [字段对照表](./docs/field-mapping.md)——导入/导出全字段速查
- [边界情况](./docs/edge-cases.md)——边界行为与已知限制

## English

One-way bridge between Obsidian and memlite (local-first AI memory engine). **Import** turns an Obsidian vault into a memlite library (directories become the causal tree, frontmatter maps to record fields, triple-anchor dedup by `id` / content hash / path). **Export** renders the whole library back as a vault (causal tree → folder tree with folder notes). **Status** reports per-file sync state. Round-trip is lossless: export → re-import reproduces every record with identical id, content, tags, project, timestamps and parent chain. Not a sync tool — each direction is an explicit snapshot. See [docs/](./docs/) for details.

## 协议

MIT。
