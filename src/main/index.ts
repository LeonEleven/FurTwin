import { app, BrowserWindow, Menu } from 'electron'
import { createPetWindow, setupWindowResize, setupPetDrag, setupContextMenu } from './windows/petWindow'
import { createControlPanel, setQuitting, showControlPanel } from './windows/controlPanel'
import { setupSelectVideo, setupExtractFrames } from './ipc/extract'
import { setupOpenPath } from './ipc/openPath'
import { setupGeneratedAssets } from './ipc/generatedAssets'
import { setupActionLib } from './ipc/actionLib'
import { setupPreview } from './ipc/preview'
import { setupPetShape } from './ipc/petShape'

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // 桌宠窗口
  createPetWindow()
  setupWindowResize()
  setupPetDrag()
  setupContextMenu()

  // 控制面板（初始隐藏）
  createControlPanel()

  // IPC
  setupSelectVideo()
  setupExtractFrames()
  setupPreview()
  setupPetShape()
  setupOpenPath()
  setupGeneratedAssets()
  setupActionLib()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
      createControlPanel()
    }
  })
})

// Allow real quit (bypass close->hide)
app.on('before-quit', () => {
  setQuitting()
})

app.on('window-all-closed', () => {
  app.quit()
})
