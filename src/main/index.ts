import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { createPetWindow, setupWindowResize, setupPetDrag, setupContextMenu } from './windows/petWindow'
import { createControlPanel, setQuitting, showControlPanel } from './windows/controlPanel'
import { createTray, destroyTray } from './tray'
import { setupSelectVideo, setupExtractFrames } from './ipc/extract'
import { validateStartupConfig } from './ipc/preview'
import { initBehavior, setupBehaviorIPC } from './behavior'
import { setupOpenPath } from './ipc/openPath'
import { setupGeneratedAssets } from './ipc/generatedAssets'
import { setupAssetPackage } from './ipc/assetPackage'
import { setupActionLib } from './ipc/actionLib'
import { setupPreview } from './ipc/preview'
import { setupPetShape } from './ipc/petShape'
import { registerUserDataProtocol, setupUserDataProtocolHandler, registerBundledProtocol, setupBundledProtocolHandler } from './services/userDataProtocol'

// Register protocol schemes before app is ready
registerUserDataProtocol()
registerBundledProtocol()

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // Setup userData protocol handler (P2D-1A)
  // This provides read-only access to userData/actions/generated for future use
  setupUserDataProtocolHandler()

  // Setup bundled protocol handler (P2E-5B)
  // Serves bundled action frames from resourcesPath in packaged mode
  setupBundledProtocolHandler()

  // 启动时验证上次动作是否仍可用（无效则自动回退到 Demo）
  validateStartupConfig()

  // 桌宠窗口
  createPetWindow()
  setupWindowResize()
  setupPetDrag()
  setupContextMenu()

  // 控制面板（初始隐藏）
  createControlPanel()

  // 系统托盘
  createTray()

  // IPC
  setupSelectVideo()
  setupExtractFrames()
  setupPreview()
  setupPetShape()
  setupOpenPath()
  setupGeneratedAssets()
  setupAssetPackage()
  setupActionLib()

  // 应用版本号
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())

  // 行为系统（在所有 IPC 注册完成后初始化）
  setupBehaviorIPC()
  initBehavior()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
      createControlPanel()
    }
  })
})

// Allow real quit (bypass close->hide)
app.on('before-quit', () => {
  destroyTray()
  setQuitting()
})

app.on('window-all-closed', () => {
  app.quit()
})
