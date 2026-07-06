import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { IPC_CHANNELS, type AnimConfig, type DragPayload } from '../../shared/types'
import { isControlPanelVisible, showControlPanel, hideControlPanel } from './controlPanel'
import { isAutoBehaviorActive } from '../behavior'
import { scanAllActions, findActionByPath, toActionFramesDir, buildFallbackRuntimeConfig, getFallbackActionCandidate } from '../services/actionRepository'
import { getRuntimeLocalConfigPath, toAbsoluteFramesDir, getWindowStatePath } from '../services/actionPaths'
import { isUserDataProtocolUrl, isBundledProtocolUrl } from '../services/userDataProtocol'
import { loadAssetInfo, validateAssetInfo, computeDisplayAnchor } from '../utils/assetInfo'

const isDev = !app.isPackaged

let petWindow: BrowserWindow | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null
let lastDisplayId: number | null = null

// ─── Stealth mode ────────────────────────────────────────────────────────────
let stealthModeEnabled = false
let stealthCurrentlyHidden = false
let stealthPollTimer: ReturnType<typeof setInterval> | null = null
const STEALTH_POLL_INTERVAL_MS = 250

export function isStealthModeActive(): boolean {
  return stealthModeEnabled
}

function notifyStealthRenderer(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.STEALTH_MODE_CHANGED, stealthModeEnabled)
      }
    } catch {}
  })
}

function stealthShow(): void {
  if (!stealthCurrentlyHidden) return
  stealthCurrentlyHidden = false
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setOpacity(1)
    try { petWindow.setIgnoreMouseEvents(false) } catch {}
  }
  console.log('[stealth] pet shown')
}

function stealthHide(): void {
  if (stealthCurrentlyHidden) return
  stealthCurrentlyHidden = true
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setOpacity(0)
    try { petWindow.setIgnoreMouseEvents(true, { forward: true }) } catch {}
  }
  console.log('[stealth] pet hidden')
}

function isCursorInPetBounds(): boolean {
  if (!petWindow || petWindow.isDestroyed()) return false
  const point = screen.getCursorScreenPoint()
  const bounds = petWindow.getBounds()
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
         point.y >= bounds.y && point.y <= bounds.y + bounds.height
}

function startStealthPolling(): void {
  if (stealthPollTimer) return
  stealthPollTimer = setInterval(() => {
    if (!stealthModeEnabled) return
    const inside = isCursorInPetBounds()
    if (inside && !stealthCurrentlyHidden) {
      stealthHide()
    } else if (!inside && stealthCurrentlyHidden) {
      stealthShow()
    }
  }, STEALTH_POLL_INTERVAL_MS)
}

function stopStealthPolling(): void {
  if (stealthPollTimer) {
    clearInterval(stealthPollTimer)
    stealthPollTimer = null
  }
}

function enableStealthMode(): void {
  if (stealthModeEnabled) return
  stealthModeEnabled = true
  // If cursor is already inside pet bounds, hide immediately
  if (isCursorInPetBounds()) {
    stealthHide()
  }
  startStealthPolling()
  notifyStealthRenderer()
  console.log('[stealth] enabled')
}

function disableStealthMode(): void {
  if (!stealthModeEnabled) return
  stealthModeEnabled = false
  stopStealthPolling()
  stealthShow()
  // Restore shape for current frame
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
  }
  notifyStealthRenderer()
  console.log('[stealth] disabled')
}

export function toggleStealthMode(): void {
  if (stealthModeEnabled) disableStealthMode()
  else enableStealthMode()
}

// ─── Window position persistence (v2: display-relative bottom-center) ────────
// Saves the window's bottom-center as both absolute coordinates and relative
// offsets within the current display. On restore, tries absolute first, then
// falls back to relative mapping if the display layout changed.

interface WindowStateV2 {
  version: 2
  displayId: number
  bottomCenterX: number
  bottomCenterY: number
  displayBounds: { x: number; y: number; width: number; height: number }
  relativeX: number  // 0..1, fraction within display.bounds
  relativeY: number  // 0..1, fraction within display.bounds
}

type WindowState = WindowStateV2 | { x: number; y: number } | null

function logDisplays(): void {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    console.log(`[petWindow] display id=${d.id} bounds=(${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}) workArea=(${d.workArea.x},${d.workArea.y},${d.workArea.width}x${d.workArea.height}) scaleFactor=${d.scaleFactor}`)
  }
}

function loadWindowState(): WindowState {
  try {
    const statePath = getWindowStatePath()
    if (!existsSync(statePath)) return null
    const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
    // v2 format
    if (raw.version === 2 && typeof raw.bottomCenterX === 'number' && typeof raw.bottomCenterY === 'number') {
      return raw as WindowStateV2
    }
    // Old format: x / y (top-left of 64x64 window)
    if (typeof raw.x === 'number' && typeof raw.y === 'number' &&
        Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      return { x: raw.x, y: raw.y }
    }
  } catch { /* ignore corrupted state file */ }
  return null
}

function saveWindowState(bounds: { x: number; y: number; width: number; height: number }): void {
  try {
    const bcX = bounds.x + Math.round(bounds.width / 2)
    const bcY = bounds.y + bounds.height
    const display = screen.getDisplayMatching(bounds)
    const db = display.bounds
    const relX = db.width > 0 ? (bcX - db.x) / db.width : 0.5
    const relY = db.height > 0 ? (bcY - db.y) / db.height : 0.5
    const state: WindowStateV2 = {
      version: 2,
      displayId: display.id,
      bottomCenterX: bcX,
      bottomCenterY: bcY,
      displayBounds: { x: db.x, y: db.y, width: db.width, height: db.height },
      relativeX: relX,
      relativeY: relY,
    }
    writeFileSync(getWindowStatePath(), JSON.stringify(state), 'utf-8')
    console.log(`[petWindow] saved state: display=${display.id} bounds=(${db.x},${db.y},${db.width}x${db.height}) bc=(${bcX},${bcY}) relative=(${relX.toFixed(3)},${relY.toFixed(3)})`)
  } catch (e) {
    console.warn('[petWindow] failed to save window state:', e)
  }
}

/**
 * Restore the 64x64 window position from saved state.
 * Strategy: absolute bottom-center → relative mapping → primary center fallback.
 * Uses display.bounds (not workArea) for containment — the window CAN overlap
 * the taskbar area; we only need to prevent it from going fully off-screen.
 */
function restoreWindowPosition(state: WindowState, w: number, h: number): { x: number; y: number } {
  if (!state) {
    const primary = screen.getPrimaryDisplay().workArea
    return { x: Math.round(primary.x + primary.width / 2 - w / 2), y: Math.round(primary.y + primary.height / 2 - h / 2) }
  }

  // Old format { x, y } — treat as top-left of a 64x64 window, use directly
  if ('x' in state && 'y' in state && !('version' in state)) {
    const x = state.x
    const y = state.y
    console.log(`[petWindow] restoring old format: topLeft=(${x},${y})`)
    return clampToDisplayBounds(x, y, w, h)
  }

  // v2 format
  const v2 = state as WindowStateV2
  const displays = screen.getAllDisplays()
  logDisplays()

  // Strategy 1: find the original display by ID and bounds match
  const original = displays.find(d => d.id === v2.displayId)
  if (original) {
    const db = original.bounds
    const boundsMatch = db.x === v2.displayBounds.x && db.y === v2.displayBounds.y &&
                        db.width === v2.displayBounds.width && db.height === v2.displayBounds.height
    if (boundsMatch) {
      // Display unchanged — use absolute bottom-center
      let x = v2.bottomCenterX - Math.round(w / 2)
      let y = v2.bottomCenterY - h
      // Clamp within display.bounds (not workArea — allow taskbar overlap)
      x = Math.max(db.x, Math.min(x, db.x + db.width - w))
      y = Math.max(db.y, Math.min(y, db.y + db.height - h))
      console.log(`[petWindow] restored absolute: display=${original.id} bc=(${v2.bottomCenterX},${v2.bottomCenterY}) → topLeft=(${x},${y})`)
      return { x, y }
    }
    // Display exists but resolution/position changed — use relative mapping
    const bcX = Math.round(db.x + v2.relativeX * db.width)
    const bcY = Math.round(db.y + v2.relativeY * db.height)
    let x = bcX - Math.round(w / 2)
    let y = bcY - h
    x = Math.max(db.x, Math.min(x, db.x + db.width - w))
    y = Math.max(db.y, Math.min(y, db.y + db.height - h))
    console.log(`[petWindow] restored relative (display changed): display=${original.id} relative=(${v2.relativeX.toFixed(3)},${v2.relativeY.toFixed(3)}) → bc=(${bcX},${bcY}) topLeft=(${x},${y})`)
    return { x, y }
  }

  // Strategy 2: original display gone — map relative position onto primary display
  const primary = screen.getPrimaryDisplay()
  const pb = primary.bounds
  const bcX = Math.round(pb.x + v2.relativeX * pb.width)
  const bcY = Math.round(pb.y + v2.relativeY * pb.height)
  let x = bcX - Math.round(w / 2)
  let y = bcY - h
  x = Math.max(pb.x, Math.min(x, pb.x + pb.width - w))
  y = Math.max(pb.y, Math.min(y, pb.y + pb.height - h))
  console.log(`[petWindow] restored relative (display gone): primary=${primary.id} relative=(${v2.relativeX.toFixed(3)},${v2.relativeY.toFixed(3)}) → topLeft=(${x},${y})`)
  return { x, y }
}

/**
 * Clamp a top-left position so the window center is inside some display.bounds.
 * Uses display.bounds (not workArea) — the window can overlap the taskbar.
 * Only falls back to primary center if the position is completely unreasonable.
 */
function clampToDisplayBounds(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  const centerX = x + Math.round(w / 2)
  const centerY = y + Math.round(h / 2)
  for (const d of displays) {
    const b = d.bounds
    if (centerX >= b.x && centerX <= b.x + b.width && centerY >= b.y && centerY <= b.y + b.height) {
      return {
        x: Math.max(b.x, Math.min(x, b.x + b.width - w)),
        y: Math.max(b.y, Math.min(y, b.y + b.height - h)),
      }
    }
  }
  const primary = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(primary.x + primary.width / 2 - w / 2),
    y: Math.round(primary.y + primary.height / 2 - h / 2),
  }
}

interface AssetEntry {
  id: string
  path: string
  name: string
  isActive: boolean
}

/** Scan generated directory for assets using shared loadAssetInfo */
function scanAssets(): AssetEntry[] {
  const entries = scanAllActions()
  return entries.map(entry => ({
    id: entry.id,
    path: entry.path,
    name: entry.info.name,
    isActive: entry.isActive,
  }))
}

/**
 * Push the startup config to the renderer after PET_RENDERER_READY.
 * Priority: saved action > default action > first available action > demo.
 * The renderer does NOT load any config on its own; it waits for this push.
 */
function pushStartupConfig(): void {
  const configPath = getRuntimeLocalConfigPath()

  // 1. Try to restore saved action from local.config.json
  if (existsSync(configPath)) {
    try {
      const saved = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (saved.framesDir) {
        const absDir = toAbsoluteFramesDir(saved.framesDir)
        const entry = findActionByPath(absDir)

        if (entry) {
          const info = loadAssetInfo(entry.path, entry.id)
          const error = validateAssetInfo(info)
          if (!error && info) {
            const framesDir = toActionFramesDir(entry)
            const anchor = computeDisplayAnchor(info)
            const config: AnimConfig = {
              name: info.name,
              label: info.name,
              framesDir,
              fps: info.fpsOverride ?? 12,
              scale: 0.5,
              displayScale: info.displayScale,
              loop: info.loop,
              frameCount: info.frameCount,
              frameWidth: info.frameWidth,
              frameHeight: info.frameHeight,
              framePattern: `{}.${info.format}`,
              anchorX: anchor?.anchorX,
              anchorY: anchor?.anchorY,
            }

            if (petWindow && !petWindow.isDestroyed()) {
              petWindow.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config)
              console.log(`[petWindow] startup: restored saved action id=${entry.id} source=${entry.source}`)
            }
            return
          }
        }
        console.log(`[petWindow] startup: saved action not found, trying fallback`)
      }
    } catch (e) {
      console.warn('[petWindow] startup: failed to read saved config:', e)
    }
  }

  // 2. Try action repository: default > first available bundled > first available user
  const fallback = getFallbackActionCandidate()
  if (fallback) {
    const config = buildFallbackRuntimeConfig(fallback)
    if (config && petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config)
      console.log(`[petWindow] startup: fallback action id=${fallback.id} source=${fallback.source} name=${config.name}`)
      return
    }
  }

  // 3. Last resort: demo config
  const demoConfig: AnimConfig = {
    name: 'fallback',
    label: 'fallback',
    framesDir: './assets/actions/idle/fallback',
    fps: 12,
    scale: 0.5,
    loop: true,
    frameCount: 61,
    frameWidth: 534,
    frameHeight: 697,
    framePattern: '{}.png',
  }

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, demoConfig)
    console.log(`[petWindow] startup: demo fallback (no actions available)`)
  }
}

export function createPetWindow(): BrowserWindow {
  const initialWidth = 64
  const initialHeight = 64

  // Restore saved position or fall back to primary display center
  const saved = loadWindowState()
  const restored = restoreWindowPosition(saved, initialWidth, initialHeight)
  const initX = restored.x
  const initY = restored.y
  if (saved) {
    console.log(`[petWindow] restored position: → init=(${initX},${initY})`)
  }

  petWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initX,
    y: initY,
    title: '',
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  petWindow.setMenu(null)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    petWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/pet.html')
  } else {
    petWindow.loadFile(join(__dirname, '../renderer/pet.html'))
  }

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
    const bounds = petWindow?.getBounds()
    console.log(`[petWindow] ready-to-show: bounds=${JSON.stringify(bounds)} visible=${petWindow?.isVisible()}`)
  })

  // Startup config push: wait for renderer to be ready (handshake)
  const onRendererReady = () => {
    console.log('[petWindow] PET_RENDERER_READY received, pushing startup config')
    pushStartupConfig()
  }
  ipcMain.once(IPC_CHANNELS.PET_RENDERER_READY, onRendererReady)
  petWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.PET_RENDERER_READY, onRendererReady)
  })

  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return
    const bounds = petWindow.getBounds()
    const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    const displayChanged = lastDisplayId !== null && lastDisplayId !== display.id
    lastDisplayId = display.id

    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      if (!petWindow || petWindow.isDestroyed()) return
      if (displayChanged) {
        petWindow.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
      } else {
        petWindow.webContents.send(IPC_CHANNELS.PET_SURFACE_REFRESH)
      }
    }, 200)
  })

  screen.on('display-metrics-changed', () => {
    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      if (!petWindow || petWindow.isDestroyed()) return
      petWindow.webContents.send(IPC_CHANNELS.RELOAD_ANIM)
    }, 300)
  })

  return petWindow
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

/**
 * 找回桌宠 / 重新置顶。
 *
 * 触发时机：
 * - 宠物窗口被其他窗口遮挡（失去置顶）
 * - 宠物窗口被隐藏
 * - 宠物窗口被最小化
 * - 隐身模式开启导致不可见
 *
 * 策略：
 * - 引用不存在或已销毁 → 复用 createPetWindow() 重建
 * - 隐身中 → 先 disableStealthMode() 恢复可见
 * - 最小化 → restore()
 * - showInactive 恢复显示（不抢焦点）
 * - setAlwaysOnTop(true, 'screen-saver') 重新置顶
 * - moveTop() 将 Z-order 提到同类窗口最前
 *
 * 不改变窗口位置 / 不 setBounds / 不 center。
 * 失败不抛，兜底 try/catch。
 */
export function restorePetWindow(): void {
  try {
    // 1. 隐身中先恢复可见
    if (stealthModeEnabled) {
      disableStealthMode()
    }

    // 2. 引用无效 → 重建（复用 createPetWindow，不复制逻辑）
    if (!petWindow || petWindow.isDestroyed()) {
      console.log('[petWindow] restorePetWindow: pet window missing, recreating')
      createPetWindow()
      return
    }

    // 3. 最小化 → 还原
    try {
      if (petWindow.isMinimized()) petWindow.restore()
    } catch (e) {
      console.warn('[petWindow] restorePetWindow: restore failed:', e)
    }

    // 4. 隐藏 → 显示（不抢焦点，与 ready-to-show 风格一致）
    try {
      if (!petWindow.isVisible()) petWindow.showInactive()
    } catch (e) {
      console.warn('[petWindow] restorePetWindow: showInactive failed:', e)
    }

    // 5. 重新置顶（screen-saver 级别最高）
    try {
      petWindow.setAlwaysOnTop(true, 'screen-saver')
    } catch (e) {
      console.warn('[petWindow] restorePetWindow: setAlwaysOnTop failed:', e)
    }

    // 6. Z-order 提到最前
    try {
      petWindow.moveTop()
    } catch (e) {
      console.warn('[petWindow] restorePetWindow: moveTop failed:', e)
    }

    console.log('[petWindow] restorePetWindow: done')
  } catch (e) {
    console.error('[petWindow] restorePetWindow: unexpected error:', e)
  }
}

export function setupWindowResize(): void {
  ipcMain.on(IPC_CHANNELS.RESIZE_WINDOW, (_event, width: number, height: number, oldAnchorX?: number, oldAnchorY?: number, newAnchorX?: number, newAnchorY?: number) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const w = Math.max(1, Math.round(Number(width)))
    const h = Math.max(1, Math.round(Number(height)))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    try {
      const bounds = petWindow.getBounds()
      const display = screen.getDisplayMatching(bounds)
      const wa = display.workArea

      let newX: number
      let newY: number
      let mode: string

      const hasOldAnchor = Number.isFinite(oldAnchorX) && Number.isFinite(oldAnchorY) && oldAnchorX! >= 0 && oldAnchorY! >= 0
      const hasNewAnchor = Number.isFinite(newAnchorX) && Number.isFinite(newAnchorY) && newAnchorX! >= 0 && newAnchorY! >= 0

      if (hasOldAnchor && hasNewAnchor) {
        // Anchor-based alignment: keep the character anchor at the same screen position
        mode = 'anchor'
        const oldAnchorScreenX = bounds.x + oldAnchorX!
        const oldAnchorScreenY = bounds.y + oldAnchorY!
        newX = Math.round(oldAnchorScreenX - newAnchorX!)
        newY = Math.round(oldAnchorScreenY - newAnchorY!)
      } else {
        // Bottom-center fallback: preserve window's bottom-center point
        mode = 'bottom-center-fallback'
        const oldCenterX = bounds.x + Math.round(bounds.width / 2)
        const oldBottomY = bounds.y + bounds.height
        newX = oldCenterX - Math.round(w / 2)
        newY = oldBottomY - h
      }

      const clampedX = Math.max(wa.x, Math.min(newX, wa.x + wa.width - w))
      const clampedY = Math.max(wa.y, Math.min(newY, wa.y + wa.height - h))
      const clamped = clampedX !== newX || clampedY !== newY
      console.log(`[petWindow] resize(${mode}): ${w}x${h} oldBounds=(${bounds.x},${bounds.y},${bounds.width}x${bounds.height}) oldAnchor=(${oldAnchorX ?? '-'},${oldAnchorY ?? '-'}) newAnchor=(${newAnchorX ?? '-'},${newAnchorY ?? '-'}) → newPos=(${newX},${newY}) final=(${clampedX},${clampedY})${clamped ? ' CLAMPED' : ''}`)
      petWindow.setBounds({ x: clampedX, y: clampedY, width: w, height: h })
      saveWindowState({ x: clampedX, y: clampedY, width: w, height: h })
    } catch {}
  })
}

export function setupPetDrag(): void {
  let isDragging = false
  let startMouseX = 0
  let startMouseY = 0
  let startWinX = 0
  let startWinY = 0

  ipcMain.on(IPC_CHANNELS.PET_DRAG_START, (_event, payload: DragPayload) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const sx = Number(payload?.screenX)
    const sy = Number(payload?.screenY)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
    isDragging = true
    startMouseX = sx
    startMouseY = sy
    const [winX, winY] = petWindow.getPosition()
    startWinX = winX
    startWinY = winY
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_MOVE, (_event, payload: DragPayload) => {
    if (!petWindow || petWindow.isDestroyed() || !isDragging) return
    const sx = Number(payload?.screenX)
    const sy = Number(payload?.screenY)
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
    const x = Math.round(startWinX + (sx - startMouseX))
    const y = Math.round(startWinY + (sy - startMouseY))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    try { petWindow.setPosition(x, y, false) } catch {}
  })

  ipcMain.on(IPC_CHANNELS.PET_DRAG_END, () => {
    isDragging = false
    if (petWindow && !petWindow.isDestroyed()) {
      const bounds = petWindow.getBounds()
      saveWindowState(bounds)
      console.log(`[petWindow] drag end: bounds=(${bounds.x},${bounds.y}) ${bounds.width}x${bounds.height} — position saved`)
    }
  })
}

/**
 * Build shared menu template for both pet context menu and tray menu.
 * @param options.includeDevItems - include dev-only items like reload animation
 * @param options.includeActionSwitcher - include the action switch submenu
 */
export function buildAppMenuTemplate(options?: {
  includeReloadAnimation?: boolean
  includeActionSwitcher?: boolean
  includeStealth?: boolean
  includeAutoStart?: boolean
  includeRestorePet?: boolean
}): Electron.MenuItemConstructorOptions[] {
  const visible = isControlPanelVisible()
  const autoEnabled = isAutoBehaviorActive()

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: visible ? '隐藏控制面板' : '显示控制面板',
      click: () => {
        if (visible) hideControlPanel()
        else showControlPanel()
      },
    },
  ]

  // B1: 找回桌宠 / 重新置顶
  if (options?.includeRestorePet) {
    items.push({
      label: '找回桌宠',
      click: () => {
        restorePetWindow()
      },
    })
  }

  items.push({
    label: '自动行为',
    type: 'checkbox',
    checked: autoEnabled,
    click: () => {
      ipcMain.emit(IPC_CHANNELS.TOGGLE_AUTO_BEHAVIOR, null, { enabled: !autoEnabled })
    },
  })

  if (options?.includeAutoStart) {
    const autoStartEnabled = app.getLoginItemSettings().openAtLogin
    items.push({
      label: '开机自启',
      type: 'checkbox',
      checked: autoStartEnabled,
      click: () => {
        app.setLoginItemSettings({ openAtLogin: !autoStartEnabled })
        console.log(`[app] openAtLogin set to ${!autoStartEnabled}`)
      },
    })
  }

  if (options?.includeActionSwitcher) {
    const assets = scanAssets()
    const actionSubmenu: Electron.MenuItemConstructorOptions[] = assets.length > 0
      ? assets.map(asset => ({
          label: asset.isActive ? `✓ ${asset.name}` : asset.name,
          click: () => {
            ipcMain.emit(IPC_CHANNELS.SWITCH_TO_ASSET, null, { assetPath: asset.path })
          },
        }))
      : [{ label: '（暂无动作）', enabled: false }]

    items.push({ type: 'separator' })
    items.push({ label: '切换动作', submenu: actionSubmenu })
  }

  if (options?.includeReloadAnimation) {
    items.push({ type: 'separator' })
    items.push({
      label: '重新加载动画',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send(IPC_CHANNELS.MENU_ACTION, 'reload-anim')
        }
      },
    })
  }

  if (options?.includeStealth) {
    items.push({
      label: '隐身模式',
      type: 'checkbox',
      checked: stealthModeEnabled,
      click: () => { toggleStealthMode() },
    })
  }

  items.push({ type: 'separator' })
  items.push({
    label: '恢复内置预览',
    click: () => {
      ipcMain.emit(IPC_CHANNELS.RESTORE_DEMO_MENU)
    },
  })
  items.push({ type: 'separator' })
  items.push({ label: '退出 FurTwin', click: () => { app.quit() } })
  items.push({ type: 'separator' })
  items.push({ label: `FurTwin v${app.getVersion()}`, enabled: false })

  return items
}

export function setupContextMenu(): void {
  ipcMain.on(IPC_CHANNELS.SHOW_CONTEXT_MENU, () => {
    if (!petWindow || petWindow.isDestroyed()) return
    try {
      const template = buildAppMenuTemplate({ includeReloadAnimation: true, includeActionSwitcher: true, includeStealth: true, includeAutoStart: true, includeRestorePet: true })
      Menu.buildFromTemplate(template).popup({ window: petWindow })
    } catch {}
  })

  // Control panel toggle stealth mode
  ipcMain.on(IPC_CHANNELS.TOGGLE_STEALTH_MODE, () => {
    toggleStealthMode()
  })
}
