/**
 * Shared utility for reading generated asset info.
 * Both generatedAssets.ts and actionLib.ts use this to ensure consistency.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolve } from 'path'
import { execSync } from 'child_process'

const METADATA_FILE = 'asset-metadata.json'

export type ActionType = 'idle' | 'play' | 'sleep' | 'eat' | 'clean' | 'custom'

export interface AssetInfo {
  id: string
  path: string
  name: string
  sourceVideo: string
  createdAt: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  format: string
  displayScale: number
  actionType: ActionType
  loop: boolean
  isDefault: boolean
  includeInRandom: boolean
  interruptible: boolean
  fpsOverride: number | null
  autoPlayRepeatCount: number
  sourceWidth: number | null
  sourceHeight: number | null
  trimBox: { x: number; y: number; w: number; h: number } | null
  anchorOffsetX: number
  anchorOffsetY: number
}

function getPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buf = readFileSync(filePath)
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
  } catch {}
  return null
}

/**
 * Scan a generated asset directory for frames.
 * Returns frameCount, frameWidth, frameHeight, format, or null if no frames found.
 */
function scanFrames(dirPath: string): { count: number; width: number; height: number; format: string } | null {
  for (const fmt of ['png', 'webp']) {
    const files = readdirSync(dirPath).filter(f => f.endsWith(`.${fmt}`) && !f.startsWith('.')).sort()
    if (files.length > 0) {
      const dims = getPngDimensions(join(dirPath, files[0]))
      return {
        count: files.length,
        width: dims?.width ?? 0,
        height: dims?.height ?? 0,
        format: fmt,
      }
    }
  }
  return null
}

/**
 * Load asset info from a generated directory.
 * Reads asset-metadata.json first, falls back to scanning frames if metadata is incomplete.
 * If fallback scan succeeds and metadata was incomplete, auto-repairs the metadata file.
 */
export function loadAssetInfo(dirPath: string, dirName: string): AssetInfo | null {
  const metaPath = join(dirPath, METADATA_FILE)

  // Read existing metadata (may be partial or missing)
  let meta: Record<string, any> = {}
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    } catch {}
  }

  // Check if metadata has valid frame info
  const hasValidFrameInfo =
    Number.isFinite(meta.frameCount) && meta.frameCount > 0 &&
    Number.isFinite(meta.frameWidth) && meta.frameWidth > 0 &&
    Number.isFinite(meta.frameHeight) && meta.frameHeight > 0

  let needsRepair = false

  if (!hasValidFrameInfo) {
    // Fallback: scan directory for frames
    const scanned = scanFrames(dirPath)
    if (!scanned || scanned.count === 0) return null

    meta.frameCount = scanned.count
    meta.frameWidth = scanned.width
    meta.frameHeight = scanned.height
    meta.format = scanned.format
    needsRepair = true
  }

  // Fill in missing fields with defaults
  if (!meta.name) { meta.name = dirName; needsRepair = true }
  if (!meta.sourceVideo) { meta.sourceVideo = ''; needsRepair = true }
  if (!meta.createdAt) { meta.createdAt = new Date().toISOString(); needsRepair = true }
  if (!meta.format) { meta.format = 'png'; needsRepair = true }
  if (!Number.isFinite(meta.displayScale) || meta.displayScale <= 0) { meta.displayScale = 0.5; needsRepair = true }
  if (!Number.isFinite(meta.fps) || meta.fps <= 0) { meta.fps = 12; needsRepair = true }
  // Action resource v1 fields
  const VALID_ACTION_TYPES = ['idle', 'play', 'sleep', 'eat', 'clean', 'custom']
  if (meta.actionType === 'greet') { meta.actionType = 'custom'; needsRepair = true } // migrate greet → custom
  if (!VALID_ACTION_TYPES.includes(meta.actionType)) { meta.actionType = 'custom'; needsRepair = true }
  if (typeof meta.loop !== 'boolean') { meta.loop = true; needsRepair = true }
  if (typeof meta.isDefault !== 'boolean') { meta.isDefault = false; needsRepair = true }
  if (typeof meta.includeInRandom !== 'boolean') { meta.includeInRandom = true; needsRepair = true }
  if (typeof meta.interruptible !== 'boolean') { meta.interruptible = true; needsRepair = true }
  if (meta.fpsOverride !== null && !Number.isFinite(meta.fpsOverride)) { meta.fpsOverride = null; needsRepair = true }
  if (!Number.isFinite(meta.autoPlayRepeatCount) || meta.autoPlayRepeatCount < 1) { meta.autoPlayRepeatCount = 1; needsRepair = true }
  // Anchor fields (optional, null = unknown)
  if (meta.sourceWidth !== undefined && !Number.isFinite(meta.sourceWidth)) { meta.sourceWidth = null; needsRepair = true }
  if (meta.sourceHeight !== undefined && !Number.isFinite(meta.sourceHeight)) { meta.sourceHeight = null; needsRepair = true }
  if (meta.anchorOffsetX !== undefined && !Number.isFinite(meta.anchorOffsetX)) { meta.anchorOffsetX = 0; needsRepair = true }
  if (meta.anchorOffsetY !== undefined && !Number.isFinite(meta.anchorOffsetY)) { meta.anchorOffsetY = 0; needsRepair = true }

  // Auto-repair metadata file if needed
  if (needsRepair) {
    try {
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      console.log(`[assetInfo] repaired metadata for ${dirName}`)
    } catch {}
  }

  return {
    id: dirName,
    path: dirPath,
    name: meta.name,
    sourceVideo: meta.sourceVideo || '',
    createdAt: meta.createdAt || '',
    frameCount: meta.frameCount,
    frameWidth: meta.frameWidth,
    frameHeight: meta.frameHeight,
    format: meta.format,
    displayScale: meta.displayScale,
    actionType: meta.actionType,
    loop: meta.loop,
    isDefault: meta.isDefault,
    includeInRandom: meta.includeInRandom,
    interruptible: meta.interruptible,
    fpsOverride: meta.fpsOverride,
    autoPlayRepeatCount: meta.autoPlayRepeatCount,
    sourceWidth: meta.sourceWidth ?? null,
    sourceHeight: meta.sourceHeight ?? null,
    trimBox: meta.trimBox ?? null,
    anchorOffsetX: meta.anchorOffsetX ?? 0,
    anchorOffsetY: meta.anchorOffsetY ?? 0,
  }
}

/**
 * Validate asset info for switching. Returns error message or null if valid.
 */
export function validateAssetInfo(info: AssetInfo | null): string | null {
  if (!info) return 'asset not found'
  if (!Number.isFinite(info.frameCount) || info.frameCount <= 0) return `invalid frameCount=${info.frameCount}`
  if (!Number.isFinite(info.frameWidth) || info.frameWidth <= 0) return `invalid frameWidth=${info.frameWidth}`
  if (!Number.isFinite(info.frameHeight) || info.frameHeight <= 0) return `invalid frameHeight=${info.frameHeight}`
  if (!Number.isFinite(info.displayScale) || info.displayScale <= 0 || info.displayScale > 2) return `invalid displayScale=${info.displayScale}`
  return null
}

/**
 * Convert absolute asset path to renderer-relative framesDir.
 */
export function toFramesDir(assetPath: string): string {
  const publicDir = resolve('src/renderer/public')
  const relative = assetPath.replace(publicDir, '').replace(/\\/g, '/')
  return '.' + relative
}

const LOCAL_CONFIG_PATH = resolve('src/renderer/public/assets/actions/idle/local.config.json')
const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')

/**
 * Compute the character anchor point in display-space pixels.
 *
 * The anchor is the "original video canvas bottom-center" mapped to the trimmed frame,
 * then scaled by displayScale. This ensures different animations with different trim boxes
 * align to the same character reference point when switching.
 *
 * Returns { anchorX, anchorY } in display-space pixels,
 * or null if source/trim info is not available (fallback to window bottom-center).
 */
export function computeDisplayAnchor(
  info: Pick<AssetInfo, 'sourceWidth' | 'sourceHeight' | 'trimBox' | 'frameWidth' | 'frameHeight' | 'displayScale' | 'anchorOffsetX' | 'anchorOffsetY'>
): { anchorX: number; anchorY: number } | null {
  if (!info.sourceWidth || !info.sourceHeight || !info.trimBox) return null
  if (info.sourceWidth <= 0 || info.sourceHeight <= 0) return null

  const displayScale = info.displayScale || 0.5

  // Source canvas bottom-center
  const srcAnchorX = info.sourceWidth / 2
  const srcAnchorY = info.sourceHeight

  // Map to trimmed frame coordinates
  let anchorX = srcAnchorX - info.trimBox.x
  let anchorY = srcAnchorY - info.trimBox.y

  // Apply user manual offset
  anchorX += (info.anchorOffsetX || 0)
  anchorY += (info.anchorOffsetY || 0)

  // Scale to display space
  const displayAnchorX = anchorX * displayScale
  const displayAnchorY = anchorY * displayScale

  // Sanity check: warn if anchor is outside the display frame
  const displayW = info.frameWidth * displayScale
  const displayH = info.frameHeight * displayScale
  if (displayAnchorX < 0 || displayAnchorX > displayW || displayAnchorY < 0 || displayAnchorY > displayH) {
    console.warn(`[assetInfo] anchor outside display frame: anchor=(${displayAnchorX.toFixed(1)},${displayAnchorY.toFixed(1)}) display=${displayW.toFixed(0)}x${displayH.toFixed(0)}`)
  }

  return { anchorX: displayAnchorX, anchorY: displayAnchorY }
}

/**
 * Toggle default asset. If target is already default, clear it.
 * Otherwise set it as default and clear all others.
 */
export function setDefaultAsset(targetDirPath: string): void {
  if (!existsSync(GENERATED_DIR)) return

  // Check if target is already the default
  const targetMetaPath = join(targetDirPath, METADATA_FILE)
  let isAlreadyDefault = false
  try {
    if (existsSync(targetMetaPath)) {
      const meta = JSON.parse(readFileSync(targetMetaPath, 'utf-8'))
      isAlreadyDefault = meta.isDefault === true
    }
  } catch {}

  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    const metaPath = join(dirPath, METADATA_FILE)
    try {
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}
      // If toggling off: clear all. If setting new: clear others, set target.
      const shouldBeDefault = isAlreadyDefault ? false : dirPath === targetDirPath
      if (meta.isDefault !== shouldBeDefault) {
        meta.isDefault = shouldBeDefault
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      }
    } catch {}
  }
}

/**
 * Clear isDefault from all generated assets.
 */
export function clearAllDefaults(): void {
  if (!existsSync(GENERATED_DIR)) return
  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = join(GENERATED_DIR, entry.name, METADATA_FILE)
    try {
      if (!existsSync(metaPath)) continue
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (meta.isDefault) {
        meta.isDefault = false
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      }
    } catch {}
  }
}

/**
 * Get the currently active generated asset ID from local.config.json.
 * Returns the asset directory name (e.g. "1781754837975") or null if in demo mode.
 *
 * Logic:
 * - Read local.config.json framesDir
 * - Normalize path separators to /
 * - Match generated/<id> pattern
 * - If framesDir points to demo frames (not generated/), return null
 */
export function getActiveAssetId(): string | null {
  if (!existsSync(LOCAL_CONFIG_PATH)) return null
  try {
    const config = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
    const framesDir: string = config.framesDir || ''
    const normalized = framesDir.replace(/\\/g, '/')
    // Match: ./assets/actions/idle/generated/<id>
    const match = normalized.match(/generated\/([^/]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Check if an asset has valid anchor metadata.
 */
export function hasAnchorMetadata(info: AssetInfo): boolean {
  return info.sourceWidth != null && info.sourceWidth > 0 &&
         info.sourceHeight != null && info.sourceHeight > 0 &&
         info.trimBox != null
}

/**
 * Try to rebuild anchor metadata for an old asset by probing the source video.
 * If source video exists, gets its dimensions and estimates trimBox from the
 * relationship between source and trimmed frame sizes.
 *
 * Returns true if metadata was successfully rebuilt.
 */
export function rebuildAssetAnchor(dirPath: string, dirName: string): boolean {
  const metaPath = join(dirPath, METADATA_FILE)
  if (!existsSync(metaPath)) return false

  let meta: Record<string, any>
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch { return false }

  // Already has anchor data
  if (meta.sourceWidth > 0 && meta.sourceHeight > 0 && meta.trimBox) return false

  // Need source video
  const sourceVideo: string = meta.sourceVideo || ''
  if (!sourceVideo || !existsSync(sourceVideo)) {
    console.log(`[assetInfo] rebuild anchor: no source video for ${dirName}`)
    return false
  }

  // Get source video dimensions via ffprobe
  let sourceWidth = 0, sourceHeight = 0
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${sourceVideo}"`,
      { encoding: 'utf8', shell: true }
    ).trim()
    const [w, h] = output.split(',').map(Number)
    if (w > 0 && h > 0) { sourceWidth = w; sourceHeight = h }
  } catch {}

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    console.log(`[assetInfo] rebuild anchor: ffprobe failed for ${dirName}`)
    return false
  }

  // Estimate trimBox: for old assets, we don't know the exact trim position.
  // Use a heuristic: assume the character is roughly centered horizontally
  // and the trim preserved the bottom portion of the video.
  // trimBox.x = (sourceWidth - frameWidth) / 2 (centered)
  // trimBox.y = sourceHeight - frameHeight (bottom-aligned)
  const frameWidth = meta.frameWidth || 0
  const frameHeight = meta.frameHeight || 0
  if (frameWidth <= 0 || frameHeight <= 0) return false

  // Clamp trimBox to source bounds
  const trimW = Math.min(frameWidth, sourceWidth)
  const trimH = Math.min(frameHeight, sourceHeight)
  const trimX = Math.max(0, Math.round((sourceWidth - trimW) / 2))
  const trimY = Math.max(0, sourceHeight - trimH)

  meta.sourceWidth = sourceWidth
  meta.sourceHeight = sourceHeight
  meta.trimBox = { x: trimX, y: trimY, w: trimW, h: trimH }
  if (!meta.anchorOffsetX) meta.anchorOffsetX = 0
  if (!meta.anchorOffsetY) meta.anchorOffsetY = 0

  try {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    console.log(`[assetInfo] rebuilt anchor for ${dirName}: src=${sourceWidth}x${sourceHeight} trim=(${trimX},${trimY},${trimW},${trimH})`)
    return true
  } catch {
    return false
  }
}
