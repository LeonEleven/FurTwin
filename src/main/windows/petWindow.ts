import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS, type DragPayload } from '../../shared/types'
import { isControlPanelVisible, showControlPanel, hideControlPanel } from './controlPanel'

const isDev = !app.isPackaged

let petWindow: BrowserWindow | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null
let lastDisplayId: number | null = null

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

  // Cross-screen handling
  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return
    const bounds = petWindow.getBounds()
    const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const displayChanged = lastDisplayId !== null && lastDisplayId !== display.id
    lastDisplayId = display.id

    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      if (!petWindow || petWindow.isDestroyed()) return
      if (displayChanged) {
        petWindow.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
      } else {
        petWindow.webContents.send(IPC_CHANNELS.PET_SURFACE_REFRESH)
      }
    }, 200)
  })

  screen.on('display-metrics-changed', () => {
    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      if (!petWindow || petWindow.isDestroyed()) return
      petWindow.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
    }, 300)
  })

  return petWindow
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

export function setupWindowResize(): void {
  ipcMain.on(IPC_CHANNELS.RESIZE_WINDOW, (_event, width: number, height: number) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const w = Math.max(1, Math.round(Number(width)))
    const h = Math.max(1, Math.round(Number(height)))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    try {
      const [cx, cy] = petWindow.getPosition()
      const [cw, ch] = petWindow.getSize()
      petWindow.setBounds({
        x: cx + Math.round(cw / 2) - Math.round(w / 2),
        y: cy + Math.round(ch / 2) - Math.round(h / 2),
        width: w, height: h,
      })
    } catch (e) {
      console.warn('[pet] RESIZE_WINDOW failed:', e)
    }
  })
}

export function setupPetDrag(): void {
  let isDragging = false
  let startMouseX = 0
  let startMouseY = 0
  let startWinX = 0
  let startWinY = 0

  ipcMain.on(IPC_CHANNELS.PET_DRAG_START, (_event, payload: DragPayload) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const sx = Number(payload?.screenX)
    const sy = Number(payload?.screenY)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
    isDragging = true
    startMouseX = sx
    startMouseY = sy
    const [winX, winY] = petWindow.getPosition()
    startWinX = winX
    startWinY = winY
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_MOVE, (_event, payload: DragPayload) => {
    if (!petWindow || petWindow.isDestroyed() || !isDragging) return
    const sx = Number(payload?.screenX)
    const sy = Number(payload?.screenY)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
    const x = Math.round(startWinX + (sx - startMouseX))
    const y = Math.round(startWinY + (sy - startMouseY))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    try { petWindow.setPosition(x, y, false) } catch {}
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_END, () => {
    isDragging = false
  })
}

export function setupContextMenu(): void {
  ipcMain.on(IPC_CHANNELS.SHOW_CONTEXT_MENU, () => {
    if (!petWindow || petWindow.isDestroyed()) return

    const visible = isControlPanelVisible()
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: visible ? '隐藏控制面板' : '显示控制面板',
        click: () => {
          if (visible) hideControlPanel()
          else showControlPanel()
        },
      },
      { type: 'separator' },
      {
        label: '重新加载动画',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send(IPC_CHANNELS.MENU_ACTION, 'reload-anim')
          }
        },
      },
      { type: 'separator' },
      { label: '退出 FurTwin', click: () => { app.quit() } },
    ]

    try {
      Menu.buildFromTemplate(template).popup({ window: petWindow })
    } catch {}
  })
}
