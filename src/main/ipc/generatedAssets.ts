import { ipcMain } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { IPC_CHANNELS } from '../../shared/types'

const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')
const METADATA_FILE = 'asset-metadata.json'

interface GeneratedAsset {
  id: string
  path: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  format: string
  modifiedAt: number
  displayScale: number
}

interface AssetMetadata {
  displayScale: number
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

function readMetadata(dirPath: string): AssetMetadata | null {
  const metaPath = join(dirPath, METADATA_FILE)
  if (!existsSync(metaPath)) return null
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeMetadata(dirPath: string, meta: AssetMetadata): void {
  try {
    writeFileSync(join(dirPath, METADATA_FILE), JSON.stringify(meta, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[generated] write metadata failed:', e)
  }
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
          if (dims) { frameWidth = dims.width; frameHeight = dims.height }
          break
        }
      }

      if (frameCount > 0) {
        const meta = readMetadata(dirPath)
        assets.push({
          id: entry.name,
          path: dirPath,
          frameCount,
          frameWidth,
          frameHeight,
          format,
          modifiedAt: stat.mtimeMs,
          displayScale: meta?.displayScale ?? 0.5,
        })
      }
    } catch {}
  }

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

  ipcMain.on(IPC_CHANNELS.SAVE_ASSET_DISPLAY_SCALE, (_event, payload: { path: string; displayScale: number }) => {
    if (!payload?.path || !Number.isFinite(payload.displayScale)) return
    writeMetadata(payload.path, { displayScale: payload.displayScale })
    console.log(`[generated] saved displayScale=${payload.displayScale} to ${payload.path}`)
  })
}
