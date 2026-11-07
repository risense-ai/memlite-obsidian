/** *With 共享实例重载测试：不关闭传入实例、复用可用、与 CLI 版互通。 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Memlite } from '@rsrsai/memlite'
import { exportVault, exportVaultWith } from '../src/export/exporter'
import { importVault, importVaultWith, statusVaultWith } from '../src/import/importer'

const dirs: string[] = []

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memlite-obsidian-with-'))
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

describe('importVaultWith', () => {
  it('复用传入实例：导入后实例仍 open 且条目可查', async () => {
    const vault = tmp()
    write(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    write(path.join(vault, '乙.md'), '---\ntitle: 乙题\n---\n\n乙正文')
    const mem = new Memlite({ dataDir: tmp() })
    mem.open()
    const report = await importVaultWith(mem, vault)
    expect(report.created.length).toBe(2)
    // 传入实例未被关闭：仍可读写
    expect(mem.store.count()).toBe(2)
    const rid = await mem.remember('续写条目', { title: '续写' })
    expect(mem.store.get(rid)).toBeDefined()
    mem.close()
  })

  it('progress 回调经 With 重载照常触发', async () => {
    const vault = tmp()
    write(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    const mem = new Memlite({ dataDir: tmp() })
    mem.open()
    let calls = 0
    await importVaultWith(mem, vault, { onProgress: () => { calls++ } })
    expect(calls).toBe(1)
    mem.close()
  })

  it('dry-run 经 With 重载不写库', async () => {
    const vault = tmp()
    write(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    const mem = new Memlite({ dataDir: tmp() })
    mem.open()
    const report = await importVaultWith(mem, vault, { dryRun: true })
    expect(report.wouldCreate).toBe(1)
    expect(mem.store.count()).toBe(0)
    mem.close()
  })
})

describe('statusVaultWith / exportVaultWith', () => {
  it('status 复用实例；export 后实例仍 open', async () => {
    const vault = tmp()
    write(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    const mem = new Memlite({ dataDir: tmp() })
    mem.open()
    await importVaultWith(mem, vault)
    const st = await statusVaultWith(mem, vault)
    expect(st.synced).toBe(1)
    const out = path.join(tmp(), 'out-vault')
    const er = exportVaultWith(mem, out)
    expect(er.written).toBe(1)
    // 实例仍 open：再补一条
    await mem.remember('后置条', { title: '后置' })
    expect(mem.store.count()).toBe(2)
    mem.close()
  })
})

describe('CLI 版与 With 版互通', () => {
  it('importVault(CLI) 写库 → exportVaultWith(共享实例) 读同一 dataDir', async () => {
    const vault = tmp()
    write(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    const dataDir = tmp()
    await importVault(vault, { dataDir })
    // 共享实例打开同一 dataDir，With 版导出
    const mem = new Memlite({ dataDir })
    mem.open()
    const out = path.join(tmp(), 'out-vault')
    const er = exportVaultWith(mem, out)
    expect(er.total).toBe(1)
    mem.close()
  })
})
