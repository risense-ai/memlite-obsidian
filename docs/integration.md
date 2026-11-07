# 与 memlite-js 的集成契约

> 本文件锁定 `@rsrsai/memlite-obsidian` 对 `@rsrsai/memlite` 的依赖接口。

---

## 一、依赖版本

```json
{
  "dependencies": {
    "@rsrsai/memlite": "^0.1.0"
  }
}
```

跟随 memlite-js 的 minor 升级；major 升级需重新评估契约。

---

## 二、使用的公开 API

### 2.1 主类

```ts
import { Memlite } from '@rsrsai/memlite'

const mem = new Memlite({ dataDir }, {})
await mem.open()
// ... import/export 操作
await mem.close()
```

### 2.2 调用面

| 操作 | memlite-js 方法 |
|---|---|
| 导入单条（新建） | `mem.remember(content, opts)` |
| 导入单条（已存在则改） | `mem.update(id, opts)` |
| 导入单条（认因挂载） | `mem.remember(content, {...opts, parent})` |
| 按 id 查 | `mem.show(id)` |
| 列出全部 | `mem.store.all()` 或 `mem.list()` |
| 按内容 hash 查 | 自行扫描 all() 后匹配 `extra.source_hash` |
| 按路径查 | 自行扫描 all() 后匹配 `extra.obsidian_path` |
| 导出读取 | `mem.store.all()` + 因果树方法 |

**约束**：本仓**不绕过** Memlite 主类直接调用底层（store/bm25/vectors 等）。若主类未暴露某能力，应在 memlite-js 仓加方法，而非在 obsidian 仓直接 import 内部模块。

---

## 三、字段扩展契约

### 3.1 本仓引入的 extra 字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `source_hash` | string | `sha1(title+content)`，双轨去重锚之一 |
| `obsidian_path` | string | vault 内相对路径（辅助锚，诊断用） |
| `import_source` | string | 标记来源为 "obsidian" |

**约束**：
- 字段名以 snake_case 命名，与 memlite Rust flatten 契约一致
- 新增字段需在本文件登记
- 字段变更不破坏与 Rust memlite 的互通（extra 平铺，Rust 端自动吸收）

### 3.2 与 memlite 既有字段的关系

| memlite 既有 | 本仓使用方式 |
|---|---|
| `id` | 写入 frontmatter.id 作为去重锚 |
| `parent_id` | 目录层级 ↔ 因果链双向映射 |
| `importance` | 默认 `important`（Obsidian 笔记通常都是用户主动写的） |
| `kind` | 目录自动建的父条用 `Context`；文件默认无 kind 或 frontmatter 指定 |

---

## 四、CLI 调用面

```bash
memlite-obsidian import <vault-path> [opts]
memlite-obsidian export <output-path> [opts]
memlite-obsidian status <vault-path> [opts]
memlite-obsidian watch <vault-path> [opts]      # M4
```

所有命令共享参数：
- `--data-dir <DIR>`：memlite 数据目录；缺省走 memlite-js 的 `resolveDataDir`（env > 项目级 > 用户级）
- `--project <P>`：导入时写入每条记忆的 project 字段
- `--json`：输出 JSON 格式

---

## 五、版本对齐策略

| memlite-js | memlite-obsidian | 策略 |
|---|---|---|
| 0.1.0 | 0.1.0 | 起点 |
| 0.1.x | 0.1.x | 跟随；bug 修复直通 |
| 0.2.0 | 0.2.0 | 评估新能力；若新增字段影响导入/导出，同步加映射 |
| 1.0.0 | 1.0.0 | 同步 major |

---

## 六、测试契约

### 6.1 与 memlite-js 的互通测试

- [x] 导入器产出 → memlite-js 主类读出 → 字段一致（tests/importer.test.ts，2026-11-07）
- [x] 导出器产出 → 重新导入 → 幂等（tests/exporter.test.ts 互通段 + 真机 ROUNDTRIP-IDENTICAL，2026-11-07）
- [ ] 与 Rust memlite 三方互通：
  - [ ] Obsidian → 本仓 → memlite → Rust memlite 读出
  - [ ] Rust memlite → 本仓导出 → Obsidian 可读

### 6.2 必须覆盖的边界

- 空 vault
- 空 .md 文件
- 仅有 frontmatter 无正文
- 仅有正文无 frontmatter 无标题
- 同名不同目录文件
- 多层目录 + folder note
- 含二进制附件
- 含 wikilinks
- 循环软链

---

## 七、变更流程

任一侧契约变更：

1. 在变更仓库开 issue + 链接到对侧仓
2. 更新本文件
3. 双侧 CI 加互通测试覆盖变更点
4. 发版时 CHANGELOG 标注对侧最低兼容版本
