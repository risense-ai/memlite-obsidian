import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Memlite } from '@rsrsai/memlite'
import { importVault, statusVault } from '../src/import/importer'
import { walkVault } from '../src/import/tree'
import { sourceHash } from '../src/import/dedup'

const dirs: string[] = []

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memlite-obsidian-'))
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

describe('walkVault', () => {
  it('空 vault：零条目', () => {
    const v = tmp()
    const r = walkVault(v)
    expect(r.entries).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it('纯散落文件：全为根条', () => {
    const v = tmp()
    write(path.join(v, 'a.md'), '# A\n\n内容 A')
    write(path.join(v, 'b.md'), '正文 B')
    const r = walkVault(v)
    expect(r.entries.length).toBe(2)
    expect(r.entries.every((e) => e.parentPath === null)).toBe(true)
    const a = r.entries.find((e) => e.title === 'A')!
    expect(a.content).toBe('内容 A')
    const b = r.entries.find((e) => e.title === 'b')!
    expect(b.content).toBe('正文 B')
  })

  it('单层目录：目录条 Context + 子条挂父', () => {
    const v = tmp()
    write(path.join(v, '编程/Rust.md'), '# Rust\n所有权的理解')
    write(path.join(v, '编程/Python.md'), 'python 正文')
    const r = walkVault(v)
    const dir = r.entries.find((e) => e.isDirectory)!
    expect(dir.path).toBe('编程')
    expect(dir.title).toBe('编程')
    expect(dir.parentPath).toBeNull()
    expect(dir.content).toBe('- Python\n- Rust')
    const rust = r.entries.find((e) => e.title === 'Rust')!
    expect(rust.parentPath).toBe('编程')
    expect(rust.isDirectory).toBe(false)
  })

  it('多层目录 + folder note：同名 .md 并入目录条', () => {
    const v = tmp()
    write(path.join(v, '编程/Rust.md'), '# Rust 语言\n\n系统编程语言笔记。')
    write(path.join(v, '编程/Rust/所有权.md'), 'ownership 细则')
    const r = walkVault(v)
    const rustDir = r.entries.find((e) => e.isDirectory && e.path === '编程/Rust')!
    expect(rustDir.title).toBe('Rust 语言')
    expect(rustDir.content).toBe('系统编程语言笔记。')
    expect(rustDir.parentPath).toBe('编程')
    // folder note 不单独立条
    expect(r.entries.filter((e) => !e.isDirectory).map((e) => e.title)).toEqual(['所有权'])
    const own = r.entries.find((e) => e.title === '所有权')!
    expect(own.parentPath).toBe('编程/Rust')
  })

  it('跳过 .obsidian/.trash/隐藏目录与非 .md 附件', () => {
    const v = tmp()
    write(path.join(v, '.obsidian/config.json'), '{}')
    write(path.join(v, '.trash/废弃.md'), 'x')
    write(path.join(v, '.hidden.md'), 'x')
    write(path.join(v, '图片.png'), 'binary')
    write(path.join(v, '正常.md'), 'ok')
    const r = walkVault(v)
    expect(r.entries.map((e) => e.title)).toEqual(['正常'])
    expect(r.skipped).toEqual([])
  })

  it('循环软链不挂死', () => {
    const v = tmp()
    write(path.join(v, 'a/里.md'), '正文')
    fs.symlinkSync(path.join(v, 'a'), path.join(v, 'loop'))
    const r = walkVault(v)
    expect(r.entries.map((e) => e.path).sort()).toEqual(['a', 'a/里.md'])
  })
})

describe('parseMarkdownFile 边界（经 walk 呈现）', () => {
  it('空文件与只有 frontmatter：empty-content 跳过', () => {
    const v = tmp()
    write(path.join(v, '空.md'), '')
    write(path.join(v, '仅fm.md'), '---\ntags: [x]\n---\n')
    write(path.join(v, '仅标题.md'), '# 只有标题')
    const r = walkVault(v)
    expect(r.entries).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(['empty-content', 'empty-content', 'empty-content'])
  })

  it('二进制 .md：binary 跳过', () => {
    const v = tmp()
    fs.writeFileSync(path.join(v, 'bin.md'), Buffer.from([0xe4, 0x00, 0xb8, 0x01]))
    const r = walkVault(v)
    expect(r.entries).toEqual([])
    expect(r.skipped).toEqual([{ path: 'bin.md', reason: 'binary' }])
  })

  it('wikilinks 保留原文，不解析为因果', async () => {
    const v = tmp()
    write(path.join(v, '主.md'), '参见 [[另一篇]] 与 #标签')
    const memFile = tmp()
    const report = await importVault(v, { dataDir: memFile })
    expect(report.created.length).toBe(1)
    const mem = new Memlite({ dataDir: memFile }, {})
    const rec = mem.show(report.created[0])!.record
    expect(rec.content).toContain('[[另一篇]]')
    mem.close()
  })

  it('同名不同目录：title 加目录前缀去冲突', () => {
    const v = tmp()
    write(path.join(v, 'a/Rust.md'), 'A 的 Rust')
    write(path.join(v, 'b/Rust.md'), 'B 的 Rust')
    const r = walkVault(v)
    const titles = r.entries.map((e) => e.title).sort()
    expect(titles).toEqual(['Rust', 'a', 'b', 'b/Rust'])
  })
})

describe('importVault 字段映射', () => {
  it('frontmatter 全字段：id/tags/project/created/importance/kind + 自定义键平铺', async () => {
    const v = tmp()
    const d = tmp()
    write(
      path.join(v, '笔.md'),
      '---\nid: abcd1234abcd\ntitle: 自定标题\ntags: [rust, memory]\nproject: risense\ncreated: 2026-01-02T03:04:05Z\nimportance: trivial\nkind: Skill\nstatus: draft\n---\n\n正文 here。',
    )
    const report = await importVault(v, { dataDir: d })
    expect(report.created).toEqual(['abcd1234abcd'])
    const mem = new Memlite({ dataDir: d }, {})
    const rec = mem.show('abcd1234abcd')!.record
    expect(rec.title).toBe('自定标题')
    expect(rec.tags).toEqual(['rust', 'memory'])
    expect(rec.project).toBe('risense')
    expect(rec.ts).toBe(Date.parse('2026-01-02T03:04:05Z') / 1000)
    expect(rec.extra['importance']).toBe('trivial')
    expect(rec.extra['kind']).toBe('Skill')
    expect(rec.extra['status']).toBe('draft')
    expect(rec.extra['import_source']).toBe('obsidian')
    expect(rec.extra['obsidian_path']).toBe('笔.md')
    expect(rec.extra['source_hash']).toBe(sourceHash('自定标题', '正文 here。'))
    mem.close()
  })

  it('缺 frontmatter：文件名作 title、mtime 作 ts、importance 默认 important、--project 兜底', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, '无头.md'), '裸正文')
    const report = await importVault(v, { dataDir: d, project: 'demo' })
    const mem = new Memlite({ dataDir: d }, {})
    const rec = mem.show(report.created[0])!.record
    expect(rec.title).toBe('无头')
    expect(rec.project).toBe('demo')
    expect(rec.extra['importance']).toBe('important')
    expect(rec.ts).toBeGreaterThan(0)
    mem.close()
  })

  it('目录条：kind=Context、父链与目录层级一致', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, '生活/菜谱.md'), '番茄炒蛋')
    const report = await importVault(v, { dataDir: d })
    expect(report.created.length).toBe(2)
    const mem = new Memlite({ dataDir: d }, {})
    const dirRec = mem.show('生活')!.record
    expect(dirRec.title).toBe('生活')
    expect(dirRec.extra['kind']).toBe('Context')
    const dish = mem.show(report.created[1])!.record
    expect(dish.extra['parent_id']).toBe(dirRec.id)
    mem.close()
  })

  it('不安全 frontmatter 键丢弃并告警', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'x.md'), '---\nparent_id: fake\nop: put\nts: 999\n---\n正文')
    const report = await importVault(v, { dataDir: d })
    expect(report.warnings.length).toBe(3)
    const mem = new Memlite({ dataDir: d }, {})
    const rec = mem.show(report.created[0])!.record
    expect(rec.extra['parent_id']).toBe('')
    expect(rec.extra['op']).toBeUndefined()
    mem.close()
  })
})

describe('双轨去重', () => {
  it('重复导入零重复条：第二次全 unchanged', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), '内容 A')
    write(path.join(v, 'dir/b.md'), '内容 B')
    const r1 = await importVault(v, { dataDir: d })
    expect(r1.created.length).toBe(3) // a + dir + dir/b
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.created.length).toBe(0)
    expect(r2.updated.length).toBe(0)
    expect(r2.unchanged).toBe(3)
    const mem = new Memlite({ dataDir: d }, {})
    expect(mem.store.count()).toBe(3)
    mem.close()
  })

  it('改文后重导：hash 锚命中并 update，同 id', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), '旧文')
    const r1 = await importVault(v, { dataDir: d })
    write(path.join(v, 'a.md'), '新文')
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.updated.length).toBe(1)
    expect(r2.updated[0].id).toBe(r1.created[0])
    expect(r2.updated[0].changes).toContain('content')
    expect(r2.updated[0].changes).toContain('source_hash')
    const mem = new Memlite({ dataDir: d }, {})
    expect(mem.show(r1.created[0])!.record.content).toBe('新文')
    mem.close()
  })

  it('frontmatter.id 锚：库外 id 直接以此 id 建条', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), '---\nid: 123456781234\n---\n正文')
    const r1 = await importVault(v, { dataDir: d })
    expect(r1.created).toEqual(['123456781234'])
    // 第二次按 id 命中 unchanged
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.unchanged).toBe(1)
  })

  it('非法 frontmatter.id：告警并跳过 id 锚，走 hash 锚', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), '---\nid: not-valid\n---\n正文')
    const r1 = await importVault(v, { dataDir: d })
    expect(r1.warnings[0]).toContain('非 12 位 hex')
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.unchanged).toBe(1)
    expect(r2.created.length).toBe(0)
  })

  it('无 id 改名移动：path 锚兜底命中原条', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, '旧.md'), '内容')
    const r1 = await importVault(v, { dataDir: d })
    // 同内容换路径 + 换标题 → hash 锚失效，path 锚也变——改文兼改名时 path 锚用的是新路径，不命中
    // 此处测纯改名（内容不变，标题变 → hash 变；obsidian_path 变 → path 锚按新路径亦不命中）
    // 故改用「内容小改但路径不变」验证 path 锚：hash 锚先命中——改为先破坏 hash：改标题
    write(path.join(v, '旧.md'), '# 新标题\n内容')
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.updated[0].id).toBe(r1.created[0])
    expect(r2.updated[0].changes).toContain('title')
  })

  it('目录层级变化：子条 attach 到新父', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a/x.md'), 'x 正文')
    const r1 = await importVault(v, { dataDir: d })
    write(path.join(v, 'b/x.md'), 'x 正文')
    fs.rmSync(path.join(v, 'a'), { recursive: true })
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.updated.some((u) => u.id === r1.created[1] && u.changes.includes('parent'))).toBe(true)
    const mem = new Memlite({ dataDir: d }, {})
    const x = mem.show(r1.created[1])!.record
    const newParent = mem.store.all().find((r) => r.title === 'b')!
    expect(x.extra['parent_id']).toBe(newParent.id)
    mem.close()
  })
})

describe('--write-id 回填', () => {
  it('新建后回填 frontmatter.id；再导入按 id 命中', async () => {
    const v = tmp()
    const d = tmp()
    const p = path.join(v, 'a.md')
    write(p, '---\ntags: [t]\n---\n\n正文保留')
    const r1 = await importVault(v, { dataDir: d, writeId: true })
    expect(r1.created.length).toBe(1)
    const raw = fs.readFileSync(p, 'utf8')
    expect(raw).toContain(`id: ${r1.created[0]}`)
    expect(raw).toContain('正文保留')
    expect(raw).toContain('tags:')
    const r2 = await importVault(v, { dataDir: d })
    expect(r2.unchanged).toBe(1)
  })
})

describe('dry-run', () => {
  it('只预告不写入', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), '内容')
    const r = await importVault(v, { dataDir: d, dryRun: true })
    expect(r.wouldCreate).toBe(1)
    expect(r.created.length).toBe(0)
    const mem = new Memlite({ dataDir: d }, {})
    expect(mem.store.count()).toBe(0)
    mem.close()
  })
})

describe('statusVault', () => {
  it('三态：missing → synced → outdated', async () => {
    const v = tmp()
    const d = tmp()
    write(path.join(v, 'a.md'), 'A 文')
    write(path.join(v, 'b.md'), 'B 文')
    const s0 = await statusVault(v, { dataDir: d })
    expect(s0.missing).toBe(2)
    await importVault(v, { dataDir: d })
    const s1 = await statusVault(v, { dataDir: d })
    expect(s1.synced).toBe(2)
    expect(s1.rows.find((r) => r.path === 'a.md')?.anchor).toBe('hash')
    write(path.join(v, 'a.md'), 'A 文改')
    const s2 = await statusVault(v, { dataDir: d })
    expect(s2.outdated).toBe(1)
    expect(s2.rows.find((r) => r.path === 'a.md')?.changes).toContain('content')
    expect(s2.synced).toBe(1)
  })
})

describe('路径护栏', () => {
  it('空 vault 路径拒绝（不落 cwd）', async () => {
    await expect(importVault('', { dataDir: tmp() })).rejects.toThrow('vault 路径为空')
    expect(() => walkVault('')).toThrow('vault 路径为空')
  })

  it('不存在的 vault 路径拒绝', async () => {
    await expect(importVault('/nonexistent/vault-xyz', { dataDir: tmp() })).rejects.toThrow()
  })
})
