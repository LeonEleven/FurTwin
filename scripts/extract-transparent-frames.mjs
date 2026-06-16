/**
 * FFmpeg 绿幕扣除 → 透明 PNG/WebP 序列帧
 *
 * 用法:
 *   node scripts/extract-transparent-frames.mjs --input <视频路径> [选项]
 *
 * 示例:
 *   node scripts/extract-transparent-frames.mjs --input "C:\Videos\cat.mp4"
 *   node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-preset doubao-free
 *   node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-region "0:0:220:90,1020:630:260:90"
 *   node scripts/extract-transparent-frames.mjs --input cat.mp4 --crop "1024:576:128:72"
 *   node scripts/extract-transparent-frames.mjs --input cat.mp4 --center-crop "1024:576"
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'

// ─── 参数解析 ────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    if (key.startsWith('--')) {
      const name = key.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        args[name] = true
      } else {
        args[name] = next
        i++
      }
    }
  }
  return args
}

function printUsage() {
  console.log(`
FFmpeg 绿幕扣除 → 透明序列帧

用法:
  node scripts/extract-transparent-frames.mjs --input <视频路径> [选项]

必需参数:
  --input <path>              绿幕视频路径

扣绿参数:
  --similarity <float>        chromakey 相似度阈值 (0.01~1.0)
                              默认: 0.30
  --blend <float>             chromakey 边缘混合 (0.0~1.0)
                              默认: 0.05
  --despill <float>           despill 去光晕强度 (0.0~1.0)
                              默认: 0.95

水印遮罩参数（可选，推荐）:
  --mask-region <x:y:w:h,...> 水印透明遮罩区域（逗号分隔）
                              将指定矩形区域设为透明，不改变画布尺寸
                              例如: --mask-region "0:0:220:90,1020:630:260:90"
  --mask-preset <name>        预设遮罩方案:
                              doubao-free — 针对 1280x720 豆包免费视频左上角/右下角水印

裁剪参数（高级，会改变画布尺寸）:
  --crop <w:h:x:y>            手动裁剪（FFmpeg 原生格式）
                              例如: --crop "1024:576:128:72"
  --center-crop <w:h>         中心裁剪，自动计算 x/y
                              例如: --center-crop "1024:576"
  --crop-preset <name>        预设裁剪方案（⚠️ 可能裁掉宠物主体，谨慎使用）:
                              doubao-free — 针对 1280x720 裁到 1024x576

输出参数:
  --output <dir>              输出帧目录
                              默认: src/renderer/public/assets/actions/idle/frames_real
  --fps <number>              抽帧帧率
                              默认: 12
  --format <type>             输出格式: png 或 webp
                              默认: png
  --scale <W:H>               缩放，例如 512:-1
                              默认: 不缩放
  --clean <bool>              是否清空输出目录: true 或 false
                              默认: true
  --help                      显示帮助

示例:
  node scripts/extract-transparent-frames.mjs --input cat.mp4
  node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-preset doubao-free
  node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-region "0:0:220:90,1020:630:260:90"
  node scripts/extract-transparent-frames.mjs --input cat.mp4 --similarity 0.25 --blend 0.10
  node scripts/extract-transparent-frames.mjs --input cat.mp4 --format webp --scale 512:-1
`)
}

// ─── 工具函数 ────────────────────────────────────────────

/** 获取视频宽高 */
function getVideoSize(inputPath) {
  const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputPath}"`
  const output = execSync(cmd, { encoding: 'utf8', shell: true }).trim()
  const [width, height] = output.split(',').map(Number)
  if (!width || !height) {
    console.error('错误: 无法获取视频分辨率')
    process.exit(1)
  }
  return { width, height }
}

// ─── 主逻辑 ──────────────────────────────────────────────

const args = parseArgs(process.argv)

if (args.help) {
  printUsage()
  process.exit(0)
}

// 必需参数
const inputPath = args.input
if (!inputPath) {
  console.error('错误: 必须指定 --input <视频路径>')
  console.error('')
  printUsage()
  process.exit(1)
}

const resolvedInput = resolve(inputPath)
if (!existsSync(resolvedInput)) {
  console.error(`错误: 输入文件不存在: ${resolvedInput}`)
  process.exit(1)
}

// 可选参数（带默认值）
const outputDir = resolve(args.output || 'src/renderer/public/assets/actions/idle/frames_real')
const fps = Number(args.fps ?? 12)
const similarity = Number(args.similarity ?? 0.30)
const blend = Number(args.blend ?? 0.05)
const despill = Number(args.despill ?? 0.95)
const format = args.format || 'png'
const scale = args.scale || null
const crop = args['crop'] || null
const centerCrop = args['center-crop'] || null
const cropPreset = args['crop-preset'] || null
const maskRegion = args['mask-region'] || null
const maskPreset = args['mask-preset'] || null
const clean = args.clean !== 'false' && args.clean !== '0'

// ─── 前置检查 ────────────────────────────────────────────

// 检查 ffmpeg 是否可用
try {
  const version = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  const firstLine = version.split('\n')[0]
  console.log(`✅ FFmpeg: ${firstLine}`)
} catch {
  console.error('错误: FFmpeg 未安装或不在 PATH 中')
  console.error('请安装 FFmpeg: https://ffmpeg.org/download.html')
  process.exit(1)
}

// 裁剪参数互斥
const cropCount = [crop, centerCrop, cropPreset].filter(Boolean).length
if (cropCount > 1) {
  console.error('错误: --crop、--center-crop、--crop-preset 不能同时使用')
  process.exit(1)
}

// 遮罩参数互斥
if (maskRegion && maskPreset) {
  console.error('错误: --mask-region 和 --mask-preset 不能同时使用')
  process.exit(1)
}

// ─── 获取视频尺寸 ────────────────────────────────────────

const videoSize = getVideoSize(resolvedInput)
console.log(`视频: ${videoSize.width}×${videoSize.height}`)

// ─── 计算裁剪参数 ────────────────────────────────────────

let cropFilter = null

if (crop) {
  const parts = crop.split(':').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.error('错误: --crop 格式应为 w:h:x:y，例如 "1024:576:128:72"')
    process.exit(1)
  }
  const [cw, ch, cx, cy] = parts
  cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
  console.log(`裁剪: 手动区域 w=${cw} h=${ch} x=${cx} y=${cy}`)
}

if (centerCrop) {
  const parts = centerCrop.split(':').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) {
    console.error('错误: --center-crop 格式应为 w:h，例如 "1024:576"')
    process.exit(1)
  }
  const [cw, ch] = parts
  const cx = Math.round((videoSize.width - cw) / 2)
  const cy = Math.round((videoSize.height - ch) / 2)
  if (cx < 0 || cy < 0) {
    console.error(`错误: 裁剪尺寸 ${cw}×${ch} 大于视频尺寸 ${videoSize.width}×${videoSize.height}`)
    process.exit(1)
  }
  cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
  console.log(`裁剪: 中心 ${cw}×${ch}（偏移 x=${cx} y=${cy}）`)
}

if (cropPreset) {
  if (cropPreset === 'doubao-free') {
    const cw = 1024
    const ch = 576
    if (videoSize.width < cw || videoSize.height < ch) {
      console.error(`错误: doubao-free 裁剪预设需要视频至少 ${cw}×${ch}，当前 ${videoSize.width}×${videoSize.height}`)
      process.exit(1)
    }
    const cx = Math.round((videoSize.width - cw) / 2)
    const cy = Math.round((videoSize.height - ch) / 2)
    cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
    console.log(`⚠️  裁剪: doubao-free 预设 ${cw}×${ch}（可能裁掉宠物主体，请先少量帧测试）`)
  } else {
    console.error(`错误: 未知的裁剪预设: ${cropPreset}`)
    process.exit(1)
  }
}

// ─── 计算水印遮罩 ────────────────────────────────────────

let maskRegions = []

if (maskRegion) {
  // 解析逗号分隔的区域
  const regionStrs = maskRegion.split(',')
  for (const rs of regionStrs) {
    const parts = rs.trim().split(':').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      console.error(`错误: --mask-region 格式应为 x:y:w:h，例如 "0:0:220:90"。收到: "${rs.trim()}"`)
      process.exit(1)
    }
    maskRegions.push({ x: parts[0], y: parts[1], w: parts[2], h: parts[3] })
  }
  console.log(`遮罩: ${maskRegions.length} 个区域`)
}

if (maskPreset) {
  if (maskPreset === 'doubao-free') {
    maskRegions.push(
      { x: 0, y: 0, w: 220, h: 90 },
      { x: videoSize.width - 260, y: videoSize.height - 90, w: 260, h: 90 },
    )
    console.log(`遮罩: doubao-free 预设（左上角 220×90 + 右下角 260×90）`)
  } else {
    console.error(`错误: 未知的遮罩预设: ${maskPreset}`)
    console.error('可用预设: doubao-free')
    process.exit(1)
  }
}

// ─── 清理输出目录 ────────────────────────────────────────

if (clean && existsSync(outputDir)) {
  const existing = readdirSync(outputDir).filter(f => f.endsWith(`.${format}`))
  if (existing.length > 0) {
    console.log(`清理旧帧: ${existing.length} 个 ${format} 文件`)
    for (const f of existing) {
      unlinkSync(join(outputDir, f))
    }
  }
}

mkdirSync(outputDir, { recursive: true })

// ─── 构建 FFmpeg 命令 ────────────────────────────────────

// 滤镜顺序: crop → chromakey → despill → format=rgba → watermark mask → scale → fps
const filters = []

// 1. crop（高级选项，放在最前面）
if (cropFilter) {
  filters.push(cropFilter)
}

// 2. chromakey 扣绿
filters.push(`chromakey=0x00FF00:${similarity}:${blend}`)

// 3. despill 去光晕
if (despill > 0) {
  filters.push(`despill=green:${despill}:${despill}`)
}

// 4. format=rgba（确保有 alpha 通道）
filters.push('format=rgba')

// 5. 水印遮罩（drawbox + replace=1 把指定区域设为透明）
for (const r of maskRegions) {
  filters.push(`drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=black@0:t=fill:replace=1`)
}

// 6. 缩放
if (scale) {
  filters.push(`scale=${scale}`)
}

// 7. 抽帧
if (fps > 0) {
  filters.push(`fps=${fps}`)
}

const vf = filters.join(',')
const ext = format === 'webp' ? 'webp' : 'png'
const outputTemplate = join(outputDir, `%04d.${ext}`)

const parts = ['ffmpeg', '-i', `"${resolvedInput}"`]
parts.push('-vf', `"${vf}"`)

if (format === 'webp') {
  parts.push('-lossless', '0', '-quality', '90')
}

parts.push(`"${outputTemplate}"`)

const cmd = parts.join(' ')

// ─── 执行 ────────────────────────────────────────────────

console.log('')
console.log('=== FFmpeg 绿幕扣除 ===')
console.log(`输入: ${resolvedInput}`)
console.log(`输出: ${outputDir}`)
console.log(`参数: similarity=${similarity} blend=${blend} despill=${despill} fps=${fps} format=${format}${scale ? ` scale=${scale}` : ''}`)
if (maskRegions.length > 0) {
  console.log(`遮罩: ${maskRegions.map(r => `${r.x}:${r.y}:${r.w}×${r.h}`).join(', ')}`)
}
console.log(`滤镜: ${vf}`)
console.log('')
console.log('执行命令:')
console.log(`  ${cmd}`)
console.log('')
console.log('执行中...')
console.log('')

try {
  execSync(cmd, { stdio: 'inherit', shell: true })
} catch {
  console.error('')
  console.error('❌ FFmpeg 执行失败，请检查:')
  console.error('  1. 输入文件是否为有效视频')
  console.error('  2. 参数是否正确（特别是 --crop / --mask-region 格式）')
  process.exit(1)
}

// ─── 统计输出 ────────────────────────────────────────────

const outputFiles = readdirSync(outputDir).filter(f => f.endsWith(`.${ext}`))
console.log('')
console.log('────────────────────────────────────')
console.log(`✅ 完成! 输出 ${outputFiles.length} 帧`)
console.log(`   目录: ${outputDir}`)
console.log(`   格式: ${ext}`)

// ─── 验证提示 ────────────────────────────────────────────

if (outputFiles.length > 0) {
  const firstFrame = join(outputDir, outputFiles[0])
  console.log('')
  console.log('验证 alpha 通道:')
  console.log(`  ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "${firstFrame}"`)
  console.log('  应输出: rgba')
}

// ─── 接入播放器提示 ──────────────────────────────────────

console.log('')
console.log('接入 FurTwin 播放器:')
console.log('  1. 修改 src/renderer/public/assets/actions/idle/config.json:')
console.log(`     "framesDir": "./assets/actions/idle/frames_real"`)
console.log(`     "frameCount": ${outputFiles.length}`)
console.log(`     "fps": ${fps}`)
console.log(`     "framePattern": "{}.${ext}"`)
if (cropFilter) {
  console.log('  2. ⚠️ 裁剪后帧尺寸已变化，请用图片查看器确认实际尺寸，更新 config.json 中的 frameWidth / frameHeight')
} else {
  console.log('  2. 如需缩放，修改 scale（例如 0.5 表示半尺寸）')
}
console.log('  3. npm run dev 验证')
