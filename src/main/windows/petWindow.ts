import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS, type DragPayload } from '../../shared/types'

const isDev = !app.isPackaged

let petWindow: BrowserWindow | null = null

export function createPetWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const initialWidth = 64
  const initialHeight = 64

  petWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: Math.round(screenWidth / 2 - initialWidth / 2),
    y: Math.round(screenHeight / 2 - initialHeight / 2),
    title: '',
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  petWindow.setMenu(null)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    petWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/pet.html')
  } else {
    petWindow.loadFile(join(__dirname, '../renderer/pet.html'))
  }

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
  })

  return petWindow
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

/** 窗口尺寸调整 */
export function setupWindowResize(): void {
  ipcMain.on(IPC_CHANNELS.RESIZE_WINDOW, (_, width: number, height: number) => {
    if (!petWindow) return
    const w = Math.round(Number(width))
    const h = Math.round(Number(height))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    const [cx, cy] = petWindow.getPosition()
    const [cw, ch] = petWindow.getSize()
    petWindow.setBounds({
      x: cx + Math.round(cw / 2) - Math.round(w / 2),
      y: cy + Math.round(ch / 2) - Math.round(h / 2),
      width: w,
      height: h,
    })
  })
}

/**
 * 手动拖动
 * 渲染进程发送 { screenX, screenY } 对象，主进程计算窗口新位置。
 */
export function setupPetDrag(): void {
  let isDragging = false
  let startMouseX = 0
  let startMouseY = 0
  let startWinX = 0
  let startWinY = 0

  ipcMain.on(IPC_CHANNELS.PET_DRAG_START, (_, payload: DragPayload) => {
    if (!petWindow) return
    isDragging = true
    startMouseX = Number(payload.screenX)
    startMouseY = Number(payload.screenY)
    const [winX, winY] = petWindow.getPosition()
    startWinX = winX
    startWinY = winY
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_MOVE, (_, payload: DragPayload) => {
    if (!petWindow || !isDragging) return
    const x = Math.round(startWinX + (Number(payload.screenX) - startMouseX))
    const y = Math.round(startWinY + (Number(payload.screenY) - startMouseY))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    petWindow.setPosition(x, y, false)
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_END, () => {
    isDragging = false
  })
}

/** 右键菜单（由渲染进程主动触发） */
export function setupContextMenu(): void {
  ipcMain.on(IPC_CHANNELS.SHOW_CONTEXT_MENU, () => {
    if (!petWindow) return

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '重新加载动画',
        click: () => {
          petWindow?.webContents.send(IPC_CHANNELS.MENU_ACTION, 'reload-anim')
        },
      },
      { type: 'separator' },
      {
        label: '退出 FurTwin',
        click: () => {
          app.quit()
        },
      },
    ]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: petWindow })
  })
}
