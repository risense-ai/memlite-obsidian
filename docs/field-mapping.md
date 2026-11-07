# 字段对照表

> 实现与 [proposal.md](./proposal.md) §2.1/§3.1 一致；本文是完整速查版。

---

## 一、导入：Obsidian → memlite

| Obsidian 源 | memlite 目标 | 缺省/兜底 | 备注 |
|---|---|---|---|
| frontmatter `id` | `id`（12 位 hex） | 自动生成 | 库内已存在即 update；不存在则以该 id 新建；非 12 位 hex 告警并跳过 id 锚 |
| frontmatter `tags` | `tags` | `[]` | 数组或逗号分隔字符串皆可；YAML 纯数字 id 解析为 number 亦兼容 |
| frontmatter `project` | `project` | CLI `--project` | 两者都缺省为空串 |
| frontmatter `created` | `ts` | 文件 mtime | ISO 字符串 / YAML Date / 秒或毫秒数字皆可；统一规整到毫秒精度 |
| frontmatter `title` | `title` | 首个 `# ` → 文件名（去 .md） | |
| 首个非空 `# ` 行 | 从正文剥离 | — | 仅当正文首个非空行确为 h1 |
| 正文（去 frontmatter 与首 h1） | `content` | — | 空正文条跳过（`empty-content`） |
| 目录层级 | `extra.parent_id` | 根 | 目录条先建，子条挂其 id；folder note 同理 |
| frontmatter `importance` | `extra.importance` | `important` | Obsidian 笔记通常是用户主动写的 |
| frontmatter `kind` | `extra.kind` | 目录条 `Context`；文件条不设 | |
| wikilinks `[[foo]]` | 保留原文 | — | 不解析为因果 |
| 其他 frontmatter 字段 | `extra.*` 平铺 | — | 撞 memlite 固定字段的键（`op`/`ts`/`content`/`parent_id`）丢弃并告警 |
| （自动） | `extra.import_source` | — | 恒为 `"obsidian"` |
| （自动） | `extra.source_hash` | — | `sha1(title + "\n" + content)` |
| （自动） | `extra.obsidian_path` | — | vault 内相对路径（POSIX 风格） |

### 目录 → 因果链

| vault 结构 | memlite 结构 |
|---|---|
| 目录 `X/` | 一条父记忆（title=X；正文=子条标题列表 `- …`） |
| `X.md` 与 `X/` 同目录同名 | folder note：正文/frontmatter 并入 X 的目录条，不单独立条 |
| `X.md` 无同名目录 | 普通文件条，挂父目录条下 |
| 顶层散落 `.md` | 根条（parent_id 空） |
| 空目录（无子条无 note） | 不立条 |
| `.obsidian/`、`.trash/`、点开头目录/文件 | 跳过 |
| 非 `.md` 文件 | 跳过（附件不导入） |

---

## 二、导出：memlite → Obsidian

| memlite 源 | Obsidian 目标 | 备注 |
|---|---|---|
| `id` | frontmatter `id` | |
| `title` | 文件名（清洗后）+ frontmatter `title` | 禁字 `[ ] # ^ \| / \ : * ? " < >` 及全角变体剔除；空名兜底 `untitled`；同目录冲突加 `-1` |
| `content` | 正文 | |
| `ts` | frontmatter `created` | ISO8601 |
| `tags` | frontmatter `tags` | |
| `project` | frontmatter `project` | |
| `extra.importance` | frontmatter `importance` | 仅字符串值导出 |
| `extra.kind` | frontmatter `kind` | 仅字符串值导出 |
| `extra.parent_id` | 目录层级 | 有子 → `X.md` + `X/`；无子 → `X.md` |
| 其他 `extra.*` | frontmatter 平铺 | `source_hash`/`obsidian_path`/`import_source`/`parent_id` 为桥内部字段，不导出 |
| （自动） | `.obsidian/app.json` | `{}` 最小配置 |

---

## 三、往返不变量

导出 → 再导入（新库）保证逐条等价：`id`、`title`、`content`、`tags`、`project`、`ts`（毫秒精度）、`parent_id`、`source_hash`、`importance`、`kind` 全同。唯一允许漂移的是 `obsidian_path`（导出目录名由 title 派生，可能与原文件名不同——该字段仅诊断用）。
