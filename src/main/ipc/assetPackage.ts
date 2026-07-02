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

  // ─── Batch Export ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.EXPORT_BATCH_ASSET_PACKAGE, async (_event, payload: { items: Array<{ path: string; name: string }> }) => {
    if (!payload?.items || payload.items.length === 0) return { ok: false, error: '没有选中动作' }

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: '批量导出动作包',
      defaultPath: 'batch-actions.zip',
      filters: [{ name: '动作包', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, error: '用户取消' }

    try {
      const zip = new JSZip()
      const usedDirs = new Set<string>()
      let totalFrames = 0

      for (const item of payload.items) {
        const assetDir = item.path
        if (!existsSync(assetDir)) continue

        // Create safe subdirectory name: sanitized name + short id
        const safeName = item.name.replace(/[\\/:*?"<>|\s]/g, '_').substring(0, 20)
        const dirId = basename(assetDir).substring(0, 8)
        let subDir = `${safeName}_${dirId}`
        // Ensure unique
        let counter = 1
        while (usedDirs.has(subDir)) {
          subDir = `${safeName}_${dirId}_${counter}`
          counter++
        }
        usedDirs.add(subDir)

        const files = readdirSync(assetDir)
        let hasMetadata = false

        for (const file of files) {
          const filePath = join(assetDir, file)
          if (file === METADATA_FILE) {
            hasMetadata = true
          } else if (!file.endsWith('.png') && !file.endsWith('.webp')) {
            continue
          }

          if (file.endsWith('.png') || file.endsWith('.webp')) {
            totalFrames++
          }

          const data = readFileSync(filePath)
          zip.file(`${subDir}/${file}`, data)
        }

        if (!hasMetadata) {
          console.warn(`[assetPackage] skipping ${item.name}: missing metadata`)
        }
      }

      const content = await zip.generateAsync({ type: 'nodebuffer' })
      writeFileSync(result.filePath, content)

      console.log(`[assetPackage] batch exported: ${result.filePath} (${payload.items.length} actions, ${totalFrames} frames)`)
      return { ok: true, path: result.filePath, count: payload.items.length }
    } catch (e) {
      console.warn('[assetPackage] batch export failed:', e)
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

  /**
   * Import a batch package (zip with multiple subdirectories, each containing an action).
   * Scans first-level subdirectories for asset-metadata.json.
   */
  async function importBatchPackage(zipPath: string): Promise<{
    ok: boolean; batch?: boolean;
    results?: Array<{ file: string; ok: boolean; name?: string; error?: string }>;
    succeeded?: number; failed?: number;
  }> {
    try {
      const zipData = readFileSync(zipPath)
      const zip = await JSZip.loadAsync(zipData)

      // Group entries by first-level directory
      const dirMap = new Map<string, { metadata?: JSZip.JSZipObject; frames: JSZip.JSZipObject[] }>()

      zip.forEach((path, entry) => {
        const parts = path.split('/')
        if (parts.length < 2) return // skip root-level files
        const dirName = parts[0]
        const fileName = parts.slice(1).join('/')

        if (!dirMap.has(dirName)) {
          dirMap.set(dirName, { frames: [] })
        }
        const dir = dirMap.get(dirName)!

        if (fileName === METADATA_FILE) {
          dir.metadata = entry
        } else if (fileName.endsWith('.png') || fileName.endsWith('.webp')) {
          dir.frames.push(entry)
        }
      })

      // Filter directories that have metadata
      const actionDirs = Array.from(dirMap.entries()).filter(([_, dir]) => dir.metadata)

      if (actionDirs.length === 0) {
        return { ok: false, results: [{ file: basename(zipPath), ok: false, error: 'zip 中没有找到动作包' }] }
      }

      const results: Array<{ file: string; ok: boolean; name?: string; error?: string }> = []

      for (const [dirName, dir] of actionDirs) {
        try {
          // Parse metadata
          const metadataText = await dir.metadata!.async('string')
          let meta: Record<string, any>
          try {
            meta = JSON.parse(metadataText)
          } catch {
            results.push({ file: dirName, ok: false, error: 'asset-metadata.json 格式无效' })
            continue
          }

          // Force isDefault to false on import
          meta.isDefault = false

          // Create new asset directory
          const newId = createGeneratedActionId()
          const newDir = getUserGeneratedActionDir(newId)
          mkdirSync(newDir, { recursive: true })

          // Write metadata
          writeFileSync(join(newDir, METADATA_FILE), JSON.stringify(meta, null, 2), 'utf-8')

          // Extract frames
          for (const entry of dir.frames) {
            const name = basename(entry.name)
            const data = await entry.async('nodebuffer')
            writeFileSync(join(newDir, name), data)
          }

          // Validate
          const info = loadAssetInfo(newDir, newId)
          if (!info) {
            try { rmSync(newDir, { recursive: true, force: true }) } catch { /* cleanup */ }
            results.push({ file: dirName, ok: false, error: '导入后验证失败' })
            continue
          }

          console.log(`[assetPackage] imported from batch: ${newDir} (${dir.frames.length} frames, name="${info.name}")`)
          results.push({ file: dirName, ok: true, name: info.name })
        } catch (e) {
          results.push({ file: dirName, ok: false, error: String(e) })
        }
      }

      const succeeded = results.filter(r => r.ok)
      const failed = results.filter(r => !r.ok)
      return {
        ok: succeeded.length > 0,
        batch: true,
        results,
        succeeded: succeeded.length,
        failed: failed.length,
      }
    } catch (e) {
      console.warn('[assetPackage] batch import failed:', e)
      return { ok: false, results: [{ file: basename(zipPath), ok: false, error: String(e) }] }
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

    // For each file, detect if it's a single or batch package
    const allResults: Array<{ file: string; ok: boolean; name?: string; error?: string }> = []

    for (const filePath of result.filePaths) {
      // Quick detection: check if root has metadata
      try {
        const zipData = readFileSync(filePath)
        const zip = await JSZip.loadAsync(zipData)
        const hasRootMetadata = zip.file(METADATA_FILE) !== null

        if (hasRootMetadata) {
          // Single action package
          const res = await importSinglePackage(filePath)
          allResults.push({ file: basename(filePath), ...res })
        } else {
          // Try batch package (multiple subdirectories)
          const res = await importBatchPackage(filePath)
          if (res.results) {
            allResults.push(...res.results)
          } else {
            allResults.push({ file: basename(filePath), ok: false, error: '无法识别的 zip 格式' })
          }
        }
      } catch (e) {
        allResults.push({ file: basename(filePath), ok: false, error: String(e) })
      }
    }

    const succeeded = allResults.filter(r => r.ok)
    const failed = allResults.filter(r => !r.ok)
    const summary = `成功 ${succeeded.length} 个，失败 ${failed.length} 个`

    console.log(`[assetPackage] import: ${summary}`)
    return {
      ok: succeeded.length > 0,
      batch: result.filePaths.length > 1 || allResults.length > 1,
      results: allResults,
      succeeded: succeeded.length,
      failed: failed.length,
      summary,
    }
  })
}
