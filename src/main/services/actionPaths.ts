/**
 * Centralized path resolution for action resources.
 *
 * This module provides a single source of truth for all action-related paths.
 * In this phase, all paths point to the current physical locations under src/renderer/public/.
 * Future phases may redirect user-writable paths to app.getPath('userData').
 *
 * P2B Phase: Added userData path functions for future use (not yet connected to business logic).
 * P2E-5A: Packaged mode uses process.resourcesPath for bundled action paths.
 */

import { resolve, join } from 'path'
import { app } from 'electron'

// ─── Current directories (development + packaged compatible) ─────────────────
// Dev: src/renderer/public (source tree)
// Packaged: process.resourcesPath (extraResources target: resources/assets/actions/idle/)
const isPackaged = app.isPackaged
const PUBLIC_DIR = isPackaged ? process.resourcesPath : resolve('src/renderer/public')
const ACTIONS_DIR = join(PUBLIC_DIR, 'assets/actions/idle')

// User-writable paths (currently under PUBLIC_DIR, may move to userData later)
export const GENERATED_DIR = join(ACTIONS_DIR, 'generated')
export const LOCAL_CONFIG_PATH = join(ACTIONS_DIR, 'local.config.json')

// Read-only paths
export const FRAMES_DIR = join(ACTIONS_DIR, 'frames')
export const FRAMES_REAL_DIR = isPackaged ? join(app.getPath('userData'), 'temp', 'frames_real') : join(ACTIONS_DIR, 'frames_real')

// ─── userData paths (P2B - reserved for future use) ─────────────────────────
// These functions are NOT yet connected to any business logic.
// They will be used in future phases to support user-writable action storage.

/**
 * Get the public directory root.
 * Used for converting absolute paths to renderer-relative paths.
 */
export function getPublicDir(): string {
  return PUBLIC_DIR
}

/**
 * Get the actions directory.
 */
export function getActionsDir(): string {
  return ACTIONS_DIR
}

/**
 * Get the generated assets directory.
 */
export function getGeneratedDir(): string {
  return GENERATED_DIR
}

/**
 * Get the local.config.json path.
 */
export function getLocalConfigPath(): string {
  return LOCAL_CONFIG_PATH
}

/**
 * Get the frames_real directory path (default preview output).
 */
export function getFramesRealDir(): string {
  return FRAMES_REAL_DIR
}

/**
 * Get the path to a specific asset's metadata file.
 */
export function getAssetMetadataPath(assetDir: string): string {
  return join(assetDir, 'asset-metadata.json')
}

/**
 * Convert an absolute asset path to a renderer-safe framesDir.
 * - Dev mode bundled: returns relative path (./assets/actions/idle/generated/<id>)
 * - Packaged mode bundled: returns relative path (same — used for config file only)
 * - userData paths: returns furtwin-userdata:// protocol URL
 *
 * NOTE: For sending framesDir to the renderer via IPC, use toActionFramesDir() instead.
 * This function is for config file writing and dev-mode preview.
 */
export function toRendererPath(absolutePath: string): string {
  // If path is under userData, use protocol URL
  const userDataDir = app.getPath('userData')
  if (absolutePath.startsWith(userDataDir)) {
    const rel = absolutePath.slice(userDataDir.length).replace(/\\/g, '/').replace(/^\//, '')
    return `furtwin-userdata://${rel}`
  }
  const rel = absolutePath.replace(PUBLIC_DIR, '').replace(/\\/g, '/').replace(/^\//, '')
  return `./${rel}`
}

/**
 * Convert a renderer-relative framesDir to an absolute path.
 * Handles: relative paths, furtwin-userdata:// URLs, furtwin-bundled:// URLs.
 * Example: ./assets/actions/idle/generated/123
 *       -> /abs/path/src/renderer/public/assets/actions/idle/generated/123
 */
export function toAbsoluteFramesDir(rendererPath: string): string {
  // Handle furtwin-bundled:// protocol (packaged mode bundled actions)
  if (rendererPath.startsWith('furtwin-bundled://')) {
    const match = rendererPath.match(/furtwin-bundled:\/\/(.+)/)
    if (match) {
      return join(process.resourcesPath, 'assets', match[1])
    }
  }
  // Handle furtwin-userdata:// protocol (userData actions)
  if (rendererPath.startsWith('furtwin-userdata://')) {
    const match = rendererPath.match(/furtwin-userdata:\/\/actions\/generated\/([^/]+)/)
    if (match) {
      return join(getUserGeneratedDir(), match[1])
    }
  }
  // Relative path (dev mode) — strip leading ./ and any leading /
  return join(PUBLIC_DIR, rendererPath.replace(/^\.\//, '').replace(/^\//, ''))
}

/**
 * Get the default output directory for FFmpeg extraction.
 * Creates the directory if it doesn't exist.
 */
export function getExtractionOutputDir(): string {
  const timestamp = Date.now()
  return join(GENERATED_DIR, String(timestamp))
}

// ─── userData path functions (P2B - reserved for future use) ─────────────────
// These functions are NOT yet connected to any business logic.
// They will be used in future phases to support user-writable action storage.

/**
 * Check if the app is running in packaged mode.
 * Useful for determining which path strategy to use.
 */
export function isPackagedRuntime(): boolean {
  return app.isPackaged
}

/**
 * Get the userData root directory.
 * This is the Electron app's userData path (e.g., %APPDATA%/FurTwin on Windows).
 * Currently not used by any business logic.
 */
export function getUserDataRootDir(): string {
  return app.getPath('userData')
}

/**
 * Get the user actions directory under userData.
 * Structure: <userData>/actions
 * Currently not used by any business logic.
 */
export function getUserActionsDir(): string {
  return join(getUserDataRootDir(), 'actions')
}

/**
 * Get the user generated actions directory under userData.
 * Structure: <userData>/actions/generated
 * Currently not used by any business logic.
 */
export function getUserGeneratedDir(): string {
  return join(getUserActionsDir(), 'generated')
}

/**
 * Get the user temp directory under userData.
 * Structure: <userData>/temp
 * Useful for temporary extraction or processing.
 * Currently not used by any business logic.
 */
export function getUserTempDir(): string {
  return join(getUserDataRootDir(), 'temp')
}

/**
 * Get the bundled actions directory (current behavior).
 * This is the directory where actions are currently stored.
 * In development: src/renderer/public/assets/actions/idle/generated
 * In packaged: app.asar/assets/actions/idle/generated
 * Currently used by all business logic.
 */
export function getBundledActionsDir(): string {
  return GENERATED_DIR
}

/**
 * Get the bundled local.config.json path.
 * This is the default config shipped with the app.
 * Used as fallback when userData config doesn't exist.
 */
export function getBundledLocalConfigPath(): string {
  return LOCAL_CONFIG_PATH
}

/**
 * Get the userData local.config.json path.
 * This is where runtime config should be written.
 * Structure: <userData>/local.config.json
 */
export function getUserLocalConfigPath(): string {
  return join(getUserDataRootDir(), 'local.config.json')
}

/**
 * Get the runtime local.config.json path.
 * This is the single path used for all runtime config reads/writes.
 * Reads: prioritize userData, fallback to bundled.
 * Writes: always to userData.
 */
export function getRuntimeLocalConfigPath(): string {
  return getUserLocalConfigPath()
}

// ─── userData extraction path helpers (P2D-2A - reserved for future use) ─────
// These functions are NOT yet connected to any business logic.
// They will be used in future phases to support FFmpeg extraction to userData.

/**
 * Generate a unique action ID for a new action.
 * Uses timestamp + random suffix to avoid conflicts with existing directories.
 * Format: <timestamp>_<random4chars> (e.g., "1782126340688_a3f2")
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function createGeneratedActionId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 6) // 4 random chars
  return `${timestamp}_${random}`
}

/**
 * Get the userData temp directory for extraction.
 * Structure: <userData>/temp/extract
 * Used as a staging area before moving to final location.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function getUserExtractionTempDir(): string {
  return join(getUserTempDir(), 'extract')
}

/**
 * Get the temp directory for a specific action being extracted.
 * Structure: <userData>/temp/extract/<actionId>
 * Used during FFmpeg extraction, before moving to final location.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function getUserExtractionTempActionDir(actionId: string): string {
  return join(getUserExtractionTempDir(), actionId)
}

/**
 * Get the final generated directory for a specific action.
 * Structure: <userData>/actions/generated/<actionId>
 * This is where completed actions are stored.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function getUserGeneratedActionDir(actionId: string): string {
  return join(getUserGeneratedDir(), actionId)
}

/**
 * Get the frames directory for a specific action.
 * Structure: <userData>/actions/generated/<actionId>
 * (frames are stored directly in the action directory)
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function getUserActionFramesDir(actionId: string): string {
  return getUserGeneratedActionDir(actionId)
}

/**
 * Convert a userData action path to a furtwin-userdata:// protocol URL.
 * Example: <userData>/actions/generated/123456
 *       -> furtwin-userdata://actions/generated/123456
 *
 * This URL can be used as framesDir in local.config.json for userData actions.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function toUserDataProtocolUrl(actionId: string): string {
  return `furtwin-userdata://actions/generated/${actionId}`
}

/**
 * Convert a userData action path to a renderer-accessible framesDir.
 * For userData actions, this returns a furtwin-userdata:// protocol URL.
 * For bundled actions, this returns a relative path.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function toUserDataFramesDir(actionId: string, source: 'bundled' | 'user'): string {
  if (source === 'user') {
    return toUserDataProtocolUrl(actionId)
  }
  // For bundled actions, use relative path (current behavior)
  return `./assets/actions/idle/generated/${actionId}`
}
