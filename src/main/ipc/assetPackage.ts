/**
 * Asset Package Export/Import
 *
 * Export: zip a single generated asset (frames + metadata)
 * Import: extract zip to a new generated/<id>/ directory
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, basename } from 'path'
import JSZip from 'jszip'
import { IPC_CHANNELS } from '../../shared/types'
import { loadAssetInfo } from '../utils/assetInfo'
import { getGeneratedDir, getAssetMetadataPath, createGeneratedActionId, getUserGeneratedActionDir } from '../services/actionPaths'

const GENERATED_DIR = getGeneratedDir()
const METADATA_FILE = 'asset-metadata.json'

export function setupAssetPackage(): void {
  // ─── Export ───────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.EXPORT_ASSET_PACKAGE, async (_event, payload: { path: string; name: string }) => {
    if (!payload?.path || !payload?.name) return { ok: false, error: '参数无效' }

    const assetDir = payload.path
    if (!existsSync(assetDir)) return { ok: false, error: '动作目录不存在' }

    // Show save dialog
    const safeName = payload.name.replace(/[\\/:*?"<>|]/g, '_')
    const result = await dialog.showSaveDialog({
      title: '导出动作包',
      defaultPath: `${safeName}.zip`,
      filters: [{ name: '动作包', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, error: '用户取消' }

    try {
      const zip = new JSZip()
      const files = readdirSync(assetDir)

      let hasMetadata = false
      let frameCount = 0

      for (const file of files) {
        const filePath = join(assetDir, file)
        // Include metadata and image frames only
        if (file === METADATA_FILE) {
          hasMetadata = true
        } else if (!file.endsWith('.png') && !file.endsWith('.webp')) {
          continue // skip non-image, non-metadata files (like shape-cache.json)
        }

        if (file.endsWith('.png') || file.endsWith('.webp')) {
          frameCount++
        }

        const data = readFileSync(filePath)
        zip.file(file, data)
      }

      if (!hasMetadata) return { ok: false, error: '缺少 asset-metadata.json' }
      if (frameCount === 0) return { ok: false, error: '没有帧文件' }

      const content = await zip.generateAsync({ type: 'nodebuffer' })
      writeFileSync(result.filePath, content)

      console.log(`[assetPackage] exported: ${result.filePath} (${frameCount} frames)`)
      return { ok: true, path: result.filePath }
    } catch (e) {
      console.warn('[assetPackage] export failed:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ─── Import ───────────────────────────────────────────

  /**
   * Import a single .zip asset package into userData.
   * Returns success with dirName/name, or failure with error message.
   * On validation failure, cleans up the created directory.
   */
  async function importSinglePackage(zipPath: string): Promise<{ ok: boolean; dirName?: string; name?: string; error?: string }> {
    try {
      const zipData = readFileSync(zipPath)
      const zip = await JSZip.loadAsync(zipData)

      // Find metadata file
      let metadataEntry: JSZip.JSZipObject | null = null
      const frameEntries: JSZip.JSZipObject[] = []

      zip.forEach((path, entry) => {
        // Normalize path: strip directory prefix if zip contains a subfolder
        const normalized = path.replace(/^[^/]+\//, '')
        if (normalized === METADATA_FILE) {
          metadataEntry = entry
        } else if (normalized.endsWith('.png') || normalized.endsWith('.webp')) {
          frameEntries.push(entry)
        }
      })

      if (!metadataEntry) return { ok: false, error: 'zip 中缺少 asset-metadata.json' }
      if (frameEntries.length === 0) return { ok: false, error: 'zip 中没有帧文件' }

      // Parse metadata
      const metadataText = await metadataEntry.async('string')
      let meta: Record<string, any>
      try {
        meta = JSON.parse(metadataText)
      } catch {
        return { ok: false, error: 'asset-metadata.json 格式无效' }
      }

      // Force isDefault to false on import
      meta.isDefault = false

      // Create new asset directory in userData
      const newId = createGeneratedActionId()
      const newDir = getUserGeneratedActionDir(newId)
      mkdirSync(newDir, { recursive: true })

      // Write metadata
      writeFileSync(join(newDir, METADATA_FILE), JSON.stringify(meta, null, 2), 'utf-8')

      // Extract frames
      for (const entry of frameEntries) {
        const name = basename(entry.name) // flatten any subfolder
        const data = await entry.async('nodebuffer')
        writeFileSync(join(newDir, name), data)
      }

      // Validate: loadAssetInfo should succeed
      const info = loadAssetInfo(newDir, newId)
      if (!info) {
        // Clean up on validation failure
        try { rmSync(newDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
        return { ok: false, error: '导入后验证失败：无法读取动作信息' }
      }

      console.log(`[assetPackage] imported: ${newDir} (${frameEntries.length} frames, name="${info.name}")`)
      return { ok: true, dirName: newId, name: info.name }
    } catch (e) {
      console.warn('[assetPackage] import failed:', e)
      return { ok: false, error: `导入失败：${String(e)}` }
    }
  }

  ipcMain.handle(IPC_CHANNELS.IMPORT_ASSET_PACKAGE, async () => {
    // Show open dialog — supports multi-select
    const result = await dialog.showOpenDialog({
      title: '导入动作包',
      filters: [{ name: '动作包', extensions: ['zip'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: '用户取消' }

    // Single file: preserve original return shape
    if (result.filePaths.length === 1) {
      return importSinglePackage(result.filePaths[0])
    }

    // Multiple files: import each and collect results
    const results: Array<{ file: string; ok: boolean; name?: string; error?: string }> = []
    for (const filePath of result.filePaths) {
      const res = await importSinglePackage(filePath)
      results.push({ file: basename(filePath), ...res })
    }

    const succeeded = results.filter(r => r.ok)
    const failed = results.filter(r => !r.ok)
    const summary = `成功 ${succeeded.length} 个，失败 ${failed.length} 个`

    console.log(`[assetPackage] batch import: ${summary}`)
    return {
      ok: succeeded.length > 0,
      batch: true,
      results,
      succeeded: succeeded.length,
      failed: failed.length,
      summary,
    }
  })
}
