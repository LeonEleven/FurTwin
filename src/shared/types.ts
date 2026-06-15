/** 动画配置 — 对应每个动作目录下的 config.json */
export interface AnimConfig {
  /** 动作标识（目录名） */
  name: string
  /** 动作显示名称 */
  label: string
  /** 帧文件目录（相对于 renderer 根目录） */
  framesDir: string
  /** 帧率 */
  fps: number
  /** 显示缩放比例 */
  scale: number
  /** 是否循环 */
  loop: boolean
  /** 总帧数 */
  frameCount: number
  /** 帧宽度（像素） */
  frameWidth: number
  /** 帧高度（像素） */
  frameHeight: number
  /** 帧文件名模板，{} 会被替换为序号，例如 "{}.png" */
  framePattern: string
}

/** 拖动 IPC 载荷 */
export interface DragPayload {
  screenX: number
  screenY: number
}

/** IPC 频道名常量 */
export const IPC_CHANNELS = {
  PET_DRAG_START: 'PET_DRAG_START',
  PET_DRAG_MOVE: 'PET_DRAG_MOVE',
  PET_DRAG_END: 'PET_DRAG_END',
  SHOW_CONTEXT_MENU: 'SHOW_CONTEXT_MENU',
  MENU_ACTION: 'MENU_ACTION',
  RESIZE_WINDOW: 'RESIZE_WINDOW',
} as const
