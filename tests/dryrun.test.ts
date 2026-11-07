/** dry-run 与实导入的条目分类一致性（目录子条不误报 parent-failed）。 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Memlite } from '@rsrsai/memlite'
import { importVaultWith } from '../src/import/importer'

const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('dry-run 一致性', () => {
  it('含目录条的 vault：dry-run 分类与实导入一致，无 parent-failed', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-dryrun-'))
    dirs.push(vault)
    fs.writeFileSync(path.join(vault, '甲.md'), '---\ntitle: 甲题\n---\n\n甲正文')
    fs.mkdirSync(path.join(vault, '子目录'))
    fs.writeFileSync(path.join(vault, '子目录', '丙.md'), '---\ntitle: 丙题\n---\n\n丙正文')
    const mem = new Memlite({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mo-dryrun-dd-')) })
    mem.open()
    const dry = await importVaultWith(mem, vault, { dryRun: true })
    expect(dry.skipped.filter((s) => s.reason === 'parent-failed').length).toBe(0)
    expect(dry.wouldCreate).toBe(3)
    const real = await importVaultWith(mem, vault)
    expect(real.created.length).toBe(3)
    expect(real.skipped.length).toBe(0)
    mem.close()
  })
})
