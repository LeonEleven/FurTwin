import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'
import { loadAssetInfo, validateAssetInfo, computeDisplayAnchor } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'
import { pauseAutoBehavior } from '../behavior'
import { getRuntimeLocalConfigPath, getBundledLocalConfigPath } from '../services/actionPaths'
import { findActionByPath, toActionFramesDir } from '../services/actionRepository'
import { writeConfigAtomically, readConfigWithFallback } from '../services/configStore'

const LOCAL_CONFIG_PATH = getRuntimeLocalConfigPath()
const BUNDLED_CONFIG_PATH = getBundledLocalConfigPath()

function notifyPetSwitchAnim(config: AnimConfig) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      try { win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config) } catch {}
    }
  })
}

export function setupActionLib(): void {
  ipcMain.on(IPC_CHANNELS.SWITCH_TO_ASSET, (_event, payload: { assetPath: string }) => {
    if (!payload?.assetPath) return

    const assetPath = payload.assetPath

    // Find action entry to get source (bundled or user)
    const entry = findActionByPath(assetPath)
    if (!entry) {
      console.warn(`[actionLib] action not found: ${assetPath}`)
      return
    }

    // Load asset info with fallback scanning
    const info = loadAssetInfo(assetPath, entry.id)

    // Validate before writing
    const error = validateAssetInfo(info)
    if (error) {
      console.warn(`[actionLib] switch failed: ${error} id=${entry.id}`)
      return
    }

    // Use source-aware framesDir
    const framesDir = toActionFramesDir(entry)
    const anchor = computeDisplayAnchor(info!)

    const config: AnimConfig = {
      name: info!.name,
      label: info!.name,
      framesDir,
      fps: 12,
      scale: 0.5,
      displayScale: info!.displayScale,
      loop: info!.loop,
      frameCount: info!.frameCount,
      frameWidth: info!.frameWidth,
      frameHeight: info!.frameHeight,
      framePattern: `{}.${info!.format}`,
      anchorX: anchor?.anchorX,
      anchorY: anchor?.anchorY,
    }

    console.log(`[actionLib] switch asset id=${entry.id} source=${entry.source} frames=${config.frameCount} display=${config.frameWidth}x${config.frameHeight} scale=${config.displayScale} framesDir=${config.framesDir} anchor=(${anchor?.anchorX?.toFixed(1) ?? '-'},${anchor?.anchorY?.toFixed(1) ?? '-'}) src=${info!.sourceWidth ?? '-'}x${info!.sourceHeight ?? '-'} trim=${JSON.stringify(info!.trimBox ?? '-')}`)

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
        console.error('[actionLib] write local.config.json failed: atomic write returned false')
        return
      }
      console.log('[actionLib] local.config.json updated')
    } catch (e) {
      console.error('[actionLib] write local.config.json failed:', e)
      return
    }

    setTimeout(() => {
      // Send runtime config directly to pet window (no fetch needed)
      notifyPetSwitchAnim(config)
      // Also notify control panel to refresh "current use" status
      const cp = getControlPanel()
      if (cp && !cp.isDestroyed()) {
        try { cp.webContents.send(IPC_CHANNELS.ACTIVE_ASSET_CHANGED) } catch {}
      }
      // Pause auto-behavior on manual switch
      pauseAutoBehavior()
    }, 100)
  })
}
