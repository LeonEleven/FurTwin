import { ipcMain, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import { loadAssetInfo, getActiveAssetId, setDefaultAsset, rebuildAssetAnchor, computeDisplayAnchor, toFramesDir, validateAssetInfo, type AssetInfo } from '../utils/assetInfo'
import { getControlPanel } from '../windows/controlPanel'
import { getGeneratedDir, getRuntimeLocalConfigPath, getBundledLocalConfigPath, getAssetMetadataPath } from '../services/actionPaths'
import { scanAllActions, validateActionPath, validateActionName, renameAction, deleteActionDir, getFallbackActionCandidate, buildFallbackRuntimeConfig, findActionByPath, toActionFramesDir, type ActionEntry } from '../services/actionRepository'
import { restoreDemo } from './preview'

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

    // Clean up customActionOrder: remove deleted action ID
    try {
      if (existsSync(localConfigPath)) {
        const config = JSON.parse(readFileSync(localConfigPath, 'utf-8'))
        if (Array.isArray(config.customActionOrder)) {
          const idx = config.customActionOrder.indexOf(deletedDirName)
          if (idx !== -1) {
            config.customActionOrder.splice(idx, 1)
            writeFileSync(localConfigPath, JSON.stringify(config, null, 2), 'utf-8')
            console.log(`[generated] removed "${deletedDirName}" from customActionOrder`)
          }
        }
      }
    } catch (e) {
      console.warn('[generated] failed to clean customActionOrder:', e)
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
        customActionOrder: existingConfig.customActionOrder,
      }
      writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf-8')
      console.log(`[generated] deleted active, switched to fallback: "${config.name}" (id=${fallback.id})`)
    } else {
      // No remaining assets — restore demo animation
      console.log('[generated] deleted active, no remaining assets, restoring demo')
      restoreDemo()
      return { ok: true }
    }

    // Notify pet to switch animation (only when fallback exists)
    const runtimeConfig = buildFallbackRuntimeConfig(fallback!)
    if (runtimeConfig) {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          try { win.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, runtimeConfig) } catch {}
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
            // Preserve customActionOrder from existing config
            const configPath = getRuntimeLocalConfigPath()
            try {
              if (existsSync(configPath)) {
                const existing = JSON.parse(readFileSync(configPath, 'utf-8'))
                if (existing.customActionOrder) {
                  config.customActionOrder = existing.customActionOrder
                }
              }
            } catch {}
            writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
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

  // 手动排序：上移/下移
  ipcMain.handle(IPC_CHANNELS.MOVE_ACTION, (_event, payload: { actionId: string; direction: 'up' | 'down' }) => {
    if (!payload?.actionId || !['up', 'down'].includes(payload.direction)) {
      return { ok: false, error: '参数无效' }
    }

    const { actionId, direction } = payload
    const configPath = getRuntimeLocalConfigPath()

    try {
      // Read or initialize customActionOrder
      let config: Record<string, any> = {}
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, 'utf-8'))
      }

      // Get current valid action IDs (from scanAllActions without custom order)
      // We need the raw scan to get all current IDs
      const allEntries = scanAllActions()
      const validIds = new Set(allEntries.map(e => e.id))

      // Initialize customActionOrder from current scan if missing or empty
      if (!Array.isArray(config.customActionOrder) || config.customActionOrder.length === 0) {
        config.customActionOrder = allEntries.map(e => e.id)
      } else {
        // Clean up stale IDs
        config.customActionOrder = config.customActionOrder.filter((id: string) => validIds.has(id))
        // Append any new IDs not in the order
        const orderedSet = new Set(config.customActionOrder)
        for (const entry of allEntries) {
          if (!orderedSet.has(entry.id)) {
            config.customActionOrder.push(entry.id)
          }
        }
      }

      const order: string[] = config.customActionOrder
      const idx = order.indexOf(actionId)
      if (idx === -1) {
        return { ok: false, error: '动作不在排序列表中' }
      }

      if (direction === 'up' && idx === 0) {
        return { ok: false, error: '已经是第一个，无法上移' }
      }
      if (direction === 'down' && idx === order.length - 1) {
        return { ok: false, error: '已经是最后一个，无法下移' }
      }

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      ;[order[idx], order[swapIdx]] = [order[swapIdx], order[idx]]

      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      console.log(`[generated] moved "${actionId}" ${direction}, new order: ${order.join(', ')}`)
      return { ok: true }
    } catch (e) {
      console.warn('[generated] move action failed:', e)
      return { ok: false, error: String(e) }
    }
  })
}
