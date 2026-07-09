/** 动画配置 — 对应每个动作目录下的 config.json */
export interface AnimConfig {
  name: string
  label: string
  framesDir: string
  fps: number
  scale: number
  displayScale?: number
  loop: boolean
  frameCount: number
  frameWidth: number
  frameHeight: number
  framePattern: string
  anchorX?: number  // character anchor in display-space pixels (from left)
  anchorY?: number  // character anchor in display-space pixels (from top)
}

export interface DragPayload {
  screenX: number
  screenY: number
}

export interface ExtractOptions {
  input: string
  output: string
  fps: number
  similarity: number
  blend: number
  despill: number
  format: string
  trimAlpha?: boolean
  trimThreshold?: number
  trimPadding?: number
  maskPreset?: string
  maskRegion?: string
  crop?: string
  centerCrop?: string
  /** Output target: 'bundled' (default) or 'user-temp' (userData temp directory) */
  outputTarget?: 'bundled' | 'user-temp'
}

export interface ExtractResult {
  frameCount: number
  frameWidth: number
  frameHeight: number
  outputDir: string
}

export const IPC_CHANNELS = {
  // 桌宠窗口
  PET_DRAG_START: 'PET_DRAG_START',
  PET_DRAG_MOVE: 'PET_DRAG_MOVE',
  PET_DRAG_END: 'PET_DRAG_END',
  SHOW_CONTEXT_MENU: 'SHOW_CONTEXT_MENU',
  MENU_ACTION: 'MENU_ACTION',
  RESIZE_WINDOW: 'RESIZE_WINDOW',
  RELOAD_ANIM: 'RELOAD_ANIM',
  FORCE_REPAINT: 'FORCE_REPAINT',
  PET_SURFACE_REFRESH: 'PET_SURFACE_REFRESH',
  COMPUTE_PET_SHAPE: 'COMPUTE_PET_SHAPE',
  APPLY_FRAME_SHAPE: 'APPLY_FRAME_SHAPE',
  CLEAR_PET_SHAPE: 'CLEAR_PET_SHAPE',
  PET_SHAPE_UPDATED: 'PET_SHAPE_UPDATED',
  // 控制面板 - 提取
  SELECT_VIDEO: 'SELECT_VIDEO',
  EXTRACT_FRAMES: 'EXTRACT_FRAMES',
  EXTRACT_LOG: 'EXTRACT_LOG',
  EXTRACT_DONE: 'EXTRACT_DONE',
  EXTRACT_ERROR: 'EXTRACT_ERROR',
  CONFIRM_EXTRACT: 'CONFIRM_EXTRACT',
  DISCARD_EXTRACT: 'DISCARD_EXTRACT',
  CANCEL_PREVIEW: 'CANCEL_PREVIEW',
  APPLY_TO_PREVIEW: 'APPLY_TO_PREVIEW',
  RESTORE_DEMO: 'RESTORE_DEMO',
  RESTORE_DEMO_MENU: 'RESTORE_DEMO_MENU',
  OPEN_PATH: 'OPEN_PATH',
  // 动作库 (generated assets = actions)
  LIST_GENERATED_ASSETS: 'LIST_GENERATED_ASSETS',
  SAVE_ASSET_DISPLAY_SCALE: 'SAVE_ASSET_DISPLAY_SCALE',
  RENAME_ASSET: 'RENAME_ASSET',
  DELETE_ASSET: 'DELETE_ASSET',
  SWITCH_TO_ASSET: 'SWITCH_TO_ASSET',
  SET_ASSET_PLAYBACK: 'SET_ASSET_PLAYBACK',
  SET_DEFAULT_ASSET: 'SET_DEFAULT_ASSET',
  MOVE_ACTION: 'MOVE_ACTION',
  UPDATE_ACTIVE_PLAYBACK: 'UPDATE_ACTIVE_PLAYBACK',
  ACTIVE_ASSET_CHANGED: 'ACTIVE_ASSET_CHANGED',
  // 行为系统
  SWITCH_ANIM_RUNTIME: 'SWITCH_ANIM_RUNTIME',
  ANIM_PLAYBACK_COMPLETE: 'ANIM_PLAYBACK_COMPLETE',
  TOGGLE_AUTO_BEHAVIOR: 'TOGGLE_AUTO_BEHAVIOR',
  AUTO_BEHAVIOR_STATE_CHANGED: 'AUTO_BEHAVIOR_STATE_CHANGED',
  SAVE_BEHAVIOR_PARAMS: 'SAVE_BEHAVIOR_PARAMS',
  GET_BEHAVIOR_STATE: 'GET_BEHAVIOR_STATE',
  AUTO_PLAYING_CHANGED: 'AUTO_PLAYING_CHANGED',
  TRIGGER_CLICK_INTERACTION: 'TRIGGER_CLICK_INTERACTION',
  STEALTH_MODE_CHANGED: 'STEALTH_MODE_CHANGED',
  ANIM_RESOURCE_MISSING: 'ANIM_RESOURCE_MISSING',
  TOGGLE_STEALTH_MODE: 'TOGGLE_STEALTH_MODE',
  REBUILD_ANCHOR: 'REBUILD_ANCHOR',
  // 启动握手 + runtime 管理
  PET_RENDERER_READY: 'PET_RENDERER_READY',
  CLEAR_RUNTIME_CONFIG: 'CLEAR_RUNTIME_CONFIG',
  // 动作包导出/导入
  EXPORT_ASSET_PACKAGE: 'EXPORT_ASSET_PACKAGE',
  EXPORT_BATCH_ASSET_PACKAGE: 'EXPORT_BATCH_ASSET_PACKAGE',
  IMPORT_ASSET_PACKAGE: 'IMPORT_ASSET_PACKAGE',
  // 控制面板窗口状态
  CONTROL_PANEL_SHOWN: 'CONTROL_PANEL_SHOWN',
  // 应用信息
  GET_APP_VERSION: 'GET_APP_VERSION',
  APP_QUIT: 'APP_QUIT',
} as const
