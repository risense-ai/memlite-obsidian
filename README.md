# memlite-obsidian

> memlite ↔ Obsidian 双向桥梁。
> 基于 [`@rsrsai/memlite`](https://github.com/risense-ai/memlite-js)。

## 状态

🚧 **方案阶段**。M1（导入器）尚未启动。

## 心智模型

**两个工作区，单向流动，互不污染**：

- **Obsidian = 人的长期知识库**（人写、整理、维护）
- **memlite = AI 的工作记忆**（AI 读、召回、沉淀）
- **导入 = 人主动喂给 AI**
- **导出 = AI 把结论沉淀给人**

**绝不做双向实时同步**——冲突语义混乱、删除方向歧义、相互污染。

## 文档

- [方案](./docs/proposal.md)——定位、字段映射、边界、风险
- [计划](./docs/plan.md)——M1–M4 里程碑（5 工作日）
- [集成契约](./docs/integration.md)——与 memlite-js 的依赖接口

## 用法（待发布）

```bash
# 把 Obsidian vault 导入 memlite
memlite-obsidian import ~/Documents/my-vault/ --project my-proj --write-id

# 把 memlite 库导出成 Obsidian vault
memlite-obsidian export ~/Documents/memlite-vault/

# 校验：vault 里哪些文件已入 memlite
memlite-obsidian status ~/Documents/my-vault/
```

## 协议

MIT。
