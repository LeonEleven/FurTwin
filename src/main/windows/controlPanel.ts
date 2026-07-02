import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { getAppIconPath } from '../utils/iconPath'
import { IPC_CHANNELS } from '../../shared/types'

const isDev = !app.isPackaged

let controlPanel: BrowserWindow | null = null
let isQuitting = false
let blurDebounceTimer: ReturnType<typeof setTimeout> | null = null

export function setQuitting() {
  isQuitting = true
}

function refreshPetSurface() {
  const allWindows = BrowserWindow.getAllWindows()
  for (const win of allWindows) {
    if (win === controlPanel) continue
    if (win.isDestroyed()) continue
    try {
      win.webContents.send(IPC_CHANNELS.PET_SURFACE_REFRESH)
    } catch {}
  }
}

export function createControlPanel(): BrowserWindow {
  // 获取屏幕可用区域，动态计算默认尺寸
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // 默认宽度 900，不超过屏幕宽度 - 100（留边距）
  const defaultWidth = Math.min(900, screenWidth - 100)

  // 默认高度目标 980，但不超过屏幕可用高度 - 80（留任务栏和边距）
  const targetHeight = 980
  const defaultHeight = Math.min(targetHeight, screenHeight - 80)

  // 最小尺寸
  const minWidth = 680
  const minHeight = 700

  controlPanel = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: minWidth,
    minHeight: minHeight,
    title: 'FurTwin',
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    controlPanel.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/index.html')
  } else {
    controlPanel.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Close button -> hide instead of destroy (unless quitting)
  controlPanel.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      controlPanel?.hide()
    }
  })

  // blur 时轻量刷新桌宠 surface
  controlPanel.on('blur', () => {
    if (blurDebounceTimer) clearTimeout(blurDebounceTimer)
    blurDebounceTimer = setTimeout(() => {
      refreshPetSurface()
    }, 100)
  })

  return controlPanel
}

export function getControlPanel(): BrowserWindow | null {
  return controlPanel
}

export function showControlPanel() {
  if (!controlPanel || controlPanel.isDestroyed()) {
    controlPanel = createControlPanel()
  }
  controlPanel.show()
  controlPanel.focus()
  controlPanel.webContents.send(IPC_CHANNELS.CONTROL_PANEL_SHOWN)
}

export function hideControlPanel() {
  if (controlPanel && !controlPanel.isDestroyed()) {
    controlPanel.hide()
  }
}

export function toggleControlPanel() {
  if (!controlPanel || controlPanel.isDestroyed()) {
    showControlPanel()
  } else if (controlPanel.isVisible()) {
    controlPanel.hide()
  } else {
    controlPanel.show()
    controlPanel.focus()
  }
}

export function isControlPanelVisible(): boolean {
  return controlPanel !== null && !controlPanel.isDestroyed() && controlPanel.isVisible()
}
