import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join, resolve, relative } from 'path'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'

const LOCAL_CONFIG_PATH = resolve('src/renderer/public/assets/actions/idle/local.config.json')
const PUBLIC_DIR = resolve('src/renderer/public')

function getPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buf = readFileSync(filePath)
    if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  }
}

function scanFrames(dir: string): { count: number; width: number; height: number; format: string } | null {
  if (!existsSync(dir)) return null
  for (const fmt of ['png', 'webp']) {
    const files = readdirSync(dir).filter(f => f.endsWith(`.${fmt}`)).sort()
    if (files.length > 0) {
      const dims = getPngDimensions(join(dir, files[0]))
      return { count: files.length, width: dims?.width ?? 0, height: dims?.height ?? 0, format: fmt }
    }
  }
  return null
}

function toRendererPath(absoluteDir: string): string {
  return './' + relative(PUBLIC_DIR, absoluteDir).replace(/\\/g, '/')
}

function notifyPetWindows() {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
      }
    } catch {}
  })
}

/** Delete local.config.json if it exists */
function deleteLocalConfig() {
  try {
    if (existsSync(LOCAL_CONFIG_PATH)) {
      unlinkSync(LOCAL_CONFIG_PATH)
      console.log(`[preview] deleted local.config.json`)
    }
  } catch (e) {
    console.warn('[preview] failed to delete local.config.json:', e)
  }
}

export function setupPreview(): void {
  // Clean up stale local.config.json on startup
  // (Don't delete - user may have a valid preview. Only delete on explicit RESTORE_DEMO)

  // Apply to pet preview
  ipcMain.on(IPC_CHANNELS.APPLY_TO_PREVIEW, (_event, payload: { outputDir?: string }) => {
    console.log('[preview] APPLY_TO_PREVIEW received')

    const outputDir = payload?.outputDir || resolve('src/renderer/public/assets/actions/idle/frames_real')
    console.log(`[preview] scanning dir: ${outputDir}`)

    const frames = scanFrames(outputDir)
    if (!frames) {
      console.error('[preview] ERROR: no frames found in output dir')
      return
    }

    const rendererPath = toRendererPath(outputDir)
    console.log(`[preview] framesDir=${rendererPath} frameCount=${frames.count} frame=${frames.width}x${frames.height}`)

    const config: AnimConfig = {
      name: 'idle',
      label: 'preview',
      framesDir: rendererPath,
      fps: 12,
      scale: 0.5,
      loop: true,
      frameCount: frames.count,
      frameWidth: frames.width,
      frameHeight: frames.height,
      framePattern: `{}.${frames.format}`,
    }

    try {
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
      console.log('[preview] local.config.json written')
    } catch (e) {
      console.error('[preview] failed to write local.config.json:', e)
      return
    }

    setTimeout(() => {
      notifyPetWindows()
    }, 100)
  })

  // Restore demo preview
  ipcMain.on(IPC_CHANNELS.RESTORE_DEMO, () => {
    console.log('[preview] RESTORE_DEMO received')
    deleteLocalConfig()

    setTimeout(() => {
      notifyPetWindows()
    }, 100)
  })
}
