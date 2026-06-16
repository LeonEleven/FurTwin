import { app, BrowserWindow, Menu } from 'electron'
import { createPetWindow, setupWindowResize, setupPetDrag, setupContextMenu } from './windows/petWindow'
import { createControlPanel } from './windows/controlPanel'
import { setupSelectVideo, setupExtractFrames } from './ipc/extract'
import { setupPreview } from './ipc/preview'
import { setupPetShape } from './ipc/petShape'

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // 桌宠窗口
  createPetWindow()
  setupWindowResize()
  setupPetDrag()
  setupContextMenu()

  // 控制面板
  createControlPanel()

  // IPC
  setupSelectVideo()
  setupExtractFrames()
  setupPreview()
  setupPetShape()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
      createControlPanel()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
