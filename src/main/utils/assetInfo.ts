/**
 * Shared utility for reading generated asset info.
 * Both generatedAssets.ts and actionLib.ts use this to ensure consistency.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolve } from 'path'

const METADATA_FILE = 'asset-metadata.json'

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
