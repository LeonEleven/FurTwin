/**
 * System Tray (Windows taskbar notification area)
 *
 * Provides a stable entry point for the app and a safe exit for future stealth mode.
 * Menu is kept in sync with the pet context menu via shared buildAppMenuTemplate().
 */

import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { buildAppMenuTemplate } from './windows/petWindow'
import { toggleControlPanel } from './windows/controlPanel'
import { logger } from './services/logger'

let tray: Tray | null = null

export function createTray(): void {
  if (tray) return // already created

  // Load icon: resources/tray.png (dev: project root, packaged: process.resourcesPath)
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')

  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    const size = icon.getSize()
    logger.info('tray', `icon loaded: path=${iconPath} empty=${icon.isEmpty()} size=${size.width}x${size.height}`)
    if (icon.isEmpty()) throw new Error('icon is empty')
  } catch (e) {
    // C1-1: icon 失败记录 warn，降级到空 icon 仍可使 Tray 正常工作
    logger.warn('tray', `failed to load icon, creating fallback: ${iconPath}`, e as Error)
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip(`FurTwin v${app.getVersion()}`)

  // Left click → toggle control panel
  tray.on('click', () => {
    toggleControlPanel()
  })

  // Right click → show context menu (rebuilt each time for fresh state)
  tray.on('right-click', () => {
    const template = buildAppMenuTemplate({ includeActionSwitcher: true, includeReloadAnimation: true, includeStealth: true, includeAutoStart: true, includeRestorePet: true })
    tray?.popUpContextMenu(Menu.buildFromTemplate(template))
  })

  logger.info('tray', 'tray created')
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    logger.info('tray', 'tray destroyed')
  }
}
