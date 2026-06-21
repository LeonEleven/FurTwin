/**
 * Pet window shape management
 * Display-space scanline shape: compute alpha mask at display resolution,
 * then generate rects directly in display coordinates.
 */

import { ipcMain, BrowserWindow, Rectangle } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PNG } from 'pngjs'
import { IPC_CHANNELS } from '../../shared/types'
import { toAbsoluteFramesDir } from '../services/actionPaths'

const ALPHA_THRESHOLD = 48
const MERGE_TOLERANCE = 1
const MAX_RECTS = 1000
const SHAPE_PADDING = 2
const SHAPE_CACHE_FILE = 'shape-cache.json'
const SHAPE_CACHE_VERSION = 2 // bumped: display-space computation
const DEBUG_FULL_RECT_SHAPE = false

let perFrameRects: Rectangle[][] = []
let cachedDisplayWidth = 0
let cachedDisplayHeight = 0

function getPetWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(w => {
    if (w.isDestroyed()) return false
    return w.getTitle() === '' || w.getTitle() === 'FurTwin Pet'
  }) ?? null
}

interface Run { x: number; w: number }

function extractRunsFromMask(mask: Uint8Array, W: number, H: number): Run[][] {
  const rows: Run[][] = []
  for (let y = 0; y < H; y++) {
    const runs: Run[] = []
    let startX = -1
    for (let x = 0; x <= W; x++) {
      const opaque = x < W ? mask[y * W + x] : 0
      if (opaque && startX === -1) { startX = x }
      else if (!opaque && startX !== -1) { runs.push({ x: startX, w: x - startX }); startX = -1 }
    }
    rows.push(runs)
  }
  return rows
}

function mergeRunsToRects(rows: Run[][], tolerance: number): Rectangle[] {
  const rects: Rectangle[] = []
  const used: boolean[][] = rows.map(r => new Array(r.length).fill(false))
  for (let y = 0; y < rows.length; y++) {
    for (let si = 0; si < rows[y].length; si++) {
      if (used[y][si]) continue
      const run = rows[y][si]
      let endY = y + 1
      while (endY < rows.length) {
        let matchIdx = -1
        for (let ni = 0; ni < rows[endY].length; ni++) {
          if (used[endY][ni]) continue
          const nr = rows[endY][ni]
          if (Math.abs(nr.x - run.x) <= tolerance && Math.abs(nr.w - run.w) <= tolerance) {
            matchIdx = ni; break
          }
        }
        if (matchIdx === -1) break
        used[endY][matchIdx] = true
        endY++
      }
      rects.push({ x: run.x, y, width: run.w, height: endY - y })
    }
  }
  return rects
}

function clampRects(rects: Rectangle[], winW: number, winH: number): Rectangle[] {
  const valid: Rectangle[] = []
  for (const r of rects) {
    const x = Math.max(0, Math.round(r.x))
    const y = Math.max(0, Math.round(r.y))
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    const cw = Math.min(w, winW - x)
    const ch = Math.min(h, winH - y)
    if (cw > 0 && ch > 0 && Number.isFinite(x) && Number.isFinite(y)) {
      valid.push({ x, y, width: cw, height: ch })
    }
  }
  return valid
}

/**
 * Compute shape rects in display space.
 * Instead of: compute in source space -> scale rects (causes rounding errors)
 * Do: build alpha mask at display resolution -> scanline directly in display coords
 */
function computeFrameShapeDisplay(filePath: string, displayW: number, displayH: number): Rectangle[] {
  const buf = readFileSync(filePath)
  const png = PNG.sync.read(buf)
  const srcW = png.width
  const srcH = png.height

  // Build alpha mask at display resolution
  // For each display pixel, sample the corresponding source pixel
  const mask = new Uint8Array(displayW * displayH)
  for (let dy = 0; dy < displayH; dy++) {
    const sy = Math.floor(dy * srcH / displayH)
    for (let dx = 0; dx < displayW; dx++) {
      const sx = Math.floor(dx * srcW / displayW)
      const alpha = png.data[(sy * srcW + sx) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        mask[dy * displayW + dx] = 1
      }
    }
  }

  // Scanline on display-space mask
  const rows = extractRunsFromMask(mask, displayW, displayH)
  let rects = mergeRunsToRects(rows, MERGE_TOLERANCE)

  // Add padding
  if (SHAPE_PADDING > 0) {
    rects = rects.map(r => ({
      x: r.x - SHAPE_PADDING,
      y: r.y - SHAPE_PADDING,
      width: r.width + SHAPE_PADDING * 2,
      height: r.height + SHAPE_PADDING * 2,
    }))
  }

  if (rects.length > MAX_RECTS) rects = rects.slice(0, MAX_RECTS)
  return rects
}

function resolveFrameDir(framesDir: string): string {
  return toAbsoluteFramesDir(framesDir)
}

// ─── Shape Cache ─────────────────────────────────────────

interface ShapeCache {
  version: number
  frameCount: number
  frameWidth: number
  frameHeight: number
  effectiveScale: number
  displayWidth: number
  displayHeight: number
  perFrameRects: Rectangle[][]
  createdAt: number
}

function getCachePath(frameDir: string): string {
  return join(frameDir, SHAPE_CACHE_FILE)
}

function tryLoadCache(frameDir: string, frameCount: number, frameWidth: number, frameHeight: number, effectiveScale: number, displayW: number, displayH: number): Rectangle[][] | null {
  const cachePath = getCachePath(frameDir)
  if (!existsSync(cachePath)) return null

  try {
    const raw = readFileSync(cachePath, 'utf-8')
    const cache: ShapeCache = JSON.parse(raw)

    if (cache.version !== SHAPE_CACHE_VERSION) return null
    if (cache.frameCount !== frameCount) return null
    if (cache.frameWidth !== frameWidth) return null
    if (cache.frameHeight !== frameHeight) return null
    if (Math.abs(cache.effectiveScale - effectiveScale) > 0.001) return null
    if (cache.displayWidth !== displayW) return null
    if (cache.displayHeight !== displayH) return null
    if (!Array.isArray(cache.perFrameRects) || cache.perFrameRects.length !== frameCount) return null

    console.log(`[shape] cache HIT v${cache.version} effectiveScale=${effectiveScale} display=${displayW}x${displayH}`)
    return cache.perFrameRects
  } catch (e) {
    console.warn('[shape] cache read failed:', e)
    return null
  }
}

function saveCache(frameDir: string, frameCount: number, frameWidth: number, frameHeight: number, effectiveScale: number, displayW: number, displayH: number, rects: Rectangle[][]): void {
  const cachePath = getCachePath(frameDir)
  const cache: ShapeCache = {
    version: SHAPE_CACHE_VERSION,
    frameCount,
    frameWidth,
    frameHeight,
    effectiveScale,
    displayWidth: displayW,
    displayHeight: displayH,
    perFrameRects: rects,
    createdAt: Date.now(),
  }
  try {
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
    console.log(`[shape] cache SAVED v${SHAPE_CACHE_VERSION} effectiveScale=${effectiveScale} display=${displayW}x${displayH}`)
  } catch (e) {
    console.warn('[shape] cache write failed:', e)
  }
}

// ─── IPC Handlers ────────────────────────────────────────

export function setupPetShape(): void {
  ipcMain.on(IPC_CHANNELS.COMPUTE_PET_SHAPE, (_event, payload: {
    framesDir: string; framePattern: string; frameCount: number;
    frameWidth: number; frameHeight: number; effectiveScale: number
  }) => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    const frameDir = resolveFrameDir(payload.framesDir)
    const bounds = petWin.getBounds()
    const effectiveScale = payload.effectiveScale
    const displayW = Math.round(payload.frameWidth * effectiveScale)
    const displayH = Math.round(payload.frameHeight * effectiveScale)

    cachedDisplayWidth = displayW
    cachedDisplayHeight = displayH

    console.log(`[shape] displaySize=${displayW}x${displayH} effectiveScale=${effectiveScale} frame=${payload.frameWidth}x${payload.frameHeight}`)

    // Try cache
    const cached = tryLoadCache(frameDir, payload.frameCount, payload.frameWidth, payload.frameHeight, effectiveScale, displayW, displayH)
    if (cached) {
      perFrameRects = cached.map(rects => clampRects(rects, displayW, displayH))
      if (!DEBUG_FULL_RECT_SHAPE && perFrameRects.length > 0) {
        try { petWin.setShape(perFrameRects[0]) } catch {}
        console.log(`[shape] applied from cache: frame=0 rects=${perFrameRects[0].length} window=${displayW}x${displayH}`)
      }
      petWin.webContents.send(IPC_CHANNELS.PET_SHAPE_UPDATED, {
        rects: perFrameRects[0]?.length ?? 0, activeBlocks: perFrameRects.length, totalBlocks: payload.frameCount,
      })
      return
    }

    // Cache miss: compute in display space
    console.log(`[shape] cache MISS v${SHAPE_CACHE_VERSION}, computing display-space shape`)

    try {
      perFrameRects = []
      let totalRects = 0

      for (let i = 0; i < payload.frameCount; i++) {
        const num = String(i + 1).padStart(4, '0')
        const filename = payload.framePattern.replace('{}', num)
        const filePath = join(frameDir, filename)
        try {
          const rects = computeFrameShapeDisplay(filePath, displayW, displayH)
          const safeRects = clampRects(rects, displayW, displayH)
          perFrameRects.push(safeRects)
          totalRects += safeRects.length
        } catch {
          perFrameRects.push([{ x: 0, y: 0, width: displayW, height: displayH }])
        }
      }

      const avgRects = Math.round(totalRects / payload.frameCount)
      console.log(`[shape] precomputed ${perFrameRects.length} frames, avg_rects=${avgRects}`)

      // Save cache
      saveCache(frameDir, payload.frameCount, payload.frameWidth, payload.frameHeight, effectiveScale, displayW, displayH, perFrameRects)

      // Apply frame 0
      if (!DEBUG_FULL_RECT_SHAPE && perFrameRects.length > 0) {
        try { petWin.setShape(perFrameRects[0]) } catch {}
        console.log(`[shape] applied frame=0 rects=${perFrameRects[0].length} window=${displayW}x${displayH}`)
      }

      petWin.webContents.send(IPC_CHANNELS.PET_SHAPE_UPDATED, {
        rects: perFrameRects[0]?.length ?? 0,
        activeBlocks: perFrameRects.length,
        totalBlocks: payload.frameCount,
      })
    } catch (err) {
      console.error('[shape] precompute error:', err)
    }
  })

  ipcMain.on(IPC_CHANNELS.APPLY_FRAME_SHAPE, (_event, frameIndex: number) => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    if (DEBUG_FULL_RECT_SHAPE) {
      const bounds = petWin.getBounds()
      try { petWin.setShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }]) } catch {}
      return
    }

    if (frameIndex < 0 || frameIndex >= perFrameRects.length) return
    try { petWin.setShape(perFrameRects[frameIndex]) } catch {}
  })

  ipcMain.on(IPC_CHANNELS.PET_SURFACE_REFRESH, () => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return
    if (DEBUG_FULL_RECT_SHAPE) return
    if (perFrameRects.length > 0) {
      try { petWin.setShape(perFrameRects[0]) } catch {}
    }
  })

  ipcMain.on(IPC_CHANNELS.CLEAR_PET_SHAPE, () => {
    const petWin = getPetWindow()
    if (petWin && !petWin.isDestroyed()) {
      try { petWin.setShape([]) } catch {}
      perFrameRects = []
    }
  })
}
