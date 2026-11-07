import * as crypto from 'node:crypto'
import type { Memlite, MemRecord } from '@rsrsai/memlite'
import {
  IMPORT_SOURCE,
  MAPPED_FRONTMATTER_KEYS,
  MEMLITE_ID_RE,
  UNSAFE_FRONTMATTER_KEYS,
} from '../shared/constants'
import type { DedupHit } from '../shared/types'

/** sha1(title + '\n' + content) 小写 hex——双轨去重的内容锚 */
export function sourceHash(title: string, content: string): string {
  return crypto.createHash('sha1').update(`${title}\n${content}`, 'utf8').digest('hex')
}

export interface DedupProbe {
  /** frontmatter.id（存在才作 id 锚；非法格式抛 IdFormatError） */
  frontmatterId?: string
  sourceHash: string
  obsidianPath: string
}

/** frontmatter.id 非 12 位 hex：调用方告警并跳过 id 锚 */
export class IdFormatError extends Error {
  constructor(value: string) {
    super(`frontmatter.id 非 12 位 hex，跳过 id 锚: ${value}`)
    this.name = 'IdFormatError'
  }
}

/** 三级去重：frontmatter.id 精确查 → sha1 查 extra.source_hash → extra.obsidian_path 辅助查。
 * 命中返回 id 与锚名；未命中返回 null。 */
export function findExisting(mem: Memlite, probe: DedupProbe): DedupHit | null {
  if (probe.frontmatterId !== undefined) {
    if (!MEMLITE_ID_RE.test(probe.frontmatterId)) {
      throw new IdFormatError(probe.frontmatterId)
    }
    const hit = mem.show(probe.frontmatterId)
    if (hit !== undefined) return { id: hit.record.id, anchor: 'id' }
  }
  const all = mem.store.all()
  const byHash = all.find((r) => r.extra['source_hash'] === probe.sourceHash)
  if (byHash !== undefined) return { id: byHash.id, anchor: 'hash' }
  const byPath = all.find((r) => r.extra['obsidian_path'] === probe.obsidianPath)
  if (byPath !== undefined) return { id: byPath.id, anchor: 'path' }
  return null
}

/** 导入候选与库中记录的逐字段比对（title/content/tags/project/source_hash） */
export function diffAgainst(record: MemRecord, candidate: {
  title: string
  content: string
  tags: string[]
  project: string
  sourceHash: string
}): string[] {
  const changes: string[] = []
  if (record.title !== candidate.title) changes.push('title')
  if (record.content !== candidate.content) changes.push('content')
  if (JSON.stringify(record.tags) !== JSON.stringify(candidate.tags)) changes.push('tags')
  if (record.project !== candidate.project) changes.push('project')
  if (record.extra['source_hash'] !== candidate.sourceHash) changes.push('source_hash')
  return changes
}

/** 待写 extra：三件套（import_source/source_hash/obsidian_path）+ frontmatter 平铺。
 * importance 缺省 important（Obsidian 笔记通常是用户主动写的）；目录条 kind 缺省 Context。
 * 会撞 memlite 固定字段的键丢弃并在 droppedKeys 告知。 */
export function buildExtra(frontmatter: Record<string, unknown>, hash: string, relPath: string, isDirectory: boolean): {
  extra: Record<string, unknown>
  droppedKeys: string[]
} {
  const extra: Record<string, unknown> = {
    import_source: IMPORT_SOURCE,
    source_hash: hash,
    obsidian_path: relPath,
    importance: frontmatter['importance'] ?? 'important',
    kind: frontmatter['kind'] ?? (isDirectory ? 'Context' : undefined),
  }
  const droppedKeys: string[] = []
  for (const [k, v] of Object.entries(frontmatter)) {
    if (MAPPED_FRONTMATTER_KEYS.has(k)) continue
    if (UNSAFE_FRONTMATTER_KEYS.has(k)) {
      droppedKeys.push(k)
      continue
    }
    extra[k] = v
  }
  for (const k of Object.keys(extra)) {
    if (extra[k] === undefined) delete extra[k]
  }
  return { extra, droppedKeys }
}
