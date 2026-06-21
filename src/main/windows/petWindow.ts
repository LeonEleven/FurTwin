import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS, type DragPayload } from '../../shared/types'
import { isControlPanelVisible, showControlPanel, hideControlPanel } from './controlPanel'
import { isAutoBehaviorActive } from '../behavior'
import { scanAllActions } from '../services/actionRepository'

const isDev = !app.isPackaged

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
  const entries = scanAllActions()
  return entries.map(entry => ({
    id: entry.id,
    path: entry.path,
    name: entry.info.name,
    isActive: entry.isActive,
  }))
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
    const bounds = petWindow?.getBounds()
    console.log(`[petWindow] ready-to-show: bounds=${JSON.stringify(bounds)} visible=${petWindow?.isVisible()}`)
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
  ipcMain.on(IPC_CHANNELS.RESIZE_WINDOW, (_event, width: number, height: number, oldAnchorX?: number, oldAnchorY?: number, newAnchorX?: number, newAnchorY?: number) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const w = Math.max(1, Math.round(Number(width)))
    const h = Math.max(1, Math.round(Number(height)))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    try {
      const bounds = petWindow.getBounds()
      const display = screen.getDisplayMatching(bounds)
      const wa = display.workArea

      let newX: number
      let newY: number
      let mode: string

      const hasOldAnchor = Number.isFinite(oldAnchorX) && Number.isFinite(oldAnchorY) && oldAnchorX! >= 0 && oldAnchorY! >= 0
      const hasNewAnchor = Number.isFinite(newAnchorX) && Number.isFinite(newAnchorY) && newAnchorX! >= 0 && newAnchorY! >= 0

      if (hasOldAnchor && hasNewAnchor) {
        // Anchor-based alignment: keep the character anchor at the same screen position
        mode = 'anchor'
        const oldAnchorScreenX = bounds.x + oldAnchorX!
        const oldAnchorScreenY = bounds.y + oldAnchorY!
        newX = Math.round(oldAnchorScreenX - newAnchorX!)
        newY = Math.round(oldAnchorScreenY - newAnchorY!)
      } else {
        // Bottom-center fallback: preserve window's bottom-center point
        mode = 'bottom-center-fallback'
        const oldCenterX = bounds.x + Math.round(bounds.width / 2)
        const oldBottomY = bounds.y + bounds.height
        newX = oldCenterX - Math.round(w / 2)
        newY = oldBottomY - h
      }

      const clampedX = Math.max(wa.x, Math.min(newX, wa.x + wa.width - w))
      const clampedY = Math.max(wa.y, Math.min(newY, wa.y + wa.height - h))
      const clamped = clampedX !== newX || clampedY !== newY
      console.log(`[petWindow] resize(${mode}): ${w}x${h} oldBounds=(${bounds.x},${bounds.y},${bounds.width}x${bounds.height}) oldAnchor=(${oldAnchorX ?? '-'},${oldAnchorY ?? '-'}) newAnchor=(${newAnchorX ?? '-'},${newAnchorY ?? '-'}) → newPos=(${newX},${newY}) final=(${clampedX},${clampedY})${clamped ? ' CLAMPED' : ''}`)
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
    if (petWindow && !petWindow.isDestroyed()) {
      const bounds = petWindow.getBounds()
      console.log(`[petWindow] drag end: bounds=(${bounds.x},${bounds.y}) ${bounds.width}x${bounds.height}`)
    }
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

    const autoEnabled = isAutoBehaviorActive()

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: visible ? '隐藏控制面板' : '显示控制面板',
        click: () => {
          if (visible) hideControlPanel()
          else showControlPanel()
        },
      },
      {
        label: '自动行为',
        type: 'checkbox',
        checked: autoEnabled,
        click: () => {
          ipcMain.emit(IPC_CHANNELS.TOGGLE_AUTO_BEHAVIOR, null, { enabled: !autoEnabled })
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
