import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join, basename, extname, dirname } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs'
import { IPC_CHANNELS, type ExtractOptions } from '../../shared/types'
import { getExtractionOutputDir, getAssetMetadataPath, createGeneratedActionId, getUserExtractionTempActionDir, getUserExtractionTempDir, getUserGeneratedActionDir } from '../services/actionPaths'
import { getFfmpegPath, getFfprobePath, getFfmpegNotFoundMessage } from '../services/ffmpegPath'

const isDev = !app.isPackaged

// ─── Output Target (P2D-2B-0) ─────────────────────────────────────────────
// Defines where FFmpeg extraction output is stored.
// Currently only 'bundled' is used by the UI.
// 'user-temp' is reserved for future userData support.

type OutputTarget = 'bundled' | 'user-temp'

interface OutputDirResult {
  dir: string
  actionId: string
  target: OutputTarget
}

/**
 * Generate output directory based on target.
 * - 'bundled': current behavior, output to src/renderer/public/assets/actions/idle/generated/<timestamp>
 * - 'user-temp': reserved for future, output to userData/temp/extract/<actionId>
 *
 * NOTE: 'user-temp' is NOT yet connected to any business logic.
 */
function generateOutputDir(target: OutputTarget = 'bundled'): OutputDirResult {
  if (target === 'user-temp') {
    // Reserved for future use - NOT connected to UI yet
    const actionId = createGeneratedActionId()
    const dir = getUserExtractionTempActionDir(actionId)
    mkdirSync(dir, { recursive: true })
    return { dir, actionId, target }
  }

  // Default: bundled behavior (current)
  const actionId = String(Date.now())
  const dir = getExtractionOutputDir()
  mkdirSync(dir, { recursive: true })
  return { dir, actionId, target }
}

/**
 * Resolve the Node.js executable for running scripts.
 * - Dev: use npm_node_execpath or system node
 * - Packaged: use process.execPath (Electron) with ELECTRON_RUN_AS_NODE=1
 */
function resolveNodeExecutable(): string {
  if (isDev) {
    const npmNode = process.env.npm_node_execpath
    if (npmNode && existsSync(npmNode)) return npmNode
    const nodeExe = process.env.NODE_EXE
    if (nodeExe && existsSync(nodeExe)) return nodeExe
    return 'node'
  }
  // Packaged: use Electron's process.execPath
  // The caller should set ELECTRON_RUN_AS_NODE=1 in env
  return process.execPath
}

/**
 * Get the path to the extract script.
 * - Dev: project root/scripts/extract-transparent-frames.mjs
 * - Packaged: process.resourcesPath/scripts/extract-transparent-frames.bundle.cjs
 */
function getScriptPath(): string {
  let scriptPath: string
  if (isDev) {
    scriptPath = join(process.cwd(), 'scripts', 'extract-transparent-frames.mjs')
  } else {
    scriptPath = join(process.resourcesPath, 'scripts', 'extract-transparent-frames.bundle.cjs')
  }

  if (!existsSync(scriptPath)) {
    console.error(`[extract] script not found: ${scriptPath}`)
    throw new Error(`提取脚本未找到: ${scriptPath}`)
  }

  return scriptPath
}

function safeSend(win: BrowserWindow | null, channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, ...args) } catch {}
  }
}

/** 扫描输出目录，获取帧信息 */
function scanOutputDir(dir: string): { frameCount: number; frameWidth: number; frameHeight: number } {
  for (const fmt of ['png', 'webp']) {
    const files = readdirSync(dir).filter(f => f.endsWith(`.${fmt}`)).sort()
    if (files.length > 0) {
      const firstPath = join(dir, files[0])
      try {
        const buf = readFileSync(firstPath)
        if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
          return {
            frameCount: files.length,
            frameWidth: buf.readUInt32BE(16),
            frameHeight: buf.readUInt32BE(20),
          }
        }
      } catch {}
      return { frameCount: files.length, frameWidth: 0, frameHeight: 0 }
    }
  }
  return { frameCount: 0, frameWidth: 0, frameHeight: 0 }
}

export function setupSelectVideo(): void {
  ipcMain.handle(IPC_CHANNELS.SELECT_VIDEO, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择绿幕视频',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

export function setupExtractFrames(): void {
  // P3C-1: Clean up stale temp extract directories on startup
  try {
    const tempDir = getUserExtractionTempDir()
    console.log(`[extract] startup cleanup: checking temp extract dir: ${tempDir}`)
    if (existsSync(tempDir)) {
      const entries = readdirSync(tempDir, { withFileTypes: true })
      const dirs = entries.filter(e => e.isDirectory())
      console.log(`[extract] startup cleanup: found ${dirs.length} subdirectory(ies) in temp/extract`)
      let cleaned = 0
      for (const entry of dirs) {
        const dirPath = join(tempDir, entry.name)
        try {
          rmSync(dirPath, { recursive: true, force: true })
          cleaned++
          console.log(`[extract] startup cleanup: removed stale temp: ${entry.name}`)
        } catch (e) {
          console.warn(`[extract] startup cleanup failed for ${entry.name}:`, e)
        }
      }
      console.log(`[extract] startup cleanup: done, removed ${cleaned}/${dirs.length}`)
    } else {
      console.log('[extract] startup cleanup: temp/extract dir does not exist, nothing to clean')
    }
  } catch (e) {
    console.warn('[extract] startup temp cleanup error:', e)
  }

  ipcMain.on(IPC_CHANNELS.EXTRACT_FRAMES, (event, options: ExtractOptions) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (!sender) return

    // Use outputTarget from options, default to 'user-temp' (userData)
    const outputTarget = options.outputTarget || 'user-temp'
    let outputResult: { dir: string; actionId: string; target: string }
    try {
      outputResult = generateOutputDir(outputTarget)
    } catch (e) {
      console.error('[extract] failed to generate output dir:', e)
      safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code: -1, message: `无法创建输出目录: ${e}` })
      return
    }
    const outputDir = outputResult.dir
    console.log(`[extract] output_dir: ${outputDir} (target: ${outputResult.target})`)

    const nodeExec = resolveNodeExecutable()
    let scriptPath: string
    try {
      scriptPath = getScriptPath()
    } catch (e) {
      console.error('[extract] failed to get script path:', e)
      safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code: -1, message: `${e}` })
      return
    }

    // Get FFmpeg and ffprobe paths
    const ffmpegPath = getFfmpegPath()
    const ffprobePath = getFfprobePath()
    console.log(`[extract] ffmpeg: ${ffmpegPath}`)
    console.log(`[extract] ffprobe: ${ffprobePath}`)

    const args = [scriptPath, '--input', options.input, '--output', outputDir]
    args.push('--fps', String(options.fps))
    args.push('--similarity', String(options.similarity))
    args.push('--blend', String(options.blend))
    args.push('--despill', String(options.despill))
    args.push('--format', options.format)
    args.push('--clean', 'true')
    args.push('--ffmpeg-bin', ffmpegPath)
    args.push('--ffprobe-bin', ffprobePath)

    if (options.trimAlpha !== false) {
      args.push('--trim-alpha', 'true')
      if (options.trimThreshold != null) args.push('--trim-threshold', String(options.trimThreshold))
      if (options.trimPadding != null) args.push('--trim-padding', String(options.trimPadding))
    }
    if (options.maskPreset) args.push('--mask-preset', options.maskPreset)
    if (options.maskRegion) args.push('--mask-region', options.maskRegion)
    if (options.crop) args.push('--crop', options.crop)
    if (options.centerCrop) args.push('--center-crop', options.centerCrop)

    console.log(`[extract] node: ${nodeExec}`)
    console.log(`[extract] script: ${scriptPath}`)

    // Prepare environment variables
    const env = { ...process.env }
    // If using Electron's process.execPath, set ELECTRON_RUN_AS_NODE
    if (!isDev && nodeExec === process.execPath) {
      env.ELECTRON_RUN_AS_NODE = '1'
    }

    const child = spawn(nodeExec, args, {
      shell: false,
      windowsHide: true,
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let finished = false
    let allStdout = ''

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString()
      allStdout += text
      safeSend(sender, IPC_CHANNELS.EXTRACT_LOG, text)
    })

    child.stderr.on('data', (data: Buffer) => {
      safeSend(sender, IPC_CHANNELS.EXTRACT_LOG, data.toString())
    })

    child.on('close', (code) => {
      if (finished) return
      finished = true
      console.log(`[extract] close code: ${code}`)

      if (code === 0) {
        // 从输出目录扫描帧信息
        const info = scanOutputDir(outputDir)
        const result: Record<string, unknown> = {
          outputDir,
          frameCount: info.frameCount,
          frameWidth: info.frameWidth,
          frameHeight: info.frameHeight,
          trimWidth: info.frameWidth,
          trimHeight: info.frameHeight,
          actionId: outputResult.actionId,
        }

        // 从日志中解析 trim 信息
        const trimMatch = allStdout.match(/最终帧尺寸:\s*(\d+)x(\d+)/)
        if (trimMatch) {
          result.trimWidth = Number(trimMatch[1])
          result.trimHeight = Number(trimMatch[2])
        }

        // 解析源画布尺寸和裁剪区域
        let sourceWidth = 0, sourceHeight = 0
        let trimBoxX = 0, trimBoxY = 0, trimBoxW = 0, trimBoxH = 0
        const srcMatch = allStdout.match(/源画布尺寸:\s*(\d+)x(\d+)/)
        if (srcMatch) {
          sourceWidth = Number(srcMatch[1])
          sourceHeight = Number(srcMatch[2])
        }
        const boxMatch = allStdout.match(/裁剪区域:\s*x=(\d+)\s*y=(\d+)\s*w=(\d+)\s*h=(\d+)/)
        if (boxMatch) {
          trimBoxX = Number(boxMatch[1])
          trimBoxY = Number(boxMatch[2])
          trimBoxW = Number(boxMatch[3])
          trimBoxH = Number(boxMatch[4])
        }

        // 写入 asset-metadata.json
        const sourceName = basename(options.input, extname(options.input))
        const metadata: Record<string, unknown> = {
          name: sourceName,
          sourceVideo: options.input,
          createdAt: new Date().toISOString(),
          frameCount: result.frameCount,
          frameWidth: result.frameWidth,
          frameHeight: result.frameHeight,
          format: options.format,
          displayScale: 0.5,
          actionType: 'custom',
          loop: true,
          isDefault: false,
          includeInRandom: false,
          interruptible: true,
          fpsOverride: null,
          autoPlayRepeatCount: 1,
          anchorOffsetX: 0,
          anchorOffsetY: 0,
          triggerOnClick: false,
        }
        // 保存源画布和裁剪信息（用于动作切换时角色锚点对齐）
        if (sourceWidth > 0 && sourceHeight > 0) {
          metadata.sourceWidth = sourceWidth
          metadata.sourceHeight = sourceHeight
        }
        if (trimBoxW > 0 && trimBoxH > 0) {
          metadata.trimBox = { x: trimBoxX, y: trimBoxY, w: trimBoxW, h: trimBoxH }
        }
        try {
          writeFileSync(getAssetMetadataPath(outputDir), JSON.stringify(metadata, null, 2), 'utf-8')
          console.log(`[extract] metadata saved: dir=${outputDir}`)
        } catch (e) {
          console.warn('[extract] metadata save failed:', e)
        }

        // P3C-1: Do NOT auto-move temp to final. Keep in temp for user confirmation.

        console.log(`[extract] EXTRACT_DONE (pending confirmation) result=${JSON.stringify(result)}`)
        safeSend(sender, IPC_CHANNELS.EXTRACT_DONE, result)
      } else {
        // FFmpeg failed - clean up user-temp directory if applicable
        if (outputResult.target === 'user-temp') {
          try {
            rmSync(outputDir, { recursive: true, force: true })
            console.log(`[extract] cleaned up user-temp dir: ${outputDir}`)
          } catch (e) {
            console.warn('[extract] failed to cleanup user-temp dir:', e)
          }
        }
        safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code, message: `Exit code: ${code}` })
      }
    })

    child.on('error', (err) => {
      if (finished) return
      finished = true
      console.error(`[extract] spawn error: ${err.message}`)
      // Clean up user-temp directory if applicable
      if (outputResult.target === 'user-temp') {
        try {
          rmSync(outputDir, { recursive: true, force: true })
          console.log(`[extract] cleaned up user-temp dir: ${outputDir}`)
        } catch (e) {
          console.warn('[extract] failed to cleanup user-temp dir:', e)
        }
      }
      safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code: -1, message: err.message })
    })
  })

  // P3C-1: Confirm extract - move temp to final location
  ipcMain.handle(IPC_CHANNELS.CONFIRM_EXTRACT, (_event, payload: { actionId: string }) => {
    if (!payload?.actionId) return { ok: false, error: 'actionId 不能为空' }

    const tempDir = getUserExtractionTempActionDir(payload.actionId)
    const finalDir = getUserGeneratedActionDir(payload.actionId)

    if (!existsSync(tempDir)) {
      return { ok: false, error: '临时目录不存在，可能已确认或丢弃' }
    }

    if (existsSync(finalDir)) {
      return { ok: false, error: '目标目录已存在' }
    }

    try {
      mkdirSync(dirname(finalDir), { recursive: true })
      renameSync(tempDir, finalDir)
      console.log(`[extract] confirmed: moved ${tempDir} -> ${finalDir}`)
      return { ok: true, finalDir, actionId: payload.actionId }
    } catch (e: any) {
      console.warn('[extract] confirm failed:', e)
      return { ok: false, error: e.message }
    }
  })

  // P3C-1: Discard extract - delete temp directory
  ipcMain.handle(IPC_CHANNELS.DISCARD_EXTRACT, (_event, payload: { actionId: string }) => {
    if (!payload?.actionId) return { ok: false, error: 'actionId 不能为空' }

    const tempDir = getUserExtractionTempActionDir(payload.actionId)

    if (!existsSync(tempDir)) {
      return { ok: true } // Already gone, consider success
    }

    try {
      rmSync(tempDir, { recursive: true, force: true })
      console.log(`[extract] discarded: removed ${tempDir}`)
      return { ok: true }
    } catch (e: any) {
      console.warn('[extract] discard failed:', e)
      return { ok: false, error: e.message }
    }
  })
}
