/**
 * Pet window shape management
 * - Per-frame scanline shape for precise alpha boundary
 * - Shape cache for fast resource switching
 */

import { ipcMain, BrowserWindow, Rectangle, screen } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PNG } from 'pngjs'
import { IPC_CHANNELS } from '../../shared/types'

const ALPHA_THRESHOLD = 48
const MERGE_TOLERANCE = 1
const MAX_RECTS = 1000
const SHAPE_CACHE_FILE = 'shape-cache.json'
const SHAPE_CACHE_VERSION = 1

let SHAPE_COORD_MODE: 'dip' | 'physical' = 'dip'

let perFrameRects: Rectangle[][] = []
let cachedFrameWidth = 0
let cachedFrameHeight = 0
let cachedScale = 1

function getPetWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(w => {
    if (w.isDestroyed()) return false
    const title = w.getTitle()
    return title === '' || title === 'FurTwin Pet'
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

function computeFrameShape(filePath: string, scale: number): Rectangle[] {
  const buf = readFileSync(filePath)
  const png = PNG.sync.read(buf)
  const W = png.width
  const H = png.height
  const mask = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) {
    if (png.data[p * 4 + 3] > ALPHA_THRESHOLD) mask[p] = 1
  }
  const rows = extractRunsFromMask(mask, W, H)
  let rects = mergeRunsToRects(rows, MERGE_TOLERANCE)
  rects = rects.map(r => ({
    x: Math.floor(r.x * scale),
    y: Math.floor(r.y * scale),
    width: Math.max(1, Math.ceil(r.width * scale)),
    height: Math.max(1, Math.ceil(r.height * scale)),
  }))
  if (rects.length > MAX_RECTS) rects = rects.slice(0, MAX_RECTS)
  return rects
}

function resolveFrameDir(framesDir: string): string {
  return join(process.cwd(), 'src/renderer/public', framesDir.replace(/^\.\//, ''))
}

function getDisplayScaleFactor(): number {
  const petWin = getPetWindow()
  if (!petWin || petWin.isDestroyed()) return 1
  const bounds = petWin.getBounds()
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
  return display.scaleFactor
}

function applyCoordMode(rects: Rectangle[]): Rectangle[] {
  if (SHAPE_COORD_MODE === 'physical') {
    const sf = getDisplayScaleFactor()
    if (sf !== 1) {
      return rects.map(r => ({
        x: Math.round(r.x * sf),
        y: Math.round(r.y * sf),
        width: Math.max(1, Math.round(r.width * sf)),
        height: Math.max(1, Math.round(r.height * sf)),
      }))
    }
  }
  return rects
}

// ─── Shape Cache ─────────────────────────────────────────

interface ShapeCache {
  version: number
  frameCount: number
  frameWidth: number
  frameHeight: number
  scale: number
  coordMode: string
  perFrameRects: Rectangle[][]
  createdAt: number
}

function getCachePath(frameDir: string): string {
  return join(frameDir, SHAPE_CACHE_FILE)
}

function tryLoadCache(frameDir: string, frameCount: number, frameWidth: number, frameHeight: number, scale: number): Rectangle[][] | null {
  const cachePath = getCachePath(frameDir)
  if (!existsSync(cachePath)) return null

  try {
    const raw = readFileSync(cachePath, 'utf-8')
    const cache: ShapeCache = JSON.parse(raw)

    if (cache.version !== SHAPE_CACHE_VERSION) return null
    if (cache.frameCount !== frameCount) return null
    if (cache.frameWidth !== frameWidth) return null
    if (cache.frameHeight !== frameHeight) return null
    if (cache.scale !== scale) return null
    if (!Array.isArray(cache.perFrameRects) || cache.perFrameRects.length !== frameCount) return null

    console.log(`[shape] cache HIT: ${cachePath} (${cache.perFrameRects.length} frames, created=${new Date(cache.createdAt).toISOString()})`)
    return cache.perFrameRects
  } catch (e) {
    console.warn('[shape] cache read failed:', e)
    return null
  }
}

function saveCache(frameDir: string, frameCount: number, frameWidth: number, frameHeight: number, scale: number, rects: Rectangle[][]): void {
  const cachePath = getCachePath(frameDir)
  const cache: ShapeCache = {
    version: SHAPE_CACHE_VERSION,
    frameCount,
    frameWidth,
    frameHeight,
    scale,
    coordMode: SHAPE_COORD_MODE,
    perFrameRects: rects,
    createdAt: Date.now(),
  }
  try {
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
    console.log(`[shape] cache SAVED: ${cachePath}`)
  } catch (e) {
    console.warn('[shape] cache write failed:', e)
  }
}

// ─── IPC Handlers ────────────────────────────────────────

export function setupPetShape(): void {
  ipcMain.on(IPC_CHANNELS.COMPUTE_PET_SHAPE, (_event, payload: {
    framesDir: string; framePattern: string; frameCount: number;
    frameWidth: number; frameHeight: number; scale: number
  }) => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    const frameDir = resolveFrameDir(payload.framesDir)
    const bounds = petWin.getBounds()

    cachedFrameWidth = payload.frameWidth
    cachedFrameHeight = payload.frameHeight
    cachedScale = payload.scale

    // Try cache first
    const cached = tryLoadCache(frameDir, payload.frameCount, payload.frameWidth, payload.frameHeight, payload.scale)
    if (cached) {
      perFrameRects = cached.map(rects => clampRects(rects, bounds.width, bounds.height))
      const rects = applyCoordMode(perFrameRects[0] ?? [])
      try { petWin.setShape(rects) } catch {}
      console.log(`[shape] applied from cache: frame=0 rects=${rects.length}`)
      petWin.webContents.send(IPC_CHANNELS.PET_SHAPE_UPDATED, {
        rects: rects.length, activeBlocks: perFrameRects.length, totalBlocks: payload.frameCount,
      })
      return
    }

    // Cache miss: compute
    console.log(`[shape] cache MISS, computing: dir=${frameDir} frames=${payload.frameCount}`)

    try {
      perFrameRects = []
      let totalRects = 0
      for (let i = 0; i < payload.frameCount; i++) {
        const num = String(i + 1).padStart(4, '0')
        const filename = payload.framePattern.replace('{}', num)
        const filePath = join(frameDir, filename)
        try {
          const rects = computeFrameShape(filePath, payload.scale)
          const safeRects = clampRects(rects, bounds.width, bounds.height)
          perFrameRects.push(safeRects)
          totalRects += safeRects.length
        } catch {
          perFrameRects.push([{ x: 0, y: 0, width: bounds.width, height: bounds.height }])
        }
      }
      const avgRects = Math.round(totalRects / payload.frameCount)
      console.log(`[shape] precomputed ${perFrameRects.length} frames, avg_rects=${avgRects}`)

      // Save cache
      saveCache(frameDir, payload.frameCount, payload.frameWidth, payload.frameHeight, payload.scale, perFrameRects)

      if (perFrameRects.length > 0) {
        const rects = applyCoordMode(perFrameRects[0])
        try { petWin.setShape(rects) } catch (e) { console.warn('[shape] setShape failed:', e) }
        console.log(`[shape] applied frame=0 rects=${rects.length}`)
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
    if (frameIndex < 0 || frameIndex >= perFrameRects.length) return
    const rects = applyCoordMode(perFrameRects[frameIndex])
    try { petWin.setShape(rects) } catch {}
  })

  ipcMain.on(IPC_CHANNELS.PET_SURFACE_REFRESH, () => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return
    if (perFrameRects.length > 0) {
      const rects = applyCoordMode(perFrameRects[0])
      try { petWin.setShape(rects) } catch {}
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
