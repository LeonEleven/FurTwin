/**
 * 生成测试用占位序列帧（12 帧，64x64 彩色圆形）
 * 运行方式: node scripts/generate-test-frames.mjs
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'src', 'renderer', 'public', 'assets', 'frames')
mkdirSync(outDir, { recursive: true })

const WIDTH = 64
const HEIGHT = 64
const FRAME_COUNT = 12

// 12 帧的色调（每帧旋转 30 度）
const hues = Array.from({ length: FRAME_COUNT }, (_, i) => (i * 30) % 360)

function hslToRgb(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function createPNG(width, height, pixels) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr)

  // IDAT chunk — 每行: filter byte(0) + RGBA pixels
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawData[rowOffset] = 0 // no filter
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4
      const ri = rowOffset + 1 + x * 4
      rawData[ri] = pixels[pi]
      rawData[ri + 1] = pixels[pi + 1]
      rawData[ri + 2] = pixels[pi + 2]
      rawData[ri + 3] = pixels[pi + 3]
    }
  }
  const compressed = zlib.deflateSync(rawData)
  const idatChunk = makeChunk('IDAT', compressed)

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcData = Buffer.concat([typeBuffer, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcData), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

for (let i = 0; i < FRAME_COUNT; i++) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4)
  const [r, g, b] = hslToRgb(hues[i], 80, 55)
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const radius = WIDTH / 2 - 4

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const pi = (y * WIDTH + x) * 4
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= radius) {
        // 圆形内：填充颜色，边缘做简单抗锯齿
        const alpha = dist > radius - 1 ? Math.round((radius - dist) * 255) : 255
        pixels[pi] = r
        pixels[pi + 1] = g
        pixels[pi + 2] = b
        pixels[pi + 3] = Math.max(0, Math.min(255, alpha))
      } else {
        // 透明背景
        pixels[pi] = 0
        pixels[pi + 1] = 0
        pixels[pi + 2] = 0
        pixels[pi + 3] = 0
      }
    }
  }

  const png = createPNG(WIDTH, HEIGHT, pixels)
  const num = String(i + 1).padStart(4, '0')
  writeFileSync(join(outDir, `${num}.png`), png)
  console.log(`Generated frame ${num}.png`)
}

console.log(`Done! ${FRAME_COUNT} frames written to ${outDir}`)
