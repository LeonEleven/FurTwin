/** 动作配置 — 对应每个动作目录下的 config.json */
export interface AnimConfig {
  name: string
  label: string
  framesDir: string
  fps: number
  /** 帧原始缩放（用于 shape 计算等） */
  scale: number
  /** 显示缩放覆盖（可选，优先用于窗口尺寸；不存在时使用 scale） */
  displayScale?: number
  loop: boolean
  frameCount: number
  frameWidth: number
  frameHeight: number
  framePattern: string
}

/** 拖动 IPC 载荷 */
export interface DragPayload {
  screenX: number
  screenY: number
}

/** FFmpeg 提取参数 */
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

/** 提取结果 */
export interface ExtractResult {
  frameCount: number
  frameWidth: number
  frameHeight: number
  outputDir: string
}

/** IPC 频道名常量 */
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
  // 控制面板
  SELECT_VIDEO: 'SELECT_VIDEO',
  EXTRACT_FRAMES: 'EXTRACT_FRAMES',
  EXTRACT_LOG: 'EXTRACT_LOG',
  EXTRACT_DONE: 'EXTRACT_DONE',
  EXTRACT_ERROR: 'EXTRACT_ERROR',
  APPLY_TO_PREVIEW: 'APPLY_TO_PREVIEW',
  RESTORE_DEMO: 'RESTORE_DEMO',
  OPEN_PATH: 'OPEN_PATH',
  LIST_GENERATED_ASSETS: 'LIST_GENERATED_ASSETS',
  SAVE_ASSET_DISPLAY_SCALE: 'SAVE_ASSET_DISPLAY_SCALE',
  RENAME_ASSET: 'RENAME_ASSET',
  DELETE_ASSET: 'DELETE_ASSET',
} as const
