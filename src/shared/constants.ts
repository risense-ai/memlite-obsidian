/** 本仓写入 extra 的来源标记值 */
export const IMPORT_SOURCE = 'obsidian'

/** frontmatter 中被显式映射的字段（不再平铺进 extra） */
export const MAPPED_FRONTMATTER_KEYS = new Set([
  'id',
  'title',
  'tags',
  'project',
  'created',
  'importance',
  'kind',
])

/** 平铺进 extra 会撞 memlite 固定字段/因链语义的键——一律丢弃并告警 */
export const UNSAFE_FRONTMATTER_KEYS = new Set(['op', 'ts', 'content', 'parent_id'])

/** memlite 记录 id：12 位小写 hex（uuid v4 simple 前 12 位） */
export const MEMLITE_ID_RE = /^[0-9a-f]{12}$/

/** 目录父条缺省 kind */
export const DIRECTORY_KIND = 'Context'

/** Obsidian 惯例跳过目录 */
export const SKIP_DIR_NAMES = new Set(['.obsidian', '.trash'])
