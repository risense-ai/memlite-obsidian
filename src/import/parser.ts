import * as fs from 'node:fs'
import matter from 'gray-matter'

export interface ParsedFile {
  /** frontmatter.title → 首个 `# ` → 文件名（去 .md） */
  title: string
  /** rawBody 去掉 frontmatter 与首个非空 `# ` 行 */
  content: string
  /** 已解析 frontmatter；非对象容错为空对象 */
  frontmatter: Record<string, unknown>
  /** 仅去 frontmatter 的原文正文 */
  rawBody: string
}

/** 二进制附件误以 .md 呈现时抛出（walk 层转 skipped.binary） */
export class BinaryFileError extends Error {
  constructor(path: string) {
    super(`二进制文件: ${path}`)
    this.name = 'BinaryFileError'
  }
}

/** 依序提取标题：frontmatter.title → 首个非空 `# ` 行 → 文件名（去 .md） */
function extractTitle(rawBody: string, frontmatter: Record<string, unknown>, fallback: string): string {
  const fmTitle = frontmatter['title']
  if (typeof fmTitle === 'string' && fmTitle.trim() !== '') return fmTitle.trim()
  for (const line of rawBody.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)
    if (m) return m[1]
  }
  return fallback
}

/** rawBody 去掉首个非空行的 `# ` 标题行（仅当该行确为 h1） */
function stripTitleHeading(rawBody: string): string {
  const lines = rawBody.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (/^#\s/.test(line)) lines.splice(i, 1)
    break
  }
  return lines.join('\n').replace(/^\n+/, '').replace(/\s+$/, '')
}

/**
 * 解析单个 .md 文件；读取失败返回 null（调用方记 skipped.read-error）。
 * 含 \0 判定二进制，抛 BinaryFileError（调用方转 skipped.binary）。
 */
export function parseMarkdownFile(absPath: string, filenameFallback: string): ParsedFile | null {
  let text: string
  try {
    text = fs.readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  if (text.includes('\0')) throw new BinaryFileError(absPath)

  const parsed = matter(text)
  const frontmatter =
    parsed.data !== null && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? (parsed.data as Record<string, unknown>)
      : {}
  const rawBody = parsed.content
  return {
    title: extractTitle(rawBody, frontmatter, filenameFallback),
    content: stripTitleHeading(rawBody),
    frontmatter,
    rawBody,
  }
}
