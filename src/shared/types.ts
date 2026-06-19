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
  UPDATE_ACTIVE_PLAYBACK: 'UPDATE_ACTIVE_PLAYBACK',
  ACTIVE_ASSET_CHANGED: 'ACTIVE_ASSET_CHANGED',
} as const
