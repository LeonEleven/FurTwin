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
  // --- 启动握手：renderer 准备好后通知 main ---
  sendRendererReady: () => {
    ipcRenderer.send(IPC_CHANNELS.PET_RENDERER_READY)
  },
  // --- 清除 runtime config（恢复 demo 时使用） ---
  clearRuntimeConfig: () => {
    ipcRenderer.send(IPC_CHANNELS.CLEAR_RUNTIME_CONFIG)
  },
  onClearRuntimeConfig: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.CLEAR_RUNTIME_CONFIG, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.CLEAR_RUNTIME_CONFIG, handler) }
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
  notifyAnimResourceMissing: () => {
    ipcRenderer.send(IPC_CHANNELS.ANIM_RESOURCE_MISSING)
  },
  triggerClickInteraction: () => {
    ipcRenderer.send(IPC_CHANNELS.TRIGGER_CLICK_INTERACTION)
  },
  onStealthModeChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on(IPC_CHANNELS.STEALTH_MODE_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.STEALTH_MODE_CHANGED, handler) }
  },
  toggleStealthMode: () => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_STEALTH_MODE)
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
      callback(result)
    }
    ipcRenderer.on(IPC_CHANNELS.EXTRACT_DONE, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.EXTRACT_DONE, handler) }
  },
  onExtractError: (callback: (err: { code: number; message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, err: { code: number; message: string }) => {
      callback(err)
    }
    ipcRenderer.on(IPC_CHANNELS.EXTRACT_ERROR, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.EXTRACT_ERROR, handler) }
  },
  // --- 应用到预览 ---
  applyToPreview: (outputDir: string, displayScale?: number, temporary?: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.APPLY_TO_PREVIEW, { outputDir, displayScale, temporary })
  },
  // --- P3C-1: 确认提取结果加入动作库 ---
  confirmExtract: (actionId: string): Promise<{ ok: boolean; finalDir?: string; actionId?: string; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONFIRM_EXTRACT, { actionId })
  },
  // --- P3C-1: 丢弃提取结果 ---
  discardExtract: (actionId: string): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DISCARD_EXTRACT, { actionId })
  },
  // --- P3C-1: 取消预览（不清除 local.config.json） ---
  cancelPreview: () => {
    ipcRenderer.send(IPC_CHANNELS.CANCEL_PREVIEW)
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
    autoPlayRepeatCount?: number; anchorOffsetX?: number; anchorOffsetY?: number;
    triggerOnClick?: boolean
  }) => {
    ipcRenderer.send(IPC_CHANNELS.SET_ASSET_PLAYBACK, { path, ...fields })
  },
  // --- 设置默认动作 ---
  setDefaultAsset: (path: string) => {
    ipcRenderer.send(IPC_CHANNELS.SET_DEFAULT_ASSET, { path })
  },
  // --- 手动排序 ---
  moveAction: (actionId: string, direction: 'up' | 'down'): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MOVE_ACTION, { actionId, direction })
  },
  rebuildAnchor: (path: string, dirName: string): Promise<{ ok: boolean; rebuilt?: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REBUILD_ANCHOR, { path, dirName })
  },
  // --- 动作包导出/导入 ---
  exportAssetPackage: (path: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EXPORT_ASSET_PACKAGE, { path, name })
  },
  exportBatchAssetPackage: (items: Array<{ path: string; name: string }>): Promise<{ ok: boolean; path?: string; count?: number; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EXPORT_BATCH_ASSET_PACKAGE, { items })
  },
  importAssetPackage: (): Promise<{
    ok: boolean; dirName?: string; name?: string; error?: string;
    batch?: boolean; results?: Array<{ file: string; ok: boolean; name?: string; error?: string }>;
    succeeded?: number; failed?: number; summary?: string;
  }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.IMPORT_ASSET_PACKAGE)
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
  getBehaviorState: (): Promise<{ enabled: boolean; params: { firstDelaySec: number; minIntervalSec: number; maxIntervalSec: number; manualPauseSec: number } }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_BEHAVIOR_STATE)
  },
  saveBehaviorParams: (params: { firstDelaySec?: number; minIntervalSec?: number; maxIntervalSec?: number; manualPauseSec?: number }) => {
    ipcRenderer.send(IPC_CHANNELS.SAVE_BEHAVIOR_PARAMS, params)
  },
  onAutoPlayingChanged: (callback: (name: string | null) => void) => {
    const handler = (_: unknown, name: string | null) => callback(name)
    ipcRenderer.on(IPC_CHANNELS.AUTO_PLAYING_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.AUTO_PLAYING_CHANGED, handler) }
  },
  // --- 应用版本号 ---
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION)
  },
  // --- 控制面板窗口显示事件 ---
  onControlPanelShown: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.CONTROL_PANEL_SHOWN, handler)
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.CONTROL_PANEL_SHOWN, handler) }
  },
  // --- 退出应用 ---
  quitApp: () => {
    ipcRenderer.send(IPC_CHANNELS.APP_QUIT)
  },
})
