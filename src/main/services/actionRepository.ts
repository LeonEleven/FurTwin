/**
 * ActionRepository - Action scanning, metadata access, and validation.
 *
 * This module provides a centralized interface for scanning
 * generated actions, reading their metadata, and validating
 * paths/names for write operations.
 *
 * P1A Phase: Scanning and metadata reading.
 * P1C-1 Phase: Path and name validation for write operations.
 */

import { existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative, isAbsolute } from 'path'
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

// ─── Validation Helpers (P1C-1) ─────────────────────────

/**
 * Check if an action name is safe for use as a directory name / display name.
 * Rejects empty, whitespace-only, path separators, and illegal filename characters.
 */
export function isActionNameSafe(name: string): boolean {
  if (!name || name.trim().length === 0) return false

  const trimmed = name.trim()

  // Reject path separators
  if (trimmed.includes('/') || trimmed.includes('\\')) return false

  // Reject illegal filename characters (Windows + general)
  // < > : " / \ | ? *
  if (/[<>:"\\|?*]/.test(trimmed)) return false

  // Reject . and .. (special directory names)
  if (trimmed === '.' || trimmed === '..') return false

  return true
}

/**
 * Validate an action name and return detailed error message.
 */
export function validateActionName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '名称不能为空' }
  }

  const trimmed = name.trim()

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return { valid: false, error: '名称不能包含路径分隔符' }
  }

  if (/[<>:"\\|?*]/.test(trimmed)) {
    return { valid: false, error: '名称包含非法字符' }
  }

  if (trimmed === '.' || trimmed === '..') {
    return { valid: false, error: '名称不能为 . 或 ..' }
  }

  return { valid: true }
}

/**
 * Check if a directory path is within the generated directory.
 * Prevents path traversal attacks and ensures we only operate on action assets.
 */
export function isWithinGeneratedDir(dirPath: string): boolean {
  const GENERATED_DIR = getGeneratedDir()

  try {
    const resolvedPath = resolve(dirPath)
    const resolvedGenerated = resolve(GENERATED_DIR)

    // Check if the path is exactly the generated dir itself (should not allow deleting root)
    if (resolvedPath === resolvedGenerated) return false

    // Check if the path is within the generated dir
    const rel = relative(resolvedGenerated, resolvedPath)
    // If relative path starts with '..', it's outside
    // If relative path is empty or '.', it's the same directory
    return !rel.startsWith('..') && rel !== '' && rel !== '.'
  } catch {
    return false
  }
}

/**
 * Validate a directory path for write operations.
 * Ensures the path is within the generated directory and exists.
 */
export function validateActionPath(dirPath: string): { valid: boolean; error?: string } {
  if (!dirPath || dirPath.trim().length === 0) {
    return { valid: false, error: '路径不能为空' }
  }

  // Check for absolute paths that might bypass validation
  // (isWithinGeneratedDir handles this via resolve, but we can fail early)
  if (isAbsolute(dirPath) && !dirPath.startsWith(getGeneratedDir())) {
    return { valid: false, error: '路径不在动作目录内' }
  }

  if (!isWithinGeneratedDir(dirPath)) {
    return { valid: false, error: '路径不在动作目录内' }
  }

  if (!existsSync(dirPath)) {
    return { valid: false, error: '动作目录不存在' }
  }

  return { valid: true }
}
