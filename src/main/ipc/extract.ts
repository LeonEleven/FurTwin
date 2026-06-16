import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { IPC_CHANNELS, type ExtractOptions } from '../../shared/types'

const isDev = !app.isPackaged

function resolveNodeExecutable(): string {
  const npmNode = process.env.npm_node_execpath
  if (npmNode && existsSync(npmNode)) return npmNode
  const nodeExe = process.env.NODE_EXE
  if (nodeExe && existsSync(nodeExe)) return nodeExe
  return 'node'
}

function getScriptPath(): string {
  if (isDev) return join(process.cwd(), 'scripts', 'extract-transparent-frames.mjs')
  return join(process.resourcesPath, 'scripts', 'extract-transparent-frames.mjs')
}

function safeSend(win: BrowserWindow | null, channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, ...args) } catch {}
  }
}

function generateOutputDir(): string {
  const timestamp = Date.now()
  const dir = join(process.cwd(), 'src/renderer/public/assets/actions/idle/generated', String(timestamp))
  mkdirSync(dir, { recursive: true })
  return dir
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
  ipcMain.on(IPC_CHANNELS.EXTRACT_FRAMES, (event, options: ExtractOptions) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (!sender) return

    const outputDir = generateOutputDir()
    console.log(`[extract] output_dir: ${outputDir}`)

    const nodeExec = resolveNodeExecutable()
    const scriptPath = getScriptPath()

    const args = [scriptPath, '--input', options.input, '--output', outputDir]
    args.push('--fps', String(options.fps))
    args.push('--similarity', String(options.similarity))
    args.push('--blend', String(options.blend))
    args.push('--despill', String(options.despill))
    args.push('--format', options.format)
    args.push('--clean', 'true')

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

    const child = spawn(nodeExec, args, {
      shell: false,
      windowsHide: true,
      cwd: process.cwd(),
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
        const result = {
          outputDir,
          frameCount: info.frameCount,
          frameWidth: info.frameWidth,
          frameHeight: info.frameHeight,
          trimWidth: info.frameWidth,
          trimHeight: info.frameHeight,
        }

        // 尝试从日志中解析 trim 后尺寸
        const trimMatch = allStdout.match(/Final frame size:\s*(\d+)x(\d+)/i)
        if (trimMatch) {
          result.trimWidth = Number(trimMatch[1])
          result.trimHeight = Number(trimMatch[2])
        }

        console.log(`[extract] EXTRACT_DONE result=${JSON.stringify(result)}`)
        safeSend(sender, IPC_CHANNELS.EXTRACT_DONE, result)
      } else {
        safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code, message: `Exit code: ${code}` })
      }
    })

    child.on('error', (err) => {
      if (finished) return
      finished = true
      console.error(`[extract] spawn error: ${err.message}`)
      safeSend(sender, IPC_CHANNELS.EXTRACT_ERROR, { code: -1, message: err.message })
    })
  })
}
