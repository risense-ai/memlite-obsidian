import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Memlite } from '@rsrsai/memlite'
import { openBridgeMem } from '../import/importer'
import { renderMarkdown } from './frontmatter'
import { resolveConflict, sanitizeFilename } from './filename'
import { buildTree, type ExportNode } from './tree'

export interface ExportOptions {
  dataDir?: string
  /** 输出目录已存在非空时允许覆盖（先清空该目录） */
  overwrite?: boolean
  onProgress?: (done: number, total: number, title: string) => void
}

export interface ExportReport {
  output: string
  total: number
  written: number
  /** 悬空父指针按根处理并计入 */
  dangling: number
  warnings: string[]
}

/** 主导出流：因果树 → 目录树 vault。默认拒绝覆盖已存在目录；--overwrite 先清空。 */
export function exportVault(outputPath: string, opts: ExportOptions = {}): ExportReport {
  const outAbs = path.resolve(outputPath)
  if (fs.existsSync(outAbs)) {
    const empty = fs.readdirSync(outAbs).length === 0
    if (!empty && opts.overwrite !== true) {
      throw new Error(`输出目录已存在且非空（--overwrite 可覆盖）: ${outAbs}`)
    }
    if (!empty) fs.rmSync(outAbs, { recursive: true, force: true })
  }
  fs.mkdirSync(outAbs, { recursive: true })

  const mem: Memlite = openBridgeMem(opts.dataDir)
  const warnings: string[] = []
  let written = 0
  let total = 0
  let dangling = 0
  try {
    const tree = buildTree(mem)
    dangling = tree.dangling
    const roots = tree.roots
    if (dangling > 0) warnings.push(`${dangling} 条 parent_id 悬空（父已删），按根处理`)
    total = countNodes(roots)
    // 同目录文件名集合：全树预占（目录名与文件名共享命名空间）
    const usedByDir = new Map<string, Set<string>>()
    for (const root of roots) {
      writeNode(root, outAbs, '', usedByDir, (n) => {
        written++
        opts.onProgress?.(written, total, n.record.title)
      }, warnings)
    }
    // 最小 .obsidian 配置（打开即用；graph/backlinks 为核心插件默认开）
    const obsidianDir = path.join(outAbs, '.obsidian')
    fs.mkdirSync(obsidianDir, { recursive: true })
    fs.writeFileSync(path.join(obsidianDir, 'app.json'), '{}\n', 'utf8')
  } finally {
    mem.close()
  }
  return { output: outAbs, total, written, dangling, warnings }
}

function writeNode(
  node: ExportNode,
  outAbs: string,
  relDir: string,
  usedByDir: Map<string, Set<string>>,
  onWritten: (n: ExportNode) => void,
  warnings: string[],
): void {
  const used = usedByDir.get(relDir) ?? new Set<string>()
  usedByDir.set(relDir, used)
  const base = resolveConflict(sanitizeFilename(node.record.title), used)
  used.add(`${base}.md`)

  const fileRel = relDir === '' ? `${base}.md` : `${relDir}/${base}.md`
  try {
    fs.writeFileSync(path.join(outAbs, fileRel), renderMarkdown(node.record), 'utf8')
    onWritten(node)
  } catch (e) {
    warnings.push(`${fileRel}: 写入失败（${e instanceof Error ? e.message : String(e)}）`)
    return
  }

  if (node.children.length === 0) return
  const childDirRel = relDir === '' ? base : `${relDir}/${base}`
  fs.mkdirSync(path.join(outAbs, childDirRel), { recursive: true })
  for (const child of node.children) {
    writeNode(child, outAbs, childDirRel, usedByDir, onWritten, warnings)
  }
}

function countNodes(nodes: ExportNode[]): number {
  let n = 0
  for (const node of nodes) n += 1 + countNodes(node.children)
  return n
}
