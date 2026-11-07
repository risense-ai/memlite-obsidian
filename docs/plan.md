# memlite-obsidian 实施计划

> 与 [proposal.md](./proposal.md) 配套。
> 总估算：**5 个工作日**（import 2 + export 2 + 文档发布 1）。

---

## 里程碑总览

| 阶段 | 范围 | 估算 | 产出 |
|---|---|---|---|
| M1 | 导入器 | 2 天 | parser + tree + dedup + importer + CLI |
| M2 | 导出器 | 2 天 | frontmatter + filename + tree + exporter + CLI |
| M3 | 文档 + 发布 | 1 天 | README + CHANGELOG + npm 发布 |
| M4 | watch 模式（可选） | +1 天 | chokidar watch（仅 import 方向） |

---

## M1 导入器（2 天）

### parser.ts
- [ ] `parseMarkdownFile(path)`：返回 `{title, content, frontmatter, rawBody}`
- [ ] gray-matter 解析 frontmatter
- [ ] 标题提取：frontmatter.title → 首个 `# ` → 文件名
- [ ] 正文：rawBody 去掉 frontmatter + 首 `# ` 行
- [ ] 边界：空文件、只有 frontmatter、只有标题、二进制附件（跳过）

### tree.ts
- [ ] `walkVault(vaultPath)`：返回 `VaultEntry[]`
- [ ] 跳过 `.obsidian/` `.trash/` 与隐藏目录
- [ ] 识别"folder note"：`Rust.md` + `Rust/` 同名同目录时合并
- [ ] 目录自动建父条（kind=Context，content=子条标题列表）
- [ ] 循环软链防护（realpath + 已访问 set）
- [ ] 同名不同目录文件的 title 冲突处理（加目录前缀）

### dedup.ts
- [ ] `findExisting(mem, entry)`：
  - 优先 frontmatter.id 精确查
  - 退到 sha1(title+content) 查 `extra.source_hash`
  - 退到 `extra.obsidian_path` 路径查
- [ ] 三种命中返回 id，未命中返回 null

### importer.ts
- [ ] `importVault(vaultPath, opts)`：主流程
- [ ] dry-run：只打印将要写入的条数与示例，不实际写
- [ ] `--write-id`：导入后回填 frontmatter.id 到 MD 文件
- [ ] 进度报告（每 100 条 / 完成时打印汇总）
- [ ] 错误处理：单条失败不阻塞整批

### CLI
- [ ] `cac` 装配 `import <vault>` 命令
- [ ] `--project` `--write-id` `--dry-run` `--data-dir` 参数

### 测试
- [ ] 5 种典型 vault 夹具：
  - 空 vault
  - 纯散落文件
  - 单层目录
  - 多层目录 + folder note
  - 含 frontmatter / 无 frontmatter 混合
- [ ] 双轨去重命中测试
- [ ] 边界：空文件、二进制、循环软链

---

## M2 导出器（2 天）

### frontmatter.ts
- [ ] `serializeFrontmatter(record)`：memlite Record → YAML 字符串
- [ ] 字段顺序：id/title/created/tags/project/importance/kind + 其他 extra 平铺
- [ ] created 用 ISO8601（`new Date(ts * 1000).toISOString()`）

### filename.ts
- [ ] `sanitizeFilename(title)`：去掉 Obsidian 禁止字符
- [ ] 冲突消解：同目录同名时加 `-1` `-2` 后缀
- [ ] 长度上限（避免文件系统超长）

### tree.ts
- [ ] `buildTree(mem)`：读全部记录，按 parent_id 建树
- [ ] 根条 → 顶层文件
- [ ] 有子的条 → 文件 + 同名目录
- [ ] 无子的条 → 文件

### exporter.ts
- [ ] `exportVault(outputPath, opts)`：主流程
- [ ] `--overwrite`：默认拒绝覆盖已存在目录
- [ ] 生成 `.obsidian/` 配置（打开 graph/backlinks 面板）
- [ ] 进度报告

### CLI
- [ ] `cac` 装配 `export <output>` 命令
- [ ] `--data-dir` `--overwrite` 参数

### 测试
- [ ] 各种 frontmatter 字段组合
- [ ] 文件名清洗边界
- [ ] 同名冲突消解
- [ ] 目录树生成（root → A → B → C 链条）
- [ ] 与 memlite-js 互通：导出后再导入应得到等价库

---

## M3 文档 + 发布（1 天）

### 文档

- [ ] `README.md`：安装/用法/字段映射/边界/互通（中英双语）
- [ ] `CHANGELOG.md`：0.1.0 条目
- [ ] `docs/field-mapping.md`：完整字段对照表
- [ ] `docs/edge-cases.md`：边界情况汇总

### CI

- [ ] GitHub Actions：lint + typecheck + test + build
- [ ] npm publish on `v*` tag

### 发布

- [ ] `npm pack` 验证
- [ ] 打 tag `v0.1.0`
- [ ] CI 自动 publish 到 `@rsrsai/memlite-obsidian`

---

## M4 watch 模式（可选，+1 天）

- [ ] `src/import/watcher.ts`：chokidar 监听 .md 变化
- [ ] 事件映射：add → remember；change → update；unlink → forget
- [ ] 防抖（500ms）
- [ ] 仅 import 方向——memlite 变化不回流到 vault
- [ ] CLI：`memlite-obsidian watch <vault>`

**明确**：watch 模式不是双向同步。它只让 vault 的新增/修改/删除自动流到 memlite，**反向不流**。

---

## 验收清单

### 0.1.0 发布前必须满足

- [ ] M1 导入器全命令工作 + 5 种 vault 夹具测试绿
- [ ] M2 导出器全命令工作 + 互通测试绿
- [ ] M3 文档 + CI + npm 发布完成
- [ ] **互通验证**：
  - [ ] 用导入器把 vault 转 memlite → DSH 插件能召回
  - [ ] 用导出器把 memlite 转 vault → Obsidian 打开正常
  - [ ] 导出→再导入→导出 = 幂等

### 关键度量

- **导入 1000 条 vault**：< 30 秒（含 fsync）
- **导出 1000 条 memlite**：< 10 秒
- **双轨去重准确率**：重复导入零重复条

---

## 进度追踪

每完成一项打 `[x]`。M1 启动时把本文件复制为 `docs/plan-progress.md`，逐日更新。
