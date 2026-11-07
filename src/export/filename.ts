/** Obsidian 文件名禁止字符（含路径分隔符；全角变体一并剔除——中文 vault 常见） */
const FORBIDDEN = /[[\]#^|/\\:*?"<>［］＃＾｜／＼：＊？＂＜＞]/g

/** 文件名安全上限（字符数；远低于各文件系统 255 字节限制，给多字节留余量） */
const MAX_LEN = 120

/** title → 安全文件名（去 .md）：禁止字符剔除、截断、空值兜底 */
export function sanitizeFilename(title: string): string {
  let name = title.replace(FORBIDDEN, '').trim()
  if (name.length > MAX_LEN) name = name.slice(0, MAX_LEN).trim()
  if (name === '') name = 'untitled'
  return name
}

/** 同目录冲突消解：name.md 已用则 name-1.md、name-2.md 递增 */
export function resolveConflict(name: string, used: Set<string>): string {
  if (!used.has(`${name}.md`)) return name
  for (let i = 1; ; i++) {
    const candidate = `${name}-${i}`
    if (!used.has(`${candidate}.md`)) return candidate
  }
}
