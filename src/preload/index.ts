import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DragPayload, type ExtractOptions } from '../shared/types'

contextBridge.exposeInMainWorld('petAPI', {
  // --- 拖动 ---
  dragStart: (payload: DragPayload) => {
    ipcRenderer.send(IPC_CHANNELS.PET_DRAG_START, payload)
  },
  dragMove: (payload: DragPayload) => {
    ipcRenderer.send(IPC_CHANNELS.PET_DRAG_MOVE, payload)
  },
  dragEnd: () => {
    ipcRenderer.send(IPC_CHANNELS.PET_DRAG_END)
  },
  // --- 右键菜单 ---
  showContextMenu: () => {
    ipcRenderer.send(IPC_CHANNELS.SHOW_CONTEXT_MENU)
  },
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_: unknown, action: string) => callback(action)
    ipcRenderer.on(IPC_CHANNELS.MENU_ACTION, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MENU_ACTION, handler)
    }
  },
  // --- 窗口尺寸 ---
  resizeWindow: (width: number, height: number, oldAnchorX?: number, oldAnchorY?: number, newAnchorX?: number, newAnchorY?: number) => {
    ipcRenderer.send(IPC_CHANNELS.RESIZE_WINDOW, width, height, oldAnchorX, oldAnchorY, newAnchorX, newAnchorY)
  },
  // --- 重新加载动画 ---
  reloadAnim: () => {
    ipcRenderer.send(IPC_CHANNELS.RELOAD_ANIM)
  },
  onReloadAnim: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.RELOAD_ANIM, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.RELOAD_ANIM, handler) }
  },
  onForceRepaint: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.FORCE_REPAINT, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.FORCE_REPAINT, handler) }
  },
  onSurfaceRefresh: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.PET_SURFACE_REFRESH, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.PET_SURFACE_REFRESH, handler) }
  },
  // --- 窗口形状 ---
  computePetShape: (payload: { framesDir: string; framePattern: string; frameCount: number; frameWidth: number; frameHeight: number; scale: number }) => {
    ipcRenderer.send(IPC_CHANNELS.COMPUTE_PET_SHAPE, payload)
  },
  clearPetShape: () => {
    ipcRenderer.send(IPC_CHANNELS.CLEAR_PET_SHAPE)
  },
  applyFrameShape: (frameIndex: number) => {
    ipcRenderer.send(IPC_CHANNELS.APPLY_FRAME_SHAPE, frameIndex)
  },
  onPetShapeUpdated: (callback: (info: { rects: number; activeBlocks: number; totalBlocks: number }) => void) => {
    const handler = (_: unknown, info: { rects: number; activeBlocks: number; totalBlocks: number }) => callback(info)
    ipcRenderer.on(IPC_CHANNELS.PET_SHAPE_UPDATED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.PET_SHAPE_UPDATED, handler) }
  },
  // --- 行为系统：运行时切换动画（不写 local.config.json） ---
  onSwitchAnimRuntime: (callback: (config: any) => void) => {
    const handler = (_: unknown, config: any) => callback(config)
    ipcRenderer.on(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, handler) }
  },
  // --- 行为系统：通知非循环动画播放完成 ---
  notifyPlaybackComplete: () => {
    ipcRenderer.send(IPC_CHANNELS.ANIM_PLAYBACK_COMPLETE)
  },
})

contextBridge.exposeInMainWorld('controlAPI', {
  // --- 视频选择 ---
  selectVideo: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SELECT_VIDEO)
  },
  // --- FFmpeg 提取 ---
  extractFrames: (options: ExtractOptions) => {
    ipcRenderer.send(IPC_CHANNELS.EXTRACT_FRAMES, options)
  },
  onExtractLog: (callback: (log: string) => void) => {
    const handler = (_: unknown, log: string) => callback(log)
    ipcRenderer.on(IPC_CHANNELS.EXTRACT_LOG, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.EXTRACT_LOG, handler) }
  },
  onExtractDone: (callback: (result: { outputDir: string; frameCount: number; frameWidth: number; frameHeight: number; trimWidth: number; trimHeight: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: { outputDir: string; frameCount: number; frameWidth: number; frameHeight: number; trimWidth: number; trimHeight: number }) => {
      console.log('[preload] EXTRACT_DONE handler fired')
      callback(result)
    }
    ipcRenderer.on(IPC_CHANNELS.EXTRACT_DONE, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.EXTRACT_DONE, handler) }
  },
  onExtractError: (callback: (err: { code: number; message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, err: { code: number; message: string }) => {
      console.log('[preload] EXTRACT_ERROR handler fired:', err)
      callback(err)
    }
    ipcRenderer.on(IPC_CHANNELS.EXTRACT_ERROR, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.EXTRACT_ERROR, handler) }
  },
  // --- 应用到预览 ---
  applyToPreview: (outputDir: string, displayScale?: number) => {
    ipcRenderer.send(IPC_CHANNELS.APPLY_TO_PREVIEW, { outputDir, displayScale })
  },
  // --- 恢复 Demo ---
  restoreDemo: () => {
    ipcRenderer.send(IPC_CHANNELS.RESTORE_DEMO)
  },
  // --- 打开目录 ---
  openPath: (path: string): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, path)
  },
  // --- 历史生成结果 ---
  listGeneratedAssets: (): Promise<Array<{
    id: string; path: string; name: string; sourceVideo: string;
    createdAt: string; frameCount: number; frameWidth: number;
    frameHeight: number; format: string; modifiedAt: number; displayScale: number
  }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_GENERATED_ASSETS)
  },
  saveAssetDisplayScale: (path: string, displayScale: number) => {
    ipcRenderer.send(IPC_CHANNELS.SAVE_ASSET_DISPLAY_SCALE, { path, displayScale })
  },
  renameAsset: (path: string, name: string) => {
    ipcRenderer.send(IPC_CHANNELS.RENAME_ASSET, { path, name })
  },
  deleteAsset: (path: string): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DELETE_ASSET, { path })
  },
  // --- Switch to asset as current preview ---
  switchToAsset: (assetPath: string) => {
    ipcRenderer.send(IPC_CHANNELS.SWITCH_TO_ASSET, { assetPath })
  },
  // --- 动作播放属性 ---
  setAssetPlayback: (path: string, fields: {
    actionType?: string; loop?: boolean;
    includeInRandom?: boolean; interruptible?: boolean; fpsOverride?: number | null;
    autoPlayRepeatCount?: number; anchorOffsetX?: number; anchorOffsetY?: number
  }) => {
    ipcRenderer.send(IPC_CHANNELS.SET_ASSET_PLAYBACK, { path, ...fields })
  },
  // --- 设置默认动作 ---
  setDefaultAsset: (path: string) => {
    ipcRenderer.send(IPC_CHANNELS.SET_DEFAULT_ASSET, { path })
  },
  rebuildAnchor: (path: string, dirName: string): Promise<{ ok: boolean; rebuilt?: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REBUILD_ANCHOR, { path, dirName })
  },
  // --- 更新当前使用动作的播放属性（立即生效） ---
  updateActivePlayback: (fields: { loop?: boolean; fps?: number }) => {
    ipcRenderer.send(IPC_CHANNELS.UPDATE_ACTIVE_PLAYBACK, fields)
  },
  // --- 监听当前动作变化（来自右键菜单或恢复 Demo） ---
  onActiveAssetChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.ACTIVE_ASSET_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.ACTIVE_ASSET_CHANGED, handler) }
  },
  // --- 行为系统 ---
  toggleAutoBehavior: (enabled: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_AUTO_BEHAVIOR, { enabled })
  },
  onAutoBehaviorChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on(IPC_CHANNELS.AUTO_BEHAVIOR_STATE_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.AUTO_BEHAVIOR_STATE_CHANGED, handler) }
  },
  saveBehaviorParams: (params: { firstDelaySec?: number; minIntervalSec?: number; maxIntervalSec?: number; manualPauseSec?: number }) => {
    ipcRenderer.send(IPC_CHANNELS.SAVE_BEHAVIOR_PARAMS, params)
  },
  onAutoPlayingChanged: (callback: (name: string | null) => void) => {
    const handler = (_: unknown, name: string | null) => callback(name)
    ipcRenderer.on(IPC_CHANNELS.AUTO_PLAYING_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.AUTO_PLAYING_CHANGED, handler) }
  },
})
