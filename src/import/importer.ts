import * as fs from 'node:fs'
import * as path from 'node:path'
import { Memlite, parentId, resolveDataDir } from '@rsrsai/memlite'
import matter from 'gray-matter'
import { MEMLITE_ID_RE } from '../shared/constants'
import type {
  EntryChange,
  ImportOptions,
  ImportReport,
  SkippedInfo,
  StatusReport,
  StatusRow,
  VaultEntry,
} from '../shared/types'
import { buildExtra, diffAgainst, findExisting, sourceHash } from './dedup'
import { walkVault } from './tree'

/** 打开桥专用 Memlite：嵌入档固定 none（嵌入属宿主关注点，结构化导入不做侧车） */
export function openBridgeMem(dataDir?: string): Memlite {
  const mem = new Memlite({ dataDir: dataDir ?? resolveDataDir(undefined) }, {})
  mem.open()
  return mem
}

/** 单条候选的待写字段（字段映射 §2.1 全量实现） */
function toCandidate(entry: VaultEntry, fallbackProject: string | undefined): {
  title: string
  content: string
  tags: string[]
  project: string
  ts: number
  idAnchor: string | undefined
  sourceHash: string
  extra: Record<string, unknown>
  droppedKeys: string[]
} {
  const fm = entry.frontmatter
  const title = entry.title
  const content = entry.content
  const tags = normalizeTags(fm['tags'])
  const fmProject = typeof fm['project'] === 'string' ? fm['project'].trim() : ''
  const project = fmProject !== '' ? fmProject : (fallbackProject ?? '')

  // ts 统一规整到毫秒精度（与 memlite nowTs 一致；ISO8601 往返无损——导出再导入幂等的必要条件）
  let tsMs = Math.round(entry.mtime * 1000)
  const created = fm['created']
  if (created instanceof Date) {
    tsMs = created.getTime() // YAML 无引号 ISO 日期解析为 Date
  } else if (typeof created === 'string') {
    const t = Date.parse(created)
    if (!Number.isNaN(t)) tsMs = t
  } else if (typeof created === 'number') {
    tsMs = created > 1e12 ? Math.round(created) : Math.round(created * 1000) // 秒/ms 兜底
  }
  const ts = tsMs / 1000

  let idAnchor: string | undefined
  const fmId = typeof fm['id'] === 'number' ? String(fm['id']) : fm['id'] // YAML 纯数字 id 解析为 number
  if (typeof fmId === 'string' && fmId.trim() !== '') {
    const v = fmId.trim()
    if (MEMLITE_ID_RE.test(v)) idAnchor = v
  }

  const hashValue = sourceHash(title, content)
  const { extra, droppedKeys } = buildExtra(fm, hashValue, entry.path, entry.isDirectory)
  return { title, content, tags, project, ts, idAnchor, sourceHash: hashValue, extra, droppedKeys }
}

function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
  if (typeof v === 'string' && v.trim() !== '') {
    return v.split(/[,，]/).map((t) => t.trim()).filter((t) => t !== '')
  }
  return []
}

/** 主导入流：walk → 逐条三级去重 → update 或 remember；单条失败不阻塞整批。 */
export async function importVault(vaultPath: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const { entries, skipped } = walkVault(vaultPath)
  const mem = openBridgeMem(opts.dataDir)
  const report: ImportReport = {
    scanned: entries.length,
    created: [],
    updated: [],
    unchanged: 0,
    skipped,
    warnings: [],
    wouldCreate: 0,
    wouldUpdate: 0,
  }
  const pathIds = new Map<string, string>() // 目录条路径 → 已落库 id

  try {
    let done = 0
    for (const entry of entries) {
      try {
        await importEntry(mem, entry, opts, report, pathIds)
      } catch (e) {
        report.skipped.push({
          path: entry.path,
          reason: 'write-error',
          detail: e instanceof Error ? e.message : String(e),
        })
      }
      done++
      opts.onProgress?.(done, entries.length, entry.path)
    }
  } finally {
    mem.close()
  }
  return report
}

async function importEntry(
  mem: Memlite,
  entry: VaultEntry,
  opts: ImportOptions,
  report: ImportReport,
  pathIds: Map<string, string>,
): Promise<void> {
  const cand = toCandidate(entry, opts.project)
  if (cand.idAnchor === undefined && typeof entry.frontmatter['id'] === 'string' && entry.frontmatter['id'].trim() !== '') {
    report.warnings.push(`${entry.path}: frontmatter.id 非 12 位 hex，跳过 id 锚`)
  }
  for (const k of cand.droppedKeys) {
    report.warnings.push(`${entry.path}: frontmatter.${k} 与 memlite 固定字段冲突，已丢弃`)
  }

  // 父条 id（目录条先于子条处理，故此处必已就绪；父条失败则连带跳过）
  let parentFull = ''
  if (entry.parentPath !== null) {
    const pid = pathIds.get(entry.parentPath)
    if (pid === undefined) {
      report.skipped.push({ path: entry.path, reason: 'parent-failed', detail: `父条未入库: ${entry.parentPath}` })
      return
    }
    parentFull = pid
  }

  const hit = findExisting(mem, {
    frontmatterId: cand.idAnchor,
    sourceHash: cand.sourceHash,
    obsidianPath: entry.path,
  })

  if (hit !== null) {
    const view = mem.show(hit.id)
    if (view === undefined) {
      report.skipped.push({ path: entry.path, reason: 'write-error', detail: `去重命中但记录不可读: ${hit.id}` })
      return
    }
    const changes = diffAgainst(view.record, cand)
    if (parentId(view.record) !== parentFull) changes.push('parent')
    if (changes.length === 0) {
      pathIds.set(entry.path, view.record.id)
      report.unchanged++
      return
    }
    if (opts.dryRun) {
      report.wouldUpdate++
      return
    }
    await mem.update(view.record.id, {
      title: cand.title,
      content: cand.content,
      tags: cand.tags,
      project: cand.project,
      extra: cand.extra,
    })
    if (changes.includes('parent')) await mem.attach(view.record.id, parentFull)
    pathIds.set(entry.path, view.record.id)
    report.updated.push({ id: view.record.id, changes })
    return
  }

  // 未命中 → 新建
  if (opts.dryRun) {
    report.wouldCreate++
    return
  }
  const id = await mem.remember(cand.content, {
    id: cand.idAnchor,
    title: cand.title,
    tags: cand.tags,
    project: cand.project,
    parent: parentFull === '' ? undefined : parentFull,
    ts: cand.ts,
    extra: cand.extra,
  })
  pathIds.set(entry.path, id)
  report.created.push(id)
  if (opts.writeId && cand.idAnchor === undefined && entry.noteAbsPath !== undefined) {
    writeIdBack(entry.noteAbsPath, id, report)
  }
}

/** --write-id：frontmatter 回填 id（保留原 frontmatter 其余字段与正文） */
function writeIdBack(absPath: string, id: string, report: ImportReport): void {
  try {
    const raw = fs.readFileSync(absPath, 'utf8')
    const parsed = matter(raw)
    const data = typeof parsed.data === 'object' && parsed.data !== null && !Array.isArray(parsed.data)
      ? { ...(parsed.data as Record<string, unknown>), id }
      : { id }
    fs.writeFileSync(absPath, matter.stringify(parsed.content, data), 'utf8')
  } catch (e) {
    report.warnings.push(
      `${absPath}: 回填 id 失败（${e instanceof Error ? e.message : String(e)}），memlite id=${id}`,
    )
  }
}

/** status：vault 各文件相对当前库的同步态（synced/outdated/missing） */
export async function statusVault(vaultPath: string, opts: { dataDir?: string; project?: string } = {}): Promise<StatusReport> {
  const { entries, skipped } = walkVault(vaultPath)
  const mem = openBridgeMem(opts.dataDir)
  const rows: StatusRow[] = []
  try {
    for (const entry of entries) {
      const cand = toCandidate(entry, opts.project)
      let hit = null
      try {
        hit = findExisting(mem, { frontmatterId: cand.idAnchor, sourceHash: cand.sourceHash, obsidianPath: entry.path })
      } catch {
        // id 锚非法：按无 id 锚继续
        hit = findExisting(mem, { sourceHash: cand.sourceHash, obsidianPath: entry.path })
      }
      if (hit === null) {
        rows.push({ path: entry.path, state: 'missing', id: '', anchor: null, changes: [] })
        continue
      }
      const view = mem.show(hit.id)
      if (view === undefined) {
        rows.push({ path: entry.path, state: 'missing', id: '', anchor: null, changes: [] })
        continue
      }
      const changes = diffAgainst(view.record, cand)
      rows.push({ path: entry.path, state: changes.length === 0 ? 'synced' : 'outdated', id: view.record.id, anchor: hit.anchor, changes })
    }
  } finally {
    mem.close()
  }
  return {
    rows,
    synced: rows.filter((r) => r.state === 'synced').length,
    outdated: rows.filter((r) => r.state === 'outdated').length,
    missing: rows.filter((r) => r.state === 'missing').length,
    skipped,
  }
}
