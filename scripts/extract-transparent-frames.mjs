/**
 * FFmpeg 绿幕扣除 -> 透明 PNG/WebP 序列帧
 *
 * 用法:
 *   node scripts/extract-transparent-frames.mjs --input <视频路径> [选项]
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { PNG } from 'pngjs'

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
FFmpeg 绿幕扣除 -> 透明序列帧

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

透明边界裁剪参数（推荐）:
  --trim-alpha <bool>         是否自动裁剪透明边界
                              默认: true
  --trim-threshold <int>      alpha 阈值 (0~255)，高于此值视为不透明
                              默认: 48
  --trim-padding <int>        裁剪后的边距（像素）
                              默认: 16
  --trim-min-pixels <int>     行/列最少有效像素数，低于此值忽略（防噪点）
                              默认: 16

组件清理参数（推荐，去除水印/灰块/噪点残留）:
  --clean-components <bool>   是否清理 detached alpha components
                              默认: true
  --component-min-area <int>  保留的最小 component 面积（像素数）
                              默认: 2000
  --keep-largest-component     是否只保留最大 component（宠物主体）
                              默认: true

水印遮罩参数（可选）:
  --mask-region <x:y:w:h,...> 水印透明遮罩区域（逗号分隔）
  --mask-preset <name>        预设遮罩方案: doubao-free

裁剪参数（高级，会改变画布尺寸）:
  --crop <w:h:x:y>            手动裁剪
  --center-crop <w:h>         中心裁剪
  --crop-preset <name>        预设裁剪: doubao-free

输出参数:
  --output <dir>              输出帧目录
                              默认: src/renderer/public/assets/actions/idle/frames_real
  --fps <number>              抽帧帧率
                              默认: 12
  --format <type>             输出格式: png 或 webp
                              默认: png
  --scale <W:H>               缩放
  --clean <bool>              是否清空输出目录
                              默认: true
  --help                      显示帮助
`)
}

// ─── 工具函数 ────────────────────────────────────────────

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

// ─── trim-alpha 逻辑 ─────────────────────────────────────

/**
 * 扫描所有 PNG 帧，计算包含非透明像素的 union bounding box
 * 使用行列像素计数过滤噪点：只有当某行/列的有效像素数 >= minPixels 时才计入 bbox
 */
function scanAlphaBounds(dir, files, threshold, minPixels) {
  // 先读取第一帧获取尺寸
  const firstBuf = readFileSync(join(dir, files[0]))
  const firstPng = PNG.sync.read(firstBuf)
  const W = firstPng.width
  const H = firstPng.height

  // 每行/列的有效像素计数（跨所有帧取 max）
  const rowCounts = new Uint32Array(H)
  const colCounts = new Uint32Array(W)

  for (let i = 0; i < files.length; i++) {
    const buf = readFileSync(join(dir, files[i]))
    const png = PNG.sync.read(buf)

    // 临时每帧的行列计数
    const frameRowCounts = new Uint32Array(H)
    const frameColCounts = new Uint32Array(W)

    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const alpha = png.data[(y * png.width + x) * 4 + 3]
        if (alpha > threshold) {
          frameRowCounts[y]++
          frameColCounts[x]++
        }
      }
    }

    // 取所有帧中每行/列的最大值
    for (let y = 0; y < H; y++) {
      if (frameRowCounts[y] > rowCounts[y]) rowCounts[y] = frameRowCounts[y]
    }
    for (let x = 0; x < W; x++) {
      if (frameColCounts[x] > colCounts[x]) colCounts[x] = frameColCounts[x]
    }

    if ((i + 1) % 10 === 0 || i === files.length - 1) {
      process.stdout.write(`\r  扫描 alpha: ${i + 1}/${files.length}`)
    }
  }
  console.log('')

  // 找到有效像素数 >= minPixels 的行/列范围
  let minY = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    if (rowCounts[y] >= minPixels) {
      if (minY === -1) minY = y
      maxY = y
    }
  }

  let minX = -1, maxX = -1
  for (let x = 0; x < W; x++) {
    if (colCounts[x] >= minPixels) {
      if (minX === -1) minX = x
      maxX = x
    }
  }

  if (minX === -1 || minY === -1) {
    return null
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * 裁剪单个 PNG 到指定 bbox
 */
function cropPng(inputPath, outputPath, bbox) {
  const buf = readFileSync(inputPath)
  const src = PNG.sync.read(buf)

  const dst = new PNG({ width: bbox.w, height: bbox.h })

  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const srcX = bbox.x + x
      const srcY = bbox.y + y
      const srcIdx = (srcY * src.width + srcX) * 4
      const dstIdx = (y * bbox.w + x) * 4

      if (srcX >= 0 && srcX < src.width && srcY >= 0 && srcY < src.height) {
        dst.data[dstIdx] = src.data[srcIdx]
        dst.data[dstIdx + 1] = src.data[srcIdx + 1]
        dst.data[dstIdx + 2] = src.data[srcIdx + 2]
        dst.data[dstIdx + 3] = src.data[srcIdx + 3]
      } else {
        dst.data[dstIdx] = 0
        dst.data[dstIdx + 1] = 0
        dst.data[dstIdx + 2] = 0
        dst.data[dstIdx + 3] = 0
      }
    }
  }

  writeFileSync(outputPath, PNG.sync.write(dst))
}

/**
 * 对输出目录中所有 PNG 帧执行 alpha bbox 统一裁剪
 */
function trimAlphaFrames(outputDir, threshold, padding, minPixels) {
  const files = readdirSync(outputDir).filter(f => f.endsWith('.png')).sort()
  if (files.length === 0) {
    console.log('  无 PNG 帧，跳过 trim-alpha')
    return { frameCount: 0, frameWidth: 0, frameHeight: 0 }
  }

  const firstBuf = readFileSync(join(outputDir, files[0]))
  const firstPng = PNG.sync.read(firstBuf)
  const origW = firstPng.width
  const origH = firstPng.height

  console.log(`  原始尺寸: ${origW}x${origH}`)
  console.log(`  alpha threshold: ${threshold}, min pixels: ${minPixels}, padding: ${padding}`)
  console.log(`  扫描 ${files.length} 帧 alpha 通道...`)

  const bbox = scanAlphaBounds(outputDir, files, threshold, minPixels)

  if (!bbox) {
    console.log('  [WARN] 所有帧完全透明，跳过 trim-alpha')
    return { frameCount: files.length, frameWidth: 0, frameHeight: 0 }
  }

  console.log(`  Alpha bbox: x=${bbox.x} y=${bbox.y} w=${bbox.w} h=${bbox.h}`)

  const paddedX = Math.max(0, bbox.x - padding)
  const paddedY = Math.max(0, bbox.y - padding)
  const paddedW = Math.min(origW - paddedX, bbox.w + padding * 2)
  const paddedH = Math.min(origH - paddedY, bbox.h + padding * 2)

  console.log(`  含 padding: x=${paddedX} y=${paddedY} w=${paddedW} h=${paddedH}`)
  console.log(`  最终帧尺寸: ${paddedW}x${paddedH}`)

  for (let i = 0; i < files.length; i++) {
    cropPng(join(outputDir, files[i]), join(outputDir, files[i]), {
      x: paddedX, y: paddedY, w: paddedW, h: paddedH,
    })
    if ((i + 1) % 10 === 0 || i === files.length - 1) {
      process.stdout.write(`\r  裁剪: ${i + 1}/${files.length}`)
    }
  }
  console.log('')

  return { frameCount: files.length, frameWidth: paddedW, frameHeight: paddedH }
}

// ─── 主逻辑 ──────────────────────────────────────────────

const args = parseArgs(process.argv)

if (args.help) {
  printUsage()
  process.exit(0)
}

const inputPath = args.input
if (!inputPath) {
  console.error('错误: 必须指定 --input <视频路径>')
  printUsage()
  process.exit(1)
}

const resolvedInput = resolve(inputPath)
if (!existsSync(resolvedInput)) {
  console.error(`错误: 输入文件不存在: ${resolvedInput}`)
  process.exit(1)
}

const outputDir = resolve(args.output || 'src/renderer/public/assets/actions/idle/frames_real')
const fps = Number(args.fps ?? 12)
const similarity = Number(args.similarity ?? 0.30)
const blend = Number(args.blend ?? 0.05)
const despill = Number(args.despill ?? 0.95)
const format = args.format || 'png'
const scale = args.scale || null
const cropArg = args['crop'] || null
const centerCrop = args['center-crop'] || null
const cropPreset = args['crop-preset'] || null
const maskRegion = args['mask-region'] || null
const maskPreset = args['mask-preset'] || null
const clean = args.clean !== 'false' && args.clean !== '0'
const trimAlpha = args['trim-alpha'] !== 'false' && args['trim-alpha'] !== '0'
const trimThreshold = Number(args['trim-threshold'] ?? 48)
const trimPadding = Number(args['trim-padding'] ?? 16)
const trimMinPixels = Number(args['trim-min-pixels'] ?? 16)
const cleanComponents = args['clean-components'] !== 'false' && args['clean-components'] !== '0'
const componentMinArea = Number(args['component-min-area'] ?? 2000)
const keepLargestComponent = args['keep-largest-component'] !== 'false' && args['keep-largest-component'] !== '0'

// ─── 前置检查 ────────────────────────────────────────────

try {
  const version = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  console.log(`[OK] FFmpeg: ${version.split('\n')[0]}`)
} catch {
  console.error('错误: FFmpeg 未安装或不在 PATH 中')
  process.exit(1)
}

const cropCount = [cropArg, centerCrop, cropPreset].filter(Boolean).length
if (cropCount > 1) {
  console.error('错误: --crop、--center-crop、--crop-preset 不能同时使用')
  process.exit(1)
}
if (maskRegion && maskPreset) {
  console.error('错误: --mask-region 和 --mask-preset 不能同时使用')
  process.exit(1)
}

// ─── 获取视频尺寸 ────────────────────────────────────────

const videoSize = getVideoSize(resolvedInput)
console.log(`视频: ${videoSize.width}x${videoSize.height}`)

// ─── 计算裁剪参数 ────────────────────────────────────────

let cropFilter = null

if (cropArg) {
  const parts = cropArg.split(':').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.error('错误: --crop 格式应为 w:h:x:y')
    process.exit(1)
  }
  cropFilter = `crop=${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`
  console.log(`裁剪: ${cropFilter}`)
}

if (centerCrop) {
  const parts = centerCrop.split(':').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) {
    console.error('错误: --center-crop 格式应为 w:h')
    process.exit(1)
  }
  const cx = Math.round((videoSize.width - parts[0]) / 2)
  const cy = Math.round((videoSize.height - parts[1]) / 2)
  cropFilter = `crop=${parts[0]}:${parts[1]}:${cx}:${cy}`
  console.log(`裁剪: 中心 ${parts[0]}x${parts[1]}`)
}

if (cropPreset === 'doubao-free') {
  const cw = 1024, ch = 576
  const cx = Math.round((videoSize.width - cw) / 2)
  const cy = Math.round((videoSize.height - ch) / 2)
  cropFilter = `crop=${cw}:${ch}:${cx}:${cy}`
  console.log(`[WARN]  裁剪: doubao-free 预设 ${cw}x${ch}`)
}

// ─── 计算水印遮罩 ────────────────────────────────────────

let maskRegions = []

if (maskRegion) {
  for (const rs of maskRegion.split(',')) {
    const parts = rs.trim().split(':').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      console.error(`错误: --mask-region 格式应为 x:y:w:h。收到: "${rs.trim()}"`)
      process.exit(1)
    }
    maskRegions.push({ x: parts[0], y: parts[1], w: parts[2], h: parts[3] })
  }
}

if (maskPreset === 'doubao-free') {
  maskRegions.push(
    { x: 0, y: 0, w: 220, h: 90 },
    { x: videoSize.width - 260, y: videoSize.height - 90, w: 260, h: 90 },
  )
  console.log(`遮罩: doubao-free（左上 220x90 + 右下 260x90）`)
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

const filters = []
if (cropFilter) filters.push(cropFilter)
filters.push(`chromakey=0x00FF00:${similarity}:${blend}`)
if (despill > 0) filters.push(`despill=green:${despill}:${despill}`)
filters.push('format=rgba')
for (const r of maskRegions) {
  filters.push(`drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:color=black@0:t=fill:replace=1`)
}
if (scale) filters.push(`scale=${scale}`)
if (fps > 0) filters.push(`fps=${fps}`)

const vf = filters.join(',')
const ext = format === 'webp' ? 'webp' : 'png'
const outputTemplate = join(outputDir, `%04d.${ext}`)

const parts = ['ffmpeg', '-i', `"${resolvedInput}"`, '-vf', `"${vf}"`]
if (format === 'webp') parts.push('-lossless', '0', '-quality', '90')
parts.push(`"${outputTemplate}"`)
const cmd = parts.join(' ')

// ─── 执行 FFmpeg ─────────────────────────────────────────

console.log('')
console.log('=== FFmpeg 绿幕扣除 ===')
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
  console.error('\n[ERR] FFmpeg 执行失败')
  process.exit(1)
}

// ─── connected component 分析和清理 ───────────────────────

/**
 * Flood fill connected component analysis on alpha mask
 * Returns array of components: { id, bbox, area, pixels }
 */
function findConnectedComponents(alphaMask, W, H, threshold) {
  const visited = new Uint8Array(W * H)
  const components = []

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x
      if (visited[idx] || alphaMask[idx] <= threshold) continue

      // BFS flood fill
      const queue = [idx]
      visited[idx] = 1
      let minX = x, maxX = x, minY = y, maxY = y
      let area = 0
      const pixels = []

      while (queue.length > 0) {
        const ci = queue.pop()
        const cx = ci % W
        const cy = Math.floor(ci / W)
        area++
        pixels.push(ci)
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        // 4-connected neighbors
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
          const ni = ny * W + nx
          if (visited[ni] || alphaMask[ni] <= threshold) continue
          visited[ni] = 1
          queue.push(ni)
        }
      }

      components.push({
        id: components.length,
        bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        area,
        pixels,
      })
    }
  }

  return components
}

/**
 * Build union alpha mask from all frames (sample up to 30 frames)
 */
function buildUnionAlphaMask(dir, files, threshold) {
  const firstBuf = readFileSync(join(dir, files[0]))
  const firstPng = PNG.sync.read(firstBuf)
  const W = firstPng.width
  const H = firstPng.height
  const mask = new Uint8Array(W * H)

  const step = Math.max(1, Math.floor(files.length / 30))
  for (let i = 0; i < files.length; i += step) {
    const buf = readFileSync(join(dir, files[i]))
    const png = PNG.sync.read(buf)
    for (let p = 0; p < W * H; p++) {
      if (png.data[p * 4 + 3] > threshold) mask[p] = png.data[p * 4 + 3]
    }
  }

  return { mask, W, H }
}

/**
 * Clean detached components: keep largest, remove small ones
 * Returns set of pixel indices to keep (null = keep all)
 */
function cleanDetachedComponents(dir, files, threshold, minArea, keepLargest) {
  const { mask, W, H } = buildUnionAlphaMask(dir, files, threshold)
  const components = findConnectedComponents(mask, W, H, threshold)

  if (components.length <= 1) {
    console.log(`  COMPONENTS total=${components.length} (no cleanup needed)`)
    return null
  }

  // Sort by area descending
  components.sort((a, b) => b.area - a.area)

  const largestArea = components[0].area
  const keepPixels = new Set()
  let keptCount = 0
  let removedCount = 0

  for (const comp of components) {
    const isLargest = comp.id === components[0].id
    const keep = (keepLargest && isLargest) || (!keepLargest && comp.area >= minArea)

    if (keep) {
      for (const p of comp.pixels) keepPixels.add(p)
      keptCount++
      console.log(`  COMPONENT kept id=${comp.id} bbox=${comp.bbox.x},${comp.bbox.y},${comp.bbox.w}x${comp.bbox.h} area=${comp.area}${isLargest ? ' (largest)' : ''}`)
    } else {
      removedCount++
      console.log(`  COMPONENT removed id=${comp.id} bbox=${comp.bbox.x},${comp.bbox.y},${comp.bbox.w}x${comp.bbox.h} area=${comp.area}`)
    }
  }

  console.log(`  COMPONENTS total=${components.length} kept=${keptCount} removed=${removedCount}`)
  return { keepPixels, W, H }
}

/**
 * Apply component cleanup to a single frame: set removed pixels to transparent
 */
function applyComponentCleanup(filePath, keepPixels, W, H) {
  const buf = readFileSync(filePath)
  const png = PNG.sync.read(buf)
  let changed = false

  for (let p = 0; p < W * H; p++) {
    if (png.data[p * 4 + 3] > 0 && !keepPixels.has(p)) {
      png.data[p * 4] = 0
      png.data[p * 4 + 1] = 0
      png.data[p * 4 + 2] = 0
      png.data[p * 4 + 3] = 0
      changed = true
    }
  }

  if (changed) {
    writeFileSync(filePath, PNG.sync.write(png))
  }
}

// ─── 统计 FFmpeg 输出 ────────────────────────────────────

let outputFiles = readdirSync(outputDir).filter(f => f.endsWith(`.${ext}`))
console.log('')
console.log('────────────────────────────────────')
console.log(`[OK] FFmpeg done: ${outputFiles.length} frames`)

// ─── clean-components 清理 detached alpha components ─────

if (cleanComponents && format === 'png' && outputFiles.length > 0) {
  console.log('')
  console.log('=== Clean Components ===')
  console.log(`  threshold=${trimThreshold} minArea=${componentMinArea} keepLargest=${keepLargestComponent}`)

  const cleanup = cleanDetachedComponents(outputDir, outputFiles, trimThreshold, componentMinArea, keepLargestComponent)

  if (cleanup) {
    const { keepPixels, W, H } = cleanup
    console.log(`  Applying cleanup to ${outputFiles.length} frames...`)
    for (let i = 0; i < outputFiles.length; i++) {
      applyComponentCleanup(join(outputDir, outputFiles[i]), keepPixels, W, H)
      if ((i + 1) % 10 === 0 || i === outputFiles.length - 1) {
        process.stdout.write(`\r  Cleanup: ${i + 1}/${outputFiles.length}`)
      }
    }
    console.log('')
    console.log('  [OK] Component cleanup done')
  }
} else if (cleanComponents && format !== 'png') {
  console.log('')
  console.log('[WARN] clean-components only supports PNG, skipping')
}

// ─── trim-alpha 裁剪 ────────────────────────────────────

let finalWidth = 0
let finalHeight = 0
let finalCount = outputFiles.length

if (trimAlpha && format === 'png') {
  console.log('')
  console.log('=== Trim Alpha ===')
  const result = trimAlphaFrames(outputDir, trimThreshold, trimPadding, trimMinPixels)
  finalWidth = result.frameWidth
  finalHeight = result.frameHeight
  finalCount = result.frameCount
} else if (trimAlpha && format !== 'png') {
  console.log('')
  console.log('[WARN] trim-alpha 仅支持 PNG 格式，跳过')
}

// ─── 最终输出 ────────────────────────────────────────────

if (finalWidth > 0) {
  console.log('')
  console.log(`最终帧尺寸: ${finalWidth}x${finalHeight}`)
}

console.log('')
console.log(`帧数: ${finalCount}`)
console.log(`目录: ${outputDir}`)
console.log(`格式: ${ext}`)

// 验证
if (finalCount > 0) {
  const firstFrame = join(outputDir, readdirSync(outputDir).filter(f => f.endsWith(`.${ext}`)).sort()[0])
  console.log('')
  console.log('验证 alpha 通道:')
  console.log(`  ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "${firstFrame}"`)
}

// 接入提示
console.log('')
console.log('接入 FurTwin 播放器:')
console.log('  1. 在控制面板点击「应用到桌宠预览」')
console.log('  2. 或手动修改 local.config.json')
if (finalWidth > 0) {
  console.log(`     frameWidth: ${finalWidth}, frameHeight: ${finalHeight}`)
}
console.log(`     frameCount: ${finalCount}`)
