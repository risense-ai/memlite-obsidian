/** @rsrsai/memlite-obsidian 公共出口——memlite ↔ Obsidian 单向桥（导入/导出/校验）。 */

export { parseMarkdownFile, BinaryFileError, type ParsedFile } from './import/parser'
export { walkVault } from './import/tree'
export {
  sourceHash,
  findExisting,
  diffAgainst,
  buildExtra,
  IdFormatError,
  type DedupProbe,
} from './import/dedup'
export { importVault, importVaultWith, statusVault, statusVaultWith, openBridgeMem } from './import/importer'
export { exportVault, exportVaultWith, type ExportOptions, type ExportReport } from './export/exporter'
export { sanitizeFilename, resolveConflict } from './export/filename'
export { toFrontmatterData, renderMarkdown } from './export/frontmatter'
export { buildTree, type ExportNode, type BuildTreeResult } from './export/tree'

export type {
  VaultEntry,
  WalkResult,
  SkippedInfo,
  SkippedReason,
  DedupAnchor,
  DedupHit,
  EntryChange,
  ImportOptions,
  ImportReport,
  StatusReport,
  StatusRow,
  SyncState,
} from './shared/types'

export {
  IMPORT_SOURCE,
  MAPPED_FRONTMATTER_KEYS,
  UNSAFE_FRONTMATTER_KEYS,
  MEMLITE_ID_RE,
  DIRECTORY_KIND,
  SKIP_DIR_NAMES,
} from './shared/constants'
