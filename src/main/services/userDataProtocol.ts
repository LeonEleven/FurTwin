/**
 * userData Protocol Handler (P2D-1A)
 *
 * Provides read-only access to userData/actions/generated directory
 * for serving action frames to the renderer process.
 *
 * This is a safety layer that:
 * - Only serves files from userData/actions/generated
 * - Validates paths to prevent directory traversal
 * - Supports png/webp frame formats
 * - Does NOT allow writing or modifying files
 */

import { protocol, app } from 'electron'
import { join, resolve, relative, extname } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { getUserGeneratedDir } from './actionPaths'

// Allowed file extensions for action frames
const ALLOWED_EXTENSIONS = new Set(['.png', '.webp', '.json'])

// Protocol name
const PROTOCOL_NAME = 'furtwin-userdata'

/**
 * Check if a path is within the allowed directory (userData/actions/generated).
 * Prevents directory traversal attacks (../).
 */
function isPathWithinAllowedDir(filePath: string, allowedDir: string): boolean {
  try {
    const resolvedFilePath = resolve(filePath)
    const resolvedAllowedDir = resolve(allowedDir)

    // Check if the path is exactly the allowed dir itself
    if (resolvedFilePath === resolvedAllowedDir) return false

    // Check if the path is within the allowed dir
    const rel = relative(resolvedAllowedDir, resolvedFilePath)
    // If relative path starts with '..', it's outside
    // If relative path is empty or '.', it's the same directory
    return !rel.startsWith('..') && rel !== '' && rel !== '.'
  } catch {
    return false
  }
}

/**
 * Get the content type for a file extension.
 */
function getContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Register the userData protocol handler.
 * This should be called before app.whenReady().
 */
export function registerUserDataProtocol(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: PROTOCOL_NAME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  }])
}

/**
 * Handle userData protocol requests after app is ready.
 * This should be called after app.whenReady().
 */
export function setupUserDataProtocolHandler(): void {
  protocol.handle(PROTOCOL_NAME, (request) => {
    try {
      // Parse the URL properly to handle query parameters
      // Example: furtwin-userdata://actions/generated/123456/0.png?v=3&r=0
      const url = new URL(request.url)

      // For custom protocol, host is the first part after //
      // furtwin-userdata://actions/generated/test_action_001/0001.png
      // → host=actions, pathname=/generated/test_action_001/0001.png
      // getUserGeneratedDir() already returns .../actions/generated
      // So we need to strip the leading /generated/ from pathname
      const userGeneratedDir = getUserGeneratedDir()

      // pathname is /generated/test_action_001/0001.png
      // Remove leading /generated/ to get test_action_001/0001.png
      const relativePath = url.pathname.replace(/^\/generated\//, '')

      // Construct the full file path
      const filePath = join(userGeneratedDir, relativePath)

      // Security: Validate that the path is within the allowed directory
      if (!isPathWithinAllowedDir(filePath, userGeneratedDir)) {
        console.warn(`[userData-protocol] rejected: path outside allowed dir: ${request.url}`)
        return new Response('Forbidden', { status: 403 })
      }

      // Security: Validate file extension (using relativePath, not full URL)
      const ext = extname(relativePath).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        console.warn(`[userData-protocol] rejected: unsupported extension: ${ext}`)
        return new Response('Forbidden', { status: 403 })
      }

      // Check if file exists
      if (!existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }

      // Check if it's a file (not a directory)
      const stat = statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Forbidden', { status: 403 })
      }

      // Read and serve the file
      const data = readFileSync(filePath)
      const contentType = getContentType(ext)

      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        }
      })
    } catch (e) {
      console.error('[userData-protocol] error:', e)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  console.log(`[userData-protocol] registered ${PROTOCOL_NAME}:// protocol`)
}

/**
 * Convert a relative path to a userData protocol URL.
 * Example: "actions/generated/123456" -> "furtwin-userdata://actions/generated/123456"
 *
 * NOTE: This function is NOT yet connected to any business logic.
 * It will be used in future phases to support user-writable action storage.
 */
export function toUserDataProtocolUrl(relativePath: string): string {
  // Remove leading ./ if present
  const cleanPath = relativePath.replace(/^\.\//, '')
  return `${PROTOCOL_NAME}://${cleanPath}`
}

/**
 * Check if a URL is a userData protocol URL.
 *
 * NOTE: This function is NOT yet connected to any business logic.
 */
export function isUserDataProtocolUrl(url: string): boolean {
  return url.startsWith(`${PROTOCOL_NAME}://`)
}

// ─── Bundled Protocol (P2E-5B) ─────────────────────────────────────────────
// Serves bundled action frames from process.resourcesPath/assets/ in packaged mode.
// In packaged mode, the renderer loads pet.html from app.asar, so relative URLs
// resolve inside the asar. Bundled action frames are in extraResources (outside asar).
// This protocol bridges the gap.

const BUNDLED_PROTOCOL_NAME = 'furtwin-bundled'

/**
 * Register the bundled protocol scheme. Must be called before app.whenReady().
 */
export function registerBundledProtocol(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: BUNDLED_PROTOCOL_NAME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  }])
}

/**
 * Setup the bundled protocol handler. Must be called after app.whenReady().
 * Only effective in packaged mode.
 */
export function setupBundledProtocolHandler(): void {
  if (!app.isPackaged) return

  const resourcesAssetsDir = join(process.resourcesPath, 'assets')

  protocol.handle(BUNDLED_PROTOCOL_NAME, (request) => {
    try {
      const url = new URL(request.url)
      // furtwin-bundled://actions/idle/generated/<id>/0001.png
      // URL parsing: host = "actions", pathname = "/idle/generated/<id>/0001.png"
      // We need to reconstruct: actions/idle/generated/<id>/0001.png
      const host = url.host  // "actions"
      const pathname = url.pathname.replace(/^\//, '')  // "idle/generated/<id>/0001.png"
      const relativePath = host + (pathname ? '/' + pathname : '')
      const filePath = join(resourcesAssetsDir, relativePath)

      console.log(`[bundled-protocol] ${request.url} → ${filePath} exists=${existsSync(filePath)}`)

      // Security: validate path is within resourcesAssetsDir
      const rel = relative(resourcesAssetsDir, filePath)
      if (rel.startsWith('..') || rel === '' || rel === '.') {
        return new Response('Forbidden', { status: 403 })
      }

      const ext = extname(relativePath).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return new Response('Forbidden', { status: 403 })
      }

      if (!existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Forbidden', { status: 403 })
      }

      const data = readFileSync(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': getContentType(ext),
          'Cache-Control': 'public, max-age=3600',
        }
      })
    } catch (e) {
      console.error('[bundled-protocol] error:', e)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  console.log(`[bundled-protocol] registered ${BUNDLED_PROTOCOL_NAME}:// protocol`)
}

/**
 * Convert an action ID to a furtwin-bundled:// protocol URL.
 * Example: "1712345678" -> "furtwin-bundled://actions/idle/generated/1712345678"
 */
export function toBundledProtocolUrl(actionId: string): string {
  return `${BUNDLED_PROTOCOL_NAME}://actions/idle/generated/${actionId}`
}

/**
 * Check if a URL is a bundled protocol URL.
 */
export function isBundledProtocolUrl(url: string): boolean {
  return url.startsWith(`${BUNDLED_PROTOCOL_NAME}://`)
}
