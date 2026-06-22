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

import { protocol } from 'electron'
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
      // Parse the URL: furtwin-userdata://actions/generated/123456/0.png
      const url = request.url
      const pathPart = url.replace(`${PROTOCOL_NAME}://`, '')

      // Get the userData/actions/generated directory
      const userGeneratedDir = getUserGeneratedDir()

      // Construct the full file path
      const filePath = join(userGeneratedDir, pathPart)

      // Security: Validate that the path is within the allowed directory
      if (!isPathWithinAllowedDir(filePath, userGeneratedDir)) {
        console.warn(`[userData-protocol] rejected: path outside allowed dir: ${url}`)
        return new Response('Forbidden', { status: 403 })
      }

      // Security: Validate file extension
      const ext = extname(filePath).toLowerCase()
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
