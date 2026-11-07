import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    outDir: 'dist',
    // memlite 类型外引不内联：内联会对 file: 依赖的 dist 拷贝时序敏感（CI 曾读到旧 d.ts）
    external: ['@rsrsai/memlite'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    target: 'node18',
    outDir: 'dist',
  },
])
