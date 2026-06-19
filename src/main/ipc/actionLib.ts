import { ipcMain, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { IPC_CHANNELS, type AnimConfig } from '../../shared/types'
import { loadAssetInfo, validateAssetInfo, toFramesDir } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'
import { pauseAutoBehavior } from '../behavior'

const LOCAL_CONFIG_PATH = resolve('src/renderer/public/assets/actions/idle/local.config.json')

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
    }

    console.log(`[actionLib] switch asset id=${dirName} frames=${config.frameCount} display=${config.frameWidth}x${config.frameHeight} scale=${config.displayScale}`)

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
