import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '../../shared/types'

const isDev = !app.isPackaged

let controlPanel: BrowserWindow | null = null
let blurDebounceTimer: ReturnType<typeof setTimeout> | null = null

function refreshPetSurface() {
  const allWindows = BrowserWindow.getAllWindows()
  for (const win of allWindows) {
    if (win === controlPanel) continue
    if (win.isDestroyed()) continue
    try {
      console.log('[controlPanel] sending PET_SURFACE_REFRESH to pet window')
      win.webContents.send(IPC_CHANNELS.PET_SURFACE_REFRESH)
    } catch {}
  }
}

export function createControlPanel(): BrowserWindow {
  controlPanel = new BrowserWindow({
    width: 680,
    height: 720,
    title: 'FurTwin',
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

  // blur 时轻量刷新桌宠 surface（debounce 100ms）
  controlPanel.on('blur', () => {
    if (blurDebounceTimer) clearTimeout(blurDebounceTimer)
    blurDebounceTimer = setTimeout(() => {
      console.log('[controlPanel] blur -> PET_SURFACE_REFRESH')
      refreshPetSurface()
    }, 100)
  })

  return controlPanel
}

export function getControlPanel(): BrowserWindow | null {
  return controlPanel
}
