import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DragPayload } from '../shared/types'

contextBridge.exposeInMainWorld('petAPI', {
  // --- 拖动（传递对象，避免 IPC 参数拆包问题） ---
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
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send(IPC_CHANNELS.RESIZE_WINDOW, width, height)
  },
})
