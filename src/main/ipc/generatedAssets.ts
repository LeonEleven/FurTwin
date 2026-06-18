import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { loadAssetInfo, type AssetInfo } from '../utils/assetInfo'

const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')
const METADATA_FILE = 'asset-metadata.json'

function scanGeneratedDir(): AssetInfo[] {
  if (!existsSync(GENERATED_DIR)) return []

  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: AssetInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const info = loadAssetInfo(dirPath, entry.name)
      if (info) {
        // Attach modifiedAt for sorting (not part of AssetInfo, used locally)
        const stat = statSync(dirPath)
        ;(info as any).modifiedAt = stat.mtimeMs
        assets.push(info)
      }
    } catch {}
  }

  assets.sort((a: any, b: any) => (b.modifiedAt || 0) - (a.modifiedAt || 0))
  return assets
}

export function setupGeneratedAssets(): void {
  ipcMain.handle(IPC_CHANNELS.LIST_GENERATED_ASSETS, () => {
    try {
      return scanGeneratedDir()
    } catch (e) {
      console.warn('[generated] scan failed:', e)
      return []
    }
  })

  ipcMain.on(IPC_CHANNELS.SAVE_ASSET_DISPLAY_SCALE, (_event, payload: { path: string; displayScale: number }) => {
    if (!payload?.path || !Number.isFinite(payload.displayScale)) return
    const metaPath = join(payload.path, METADATA_FILE)
    try {
      const existing = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}
      existing.displayScale = payload.displayScale
      writeFileSync(metaPath, JSON.stringify(existing, null, 2), 'utf-8')
    } catch {}
  })

  ipcMain.on(IPC_CHANNELS.RENAME_ASSET, (_event, payload: { path: string; name: string }) => {
    if (!payload?.path || !payload?.name) return
    const metaPath = join(payload.path, METADATA_FILE)
    try {
      const existing = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}
      existing.name = payload.name
      writeFileSync(metaPath, JSON.stringify(existing, null, 2), 'utf-8')
      console.log(`[generated] renamed asset at ${payload.path}`)
    } catch {}
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_ASSET, (_event, payload: { path: string }) => {
    if (!payload?.path || !existsSync(payload.path)) return { ok: false, error: 'path not found' }

    const resolved = resolve(payload.path)
    if (!resolved.startsWith(GENERATED_DIR)) {
      console.warn('[generated] delete rejected: path outside generated dir')
      return { ok: false, error: 'invalid path' }
    }

    try {
      rmSync(resolved, { recursive: true, force: true })
      console.log(`[generated] deleted: ${resolved}`)

      // If this was the active preview, restore demo
      const localConfigPath = resolve('src/renderer/public/assets/actions/idle/local.config.json')
      if (existsSync(localConfigPath)) {
        try {
          const config = JSON.parse(readFileSync(localConfigPath, 'utf-8'))
          if (config.framesDir && resolved.includes(config.framesDir.replace('./', '').replace(/\//g, '\\'))) {
            const { unlinkSync } = require('fs')
            unlinkSync(localConfigPath)
            console.log('[generated] deleted active preview, restored demo')
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
              }
            })
          }
        } catch {}
      }

      return { ok: true }
    } catch (e) {
      console.warn('[generated] delete failed:', e)
      return { ok: false, error: String(e) }
    }
  })
}
