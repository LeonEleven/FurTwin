/**
 * ActionRepository - Read-only action scanning and metadata access.
 *
 * This module provides a centralized, read-only interface for scanning
 * generated actions and reading their metadata. It does NOT handle
 * write operations (create, update, delete) — those remain in their
 * respective IPC handlers.
 *
 * P1A Phase: Only scanning and metadata reading are implemented here.
 */

import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { loadAssetInfo, getActiveAssetId, toFramesDir, type AssetInfo } from '../utils/assetInfo'
import { getGeneratedDir, getPublicDir } from './actionPaths'

// ─── Types ──────────────────────────────────────────────

export interface ActionEntry {
  id: string           // Directory name (e.g., "1781753509246")
  path: string         // Absolute path to the asset directory
  info: AssetInfo      // Full asset metadata
  modifiedAt: number   // Directory modification time (ms)
  isActive: boolean    // Whether this is the currently active asset
}

// ─── Read-Only Repository ───────────────────────────────

/**
 * Scan all generated actions (without frame validation).
 * Returns entries sorted by modifiedAt descending (newest first).
 *
 * Use case: Control panel action list, right-click menu
 */
export function scanAllActions(): ActionEntry[] {
  const GENERATED_DIR = getGeneratedDir()
  if (!existsSync(GENERATED_DIR)) return []

  const activeId = getActiveAssetId()
  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: ActionEntry[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const info = loadAssetInfo(dirPath, entry.name)
      if (info) {
        const stat = statSync(dirPath)
        const isActive = activeId !== null && activeId === entry.name
        assets.push({
          id: entry.name,
          path: dirPath,
          info,
          modifiedAt: stat.mtimeMs,
          isActive,
        })
      }
    } catch {}
  }

  assets.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return assets
}

/**
 * Scan actions with frame validation.
 * Only returns actions that have valid frames in their frames directory.
 *
 * Use case: Behavior system (auto-behavior, click interaction)
 */
export function scanValidActions(): ActionEntry[] {
  const GENERATED_DIR = getGeneratedDir()
  const PUBLIC_DIR = getPublicDir()

  if (!existsSync(GENERATED_DIR)) return []

  const activeId = getActiveAssetId()
  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: ActionEntry[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const info = loadAssetInfo(dirPath, entry.name)
      if (!info) continue

      // Verify frames exist
      const framesDir = join(PUBLIC_DIR, toFramesDir(dirPath).replace(/^\.\//, ''))
      if (!existsSync(framesDir)) continue
      const hasFrames = readdirSync(framesDir).some(f => f.endsWith('.png') || f.endsWith('.webp'))
      if (!hasFrames) continue

      const stat = statSync(dirPath)
      const isActive = activeId !== null && activeId === entry.name
      assets.push({
        id: entry.name,
        path: dirPath,
        info,
        modifiedAt: stat.mtimeMs,
        isActive,
      })
    } catch {}
  }

  assets.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return assets
}

/**
 * Read metadata for a single action by directory path.
 *
 * Use case: When you need to refresh a single action's info
 */
export function readActionMetadata(dirPath: string, dirName?: string): AssetInfo | null {
  const name = dirName || dirPath.split(/[/\\]/).pop() || ''
  return loadAssetInfo(dirPath, name)
}
