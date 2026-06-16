/**
 * FFmpeg 绿幕扣除 → 透明 PNG 序列帧
 *
 * 用法:
 *   node scripts/extract-transparent-frames.mjs <input.mp4> [outputDir]
 *
 * 示例:
 *   node scripts/extract-transparent-frames.mjs "C:\Videos\cat_green.mp4"
 *   node scripts/extract-transparent-frames.mjs "C:\Videos\cat_green.mp4" "src/renderer/public/assets/actions/idle/frames_real"
 *
 * 默认参数: chromakey=0x00FF00:0.20:0.15
 * 可修改下方 CHROMAKEY_PARAMS 调整。
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

// --- 可调参数 ---
const CHROMAKEY_PARAMS = {
  color: '0x00FF00',
  similarity: 0.20,
  blend: 0.15,
}
const DESPILL = true          // 是否去除绿色光晕
const SCALE = null            // 缩放，例如 '512:-1'，null 表示不缩放
const MAX_FRAMES = 0          // 最大帧数，0 表示全部提取
const FPS = null              // 抽帧帧率，null 表示不抽帧
const OUTPUT_FORMAT = 'png'   // 'png' 或 'webp'

// --- 脚本逻辑 ---
const inputPath = process.argv[2]
const defaultOutputDir = resolve('src/renderer/public/assets/actions/idle/frames_real')
const outputDir = process.argv[3] ? resolve(process.argv[3]) : defaultOutputDir

if (!inputPath) {
  console.log('用法: node scripts/extract-transparent-frames.mjs <input.mp4> [outputDir]')
  console.log('')
  console.log('参数:')
  console.log('  input.mp4   绿幕视频路径')
  console.log('  outputDir   输出目录（默认: src/renderer/public/assets/actions/idle/frames_real）')
  console.log('')
  console.log('可调参数: 编辑脚本顶部的 CHROMAKEY_PARAMS 等常量')
  process.exit(1)
}

if (!existsSync(inputPath)) {
  console.error(`错误: 输入文件不存在: ${inputPath}`)
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })

// 构建 FFmpeg 滤镜链
const filters = []

// chromakey 主滤镜
const { color, similarity, blend } = CHROMAKEY_PARAMS
filters.push(`chromakey=${color}:${similarity}:${blend}`)

// 去绿色光晕
if (DESPILL) {
  filters.push('despill=green:0.5:0.5')
}

// 缩放
if (SCALE) {
  filters.push(`scale=${SCALE}`)
}

// 抽帧
if (FPS) {
  filters.push(`fps=${FPS}`)
}

// 必须输出 rgba 格式才能保留 alpha 通道
filters.push('format=rgba')

const vf = filters.join(',')

// 构建输出路径模板
const ext = OUTPUT_FORMAT === 'webp' ? 'webp' : 'png'
const outputTemplate = join(outputDir, `%04d.${ext}`)

// 构建 FFmpeg 命令
const parts = ['ffmpeg', '-i', `"${inputPath}"`]
parts.push('-vf', `"${vf}"`)

if (MAX_FRAMES > 0) {
  parts.push('-frames:v', String(MAX_FRAMES))
}

if (OUTPUT_FORMAT === 'webp') {
  parts.push('-lossless', '0', '-quality', '90')
}

parts.push(`"${outputTemplate}"`)

const cmd = parts.join(' ')

console.log('=== FFmpeg 绿幕扣除 ===')
console.log(`输入: ${inputPath}`)
console.log(`输出: ${outputDir}`)
console.log(`滤镜: ${vf}`)
console.log(`命令: ${cmd}`)
console.log('')

try {
  execSync(cmd, { stdio: 'inherit', shell: true })
  console.log('')
  console.log(`✅ 完成! 帧已输出到: ${outputDir}`)
  console.log('')
  console.log('验证 alpha 通道:')
  console.log(`  ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "${join(outputDir, '0001.png')}"`)
  console.log('  应输出: rgba')
  console.log('')
  console.log('接入 FurTwin:')
  console.log('  1. 修改 src/renderer/public/assets/actions/idle/config.json')
  console.log(`  2. 将 framesDir 改为 "./assets/actions/idle/frames_real"`)
  console.log('  3. 调整 fps / frameCount / frameWidth / frameHeight / scale')
  console.log('  4. npm run dev 验证')
} catch (err) {
  console.error('')
  console.error('❌ FFmpeg 执行失败，请检查:')
  console.error('  1. FFmpeg 是否已安装并加入 PATH')
  console.error('  2. 输入文件是否为有效视频')
  console.error('  3. 滤镜参数是否正确')
  process.exit(1)
}
