import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { IPC_CHANNELS } from '../../shared/types'

const GENERATED_DIR = resolve('src/renderer/public/assets/actions/idle/generated')
const METADATA_FILE = 'asset-metadata.json'

export interface AssetMetadata {
  name: string
  sourceVideo: string
  createdAt: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  format: string
  displayScale: number
}

export interface GeneratedAsset extends AssetMetadata {
  id: string
  path: string
  modifiedAt: number
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

function readMetadata(dirPath: string): Partial<AssetMetadata> | null {
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
        const files = readdirSync(dirPath).filter(f => f.endsWith(`.${fmt}`) && !f.startsWith('.')).sort()
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
          name: meta?.name || 'unnamed',
          sourceVideo: meta?.sourceVideo || '',
          createdAt: meta?.createdAt || new Date(stat.birthtimeMs).toISOString(),
          frameCount: meta?.frameCount || frameCount,
          frameWidth: meta?.frameWidth || frameWidth,
          frameHeight: meta?.frameHeight || frameHeight,
          format: meta?.format || format,
          displayScale: meta?.displayScale ?? 0.5,
          modifiedAt: stat.mtimeMs,
        })
      }
    } catch {}
  }

  assets.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return assets
}

export function setupGeneratedAssets(): void {
  // List all generated assets
  ipcMain.handle(IPC_CHANNELS.LIST_GENERATED_ASSETS, () => {
    try {
      return scanGeneratedDir()
    } catch (e) {
      console.warn('[generated] scan failed:', e)
      return []
    }
  })

  // Save displayScale for an asset
  ipcMain.on(IPC_CHANNELS.SAVE_ASSET_DISPLAY_SCALE, (_event, payload: { path: string; displayScale: number }) => {
    if (!payload?.path || !Number.isFinite(payload.displayScale)) return
    const existing = readMetadata(payload.path) || {}
    const meta: AssetMetadata = {
      name: existing.name || 'unnamed',
      sourceVideo: existing.sourceVideo || '',
      createdAt: existing.createdAt || new Date().toISOString(),
      frameCount: existing.frameCount || 0,
      frameWidth: existing.frameWidth || 0,
      frameHeight: existing.frameHeight || 0,
      format: existing.format || 'png',
      displayScale: payload.displayScale,
    }
    writeMetadata(payload.path, meta)
  })

  // Rename an asset
  ipcMain.on(IPC_CHANNELS.RENAME_ASSET, (_event, payload: { path: string; name: string }) => {
    if (!payload?.path || !payload?.name) return
    const existing = readMetadata(payload.path) || {}
    const meta: AssetMetadata = {
      name: payload.name,
      sourceVideo: existing.sourceVideo || '',
      createdAt: existing.createdAt || new Date().toISOString(),
      frameCount: existing.frameCount || 0,
      frameWidth: existing.frameWidth || 0,
      frameHeight: existing.frameHeight || 0,
      format: existing.format || 'png',
      displayScale: existing.displayScale ?? 0.5,
    }
    writeMetadata(payload.path, meta)
    console.log(`[generated] renamed to "${payload.name}" at ${payload.path}`)
  })

  // Delete an asset
  ipcMain.handle(IPC_CHANNELS.DELETE_ASSET, (_event, payload: { path: string }) => {
    if (!payload?.path || !existsSync(payload.path)) {
      return { ok: false, error: 'path not found' }
    }

    // Safety: only allow deleting under GENERATED_DIR
    const resolved = resolve(payload.path)
    if (!resolved.startsWith(GENERATED_DIR)) {
      console.warn('[generated] delete rejected: path outside generated dir')
      return { ok: false, error: 'invalid path' }
    }

    try {
      rmSync(resolved, { recursive: true, force: true })
      console.log(`[generated] deleted: ${resolved}`)

      // If this was the currently previewed asset, restore demo
      const localConfigPath = resolve('src/renderer/public/assets/actions/idle/local.config.json')
      if (existsSync(localConfigPath)) {
        try {
          const config = JSON.parse(readFileSync(localConfigPath, 'utf-8'))
          if (config.framesDir && resolved.includes(config.framesDir.replace('./', '').replace(/\//g, '\\'))) {
            const { unlinkSync } = require('fs')
            unlinkSync(localConfigPath)
            console.log('[generated] deleted asset was active preview, restored demo')
            // Notify pet windows to reload
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                try { win.webContents.send(IPC_CHANNELS.RELOAD_ANIM) } catch {}
              }
            })
          }
        } catch {}
      }

      return { ok: true }
    } catch (e) {
      console.warn('[generated] delete failed:', e)
      return { ok: false, error: String(e) }
    }
  })
}
