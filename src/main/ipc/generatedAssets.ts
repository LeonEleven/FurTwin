import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { loadAssetInfo, getActiveAssetId, setDefaultAsset, rebuildAssetAnchor, computeDisplayAnchor, toFramesDir, validateAssetInfo, type AssetInfo } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'

const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')
const METADATA_FILE = 'asset-metadata.json'

function scanGeneratedDir(): (AssetInfo & { isActive: boolean; modifiedAt: number })[] {
  if (!existsSync(GENERATED_DIR)) return []

  const activeId = getActiveAssetId()
  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: (AssetInfo & { isActive: boolean; modifiedAt: number })[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const info = loadAssetInfo(dirPath, entry.name)
      if (info) {
        const stat = statSync(dirPath)
        const isActive = activeId !== null && activeId === entry.name
        assets.push({ ...info, isActive, modifiedAt: stat.mtimeMs })
      }
    } catch {}
  }

  assets.sort((a, b) => b.modifiedAt - a.modifiedAt)
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

    const deletedDirName = resolved.split(/[/\\]/).pop() || ''
    const wasActive = getActiveAssetId() === deletedDirName
    const localConfigPath = resolve('src/renderer/public/assets/actions/idle/local.config.json')

    try {
      rmSync(resolved, { recursive: true, force: true })
      console.log(`[generated] deleted: ${resolved}`)

      if (!wasActive) {
        // Not the active asset — nothing more to do
        return { ok: true }
      }

      // Deleted the active asset — find fallback
      const remaining = scanGeneratedDir() // already sorted by modifiedAt desc
      const LOCAL_CONFIG_PATH = localConfigPath

      // Fallback priority: default → idle → any valid → demo
      let fallback = remaining.find(a => a.isDefault)
      if (!fallback) fallback = remaining.find(a => a.actionType === 'idle')
      if (!fallback) fallback = remaining[0] // most recent

      if (fallback) {
        // Switch to fallback asset
        const anchor = computeDisplayAnchor(fallback)
        const config = {
          name: fallback.name, label: fallback.name, framesDir: toFramesDir(fallback.path),
          fps: fallback.fpsOverride ?? 12, scale: 0.5, displayScale: fallback.displayScale,
          loop: fallback.loop, frameCount: fallback.frameCount, frameWidth: fallback.frameWidth,
          frameHeight: fallback.frameHeight, framePattern: `{}.${fallback.format}`,
          anchorX: anchor?.anchorX, anchorY: anchor?.anchorY,
        }
        writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
        console.log(`[generated] deleted active, switched to fallback: "${fallback.name}" (id=${fallback.id})`)
      } else {
        // No remaining assets — delete local.config.json to fall back to demo
        if (existsSync(LOCAL_CONFIG_PATH)) {
          const { unlinkSync } = require('fs')
          unlinkSync(LOCAL_CONFIG_PATH)
        }
        console.log('[generated] deleted active, no remaining assets, restored demo')
      }

      // Notify pet to reload
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
        }
      })

      // Notify control panel to refresh
      const cp = getControlPanel()
      if (cp && !cp.isDestroyed()) {
        try { cp.webContents.send(IPC_CHANNELS.ACTIVE_ASSET_CHANGED) } catch {}
      }

      return { ok: true }
    } catch (e) {
      console.warn('[generated] delete failed:', e)
      return { ok: false, error: String(e) }
    }
  })

  // 更新动作播放属性
  ipcMain.on(IPC_CHANNELS.SET_ASSET_PLAYBACK, (_event, payload: {
    path: string; actionType?: string; loop?: boolean;
    includeInRandom?: boolean; interruptible?: boolean; fpsOverride?: number | null;
    autoPlayRepeatCount?: number; anchorOffsetX?: number; anchorOffsetY?: number
  }) => {
    if (!payload?.path) return
    const metaPath = join(payload.path, METADATA_FILE)
    try {
      const existing = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}
      if (payload.actionType !== undefined) existing.actionType = payload.actionType
      if (payload.loop !== undefined) existing.loop = payload.loop
      if (payload.includeInRandom !== undefined) existing.includeInRandom = payload.includeInRandom
      if (payload.interruptible !== undefined) existing.interruptible = payload.interruptible
      if (payload.fpsOverride !== undefined) existing.fpsOverride = payload.fpsOverride
      if (payload.autoPlayRepeatCount !== undefined) existing.autoPlayRepeatCount = payload.autoPlayRepeatCount
      if (payload.anchorOffsetX !== undefined) existing.anchorOffsetX = payload.anchorOffsetX
      if (payload.anchorOffsetY !== undefined) existing.anchorOffsetY = payload.anchorOffsetY
      writeFileSync(metaPath, JSON.stringify(existing, null, 2), 'utf-8')
      console.log(`[generated] updated playback: ${payload.path}`)

      // If this is the active asset and anchor offset changed, update local.config.json and reload pet
      if (payload.anchorOffsetX !== undefined || payload.anchorOffsetY !== undefined) {
        const activeId = getActiveAssetId()
        const dirName = payload.path.split(/[/\\]/).pop()
        if (activeId && dirName === activeId) {
          const info = loadAssetInfo(payload.path, dirName!)
          if (info && !validateAssetInfo(info)) {
            const anchor = computeDisplayAnchor(info)
            const config = {
              name: info.name, label: info.name, framesDir: toFramesDir(payload.path),
              fps: info.fpsOverride ?? 12, scale: 0.5, displayScale: info.displayScale,
              loop: info.loop, frameCount: info.frameCount, frameWidth: info.frameWidth,
              frameHeight: info.frameHeight, framePattern: `{}.${info.format}`,
              anchorX: anchor?.anchorX, anchorY: anchor?.anchorY,
            }
            const localConfigPath = resolve('src/renderer/public/assets/actions/idle/local.config.json')
            writeFileSync(localConfigPath, JSON.stringify(config, null, 2), 'utf-8')
            // Notify pet to reload with new anchor
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
              }
            })
            console.log(`[generated] active asset anchor updated, pet reloaded`)
          }
        }
      }
    } catch {}
  })

  // 设置默认动作
  ipcMain.on(IPC_CHANNELS.SET_DEFAULT_ASSET, (_event, payload: { path: string }) => {
    if (!payload?.path) return
    try {
      setDefaultAsset(payload.path)
      console.log(`[generated] set default: ${payload.path}`)
    } catch (e) {
      console.warn('[generated] set default failed:', e)
    }
  })

  // 重建 anchor 元数据
  ipcMain.handle(IPC_CHANNELS.REBUILD_ANCHOR, (_event, payload: { path: string; dirName: string }) => {
    if (!payload?.path || !payload?.dirName) return { ok: false, error: 'invalid payload' }
    try {
      const rebuilt = rebuildAssetAnchor(payload.path, payload.dirName)
      return { ok: true, rebuilt }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })
}
