/**
 * FFmpeg path resolution for packaged and dev environments.
 *
 * Resolution priority:
 * 1. Environment variable FURTWIN_FFMPEG_PATH (if set and file exists)
 * 2. Packaged: process.resourcesPath/bin/ffmpeg.exe
 * 3. Dev: project root resources/bin/ffmpeg.exe
 * 4. Fallback: 'ffmpeg' (system PATH)
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

const isDev = !app.isPackaged

/**
 * Get the path to ffmpeg executable.
 * Returns the first existing path, or 'ffmpeg' as fallback.
 */
export function getFfmpegPath(): string {
  // 1. Environment variable
  const envPath = process.env.FURTWIN_FFMPEG_PATH
  if (envPath && existsSync(envPath)) {
    return envPath
  }

  // 2. Packaged: resources/bin/ffmpeg.exe
  if (!isDev) {
    const packagedPath = join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    if (existsSync(packagedPath)) {
      return packagedPath
    }
  }

  // 3. Dev: project root resources/bin/ffmpeg.exe
  if (isDev) {
    const devPath = join(process.cwd(), 'resources', 'bin', 'ffmpeg.exe')
    if (existsSync(devPath)) {
      return devPath
    }
  }

  // 4. Fallback: system PATH
  return 'ffmpeg'
}

/**
 * Get the path to ffprobe executable.
 * Returns the first existing path, or 'ffprobe' as fallback.
 */
export function getFfprobePath(): string {
  // 1. Environment variable
  const envPath = process.env.FURTWIN_FFPROBE_PATH
  if (envPath && existsSync(envPath)) {
    return envPath
  }

  // 2. Packaged: resources/bin/ffprobe.exe
  if (!isDev) {
    const packagedPath = join(process.resourcesPath, 'bin', 'ffprobe.exe')
    if (existsSync(packagedPath)) {
      return packagedPath
    }
  }

  // 3. Dev: project root resources/bin/ffprobe.exe
  if (isDev) {
    const devPath = join(process.cwd(), 'resources', 'bin', 'ffprobe.exe')
    if (existsSync(devPath)) {
      return devPath
    }
  }

  // 4. Fallback: system PATH
  return 'ffprobe'
}

/**
 * Check if FFmpeg is available.
 * Returns true if ffmpeg executable exists and is accessible.
 */
export function isFfmpegAvailable(): boolean {
  const ffmpegPath = getFfmpegPath()

  // If it's a system command, we can't easily check without spawning
  if (ffmpegPath === 'ffmpeg') {
    // Assume available if it's a system command
    // Actual check will happen when we try to spawn it
    return true
  }

  // Check if the file exists
  return existsSync(ffmpegPath)
}

/**
 * Get a user-friendly error message when FFmpeg is not found.
 */
export function getFfmpegNotFoundMessage(): string {
  return '未找到 FFmpeg。请安装 FFmpeg 并添加到系统 PATH，或等待后续内置打包版本。'
}
