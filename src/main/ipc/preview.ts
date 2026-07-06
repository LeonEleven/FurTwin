import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'
import { getControlPanel } from '../windows/controlPanel'
import { pauseAutoBehavior } from '../behavior'
import { getLocalConfigPath, getRuntimeLocalConfigPath, getBundledLocalConfigPath, getPublicDir, getFramesRealDir, toRendererPath, getUserGeneratedDir } from '../services/actionPaths'
import { isUserDataProtocolUrl, isBundledProtocolUrl } from '../services/userDataProtocol'
import { writeConfigAtomically, readConfigWithFallback } from '../services/configStore'

const LOCAL_CONFIG_PATH = getRuntimeLocalConfigPath()
const BUNDLED_CONFIG_PATH = getBundledLocalConfigPath()
const PUBLIC_DIR = getPublicDir()

// P3C-1: Saved config before temporary preview, used to restore on cancel
let previousStableConfig: AnimConfig | null = null

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
 * Restore demo: delete local.config.json, clear runtime config, reload pet windows.
 * Used by both control panel and right-click menu.
 */
export function restoreDemo(): void {
  console.log('[preview] restoreDemo')
  deleteLocalConfig()
  setTimeout(() => {
    // Clear runtime config on renderer, then reload from file (which falls back to demo)
    BrowserWindow.getAllWindows().forEach((win) => {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.CLEAR_RUNTIME_CONFIG)
        }
      } catch {}
    })
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
 * If the frames directory is missing or has no frames, strip action-specific
 * fields but preserve user config (customActionOrder, behavior params, etc.)
 * so the pet falls back to the default demo animation.
 */
export function validateStartupConfig(): void {
  if (!existsSync(LOCAL_CONFIG_PATH)) return

  try {
    // P7A-1: 使用带备份恢复的读取
    const config = readConfigWithFallback(LOCAL_CONFIG_PATH, BUNDLED_CONFIG_PATH)
    // Normalize double-slash in framesDir (legacy bug: .//assets/... → ./assets/...)
    let framesDir: string = config.framesDir
    if (framesDir && framesDir.startsWith('.//')) {
      framesDir = './' + framesDir.slice(3)
      console.log(`[preview] startup: normalized framesDir: ${config.framesDir} → ${framesDir}`)
      config.framesDir = framesDir
      try { writeConfigAtomically(LOCAL_CONFIG_PATH, config) } catch {}
    }
    if (!framesDir) {
      console.log('[preview] startup: empty framesDir, stripping action fields')
      stripActionFields()
      return
    }

    // Handle protocol URLs
    let absDir: string
    if (isUserDataProtocolUrl(framesDir)) {
      // Extract actionId from furtwin-userdata://actions/generated/<actionId>
      const match = framesDir.match(/furtwin-userdata:\/\/actions\/generated\/([^/]+)/)
      if (match) {
        const actionId = match[1]
        absDir = join(getUserGeneratedDir(), actionId)
      } else {
        console.log(`[preview] startup: invalid userData protocol URL (${framesDir}), stripping action fields`)
        stripActionFields()
        return
      }
    } else if (isBundledProtocolUrl(framesDir)) {
      // Extract path from furtwin-bundled://actions/idle/generated/<actionId>
      const match = framesDir.match(/furtwin-bundled:\/\/(.+)/)
      if (match) {
        absDir = join(process.resourcesPath, 'assets', match[1])
      } else {
        console.log(`[preview] startup: invalid bundled protocol URL (${framesDir}), stripping action fields`)
        stripActionFields()
        return
      }
    } else {
      // For relative paths (dev mode), use existing logic
      absDir = join(PUBLIC_DIR, framesDir.replace(/^\.\//, ''))
    }

    if (!existsSync(absDir)) {
      console.log(`[preview] startup: frames dir missing (${absDir}), stripping action fields`)
      stripActionFields()
      return
    }

    const hasFrames = readdirSync(absDir).some(f => f.endsWith('.png') || f.endsWith('.webp'))
    if (!hasFrames) {
      console.log(`[preview] startup: no frames in ${absDir}, stripping action fields`)
      stripActionFields()
      return
    }

    console.log(`[preview] startup: local.config.json valid, framesDir=${framesDir}`)
  } catch {
    console.log('[preview] startup: failed to parse local.config.json, stripping action fields')
    stripActionFields()
  }
}

/**
 * Remove action-specific fields from local.config.json while preserving
 * user config: customActionOrder, behavior params, etc.
 */
function stripActionFields(): void {
  if (!existsSync(LOCAL_CONFIG_PATH)) return
  try {
    // P7A-1: 使用带备份恢复的读取
    const config = readConfigWithFallback(LOCAL_CONFIG_PATH, BUNDLED_CONFIG_PATH)
    // Fields to remove (action/preview specific)
    const actionFields = [
      'framesDir', 'name', 'label', 'fps', 'scale', 'displayScale',
      'loop', 'frameCount', 'frameWidth', 'frameHeight', 'framePattern',
      'anchorX', 'anchorY',
    ]
    for (const field of actionFields) {
      delete config[field]
    }
    // If nothing meaningful remains, delete the file
    const meaningfulKeys = Object.keys(config).filter(k => k !== 'framesDir')
    if (meaningfulKeys.length === 0) {
      unlinkSync(LOCAL_CONFIG_PATH)
      console.log('[preview] stripped action fields, config now empty, deleted file')
    } else {
      // P7A-1: 原子写入
      writeConfigAtomically(LOCAL_CONFIG_PATH, config)
      console.log(`[preview] stripped action fields, preserved: ${meaningfulKeys.join(', ')}`)
    }
  } catch {
    // If we can't parse/modify, leave it alone rather than delete
    console.warn('[preview] failed to strip action fields, leaving config unchanged')
  }
}

export function setupPreview(): void {
  // Clean up stale local.config.json on startup
  // (Don't delete - user may have a valid preview. Only delete on explicit RESTORE_DEMO)

  // Apply to pet preview
  ipcMain.on(IPC_CHANNELS.APPLY_TO_PREVIEW, (_event, payload: { outputDir?: string; displayScale?: number; temporary?: boolean }) => {
    console.log('[preview] APPLY_TO_PREVIEW received')

    const outputDir = payload?.outputDir || getFramesRealDir()
    const displayScale = Number(payload?.displayScale) || 0.5
    const isTemporary = payload?.temporary === true
    console.log(`[preview] scanning dir: ${outputDir} temporary=${isTemporary}`)

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

    // P3C-1: Save current config before temporary preview for later restoration
    if (isTemporary) {
      try {
        if (existsSync(LOCAL_CONFIG_PATH)) {
          const raw = readFileSync(LOCAL_CONFIG_PATH, 'utf-8')
          previousStableConfig = JSON.parse(raw)
          console.log('[preview] saved previousStableConfig for temp preview restore')
        } else {
          previousStableConfig = null
          console.log('[preview] no existing local.config.json, previousStableConfig=null')
        }
      } catch {
        previousStableConfig = null
      }
    }

    // P3C-1: Temporary preview (pending extract) should NOT write local.config.json
    // Only write for正式应用
    if (!isTemporary) {
      try {
        // P7A-1: 使用带备份恢复的读取
        const existingConfig = readConfigWithFallback(LOCAL_CONFIG_PATH, BUNDLED_CONFIG_PATH)
        // Merge: action config fields + preserved behavior params
        const mergedConfig = {
          ...config,
          autoBehaviorEnabled: existingConfig.autoBehaviorEnabled,
          autoBehaviorFirstDelaySec: existingConfig.autoBehaviorFirstDelaySec,
          autoBehaviorMinIntervalSec: existingConfig.autoBehaviorMinIntervalSec,
          autoBehaviorMaxIntervalSec: existingConfig.autoBehaviorMaxIntervalSec,
          autoBehaviorManualPauseSec: existingConfig.autoBehaviorManualPauseSec,
          customActionOrder: existingConfig.customActionOrder,
        }
        // P7A-1: 原子写入
        if (!writeConfigAtomically(LOCAL_CONFIG_PATH, mergedConfig)) {
          console.error('[preview] failed to write local.config.json: atomic write returned false')
          return
        }
        console.log(`[preview] write local.config scale=${config.scale} displayScale=${config.displayScale}`)
      } catch (e) {
        console.error('[preview] failed to write local.config.json:', e)
        return
      }
    }

    setTimeout(() => {
      // P3C-1: Pause auto-behavior BEFORE switching to avoid race condition
      pauseAutoBehavior()
      // Send runtime config directly to pet window
      notifyPetSwitchAnim(config)
    }, 100)
  })

  // P3C-1: Cancel preview and restore previous stable config
  ipcMain.on(IPC_CHANNELS.CANCEL_PREVIEW, () => {
    console.log('[preview] CANCEL_PREVIEW received')
    if (previousStableConfig) {
      // Restore the saved config (the正式 action that was active before preview)
      console.log(`[preview] restoring previousStableConfig: ${previousStableConfig.name}`)
      BrowserWindow.getAllWindows().forEach((win) => {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, previousStableConfig)
          }
        } catch {}
      })
      previousStableConfig = null
    } else {
      // No previous config saved — fall back to file-based reload
      console.log('[preview] no previousStableConfig, falling back to CLEAR_RUNTIME_CONFIG')
      BrowserWindow.getAllWindows().forEach((win) => {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.CLEAR_RUNTIME_CONFIG)
          }
        } catch {}
      })
    }
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
      // P7A-1: 使用带备份恢复的读取
      const config = readConfigWithFallback(LOCAL_CONFIG_PATH, BUNDLED_CONFIG_PATH)
      if (payload.loop !== undefined) config.loop = payload.loop
      if (payload.fps !== undefined) config.fps = payload.fps
      // P7A-1: 原子写入
      writeConfigAtomically(LOCAL_CONFIG_PATH, config)
      console.log(`[preview] updated active playback: loop=${config.loop} fps=${config.fps}`)
      BrowserWindow.getAllWindows().forEach((win) => {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
          }
        } catch {}
      })
    } catch (e) {
      console.warn('[preview] update active playback failed:', e)
    }
  })
}
