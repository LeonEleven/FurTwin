import { ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { IPC_CHANNELS } from '../../shared/types'

export function setupOpenPath(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_event, path: string) => {
    if (!path || typeof path !== 'string') {
      console.warn('[openPath] invalid path:', path)
      return { ok: false, error: 'invalid path' }
    }
    if (!existsSync(path)) {
      console.warn('[openPath] path not found:', path)
      return { ok: false, error: 'path not found' }
    }
    try {
      await shell.openPath(path)
      return { ok: true }
    } catch (e) {
      console.warn('[openPath] failed:', e)
      return { ok: false, error: String(e) }
    }
  })
}
