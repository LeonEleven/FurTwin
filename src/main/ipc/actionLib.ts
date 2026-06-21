import { ipcMain, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'
import { loadAssetInfo, validateAssetInfo, toFramesDir, computeDisplayAnchor } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'
import { pauseAutoBehavior } from '../behavior'
import { getLocalConfigPath } from '../services/actionPaths'

const LOCAL_CONFIG_PATH = getLocalConfigPath()

function notifyPetReload() {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
    }
  })
}

export function setupActionLib(): void {
  ipcMain.on(IPC_CHANNELS.SWITCH_TO_ASSET, (_event, payload: { assetPath: string }) => {
    if (!payload?.assetPath) return

    const assetPath = payload.assetPath
    const dirName = assetPath.split(/[/\\]/).pop() || 'unknown'

    // Load asset info with fallback scanning
    const info = loadAssetInfo(assetPath, dirName)

    // Validate before writing
    const error = validateAssetInfo(info)
    if (error) {
      console.warn(`[actionLib] switch failed: ${error} id=${dirName}`)
      return
    }

    const framesDir = toFramesDir(assetPath)
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

    console.log(`[actionLib] switch asset id=${dirName} frames=${config.frameCount} display=${config.frameWidth}x${config.frameHeight} scale=${config.displayScale} anchor=(${anchor?.anchorX?.toFixed(1) ?? '-'},${anchor?.anchorY?.toFixed(1) ?? '-'}) src=${info!.sourceWidth ?? '-'}x${info!.sourceHeight ?? '-'} trim=${JSON.stringify(info!.trimBox ?? '-')}`)

    try {
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
      console.log('[actionLib] local.config.json updated')
    } catch (e) {
      console.error('[actionLib] write local.config.json failed:', e)
      return
    }

    setTimeout(() => {
      notifyPetReload()
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
