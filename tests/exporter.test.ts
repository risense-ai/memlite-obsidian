import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Memlite } from '@rsrsai/memlite'
import { exportVault } from '../src/export/exporter'
import { renderMarkdown, toFrontmatterData } from '../src/export/frontmatter'
import { sanitizeFilename, resolveConflict } from '../src/export/filename'
import { buildTree } from '../src/export/tree'
import { importVault } from '../src/import/importer'
import { sourceHash } from '../src/import/dedup'

const dirs: string[] = []

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memlite-export-'))
  dirs.push(d)
  return d
}

function write(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('sanitizeFilename', () => {
  it('Obsidian 禁止字符剔除', () => {
    expect(sanitizeFilename('什么是 Rust？')).toBe('什么是 Rust') // ？
    expect(sanitizeFilename('a[b]c#d^e|f/g\\h:i*j?k"l<m>n')).toBe('abcdefghijklmn')
    expect(sanitizeFilename('  两边空格  ')).toBe('两边空格')
  })

  it('空值兜底 untitled；超长截断', () => {
    expect(sanitizeFilename('[#^|]')).toBe('untitled')
    expect(sanitizeFilename('长'.repeat(200)).length).toBe(120)
  })
})

describe('resolveConflict', () => {
  it('同目录同名加 -1 -2 后缀', () => {
    const used = new Set<string>()
    expect(resolveConflict('Rust', used)).toBe('Rust')
    used.add('Rust.md')
    expect(resolveConflict('Rust', used)).toBe('Rust-1')
    used.add('Rust-1.md')
    expect(resolveConflict('Rust', used)).toBe('Rust-2')
  })
})

describe('toFrontmatterData', () => {
  it('字段序与桥内部字段剔除', () => {
    const rec = {
      op: 'put' as const,
      id: 'abcd1234abcd',
      ts: 1767323045,
      title: '什么是 Rust',
      content: '正文',
      tags: ['rust'],
      project: 'risense',
      extra: {
        parent_id: '',
        source_hash: 'h',
        obsidian_path: 'a.md',
        import_source: 'obsidian',
        importance: 'important',
        kind: 'Skill',
        status: 'draft',
      },
    }
    const { data } = toFrontmatterData(rec)
    expect(Object.keys(data)).toEqual(['id', 'title', 'created', 'tags', 'project', 'importance', 'kind', 'status'])
    expect(data['created']).toBe(new Date(1767323045 * 1000).toISOString())
    expect(data['status']).toBe('draft')
    expect(data['source_hash']).toBeUndefined()
    expect(data['obsidian_path']).toBeUndefined()
    expect(data['parent_id']).toBeUndefined()
  })
})

describe('buildTree', () => {
  it('parent_id 链 → 树；悬空父按根并计数', async () => {
    const d = tmp()
    const mem = new Memlite({ dataDir: d }, {})
    mem.open()
    const a = mem.store.put('A', 'A', [], '')
    const b = mem.store.putChild('B', 'B', [], '', a)
    mem.store.putChild('C', 'C', [], '', b)
    mem.close()
    // 悬空父指针仅来自外部数据（Rust 库/手改）——主类路径有防悬空护栏。
    // 模拟：直写一行原始 JSONL。
    const { DATA_FILE } = await import('@rsrsai/memlite')
    fs.appendFileSync(
      path.join(d, DATA_FILE),
      JSON.stringify({ op: 'put', id: 'ghost0000001', ts: 1, title: '悬空', content: 'x', tags: [], project: '', parent_id: 'notexist0000' }) + '\n',
    )
    const mem2 = new Memlite({ dataDir: d }, {})
    mem2.open()
    const { roots, dangling } = buildTree(mem2)
    expect(dangling).toBe(1)
    expect(roots.map((r) => r.record.title).sort()).toEqual(['A', '悬空'])
    const aNode = roots.find((r) => r.record.title === 'A')!
    expect(aNode.children[0].record.title).toBe('B')
    expect(aNode.children[0].children[0].record.title).toBe('C')
    mem2.close()
  })
})

describe('exportVault', () => {
  it('root → A → B → C 链导出为嵌套目录 + folder note', () => {
    const d = tmp()
    const out = path.join(tmp(), 'vault')
    const mem = new Memlite({ dataDir: d }, {})
    mem.open()
    const aid = mem.store.put('A 正文', 'A', [], '')
    const bid = mem.store.putChild('B 正文', 'B', [], '', aid)
    mem.store.putChild('C 正文', 'C', [], '', bid)
    mem.close()
    const report = exportVault(out, { dataDir: d })
    expect(report.written).toBe(3)
    expect(fs.existsSync(path.join(out, 'A.md'))).toBe(true)
    expect(fs.existsSync(path.join(out, 'A/B.md'))).toBe(true)
    expect(fs.existsSync(path.join(out, 'A/B/C.md'))).toBe(true)
    expect(fs.existsSync(path.join(out, '.obsidian/app.json'))).toBe(true)
    const aMd = fs.readFileSync(path.join(out, 'A.md'), 'utf8')
    expect(aMd).toContain('id: ' + aid)
    expect(aMd).toContain('A 正文')
  })

  it('默认拒绝覆盖非空目录；--overwrite 清空重写', () => {
    const d = tmp()
    const out = path.join(tmp(), 'vault')
    const mem = new Memlite({ dataDir: d }, {})
    mem.open()
    mem.store.put('正文', '题', [], '')
    mem.close()
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'stale.md'), '旧文件')
    expect(() => exportVault(out, { dataDir: d })).toThrow('已存在且非空')
    exportVault(out, { dataDir: d, overwrite: true })
    expect(fs.existsSync(path.join(out, 'stale.md'))).toBe(false)
    expect(fs.existsSync(path.join(out, '题.md'))).toBe(true)
  })

  it('title 冲突同目录消解为 -1', () => {
    const d = tmp()
    const out = path.join(tmp(), 'vault')
    const mem = new Memlite({ dataDir: d }, {})
    mem.open()
    mem.store.put('甲', '同名', [], '')
    mem.store.put('乙', '同名', [], '')
    mem.close()
    exportVault(out, { dataDir: d })
    expect(fs.existsSync(path.join(out, '同名.md'))).toBe(true)
    expect(fs.existsSync(path.join(out, '同名-1.md'))).toBe(true)
  })

  it('extra 平铺与 importance/kind 进 frontmatter', () => {
    const d = tmp()
    const out = path.join(tmp(), 'vault')
    const mem = new Memlite({ dataDir: d }, {})
    mem.open()
    mem.store.putFull({
      id: 'abcd1234abcd',
      ts: 1767323045,
      content: '正文',
      title: '题',
      tags: ['t'],
      project: 'p',
      extra: { importance: 'trivial', kind: 'Skill', status: 'draft' },
    })
    mem.close()
    exportVault(out, { dataDir: d })
    const md = fs.readFileSync(path.join(out, '题.md'), 'utf8')
    expect(md).toContain('id: abcd1234abcd')
    expect(md).toContain('importance: trivial')
    expect(md).toContain('kind: Skill')
    expect(md).toContain('status: draft')
    expect(md).toContain('project: p')
    expect(md).not.toContain('source_hash')
    expect(md).not.toContain('parent_id')
  })
})

describe('互通：导出 → 再导入 → 幂等', () => {
  it('混合 vault 导入 → 导出 → 再导入：零新建零更新全 unchanged', async () => {
    // 第一段：vault → memlite
    const vault1 = tmp()
    const d = tmp()
    write(path.join(vault1, '散落.md'), '# 散落笔记\n\n顶层正文')
    write(
      path.join(vault1, '编程/Rust.md'),
      '---\ntags: [rust, memory]\nproject: risense\ncreated: 2026-01-02T03:04:05Z\nimportance: important\nkind: Skill\nstatus: draft\n---\n\nRust 语言正文，参见 [[所有权]]。',
    )
    write(path.join(vault1, '编程/Rust/所有权.md'), 'ownership 三条规则。')
    write(path.join(vault1, '生活/菜谱.md'), '# 菜谱\n\n番茄炒蛋。')
    const r1 = await importVault(vault1, { dataDir: d, project: 'demo' })
    expect(r1.skipped.length).toBe(0)

    // 第二段：memlite → vault2
    const out = path.join(tmp(), 'exported')
    exportVault(out, { dataDir: d })

    // 第三段：vault2 → 新库 d2，frontmatter id 直接作 id 建（同 id 新建、零更新零跳过）
    const d2 = tmp()
    const r2 = await importVault(out, { dataDir: d2 })
    expect(r2.created.sort()).toEqual([...r1.created].sort())
    expect(r2.updated.length).toBe(0)
    expect(r2.skipped.length).toBe(0)
    // 幂等：同库第三次导入零变更
    const r3 = await importVault(out, { dataDir: d2 })
    expect(r3.created.length).toBe(0)
    expect(r3.updated.length).toBe(0)
    expect(r3.unchanged).toBe(r1.created.length)

    // 第四段：两个库逐条等价（title/content/tags/project/ts/parent 链）
    const memA = new Memlite({ dataDir: d }, {})
    const memB = new Memlite({ dataDir: d2 }, {})
    memA.open()
    memB.open()
    const allA = memA.store.all().sort((x, y) => x.id.localeCompare(y.id))
    const allB = memB.store.all().sort((x, y) => x.id.localeCompare(y.id))
    expect(allB.map((r) => r.id)).toEqual(allA.map((r) => r.id))
    for (const recA of allA) {
      const recB = memB.store.get(recA.id)!
      expect(recB.title).toBe(recA.title)
      expect(recB.content).toBe(recA.content)
      expect(recB.tags).toEqual(recA.tags)
      expect(recB.project).toBe(recA.project)
      expect(recB.ts).toBe(recA.ts)
      expect(recB.extra['parent_id']).toBe(recA.extra['parent_id'])
      expect(recB.extra['source_hash']).toBe(recA.extra['source_hash'])
    }
    memA.close()
    memB.close()
  })

  it('目录条 folder note 往返：目录正文不丢', async () => {
    const vault = tmp()
    const d = tmp()
    write(path.join(vault, '编程/Rust.md'), '# Rust 语言\n\nfolder note 正文。')
    write(path.join(vault, '编程/Rust/所有权.md'), '细则')
    await importVault(vault, { dataDir: d })
    const out = path.join(tmp(), 'exported')
    exportVault(out, { dataDir: d })
    // 目录条 title='Rust 语言' → 导出为 'Rust 语言.md'（folder note）+ 同名目录
    expect(fs.existsSync(path.join(out, '编程/Rust 语言.md'))).toBe(true)
    expect(fs.existsSync(path.join(out, '编程/Rust 语言/所有权.md'))).toBe(true)
    const rustMd = fs.readFileSync(path.join(out, '编程/Rust 语言.md'), 'utf8')
    expect(rustMd).toContain('folder note 正文。')
    // 再导入目录条 hash 不变
    const d2 = tmp()
    const r = await importVault(out, { dataDir: d2 })
    expect(r.updated.length).toBe(0)
    const mem = new Memlite({ dataDir: d2 }, {})
    mem.open()
    const rust = mem.store.all().find((x) => x.title === 'Rust 语言')!
    expect(rust.extra['source_hash']).toBe(sourceHash('Rust 语言', 'folder note 正文。'))
    mem.close()
  })
})

describe('renderMarkdown', () => {
  it('正文紧随 frontmatter；空 tags 序列化 []', () => {
    const rec = {
      op: 'put' as const,
      id: 'abcd1234abcd',
      ts: 1767323045,
      title: '题',
      content: '第一行\n\n第二行',
      tags: [],
      project: '',
      extra: { parent_id: '' },
    }
    const md = renderMarkdown(rec)
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('tags: []')
    expect(md.trimEnd().endsWith('第二行')).toBe(true)
  })
})
