# memlite-obsidian 实施进度

> 与 [plan.md](./plan.md) 配套的勾选副本。开工日 2026-11-07。

---

## 里程碑总览

| 阶段 | 范围 | 估算 | 状态 |
|---|---|---|---|
| M1 | 导入器 | 2 天 | ✅ 完成（2026-11-07，commit 2f813ad） |
| M2 | 导出器 | 2 天 | ✅ 完成（2026-11-07，commit d70ff28，含互通幂等） |
| M3 | 文档 + 发布 | 1 天 | ◐ 文档完成；CI/npm 发布待 GitHub 仓创建 |
| M4 | watch 模式（可选） | +1 天 | ⬜ 未做 |

前置（memlite-js 契约缺口补齐，commit 7366d32 + 1）：`Store.putFull`（显式 id/ts/extra）、`RememberOpts` 增 id/ts/extra、`update` 增 extra/project（parent_id 锁定）、`attach(id, '')` 升根、`putWithId` 增 extraPatch。memlite-js 96 测试绿。

---

## M1 导入器（✅ 2026-11-07）

### parser.ts
- [x] `parseMarkdownFile(path)`：返回 `{title, content, frontmatter, rawBody}`
- [x] gray-matter 解析 frontmatter（非对象容错为空）
- [x] 标题提取：frontmatter.title → 首个 `# ` → 文件名
- [x] 正文：rawBody 去掉 frontmatter + 首 `# ` 行（仅当首非空行确为 h1）
- [x] 边界：空文件、只有 frontmatter、只有标题（→ empty-content 跳过）、二进制附件（→ binary 跳过）；YAML Date/数字 id 容错

### tree.ts
- [x] `walkVault(vaultPath)`：返回 `VaultEntry[]`
- [x] 跳过 `.obsidian/` `.trash/` 与隐藏目录、非 .md 附件
- [x] 识别 folder note：`Rust.md` + `Rust/` 同名同目录时合并（note 由父层下传）
- [x] 目录自动建父条（kind=Context，content=子条标题列表；空目录不立条）
- [x] 循环软链防护（realpath + 已访问 set）；软链 .md/软链目录可达即走
- [x] 同名不同目录文件的 title 冲突处理（逐级加目录前缀）
- [x] 空/不存在 vault 路径拒绝（防落 cwd）

### dedup.ts
- [x] `findExisting(mem, entry)`：id（12 hex 校验，非法告警跳过）→ sha1(title+content) 查 `extra.source_hash` → `extra.obsidian_path`
- [x] 三种命中返回 id 与锚名，未命中返回 null
- [x] `diffAgainst`：title/content/tags/project/source_hash 逐字段比对（parent 在 importer 层比对）

### importer.ts
- [x] `importVault(vaultPath, opts)`：主流程；父条先于子条落库，父失败连带跳过
- [x] dry-run：只打印预告，不实际写
- [x] `--write-id`：导入后回填 frontmatter.id（gray-matter stringify 保留原 fm 与正文）
- [x] 进度回调（onProgress）
- [x] 错误处理：单条失败不阻塞整批（skipped + reason）
- [x] 目录层级变化：子条 attach 新父（memlite 防环）

### CLI
- [x] `cac` 装配 `import <vault>` 与 `status <vault>` 命令
- [x] `--project` `--write-id` `--dry-run` `--data-dir` `--json` 参数（空串 data-dir 视同未传）

### 测试（23 项，后增至 25 项——含路径护栏 2 项）
- [x] 5 种典型 vault 夹具：空 vault / 纯散落文件 / 单层目录 / 多层目录+folder note / frontmatter 混合
- [x] 双轨去重命中测试（重复导入零重复、改文 update、id 锚、非法 id、改名、目录层级变化）
- [x] 边界：空文件、二进制、循环软链、wikilinks、title 冲突
- [x] status 三态（missing → synced → outdated）

---

## M2 导出器（✅ 2026-11-07）

### frontmatter.ts
- [x] `toFrontmatterData(record)` / `renderMarkdown(record)`：字段序 id/title/created/tags/project/importance/kind + 其他 extra 平铺
- [x] created 用 ISO8601；桥内部字段（source_hash/obsidian_path/import_source/parent_id）不导出

### filename.ts
- [x] `sanitizeFilename(title)`：禁字剔除（含全角变体）、120 字截断、`untitled` 兜底
- [x] 冲突消解：`resolveConflict` 同目录 `-1` `-2` 后缀

### tree.ts
- [x] `buildTree(mem)`：全库按 parent_id 建树，children ts 升序
- [x] 悬空父按根处理并计数（主类写入路径防悬空；该形态仅来自外部数据，测试以原始 JSONL 模拟）

### exporter.ts
- [x] `exportVault(outputPath, opts)`：主流程
- [x] `--overwrite`：默认拒绝覆盖已存在目录；开启则先清空
- [x] 生成 `.obsidian/app.json` 最小配置
- [x] 进度回调；有子条 → 文件 + 同名目录（folder note 语义）

### CLI
- [x] `export <output>` 命令：`--data-dir` `--overwrite` `--json`

### 测试（12 项；全套 37 绿）
- [x] frontmatter 字段组合与顺序
- [x] 文件名清洗边界（禁字/全角/空值/超长）
- [x] 同名冲突消解
- [x] 目录树生成（root → A → B → C 链条）
- [x] **互通：导入 → 导出 → 再导入（新库）逐条等价；同库再导入全 unchanged（幂等）**
- [x] 目录条 folder note 往返不丢正文

---

## M3 文档 + 发布（◐ 文档完成 2026-11-07）

### 文档
- [x] `README.md`：状态/心智模型/安装/用法/速览（中英双语）
- [x] `CHANGELOG.md`：0.1.0 条目
- [x] `docs/field-mapping.md`：完整字段对照表 + 往返不变量
- [x] `docs/edge-cases.md`：边界情况汇总 + 已知限制

### CI（⬜ 待 GitHub 仓创建）
- [ ] GitHub Actions：lint + typecheck + test + build
- [ ] npm publish on `v*` tag

### 发布（⬜）
- [ ] `npm pack` 验证
- [ ] 打 tag `v0.1.0`、CI 自动 publish 到 `@rsrsai/memlite-obsidian`

---

## M4 watch 模式（⬜ 可选，+1 天）

- [ ] `src/import/watcher.ts`：chokidar 监听 .md 变化
- [ ] 事件映射：add → remember；change → update；unlink → forget
- [ ] 防抖（500ms）
- [ ] 仅 import 方向
- [ ] CLI：`memlite-obsidian watch <vault>`

---

## 验收清单（0.1.0）

- [x] M1 导入器全命令工作 + vault 夹具测试绿
- [x] M2 导出器全命令工作 + 互通测试绿
- [x] **互通幂等**：导出→再导入→导出 = 幂等（测试 + 真机 ROUNDTRIP-IDENTICAL 双验证）
- [ ] 用导入器把 vault 转 memlite → DSH 插件能召回（待宿主联调）
- [ ] 用导出器把 memlite 转 vault → Obsidian 打开正常（待 Obsidian 人工核验）
- [ ] M3 CI + npm 发布完成

### 关键度量（样例规模实测）

- 重复导入：零重复条（unchanged 判定，无 ts 搅动）✅
- 真机往返：5 条样例 ROUNDTRIP-IDENTICAL ✅
- 千条规模压测：⬜ 未测（可选）

---

## 事故记录（2026-11-07）

真机验证时 zsh glob 无匹配中止赋值链 → 空变量传入 CLI：`import ""` 落 cwd（memlite-obsidian 仓）且 `--write-id` 向仓内 114 个 .md（含 node_modules）注入 frontmatter；`--data-dir ""` 经 resolveDataDir 落入用户级 `~/memlite-data`（新建目录，写入 312 条垃圾）。清损：删 `~/memlite-data`（全程新目录、无既有数据）、git 还原 4 个仓库文档、剥离 104 个 node_modules 注入、重装 node_modules。加固：vault 路径空/不存在即拒、`--data-dir` 空串视同未传、空目录不再记 skip。教训入 respire 记忆库。
