/**
 * 打包前检查 FFmpeg 二进制是否存在。
 * 由 package.json 的 predist 脚本自动调用。
 */

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const required = [
  'resources/bin/ffmpeg.exe',
  'resources/bin/ffprobe.exe',
]

const missing = required.filter(f => !existsSync(join(root, f)))

if (missing.length > 0) {
  console.error('\n缺少 FFmpeg 二进制文件：')
  missing.forEach(f => console.error(`  - ${f}`))
  console.error('\n请将 ffmpeg.exe 和 ffprobe.exe 放入 resources/bin/ 后再执行 npm run dist。')
  console.error('下载地址：https://github.com/BtbN/FFmpeg-Builds/releases\n')
  process.exit(1)
}

console.log('[check-ffmpeg] FFmpeg 二进制检查通过')
