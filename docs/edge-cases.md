# 边界情况汇总

> 按 [integration.md](./integration.md) §6.2 清单逐项落实；均为测试覆盖项。

## vault 侧

| 边界 | 行为 | 测试 |
|---|---|---|
| 空 vault | 零条目零跳过，正常退出 | ✅ walkVault 空 vault |
| 空 `.md` 文件 | `empty-content` 跳过 | ✅ |
| 仅有 frontmatter 无正文 | `empty-content` 跳过 | ✅ |
| 仅有标题无正文 | `empty-content` 跳过（memlite 拒空正文） | ✅ |
| 二进制 `.md`（含 `\0`） | `binary` 跳过 | ✅ |
| 非 `.md` 附件 | 静默跳过 | ✅ |
| `.obsidian/`、`.trash/`、点开头 | 跳过 | ✅ |
| 空目录 | 不立条（静默） | ✅ |
| 目录条正文 | 子条标题列表 `- 标题`；folder note 有正文则用 note 正文 | ✅ |
| 同名不同目录文件 | title 冲突：后者逐级加父目录前缀（`b/Rust`） | ✅ |
| folder note（`X.md` + `X/`） | note 并入目录条；不单独立条 | ✅ |
| 循环软链目录 | realpath + 已访问集，不挂死 | ✅ |
| 软链 `.md` / 软链目录 | 目标可达即按普通文件/目录走；不可达记 `read-error` | ✅ |
| wikilinks | 保留原文，不解析为因果 | ✅ |
| YAML 无引号 ISO 日期 | 解析为 `Date` 对象——按 Date 取 ms | ✅ |
| YAML 纯数字 id（如 `123456781234`） | 解析为 number——转字符串后校验 | ✅ |
| 非法 frontmatter.id（非 12 hex） | 告警，跳过 id 锚，hash/path 锚照常 | ✅ |
| frontmatter 撞固定字段（`op`/`ts`/`content`/`parent_id`） | 丢弃并告警（`parent_id` 由目录结构管理） | ✅ |
| 空字符串 vault 路径 | 拒绝（防落到 cwd） | ✅ |
| 不存在的 vault 路径 | 拒绝 | ✅ |

## 去重侧（双轨+路径）

| 场景 | 锚 | 行为 |
|---|---|---|
| frontmatter.id 在库 | id | update（同 id），逐字段 diff（title/content/tags/project/source_hash/parent） |
| frontmatter.id 不在库 | id | 以该 id 新建 |
| 无 id，内容未变 | hash | unchanged（零写入，ts 不动） |
| 无 id，内容/标题变了 | hash | update；路径没变时 hash 变仍由 hash 锚命中 |
| hash 变且路径没变 | path | update |
| hash 变且路径也变（改名+改文） | 无 | 新建；旧条成孤儿（documented 限制：`obsidian_path` 不作主锚） |
| 目录改名、子条内容不变 | hash | 子条 hit → 仅 parent 变 → `attach` 到新父目录条 |
| 重复导入 | — | 零新建零更新全 unchanged（幂等） |
| 目录层级变化 | — | 子条 `attach` 新父；防环由 memlite `reparentChecked` 保证 |

## 导出侧

| 边界 | 行为 |
|---|---|
| 输出目录已存在非空 | 拒绝；`--overwrite` 先清空 |
| title 含禁字/全角禁字 | 剔除；空名兜底 `untitled` |
| 同目录同名 | `-1` `-2` 后缀 |
| title 超长 | 120 字符截断 |
| 悬空 parent_id（父已删） | 按根导出并计入 dangling 告警（仅外部脏数据会出现；主类写入路径防悬空） |
| 目录条 | `X.md`（folder note 语义）+ `X/` 目录 |
| 桥内部 extra 字段 | 不写 frontmatter |

## 已知限制（非 bug）

1. **改名+改文且无 id** → 新建孤儿条。规避：用 `--write-id` 首次导入回填 id。
2. **无 id 条目的 frontmatter 元数据变更**（仅 tags/project/importance 变，title/content 不变）→ hash 不变 → 不会同步。规避：同上，回填 id。
3. **update 的 extra 按键合并不删除**——vault 里删掉的 frontmatter 自定义键在 memlite extra 里残留。
4. **导入不做嵌入**——桥固定 none 档；宿主侧用 `mem.reembed()` 回填向量。
5. **双侧同改**：导入方向 vault 为准（覆盖 memlite），导出方向 memlite 为准（覆盖 vault）——见 proposal §九。
