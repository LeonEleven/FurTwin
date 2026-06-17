import { ipcMain } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { IPC_CHANNELS } from '../../shared/types'

const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')

interface GeneratedAsset {
  id: string          // timestamp folder name
  path: string        // absolute path
  frameCount: number
  frameWidth: number
  frameHeight: number
  format: string
  modifiedAt: number  // ms timestamp
}

function getPngDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buf = readFileSync(filePath)
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
  } catch {}
  return null
}

function scanGeneratedDir(): GeneratedAsset[] {
  if (!existsSync(GENERATED_DIR)) return []

  const entries = readdirSync(GENERATED_DIR, { withFileTypes: true })
  const assets: GeneratedAsset[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(GENERATED_DIR, entry.name)
    try {
      const stat = statSync(dirPath)

      // Find frames
      let frameCount = 0
      let frameWidth = 0
      let frameHeight = 0
      let format = 'png'

      for (const fmt of ['png', 'webp']) {
        const files = readdirSync(dirPath).filter(f => f.endsWith(`.${fmt}`)).sort()
        if (files.length > 0) {
          frameCount = files.length
          format = fmt
          const dims = getPngDimensions(join(dirPath, files[0]))
          if (dims) {
            frameWidth = dims.width
            frameHeight = dims.height
          }
          break
        }
      }

      if (frameCount > 0) {
        assets.push({
          id: entry.name,
          path: dirPath,
          frameCount,
          frameWidth,
          frameHeight,
          format,
          modifiedAt: stat.mtimeMs,
        })
      }
    } catch {}
  }

  // Sort by modified time descending
  assets.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return assets
}

export function setupGeneratedAssets(): void {
  ipcMain.handle(IPC_CHANNELS.LIST_GENERATED_ASSETS, () => {
    try {
      const assets = scanGeneratedDir()
      console.log(`[generated] found ${assets.length} assets`)
      return assets
    } catch (e) {
      console.warn('[generated] scan failed:', e)
      return []
    }
  })
}
