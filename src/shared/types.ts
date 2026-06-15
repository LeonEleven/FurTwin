/** 动画配置 */
export interface AnimConfig {
  framesDir: string
  fps: number
  scale: number
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

/** IPC 频道名常量 */
export const IPC_CHANNELS = {
  PET_DRAG_START: 'PET_DRAG_START',
  PET_DRAG_MOVE: 'PET_DRAG_MOVE',
  PET_DRAG_END: 'PET_DRAG_END',
  SHOW_CONTEXT_MENU: 'SHOW_CONTEXT_MENU',
  MENU_ACTION: 'MENU_ACTION',
  RESIZE_WINDOW: 'RESIZE_WINDOW',
} as const
