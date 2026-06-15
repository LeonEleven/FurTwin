import { app, BrowserWindow, Menu } from 'electron'
import { createPetWindow, setupWindowResize, setupPetDrag, setupContextMenu } from './windows/petWindow'

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  createPetWindow()
  setupWindowResize()
  setupPetDrag()
  setupContextMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
