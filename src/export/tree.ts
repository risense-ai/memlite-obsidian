import type { Memlite, MemRecord } from '@rsrsai/memlite'
import { parentId } from '@rsrsai/memlite'

export interface ExportNode {
  record: MemRecord
  children: ExportNode[]
}

export interface BuildTreeResult {
  roots: ExportNode[]
  /** parent_id 指向不存在记录的悬空条数（按根处理并计入） */
  dangling: number
}

/** 读全库 → 因果树：按 parent_id 建父子，children 按 ts 升序；悬空父指针按根处理。 */
export function buildTree(mem: Memlite): BuildTreeResult {
  const all = mem.store.all()
  const byId = new Map<string, ExportNode>(all.map((r) => [r.id, { record: r, children: [] }]))
  const roots: ExportNode[] = []
  let dangling = 0
  for (const node of byId.values()) {
    const pid = parentId(node.record)
    const parent = pid === '' ? undefined : byId.get(pid)
    if (parent === undefined) {
      if (pid !== '') dangling++
      roots.push(node)
      continue
    }
    parent.children.push(node)
  }
  const byTs = (a: ExportNode, b: ExportNode): number => a.record.ts - b.record.ts
  for (const node of byId.values()) node.children.sort(byTs)
  roots.sort(byTs)
  return { roots, dangling }
}
