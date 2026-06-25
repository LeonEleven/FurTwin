import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'
import { getControlPanel } from '../windows/controlPanel'
import { pauseAutoBehavior } from '../behavior'
import { getLocalConfigPath, getRuntimeLocalConfigPath, getBundledLocalConfigPath, getPublicDir, getFramesRealDir, toRendererPath, getUserGeneratedDir } from '../services/actionPaths'
import { isUserDataProtocolUrl } from '../services/userDataProtocol'

const LOCAL_CONFIG_PATH = getRuntimeLocalConfigPath()
const BUNDLED_CONFIG_PATH = getBundledLocalConfigPath()
const PUBLIC_DIR = getPublicDir()

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

function notifyPetSwitchAnim(config: AnimConfig) {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config)
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

/**
 * Restore demo: delete local.config.json and reload all pet windows.
 * Used by both control panel and right-click menu.
 */
export function restoreDemo(): void {
  console.log('[preview] restoreDemo')
  deleteLocalConfig()
  setTimeout(() => {
    notifyPetWindows()
    // Notify control panel to clear "current use" status
    const cp = getControlPanel()
    if (cp && !cp.isDestroyed()) {
      try { cp.webContents.send(IPC_CHANNELS.ACTIVE_ASSET_CHANGED) } catch {}
    }
    // Pause auto-behavior on manual restore demo
    pauseAutoBehavior()
  }, 100)
}

/**
 * Startup validation: check if local.config.json references a valid asset.
 * If the frames directory is missing or has no frames, delete the config
 * so the pet falls back to the default demo animation.
 */
export function validateStartupConfig(): void {
  if (!existsSync(LOCAL_CONFIG_PATH)) return

  try {
    const config = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
    const framesDir: string = config.framesDir
    if (!framesDir) {
      console.log('[preview] startup: empty framesDir, deleting local.config.json')
      deleteLocalConfig()
      return
    }

    // Handle userData protocol URLs
    let absDir: string
    if (isUserDataProtocolUrl(framesDir)) {
      // Extract actionId from furtwin-userdata://actions/generated/<actionId>
      const match = framesDir.match(/furtwin-userdata:\/\/actions\/generated\/([^/]+)/)
      if (match) {
        const actionId = match[1]
        absDir = join(getUserGeneratedDir(), actionId)
      } else {
        console.log(`[preview] startup: invalid userData protocol URL (${framesDir}), deleting local.config.json`)
        deleteLocalConfig()
        return
      }
    } else {
      // For bundled actions, use existing logic
      absDir = join(PUBLIC_DIR, framesDir.replace(/^\.\//, ''))
    }

    if (!existsSync(absDir)) {
      console.log(`[preview] startup: frames dir missing (${absDir}), deleting local.config.json`)
      deleteLocalConfig()
      return
    }

    const hasFrames = readdirSync(absDir).some(f => f.endsWith('.png') || f.endsWith('.webp'))
    if (!hasFrames) {
      console.log(`[preview] startup: no frames in ${absDir}, deleting local.config.json`)
      deleteLocalConfig()
      return
    }

    console.log(`[preview] startup: local.config.json valid, framesDir=${framesDir}`)
  } catch {
    console.log('[preview] startup: failed to parse local.config.json, deleting')
    deleteLocalConfig()
  }
}

export function setupPreview(): void {
  // Clean up stale local.config.json on startup
  // (Don't delete - user may have a valid preview. Only delete on explicit RESTORE_DEMO)

  // Apply to pet preview
  ipcMain.on(IPC_CHANNELS.APPLY_TO_PREVIEW, (_event, payload: { outputDir?: string; displayScale?: number }) => {
    console.log('[preview] APPLY_TO_PREVIEW received')

    const outputDir = payload?.outputDir || getFramesRealDir()
    const displayScale = Number(payload?.displayScale) || 0.5
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
      displayScale,
      loop: true,
      frameCount: frames.count,
      frameWidth: frames.width,
      frameHeight: frames.height,
      framePattern: `{}.${frames.format}`,
    }

    try {
      // Preserve existing behavior params when writing action config
      // Priority: userData config > bundled config > empty
      let existingConfig: Record<string, any> = {}
      if (existsSync(LOCAL_CONFIG_PATH)) {
        try {
          existingConfig = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
        } catch {}
      } else if (existsSync(BUNDLED_CONFIG_PATH)) {
        try {
          existingConfig = JSON.parse(readFileSync(BUNDLED_CONFIG_PATH, 'utf-8'))
        } catch {}
      }
      // Merge: action config fields + preserved behavior params
      const mergedConfig = {
        ...config,
        autoBehaviorEnabled: existingConfig.autoBehaviorEnabled,
        autoBehaviorFirstDelaySec: existingConfig.autoBehaviorFirstDelaySec,
        autoBehaviorMinIntervalSec: existingConfig.autoBehaviorMinIntervalSec,
        autoBehaviorMaxIntervalSec: existingConfig.autoBehaviorMaxIntervalSec,
        autoBehaviorManualPauseSec: existingConfig.autoBehaviorManualPauseSec,
      }
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf-8')
      console.log(`[preview] write local.config scale=${config.scale} displayScale=${config.displayScale}`)
    } catch (e) {
      console.error('[preview] failed to write local.config.json:', e)
      return
    }

    setTimeout(() => {
      // Send runtime config directly to pet window
      notifyPetSwitchAnim(config)
    }, 100)
  })

  // Restore demo preview (from control panel)
  ipcMain.on(IPC_CHANNELS.RESTORE_DEMO, () => {
    console.log('[preview] RESTORE_DEMO received')
    restoreDemo()
  })

  // Restore demo from right-click menu
  ipcMain.on(IPC_CHANNELS.RESTORE_DEMO_MENU, () => {
    console.log('[preview] RESTORE_DEMO_MENU received')
    restoreDemo()
  })

  // Update playback properties of the currently active asset
  ipcMain.on(IPC_CHANNELS.UPDATE_ACTIVE_PLAYBACK, (_event, payload: { loop?: boolean; fps?: number }) => {
    if (!existsSync(LOCAL_CONFIG_PATH)) return
    try {
      const config = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf-8'))
      if (payload.loop !== undefined) config.loop = payload.loop
      if (payload.fps !== undefined) config.fps = payload.fps
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
      console.log(`[preview] updated active playback: loop=${config.loop} fps=${config.fps}`)
      notifyPetWindows()
    } catch (e) {
      console.warn('[preview] update active playback failed:', e)
    }
  })
}
