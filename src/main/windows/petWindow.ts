import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { IPC_CHANNELS, type DragPayload } from '../../shared/types'
import { isControlPanelVisible, showControlPanel, hideControlPanel } from './controlPanel'
import { loadAssetInfo, getActiveAssetId } from '../utils/assetInfo'

const isDev = !app.isPackaged
const GENERATED_DIR = join(process.cwd(), 'src/renderer/public/assets/actions/idle/generated')

let petWindow: BrowserWindow | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null
let lastDisplayId: number | null = null

interface AssetEntry {
  id: string
  path: string
  name: string
  isActive: boolean
}

/** Scan generated directory for assets using shared loadAssetInfo */
function scanAssets(): AssetEntry[] {
  if (!existsSync(GENERATED_DIR)) return []
  const activeId = getActiveAssetId()
  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: AssetEntry[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const info = loadAssetInfo(dirPath, entry.name)
      if (info) {
        const isActive = activeId !== null && activeId === entry.name
        assets.push({ id: entry.name, path: dirPath, name: info.name, isActive })
      }
    } catch {}
  }

  assets.sort((a, b) => {
    const sa = statSync(a.path).mtimeMs
    const sb = statSync(b.path).mtimeMs
    return sb - sa
  })

  return assets
}

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
      const centerX = cx + Math.round(cw / 2)
      const bottomY = cy + ch
      let newX = centerX - Math.round(w / 2)
      let newY = bottomY - h
      const display = screen.getDisplayMatching({ x: cx, y: cy, width: cw, height: ch })
      const wa = display.workArea
      const clampedX = Math.max(wa.x, Math.min(newX, wa.x + wa.width - w))
      const clampedY = Math.max(wa.y, Math.min(newY, wa.y + wa.height - h))
      petWindow.setBounds({ x: clampedX, y: clampedY, width: w, height: h })
    } catch {}
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
    const assets = scanAssets()

    // Build action submenu from generated assets
    const actionSubmenu: Electron.MenuItemConstructorOptions[] = assets.length > 0
      ? assets.map(asset => ({
          label: asset.isActive ? `✓ ${asset.name}` : asset.name,
          click: () => {
            ipcMain.emit(IPC_CHANNELS.SWITCH_TO_ASSET, null, { assetPath: asset.path })
          },
        }))
      : [{ label: '（暂无动作）', enabled: false }]

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
        label: '切换动作',
        submenu: actionSubmenu,
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
      {
        label: '恢复 Demo 预览',
        click: () => {
          ipcMain.emit(IPC_CHANNELS.RESTORE_DEMO_MENU)
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
