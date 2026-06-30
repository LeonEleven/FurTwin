import { app, BrowserWindow } from 'electron'
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
  controlPanel = new BrowserWindow({
    width: 680,
    height: 720,
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
