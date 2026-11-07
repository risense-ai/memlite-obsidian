import * as fs from 'node:fs'
import * as path from 'node:path'
import { SKIP_DIR_NAMES } from '../shared/constants'
import type { SkippedInfo, VaultEntry, WalkResult } from '../shared/types'
import { BinaryFileError, parseMarkdownFile } from './parser'

/** 遍历 vault：.md 文件 + 目录（含 folder note 合并）→ VaultEntry[]。
 * 跳过 .obsidian/.trash 与隐藏目录、非 .md 文件；循环软链以 realpath + 已访问集防护。 */
export function walkVault(vaultPath: string): WalkResult {
  const rootReal = fs.realpathSync(path.resolve(vaultPath))
  const entries: VaultEntry[] = []
  const skipped: SkippedInfo[] = []
  const visited = new Set<string>([rootReal])

  /** 返回该目录下产生的条目（目录条在文件条之前；深度优先，父先于子）。
   * folderNote：父目录里与本目录同名的 X.md（folder note），由父层解析后下传。 */
  const walkDir = (
    absDir: string,
    relDir: string,
    parentPath: string | null,
    folderNote?: { dirent: fs.Dirent; absPath: string },
  ): void => {
    let dirents: fs.Dirent[]
    try {
      dirents = fs.readdirSync(absDir, { withFileTypes: true })
    } catch (e) {
      skipped.push({
        path: relDir === '' ? '.' : relDir,
        reason: 'read-error',
        detail: e instanceof Error ? e.message : String(e),
      })
      return
    }

    const subdirs: fs.Dirent[] = []
    const mdFiles: fs.Dirent[] = []
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue // 隐藏文件与目录
      if (d.isDirectory()) {
        if (SKIP_DIR_NAMES.has(d.name)) continue
        subdirs.push(d)
      } else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
        mdFiles.push(d)
      } else if (d.isSymbolicLink()) {
        // 软链：目标目录按子目录走（循环在 realpath 层防护）；目标 .md 按文件走
        const abs = path.join(absDir, d.name)
        let st: fs.Stats
        try {
          st = fs.statSync(abs)
        } catch {
          skipped.push({ path: joinRel(relDir, d.name), reason: 'read-error', detail: '软链目标不可达' })
          continue
        }
        if (st.isDirectory()) {
          if (!SKIP_DIR_NAMES.has(d.name)) subdirs.push(d)
        } else if (st.isFile() && d.name.toLowerCase().endsWith('.md')) {
          mdFiles.push(d)
        }
      }
    }

    // 与子目录同名的 X.md 是子目录的 folder note——下传给子层，不立文件条
    const dirNames = new Set(subdirs.map((d) => d.name))

    const dirEntryPath = relDir === '' ? null : relDir
    if (dirEntryPath !== null) {
      const st = fs.statSync(absDir)
      const entry: VaultEntry = {
        path: dirEntryPath,
        isDirectory: true,
        title: path.basename(absDir),
        content: '',
        frontmatter: {},
        parentPath,
        mtime: st.mtimeMs / 1000,
      }
      if (folderNote !== undefined) {
        entry.noteAbsPath = folderNote.absPath
        try {
          const parsed = parseMarkdownFile(folderNote.absPath, stripMd(folderNote.dirent.name))
          if (parsed === null) {
            skipped.push({ path: joinRel(parentOf(relDir) ?? '', folderNote.dirent.name), reason: 'read-error' })
          } else {
            entry.title = parsed.title
            entry.content = parsed.content
            entry.frontmatter = parsed.frontmatter
          }
        } catch (e) {
          if (e instanceof BinaryFileError) {
            skipped.push({ path: joinRel(parentOf(relDir) ?? '', folderNote.dirent.name), reason: 'binary' })
          } else {
            throw e
          }
        }
      }
      entries.push(entry)
    }

    // 非 folder note 的 .md 文件条
    for (const f of mdFiles) {
      if (dirNames.has(stripMd(f.name))) continue // 子目录的 folder note，由子层消费
      const rel = joinRel(relDir, f.name)
      let abs = path.join(absDir, f.name)
      if (f.isSymbolicLink()) {
        try {
          abs = fs.realpathSync(abs)
        } catch {
          skipped.push({ path: rel, reason: 'read-error', detail: '软链目标不可达' })
          continue
        }
      }
      let st: fs.Stats
      try {
        st = fs.statSync(abs)
      } catch (e) {
        skipped.push({ path: rel, reason: 'read-error', detail: e instanceof Error ? e.message : String(e) })
        continue
      }
      const fallback = stripMd(f.name)
      try {
        const parsed = parseMarkdownFile(abs, fallback)
        if (parsed === null) {
          skipped.push({ path: rel, reason: 'read-error' })
          continue
        }
        if (parsed.content.trim() === '') {
          skipped.push({ path: rel, reason: 'empty-content' })
          continue
        }
        entries.push({
          path: rel,
          isDirectory: false,
          title: parsed.title,
          content: parsed.content,
          frontmatter: parsed.frontmatter,
          parentPath: dirEntryPath,
          mtime: st.mtimeMs / 1000,
          noteAbsPath: abs,
        })
      } catch (e) {
        if (e instanceof BinaryFileError) {
          skipped.push({ path: rel, reason: 'binary' })
        } else {
          throw e
        }
      }
    }

    // 子目录（循环软链防护：realpath 已访问即跳过）
    for (const d of subdirs) {
      const childAbs = path.join(absDir, d.name)
      const childRel = joinRel(relDir, d.name)
      let real: string
      try {
        real = fs.realpathSync(childAbs)
      } catch {
        skipped.push({ path: childRel, reason: 'read-error', detail: '目录不可达' })
        continue
      }
      if (visited.has(real)) continue // 循环软链
      visited.add(real)
      const note = mdFiles.find((f) => stripMd(f.name) === d.name)
      walkDir(
        real,
        childRel,
        dirEntryPath,
        note !== undefined
          ? { dirent: note, absPath: path.join(absDir, note.name) }
          : undefined,
      )
    }
  }

  walkDir(rootReal, '', null)

  // 目录条 content = 子条标题列表（folder note 已有正文则保留）
  fillDirectoryContents(entries, skipped)
  resolveTitleConflicts(entries)
  return { entries, skipped }
}

/** 目录条无正文时填子条标题列表；仍为空（空目录）记 skipped.empty-dir 并剔除该条 */
function fillDirectoryContents(entries: VaultEntry[], skipped: SkippedInfo[]): void {
  for (const e of [...entries]) {
    if (!e.isDirectory || e.content.trim() !== '') continue
    const childTitles = entries
      .filter((c) => c.path !== e.path && parentOf(c.path) === e.path)
      .map((c) => `- ${c.title}`)
    if (childTitles.length === 0) {
      entries.splice(entries.indexOf(e), 1)
      skipped.push({ path: e.path, reason: 'empty-dir' })
      continue
    }
    e.content = childTitles.join('\n')
  }
}

/** 同名不同目录的 title 冲突：后者逐级加父目录前缀直到唯一 */
function resolveTitleConflicts(entries: VaultEntry[]): void {
  const seen = new Map<string, number>()
  for (const e of entries) {
    const n = seen.get(e.title) ?? 0
    if (n === 0) {
      seen.set(e.title, 1)
      continue
    }
    seen.set(e.title, n + 1)
    let title = e.title
    let dir = parentOf(e.path)
    while (dir !== null && seen.get(title) !== undefined) {
      title = `${basenameOf(dir)}/${title}`
      dir = parentOf(dir)
    }
    e.title = title
  }
}

function stripMd(name: string): string {
  return name.replace(/\.md$/i, '')
}

function joinRel(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}

function parentOf(rel: string): string | null {
  const i = rel.lastIndexOf('/')
  return i === -1 ? null : rel.slice(0, i)
}

function basenameOf(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i === -1 ? rel : rel.slice(i + 1)
}
