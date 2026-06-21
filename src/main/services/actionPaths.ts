/**
 * Centralized path resolution for action resources.
 *
 * This module provides a single source of truth for all action-related paths.
 * In this phase, all paths point to the current physical locations under src/renderer/public/.
 * Future phases may redirect user-writable paths to app.getPath('userData').
 */

import { resolve, join } from 'path'

// Base directories
const PUBLIC_DIR = resolve('src/renderer/public')
const ACTIONS_DIR = join(PUBLIC_DIR, 'assets/actions/idle')

// User-writable paths (currently under PUBLIC_DIR, may move to userData later)
export const GENERATED_DIR = join(ACTIONS_DIR, 'generated')
export const LOCAL_CONFIG_PATH = join(ACTIONS_DIR, 'local.config.json')

// Read-only paths
export const FRAMES_DIR = join(ACTIONS_DIR, 'frames')
export const FRAMES_REAL_DIR = join(ACTIONS_DIR, 'frames_real')

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
 * Convert an absolute asset path to a renderer-relative framesDir.
 * Example: /abs/path/src/renderer/public/assets/actions/idle/generated/123
 *       -> ./assets/actions/idle/generated/123
 */
export function toRendererPath(absolutePath: string): string {
  return './' + absolutePath.replace(PUBLIC_DIR, '').replace(/\\/g, '/')
}

/**
 * Convert a renderer-relative framesDir to an absolute path.
 * Example: ./assets/actions/idle/generated/123
 *       -> /abs/path/src/renderer/public/assets/actions/idle/generated/123
 */
export function toAbsoluteFramesDir(rendererPath: string): string {
  return join(PUBLIC_DIR, rendererPath.replace(/^\.\//, ''))
}

/**
 * Get the default output directory for FFmpeg extraction.
 * Creates the directory if it doesn't exist.
 */
export function getExtractionOutputDir(): string {
  const timestamp = Date.now()
  return join(GENERATED_DIR, String(timestamp))
}
