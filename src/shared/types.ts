/** vault 内一个可导入单元（文件或目录）解析后的中间形态。 */
export interface VaultEntry {
  /** vault 内相对路径（POSIX 风格；目录条以 `/` 结尾不带——统一不带尾斜杠） */
  path: string
  /** 目录自动建的父条（kind=Context）；folder note 已合并进此条 */
  isDirectory: boolean
  /** frontmatter.title → 首个 `# ` → 文件名/目录名 */
  title: string
  /** 正文（去 frontmatter 与首 `# ` 行；目录条=子条标题列表） */
  content: string
  /** 已解析 frontmatter（无则空对象；非对象 frontmatter 容错为空） */
  frontmatter: Record<string, unknown>
  /** 父目录条路径；vault 顶层为 null */
  parentPath: string | null
  /** 文件 mtime（秒；目录条取目录 mtime） */
  mtime: number
  /** 本条背后的 .md 文件绝对路径（文件条=自身；folder note 目录条=同名 .md；纯目录无） */
  noteAbsPath?: string
}

export type SkippedReason =
  | 'empty-content' // 空文件 / 只有 frontmatter / 只有标题
  | 'binary' // 含 \0 判定二进制
  | 'read-error' // 读文件失败
  | 'parent-failed' // 父条创建失败，连带跳过
  | 'write-error' // memlite 写入失败（敏感闸等）

export interface SkippedInfo {
  path: string
  reason: SkippedReason
  detail?: string
}

export interface WalkResult {
  entries: VaultEntry[]
  skipped: SkippedInfo[]
}

export type DedupAnchor = 'id' | 'hash' | 'path'

export interface DedupHit {
  id: string
  anchor: DedupAnchor
}

export interface EntryChange {
  id: string
  /** 命中的变更字段名 */
  changes: string[]
}

export interface ImportOptions {
  /** memlite 数据目录；缺省走 memlite-js resolveDataDir（env > 项目级 > 用户级） */
  dataDir?: string
  /** 兜底 project（frontmatter.project 缺失时用） */
  project?: string
  /** 新建后回填 frontmatter.id 到 MD 文件 */
  writeId?: boolean
  /** 只算不写 */
  dryRun?: boolean
  /** 进度回调（每条后调） */
  onProgress?: (done: number, total: number, path: string) => void
}

export interface ImportReport {
  scanned: number
  created: string[]
  updated: EntryChange[]
  unchanged: number
  skipped: SkippedInfo[]
  /** 非致命告警（如 frontmatter.id 格式非法跳过锚） */
  warnings: string[]
  /** dry-run 时的预告清单 */
  wouldCreate: number
  wouldUpdate: number
}

export type SyncState = 'synced' | 'outdated' | 'missing'

export interface StatusRow {
  path: string
  state: SyncState
  /** memlite id（missing 时为空） */
  id: string
  anchor: DedupAnchor | null
  /** outdated 时列出的差异字段 */
  changes: string[]
}

export interface StatusReport {
  rows: StatusRow[]
  synced: number
  outdated: number
  missing: number
  skipped: SkippedInfo[]
}
