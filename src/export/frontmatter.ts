import matter from 'gray-matter'
import type { MemRecord } from '@rsrsai/memlite'
import { parentId } from '@rsrsai/memlite'

/** 桥内部字段——导出不进 frontmatter（source_hash 等重导入时重新生成；parent_id 由目录层级表达） */
const BRIDGE_INTERNAL_KEYS = new Set(['source_hash', 'obsidian_path', 'import_source', 'parent_id'])

/** memlite Record → { frontmatter 数据, 正文 }。字段序：id/title/created/tags/project/importance/kind 优先，其余 extra 平铺在后。 */
export function toFrontmatterData(record: MemRecord): { data: Record<string, unknown>; body: string } {
  const iso = new Date(record.ts * 1000).toISOString()
  const data: Record<string, unknown> = {
    id: record.id,
    title: record.title,
    created: iso,
    tags: record.tags,
    project: record.project,
  }
  const extra = record.extra ?? {}
  if (typeof extra['importance'] === 'string') data['importance'] = extra['importance']
  if (typeof extra['kind'] === 'string') data['kind'] = extra['kind']
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'importance' || k === 'kind') continue
    if (BRIDGE_INTERNAL_KEYS.has(k)) continue
    data[k] = v
  }
  return { data, body: record.content }
}

/** Record → 完整 .md 文本（frontmatter + 正文） */
export function renderMarkdown(record: MemRecord): string {
  const { data, body } = toFrontmatterData(record)
  return matter.stringify(body, data)
}

/** 供诊断：因链父 id（不写入 frontmatter） */
export function parentOfRecord(record: MemRecord): string {
  return parentId(record)
}
