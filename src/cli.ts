#!/usr/bin/env node
import { cac } from 'cac'
import { importVault, statusVault } from './import/importer'
import type { ImportReport } from './shared/types'

const VERSION = '0.1.0'

const cli = cac('memlite-obsidian')

cli
  .command('import <vault>', '导入 Obsidian vault 到 memlite（一次性快照）')
  .option('--project <project>', '兜底 project（frontmatter.project 缺失时用）')
  .option('--write-id', '新建后回填 frontmatter.id 到 MD 文件')
  .option('--dry-run', '只打印将要写入的条数与变更，不实际写')
  .option('--data-dir <dir>', 'memlite 数据目录（缺省 env > 项目级 > 用户级）')
  .option('--json', '输出 JSON')
  .action(async (vault: string, opts: { project?: string; writeId?: boolean; dryRun?: boolean; dataDir?: string; json?: boolean }) => {
    try {
      const report = await importVault(vault, {
        project: opts.project,
        writeId: opts.writeId,
        dryRun: opts.dryRun,
        dataDir: opts.dataDir,
      })
      printImportReport(report, opts.json === true, opts.dryRun === true)
    } catch (e) {
      console.error(`导入失败: ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 1
    }
  })

cli
  .command('status <vault>', '查看 vault 各文件相对当前 memlite 库的同步态')
  .option('--data-dir <dir>', 'memlite 数据目录（缺省 env > 项目级 > 用户级）')
  .option('--json', '输出 JSON')
  .action(async (vault: string, opts: { dataDir?: string; json?: boolean }) => {
    try {
      const report = await statusVault(vault, { dataDir: opts.dataDir })
      if (opts.json === true) {
        console.log(JSON.stringify(report, null, 2))
        return
      }
      for (const row of report.rows) {
        const mark = row.state === 'synced' ? '=' : row.state === 'outdated' ? '~' : '+'
        const extra = row.state === 'outdated' ? ` (${row.changes.join(',')})` : ''
        console.log(`${mark} ${row.path}${extra}`)
      }
      for (const s of report.skipped) {
        console.log(`- ${s.path} [${s.reason}${s.detail ? `: ${s.detail}` : ''}]`)
      }
      console.log(`\nsynced=${report.synced} outdated=${report.outdated} missing=${report.missing} skipped=${report.skipped.length}`)
    } catch (e) {
      console.error(`status 失败: ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 1
    }
  })

cli.help()
cli.version(VERSION)
cli.parse()

function printImportReport(r: ImportReport, json: boolean, dryRun: boolean): void {
  if (json) {
    console.log(JSON.stringify(r, null, 2))
    return
  }
  if (dryRun) {
    console.log(`dry-run：将新建 ${r.wouldCreate} 条，更新 ${r.wouldUpdate} 条，不变 ${r.unchanged} 条，跳过 ${r.skipped.length} 条`)
    return
  }
  for (const w of r.warnings) console.warn(`warn: ${w}`)
  for (const s of r.skipped) console.warn(`skip: ${s.path} [${s.reason}${s.detail ? `: ${s.detail}` : ''}]`)
  console.log(`导入完成：新建 ${r.created.length} 条，更新 ${r.updated.length} 条，不变 ${r.unchanged} 条，跳过 ${r.skipped.length} 条`)
}
