/**
 * Pet window shape management
 * - Per-frame scanline shape for precise alpha boundary
 * - Union shape fallback
 * - DPI coordinate mode testing
 */

import { ipcMain, BrowserWindow, Rectangle, screen } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PNG } from 'pngjs'
import { IPC_CHANNELS } from '../../shared/types'

const ALPHA_THRESHOLD = 48
const MERGE_TOLERANCE = 1
const MAX_RECTS = 1000

// A/B test: 'dip' = local coordinates, 'physical' = scaled by display scaleFactor
let SHAPE_COORD_MODE: 'dip' | 'physical' = 'dip'

// Per-frame shape cache
let perFrameRects: Rectangle[][] = []
let cachedFrameWidth = 0
let cachedFrameHeight = 0
let cachedScale = 1
let cachedFrameDir = ''
let cachedFramePattern = ''

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

/** Compute scanline rects for a single PNG frame */
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
  // Scale to window coordinates
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

/** Get display scaleFactor for the pet window */
function getDisplayScaleFactor(): number {
  const petWin = getPetWindow()
  if (!petWin || petWin.isDestroyed()) return 1
  const bounds = petWin.getBounds()
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
  return display.scaleFactor
}

/** Apply coord mode transform to rects */
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

export function setupPetShape(): void {
  // Pre-compute per-frame shapes
  ipcMain.on(IPC_CHANNELS.COMPUTE_PET_SHAPE, (_event, payload: {
    framesDir: string; framePattern: string; frameCount: number;
    frameWidth: number; frameHeight: number; scale: number
  }) => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    const frameDir = resolveFrameDir(payload.framesDir)
    const bounds = petWin.getBounds()
    const sf = getDisplayScaleFactor()

    console.log(`[shape] precompute: dir=${frameDir} frames=${payload.frameCount} frame=${payload.frameWidth}x${payload.frameHeight} scale=${payload.scale} window=${bounds.width}x${bounds.height} displayScale=${sf}`)
    console.log(`[shape] coordMode=${SHAPE_COORD_MODE}`)

    cachedFrameWidth = payload.frameWidth
    cachedFrameHeight = payload.frameHeight
    cachedScale = payload.scale
    cachedFrameDir = frameDir
    cachedFramePattern = payload.framePattern

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

      // Apply frame 0 shape
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

  // Apply shape for specific frame (called when animation frame changes)
  ipcMain.on(IPC_CHANNELS.APPLY_FRAME_SHAPE, (_event, frameIndex: number) => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    if (frameIndex < 0 || frameIndex >= perFrameRects.length) return

    const rects = applyCoordMode(perFrameRects[frameIndex])
    try {
      petWin.setShape(rects)
    } catch (e) {
      console.warn(`[shape] apply frame=${frameIndex} failed:`, e)
    }
  })

  // Lightweight surface refresh
  ipcMain.on(IPC_CHANNELS.PET_SURFACE_REFRESH, () => {
    const petWin = getPetWindow()
    if (!petWin || petWin.isDestroyed()) return

    // Reapply current frame shape if available
    if (perFrameRects.length > 0) {
      // Use frame 0 as default refresh target
      const rects = applyCoordMode(perFrameRects[0])
      try { petWin.setShape(rects) } catch {}
    }
  })

  // Clear shape
  ipcMain.on(IPC_CHANNELS.CLEAR_PET_SHAPE, () => {
    const petWin = getPetWindow()
    if (petWin && !petWin.isDestroyed()) {
      try { petWin.setShape([]) } catch {}
      perFrameRects = []
    }
  })
}
