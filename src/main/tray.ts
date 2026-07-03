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
    console.log(`[tray] icon loaded: path=${iconPath} empty=${icon.isEmpty()} size=${size.width}x${size.height}`)
    if (icon.isEmpty()) throw new Error('icon is empty')
  } catch (e) {
    console.warn('[tray] failed to load icon, creating fallback:', e)
    // Fallback: create a small empty icon so Tray still works
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
    const template = buildAppMenuTemplate({ includeActionSwitcher: true, includeReloadAnimation: true, includeStealth: true, includeAutoStart: true })
    tray?.popUpContextMenu(Menu.buildFromTemplate(template))
  })

  console.log('[tray] created')
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    console.log('[tray] destroyed')
  }
}
