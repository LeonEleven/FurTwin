/**
 * local.config.json 原子写入与备份恢复
 *
 * P7A-1: 增强本地配置写入可靠性
 *
 * 设计：
 * - 写入：先写 .tmp，成功后 rename 到正式文件；写入前将正式文件备份到 .bak
 * - 读取：正式文件解析失败时尝试从 .bak 恢复；都失败则保持现有 bundled → {} fallback
 * - 启动清理：删除残留的 .tmp（写了一半的标志）
 *
 * 不引入新依赖，仅使用 node:fs。路径由调用方传入，.tmp / .bak 后缀在此派生。
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'

/**
 * 原子写入配置：写 .tmp → rename → 正式；写前 .bak 备份。
 *
 * 失败时返回 false，正式文件与 .bak 保持写前状态（.tmp 残留由启动清理兜底）。
 */
export function writeConfigAtomically(configPath: string, config: Record<string, any>): boolean {
  if (!configPath) return false

  const tmpPath = configPath + '.tmp'
  const bakPath = configPath + '.bak'

  try {
    // 1) 写前备份：若正式文件存在，先 rename 到 .bak
    if (existsSync(configPath)) {
      try {
        renameSync(configPath, bakPath)
      } catch (e) {
        console.warn(`[configStore] backup failed (${configPath} → ${bakPath}):`, e)
        // 备份失败不阻断写入，继续
      }
    }

    // 2) 写 tmp
    try {
      writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (e) {
      console.error(`[configStore] write tmp failed (${tmpPath}):`, e)
      return false
    }

    // 3) rename tmp → 正式（同卷原子替换）
    try {
      renameSync(tmpPath, configPath)
    } catch (e) {
      console.error(`[configStore] rename tmp → config failed (${tmpPath} → ${configPath}):`, e)
      // 清理残留 tmp
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {}
      // 尝试把 bak 恢复回正式文件（尽力）
      if (existsSync(bakPath)) {
        try { renameSync(bakPath, configPath) } catch {}
      }
      return false
    }

    return true
  } catch (e) {
    console.error('[configStore] writeConfigAtomically unexpected error:', e)
    return false
  }
}

/**
 * 读取配置。
 *
 * 与现有语义一致：
 * - 优先读 configPath
 * - configPath 不存在时回退 bundledConfigPath
 * - configPath 存在但解析失败时尝试从 .bak 恢复；恢复成功则写回 configPath 并返回其内容
 * - 都失败返回 {}
 */
export function readConfigWithFallback(configPath: string, bundledConfigPath: string): Record<string, any> {
  // 尝试读主配置
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch (parseError) {
      console.warn(`[configStore] main config parse failed (${configPath}), trying backup:`, parseError)
      // 主配置损坏 → 尝试从 .bak 恢复
      const bakPath = configPath + '.bak'
      if (existsSync(bakPath)) {
        try {
          const bakContent = readFileSync(bakPath, 'utf-8')
          const parsed = JSON.parse(bakContent)
          // 恢复：将 bak 内容写回主文件（尽力，不阻断读取）
          try {
            writeFileSync(configPath, bakContent, 'utf-8')
            console.log(`[configStore] restored ${configPath} from backup`)
          } catch (restoreErr) {
            console.warn('[configStore] failed to restore backup to main config:', restoreErr)
          }
          return parsed
        } catch (bakError) {
          console.warn(`[configStore] backup also unreadable (${bakPath}):`, bakError)
        }
      }
      // 主配置损坏且无可恢复的 bak → 返回空，让调用方走 bundled / {} 兜底
      return {}
    }
  }

  // 主文件不存在 → 回退 bundled
  if (bundledConfigPath && existsSync(bundledConfigPath)) {
    try {
      return JSON.parse(readFileSync(bundledConfigPath, 'utf-8'))
    } catch (e) {
      console.warn(`[configStore] bundled config parse failed (${bundledConfigPath}):`, e)
    }
  }

  return {}
}

/**
 * 启动清理：删除残留的 .tmp 文件（写了一半的标志）。
 *
 * 在读取 / 校验配置之前调用一次。
 */
export function cleanupStaleTempFiles(configPath: string): void {
  if (!configPath) return
  const tmpPath = configPath + '.tmp'
  if (existsSync(tmpPath)) {
    try {
      unlinkSync(tmpPath)
      console.log(`[configStore] cleaned stale tmp file: ${tmpPath}`)
    } catch (e) {
      console.warn(`[configStore] failed to clean stale tmp file (${tmpPath}):`, e)
    }
  }
}
