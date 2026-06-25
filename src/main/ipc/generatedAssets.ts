import { ipcMain, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { loadAssetInfo, getActiveAssetId, setDefaultAsset, rebuildAssetAnchor, computeDisplayAnchor, toFramesDir, validateAssetInfo, type AssetInfo } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'
import { getGeneratedDir, getRuntimeLocalConfigPath, getBundledLocalConfigPath, getAssetMetadataPath } from '../services/actionPaths'
import { scanAllActions, validateActionPath, validateActionName, renameAction, deleteActionDir, getFallbackActionCandidate, buildFallbackRuntimeConfig, findActionByPath, toActionFramesDir, type ActionEntry } from '../services/actionRepository'

const GENERATED_DIR = getGeneratedDir()
const METADATA_FILE = 'asset-metadata.json'

function scanGeneratedDir(): (AssetInfo & { isActive: boolean; modifiedAt: number })[] {
  const entries = scanAllActions()
  return entries.map(entry => ({
    ...entry.info,
    isActive: entry.isActive,
    modifiedAt: entry.modifiedAt,
  }))
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

    // Delegate to actionRepository
    const result = renameAction(payload.path, payload.name)
    if (!result.ok) {
      console.warn(`[generated] rename rejected: ${result.error}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_ASSET, (_event, payload: { path: string }) => {
    if (!payload?.path) return { ok: false, error: '路径不能为空' }

    // Check if this is the active asset before deleting
    const resolved = join(payload.path)
    const deletedDirName = resolved.split(/[/\\]/).pop() || ''
    const wasActive = getActiveAssetId() === deletedDirName
    const localConfigPath = getRuntimeLocalConfigPath()

    // Delegate directory deletion to actionRepository
    const deleteResult = deleteActionDir(payload.path)
    if (!deleteResult.ok) {
      console.warn(`[generated] delete rejected: ${deleteResult.error}`)
      return deleteResult
    }

    // If not the active asset, we're done
    if (!wasActive) {
      return { ok: true }
    }

    // Deleted the active asset — find fallback
    const LOCAL_CONFIG_PATH = localConfigPath
    const BUNDLED_CONFIG_PATH = getBundledLocalConfigPath()

    // Delegate fallback candidate selection to actionRepository
    const fallback = getFallbackActionCandidate(deletedDirName)

    if (fallback) {
      // Build runtime config using actionRepository
      const config = buildFallbackRuntimeConfig(fallback)
      if (!config) {
        console.warn(`[generated] failed to build runtime config for fallback: ${fallback.info.name}`)
        return { ok: false, error: 'Failed to build runtime config' }
      }
      // Preserve existing behavior params when writing fallback config
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
      const mergedConfig = {
        ...config,
        autoBehaviorEnabled: existingConfig.autoBehaviorEnabled,
        autoBehaviorFirstDelaySec: existingConfig.autoBehaviorFirstDelaySec,
        autoBehaviorMinIntervalSec: existingConfig.autoBehaviorMinIntervalSec,
        autoBehaviorMaxIntervalSec: existingConfig.autoBehaviorMaxIntervalSec,
        autoBehaviorManualPauseSec: existingConfig.autoBehaviorManualPauseSec,
      }
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf-8')
      console.log(`[generated] deleted active, switched to fallback: "${config.name}" (id=${fallback.id})`)
    } else {
      // No remaining assets — delete local.config.json to fall back to demo
      if (existsSync(LOCAL_CONFIG_PATH)) {
        unlinkSync(LOCAL_CONFIG_PATH)
      }
      console.log('[generated] deleted active, no remaining assets, restored demo')
    }

    // Notify pet to switch animation
    if (fallback) {
      const runtimeConfig = buildFallbackRuntimeConfig(fallback)
      if (runtimeConfig) {
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) {
            try { win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, runtimeConfig) } catch {}
          }
        })
      }
    } else {
      // No fallback, send RELOAD_ANIM to use demo
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
        }
      })
    }

    // Notify control panel to refresh
    const cp = getControlPanel()
    if (cp && !cp.isDestroyed()) {
      try { cp.webContents.send(IPC_CHANNELS.ACTIVE_ASSET_CHANGED) } catch {}
    }

    return { ok: true }
  })

  // 更新动作播放属性
  ipcMain.on(IPC_CHANNELS.SET_ASSET_PLAYBACK, (_event, payload: {
    path: string; actionType?: string; loop?: boolean;
    includeInRandom?: boolean; interruptible?: boolean; fpsOverride?: number | null;
    autoPlayRepeatCount?: number; anchorOffsetX?: number; anchorOffsetY?: number;
    triggerOnClick?: boolean
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
      if (payload.triggerOnClick !== undefined) existing.triggerOnClick = payload.triggerOnClick
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
            // Use toActionFramesDir to get renderer-safe URL (protocol URL in packaged mode)
            const entry = findActionByPath(payload.path)
            const framesDir = entry ? toActionFramesDir(entry) : toFramesDir(payload.path)
            const config = {
              name: info.name, label: info.name, framesDir,
              fps: info.fpsOverride ?? 12, scale: 0.5, displayScale: info.displayScale,
              loop: info.loop, frameCount: info.frameCount, frameWidth: info.frameWidth,
              frameHeight: info.frameHeight, framePattern: `{}.${info.format}`,
              anchorX: anchor?.anchorX, anchorY: anchor?.anchorY,
            }
            writeFileSync(getRuntimeLocalConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
            // Send config directly to pet (not RELOAD_ANIM which re-fetches from file)
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                try { win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config) } catch {}
              }
            })
            console.log(`[generated] active asset anchor updated, pet reloaded with framesDir=${framesDir}`)
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
