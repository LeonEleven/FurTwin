import { app } from 'electron'
import { join } from 'path'

/**
 * Get the path to the main application icon (build/icon.png).
 * Used for BrowserWindow titlebar, taskbar, Alt+Tab icons.
 */
export function getAppIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'build', 'icon.png')
    : join(__dirname, '../../build/icon.png')
}
