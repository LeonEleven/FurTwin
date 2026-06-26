/**
 * 将 extract-transparent-frames.mjs 及其依赖打包成 standalone bundle。
 * 输出到 resources/scripts/extract-transparent-frames.bundle.mjs
 * 由 predist 脚本自动调用。
 */

import { buildSync } from 'esbuild'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

buildSync({
  entryPoints: [join(root, 'scripts/extract-transparent-frames.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(root, 'resources/scripts/extract-transparent-frames.bundle.cjs'),
  external: [],
  banner: {
    js: '// Auto-generated bundle — do not edit manually\n// Source: scripts/extract-transparent-frames.mjs',
  },
})

console.log('[build-extract-script] Bundle 生成完成')
