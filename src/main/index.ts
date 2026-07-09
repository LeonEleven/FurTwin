import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS, type OpenDirectoryResult } from '../shared/types'
import { createPetWindow, setupWindowResize, setupPetDrag, setupContextMenu } from './windows/petWindow'
import { createControlPanel, setQuitting, showControlPanel } from './windows/controlPanel'
import { createTray, destroyTray } from './tray'
import { setupSelectVideo, setupExtractFrames } from './ipc/extract'
import { validateStartupConfig } from './ipc/preview'
import { initBehavior, setupBehaviorIPC, stopAutoBehavior } from './behavior'
import { setupOpenPath } from './ipc/openPath'
import { setupGeneratedAssets } from './ipc/generatedAssets'
import { setupAssetPackage } from './ipc/assetPackage'
import { setupActionLib } from './ipc/actionLib'
import { setupPreview } from './ipc/preview'
import { setupPetShape } from './ipc/petShape'
import { registerUserDataProtocol, setupUserDataProtocolHandler, registerBundledProtocol, setupBundledProtocolHandler } from './services/userDataProtocol'
import { cleanupStaleTempFiles } from './services/configStore'
import { initLogger, logger } from './services/logger'

// Register protocol schemes before app is ready
registerUserDataProtocol()
registerBundledProtocol()

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // C1-1: 初始化主进程 logger（必须在最早阶段，后续所有日志点依赖它）
  // 日志写到 userData/logs/furtwin-main.log
  initLogger(join(app.getPath('userData'), 'logs', 'furtwin-main.log'))
  logger.info('startup', `app ready v${app.getVersion()} (packaged=${app.isPackaged})`)

  // Setup userData protocol handler (P2D-1A)
  // This provides read-only access to userData/actions/generated for future use
  setupUserDataProtocolHandler()

  // Setup bundled protocol handler (P2E-5B)
  // Serves bundled action frames from resourcesPath in packaged mode
  setupBundledProtocolHandler()

  // P7A-1: 清理上次运行时可能残留的 .tmp 文件（写了一半的标志）
  // 必须在任何配置读取/校验之前调用
  cleanupStaleTempFiles(app.getPath('userData') + '/local.config.json')

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

  // 退出应用（由控制面板"退出 FurTwin"入口调用，复用 app.quit 完整退出链路）
  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    logger.info('startup', 'quit requested from control panel')
    app.quit()
  })

  // 打开目录入口（控制面板诊断区）
  const handleOpenDir = async (dirKind: 'log' | 'config', dirPath: string): Promise<OpenDirectoryResult> => {
    try {
      if (!existsSync(dirPath)) {
        try {
          mkdirSync(dirPath, { recursive: true })
          logger.info('openDir', `created ${dirKind} dir: ${dirPath}`)
        } catch (mkdirErr) {
          logger.warn('openDir', `failed to create ${dirKind} dir: ${dirPath} -> ${String(mkdirErr)}`)
        }
      }
      const errMsg = await shell.openPath(dirPath)
      if (errMsg) {
        logger.error('openDir', `shell.openPath ${dirKind} failed: ${dirPath} -> ${errMsg}`)
        return { ok: false, error: errMsg }
      }
      logger.info('openDir', `opened ${dirKind} dir: ${dirPath}`)
      return { ok: true }
    } catch (e) {
      logger.error('openDir', `open ${dirKind} dir exception: ${dirPath}`, e as Error)
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  }

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOG_DIR, async (): Promise<OpenDirectoryResult> => {
    const logDir = join(app.getPath('userData'), 'logs')
    return handleOpenDir('log', logDir)
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_CONFIG_DIR, async (): Promise<OpenDirectoryResult> => {
    const configDir = app.getPath('userData')
    return handleOpenDir('config', configDir)
  })

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
  logger.info('startup', 'app exiting')
  // P7-R3F: 先清理行为系统定时器，避免退出后 pending timer 触发已销毁 renderer 上的 IPC / console EPIPE
  stopAutoBehavior()
  destroyTray()
  setQuitting()
})

app.on('window-all-closed', () => {
  app.quit()
})

// C1-1: 未捕获异常 / 未处理 rejection 日志记录
// 仅记录，不强制退出或重启，让 Electron 走默认流程
process.on('uncaughtException', (err) => {
  logger.error('process', 'uncaughtException', err)
})

process.on('unhandledRejection', (reason) => {
  logger.error('process', 'unhandledRejection', reason)
})
