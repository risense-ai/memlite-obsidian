# memlite-obsidian 方案

> **状态**：草稿
> **仓库**：`risense/memlite-obsidian`
> **npm 包名**：`@rsrsai/memlite-obsidian`
> **依赖**：[`@rsrsai/memlite@^0.1.0`](https://github.com/risense-ai/memlite-js)
> **撰写日期**：2026-11-07

---

## 一、定位

**memlite 与 Obsidian 之间的双向桥梁**——单向工具，不是双向同步。

```
Obsidian vault (人的长期知识库)
       ↓ import
   memlite (AI 的工作记忆)
       ↓ export
Obsidian vault (人读 AI 结论)
```

### 1.1 核心心智模型

**两个工作区，单向流动，互不污染**：

- **Obsidian = 人的长期知识库**：用户主动写、整理、维护
- **memlite = AI 的工作记忆**：AI 助手读、召回、沉淀
- **导入 = 人主动喂给 AI**（一次性快照，不监听）
- **导出 = AI 把结论沉淀给人**（一次性快照，覆盖式）

**绝不做双向实时同步**——冲突语义混乱、删除方向歧义、相互污染。

### 1.2 三个目标

1. **导入即得**：用户跑一条命令把已有 Obsidian vault 转成 memlite 库，立即可被 DSH/Kimi 等宿主召回
2. **导出即读**：memlite 库一键导出成 Obsidian vault，人可读、可图谱、可 Dataview
3. **互通无损**：id/因果链/frontmatter 字段双向保留

### 1.3 非目标

- 不做实时双向同步（watch 模式只支持 import 方向）
- 不做 Obsidian 插件（本仓是 CLI/库，不是 Obsidian plugin）
- 不解析 markdown 语法树（memlite 存原文，不渲染）

---

## 二、导入设计（优先级 P0）

### 2.1 字段映射

| Obsidian 源 | memlite 目标 | 备注 |
|---|---|---|
| frontmatter `id` | `id` | 若存在则 update，否则新建 |
| frontmatter `tags` | `tags` | |
| frontmatter `project` | `project` | 缺失则用 CLI `--project` 参数 |
| frontmatter `created` | `ts` | 缺失用文件 mtime |
| frontmatter `importance` | `extra.importance` | |
| frontmatter `kind` | `extra.kind` | |
| 首个 `# 标题` | `title` | 缺失用文件名（去 .md） |
| 正文（去 frontmatter 与首 #） | `content` | |
| 目录层级 | `extra.parent_id` | 见 §2.2 |
| wikilinks `[[foo]]` | 保留原文，**不解析为因果** | 见 §2.4 |
| 其他 frontmatter 字段 | `extra.*` | 平铺 |

### 2.2 目录结构 → 因果链

```
vault/
├── 编程/                    ← 目录自动建一条父条（kind=Context）
│   ├── Rust.md             ← parent=编程
│   ├── Rust/               ← 与 Rust.md 同名目录
│   │   └── 所有权.md       ← parent=Rust
│   └── Python.md           ← parent=编程
└── 生活/
    └── 菜谱.md             ← parent=生活
```

**映射规则**：

- **目录** = 自动建一条父记忆（kind=Context，title=目录名，content=目录下子条标题列表）
- **同名 .md** = 该目录的"folder note"：若 `Rust.md` 和 `Rust/` 同名同目录，则 Rust.md 的 content 即该目录父条的 content
- **非同名 .md** = 该目录的子条
- **顶层散落文件** = 根条

### 2.3 去重策略（双轨）

| 锚 | 优先级 | 来源 |
|---|---|---|
| **frontmatter `id`** | 高 | 已有 id 即 update；缺失则新建后可选 `--write-id` 回填 |
| **内容 hash** | 中 | `sha1(title + content)` 存 `extra.source_hash`；hash 同即 update |
| **路径** | 低（辅助） | `extra.obsidian_path` 用于诊断，不作主锚 |

**推荐工作流**：

```bash
# 首次导入：自动写回 id
memlite-obsidian import ./vault/ --write-id

# 之后重复导入：按 id update
memlite-obsidian import ./vault/
```

### 2.4 wikilinks 处理

**默认行为**：保留原文，不解析为因果。理由：

- wikilink 是**横向关联**，不是父子
- Obsidian 图谱里 wikilink 已经表达关联；memlite 的因果树是另一层语义
- 强转会把 `[[参考]]` 这种弱关联误升为因

**未来扩展**：memlite 若加 `see_also` 字段，可开 `--extract-links` 把 wikilink 目标填入。

---

## 三、导出设计（优先级 P1）

### 3.1 memlite → Obsidian 字段映射

| memlite 源 | Obsidian 目标 |
|---|---|
| `id` | frontmatter `id` |
| `title` | 文件名（清洗后） + frontmatter `title` |
| `content` | 正文 |
| `ts` | frontmatter `created`（ISO8601） |
| `tags` | frontmatter `tags` |
| `project` | frontmatter `project` |
| `extra.importance` | frontmatter `importance` |
| `extra.kind` | frontmatter `kind` |
| `extra.parent_id` | 目录层级（见 §3.2） |
| 其他 `extra.*` | frontmatter 平铺 |

### 3.2 因果链 → 目录结构

memlite 是**扁平 id + parent_id 指针**，导出要转成**目录树**：

```
parent_id 链：root → A → B → C

导出为：
A.md         ← A 是根条
A/           ← A 有子，建同名目录
A/B.md       ← B 是 A 的子
A/B/         ← B 有子
A/B/C.md     ← C 是 B 的子
```

### 3.3 文件名清洗

Obsidian 禁止字符：`[ ] # ^ | / \ : * ? " < >`

```
title = "什么是 Rust？"
   ↓ 清洗
filename = "什么是 Rust.md"    # 去掉 ?
```

同名冲突：加 `-1` `-2` 后缀。

### 3.4 frontmatter 生成

```yaml
---
id: a1b2c3d4e5f6
title: 什么是 Rust
created: 2026-11-07T14:29:00+08:00
tags: [rust, memory]
project: risense
importance: important
kind: Skill
---
```

---

## 四、命令面

```bash
# 导入
memlite-obsidian import <vault-path> [--project P] [--write-id] [--dry-run] [--data-dir DIR]

# 导出
memlite-obsidian export <output-vault-path> [--data-dir DIR] [--overwrite]

# 监听导入（一次性快照的持续版）
memlite-obsidian watch <vault-path> [--project P] [--data-dir DIR]
# 用 chokidar 监听 .md 变化，新增/修改/删除同步到 memlite

# 校验：看 vault 里哪些文件已入 memlite
memlite-obsidian status <vault-path> [--data-dir DIR]
```

---

## 五、技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript 5+ | 与 memlite-js 一致 |
| 运行时 | Node ≥ 18 | |
| 构建 | tsup | |
| 测试 | vitest | |
| frontmatter 解析 | `gray-matter` | 事实标准；同时支持 YAML/TOML/JSON |
| 文件 watch | `chokidar` | 跨平台稳定；仅 watch 模式需要 |
| CLI 框架 | `cac` 或 `commander` | 轻量；cac 更现代 |
| 包名 | `@rsrsai/memlite-obsidian` | 沿用 rsrs scope |

---

## 六、仓库结构

```
memlite-obsidian/
├── src/
│   ├── index.ts            # 公共出口
│   ├── cli.ts              # CLI 入口
│   ├── import/
│   │   ├── parser.ts       # MD 解析（frontmatter/标题/正文）
│   │   ├── tree.ts         # 目录遍历 + 因果链构建
│   │   ├── dedup.ts        # id/hash 双轨去重
│   │   ├── importer.ts     # 主导入流
│   │   └── watcher.ts      # chokidar watch
│   ├── export/
│   │   ├── frontmatter.ts  # YAML 序列化
│   │   ├── filename.ts     # title → 文件名（清洗 + 冲突消解）
│   │   ├── tree.ts         # 因果链 → 目录树
│   │   └── exporter.ts     # 主导出流
│   └── shared/
│       ├── types.ts        # 共用类型
│       └── constants.ts    # 常量
├── tests/
├── docs/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 七、依赖与装配

```ts
import { Memlite } from '@rsrsai/memlite'

// 导入器
async function importVault(vaultPath: string, opts: ImportOpts) {
  const mem = new Memlite({ dataDir: opts.dataDir }, {})
  await mem.open()
  const parser = new VaultParser(vaultPath)
  const entries = await parser.parse()
  for (const entry of entries) {
    const existingId = await dedup.findExisting(mem, entry)
    if (existingId) {
      await mem.update(existingId, entry.toMemliteOpts())
    } else {
      const id = await mem.remember(entry.content, entry.toMemliteOpts())
      if (opts.writeId) await writeIdBack(entry.path, id)
    }
  }
  await mem.close()
}
```

**约束**：
- **不绕过** Memlite 主类直接操作 Store
- 不读取 memlite 数据文件——一切经主类

---

## 八、风险与对策

| 风险 | 概率 | 处置 |
|---|---|---|
| 大 vault（万条）导入慢 | 中 | 流式处理 + 进度报告；批量 remember 而非逐条 fsync |
| 同名文件冲突 | 高 | 加目录前缀 + `-1` 后缀双轨 |
| frontmatter 解析失败 | 中 | gray-matter 容错 + 视为无 frontmatter |
| 用户写 id 写错格式 | 低 | 校验 hex-12，不符即警告并跳过 id 锚 |
| wikilink 误升为因 | 中 | 默认不解析；显式 flag 才开 |
| 循环软链 | 低 | fs.realpath + 已访问 set |
| 用户改造 memlite 后重导 | 中 | hash 锚会失效；提示用户慎用双侧编辑 |

---

## 九、非目标（重申）

1. **不做双向同步**：明确单向
2. **不做 Obsidian 插件**：本仓是独立 CLI/库
3. **不做 markdown 渲染**：memlite 存原文
4. **不做冲突解决**：vault 与 memlite 同条两侧同改时，导入方向以 vault 为准（覆盖 memlite）；导出方向以 memlite 为准（覆盖 vault）

---

## 十、与 memlite-js 的关系

```
risense/memlite-js         →  @rsrsai/memlite@0.1.0     （基础库）
       ↑ depends on
risense/memlite-obsidian   →  @rsrsai/memlite-obsidian@0.1.0 （本仓）
```

本仓**只是 memlite-js 的一个客户端**——像 dsh-memlite 一样，所有读写经 Memlite 主类。

---

## 十一、下一步

进入 [plan.md](./plan.md) 的里程碑拆解。
