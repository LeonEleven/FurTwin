/**
 * 主进程最小 logger (C1-1)
 *
 * 设计：
 * - 仅 info / warn / error 三个级别
 * - 同步 append 到 app.getPath('userData')/logs/furtwin-main.log
 * - 写失败静默丢弃，不影响主流程
 * - 格式：[ISO时间] [LEVEL] [tag] message
 * - 不引新 npm 依赖（仅 node:fs / node:path）
 *
 * 注意：logger 方法在 initLogger 调用前调用是安全的——此时消息被静默丢弃。
 * 这意味着可以在启动早期（logger ready 前）的模块里安全地 require 并使用 logger。
 */

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'fs'
import { dirname } from 'path'
import type { ReadLogTailResult } from '../../shared/types'

// ─── 读取日志尾部 (C2: 控制面板预览最近日志) ─────────────────────────────────

/** 单次最多读取日志末尾 64KB，避免把巨大日志一次读入内存 */
export const LOG_TAIL_MAX_BYTES = 64 * 1024

/**
 * 读取日志文件末尾至多 maxBytes 字节。
 *
 * 注意：此函数在 logger 未初始化（logFile === null）或日志文件不存在时
 * 返回成功空内容，不抛出异常，便于 UI 直接展示"暂无日志"。
 */
export function readTail(maxBytes: number = LOG_TAIL_MAX_BYTES): ReadLogTailResult {
  if (!logFile) {
    // logger 未初始化，按"无日志"处理，不抛错
    return { ok: true, content: '', truncated: false }
  }

  // 文件不存在 → 视为空日志
  if (!existsSync(logFile)) {
    return { ok: true, content: '', truncated: false }
  }

  let fd: number | null = null
  let stat
  try {
    stat = statSync(logFile)
  } catch {
    return { ok: true, content: '', truncated: false }
  }

  if (stat.size === 0) {
    return { ok: true, content: '', truncated: false }
  }

  try {

    // 计算读取偏移：从文件末尾向前最多 maxBytes
    const bytesToRead = Math.min(maxBytes, stat.size)
    const offset = stat.size - bytesToRead
    const buf = Buffer.alloc(bytesToRead)

    fd = openSync(logFile, 'r')
    let bytesRead = 0
    while (bytesRead < buf.length) {
      const n = readSync(fd, buf, bytesRead, buf.length - bytesRead, offset + bytesRead)
      if (n === 0) break
      bytesRead += n
    }

    let content = buf.subarray(0, bytesRead).toString('utf-8')

    // 大文件场景：若从文件中间开始读取，首行可能是不完整的；去掉它
    const truncated = offset > 0
    if (truncated) {
      const firstNewline = content.indexOf('\n')
      if (firstNewline !== -1) {
        content = content.slice(firstNewline + 1)
      }
    }

    return { ok: true, content, truncated }
  } catch (e) {
    logger.error('logger', 'readTail failed', e as Error)
    return { ok: false, error: String((e as Error)?.message ?? e) }
  } finally {
    if (fd !== null) {
      try { closeSync(fd) } catch { /* 关闭失败不影响读取结果 */ }
    }
  }
}

// ─── 内部状态 ────────────────────────────────────────────────────────────────

/** null 表示尚未初始化，此时所有日志调用被静默丢弃 */
let logFile: string | null = null

// ─── 生命周期 ────────────────────────────────────────────────────────────────

/**
 * 初始化 logger。
 *
 * - 创建 logs 目录（递归，若不存在）
 * - 设置日志文件路径
 *
 * 必须在 app.whenReady 之后调用（因为依赖 app.getPath('userData')）。
 *
 * 重复调用幂等：仅第一次生效。
 */
export function initLogger(logFilePath: string): void {
  if (logFile) return // 已初始化，幂等

  const dir = dirname(logFilePath)
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    logFile = logFilePath
  } catch (e) {
    // 初始化失败彻底禁用日志，静默
    console.error('[logger] init failed:', e)
    logFile = null
  }
}

// ─── 核心写入 ────────────────────────────────────────────────────────────────

function write(level: string, tag: string, message: string): void {
  // 未初始化或初始化失败 → 静默丢弃
  if (!logFile) return

  const ts = new Date().toISOString()
  const safeTag = sanitize(tag)
  const safeMsg = sanitize(message)
  const line = `[${ts}] [${level}] [${safeTag}] ${safeMsg}\n`

  try {
    appendFileSync(logFile, line, 'utf-8')
  } catch (e) {
    // 写失败静默丢弃——绝不抛异常、绝不递归调用 logger
    // 仅在开发期暴露问题
    if (process.env.NODE_ENV === 'development') {
      console.error('[logger] write failed:', e)
    }
  }
}

/**
 * 把任意值转成安全的单行字符串：
 * - string      → 去空白 / 去 CR-LF
 * - Error       → name + message + stack
 * - null/undefined → 'null' / 'undefined'
 * - 其他        → String(v) 并 strip CRLF
 */
function toSafeMessage(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return stripControls(v)
  if (v instanceof Error) {
    const stackSafe = v.stack ? ' | stack: ' + stripControls(v.stack) : ''
    return `${v.name}: ${stripControls(v.message)}${stackSafe}`
  }
  try {
    const s = String(v)
    return stripControls(s)
  } catch {
    return '[unserializable]'
  }
}

/** 反引号/换行/回车 → 空格，避免污染日志行格式 */
function stripControls(s: string): string {
  return s.replace(/[\r\n\x00-\x1f\x7f]+/g, ' ').trim()
}

/** tag 必须是安全的单行 token，防误传长字符串 */
function sanitize(s: string): string {
  const cleaned = stripControls(s)
  return cleaned.length > 0 ? cleaned : 'unknown'
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  info(tag: string, message: string): void {
    write('INFO', tag, message)
  },

  warn(tag: string, message: string): void {
    write('WARN', tag, message)
  },

  /**
     * 记录错误，附加 Error.stack（如有）。
     *
     * @param tag       标签
     * @param message   描述
     * @param err       可选 Error / unknown
     */
  error(tag: string, message: string, err?: unknown): void {
    const safeMsg = toSafeMessage(message)
    if (err !== undefined && err !== null) {
      write('ERROR', tag, `${safeMsg} | ${toSafeMessage(err)}`)
    } else {
      write('ERROR', tag, safeMsg)
    }
  },
}
