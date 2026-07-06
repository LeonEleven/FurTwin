/**
 * Behavior System v0
 *
 * Core logic: idle loop + random action insertion + pause on manual interaction.
 *
 * Key design:
 * - Auto-behavior sends SWITCH_ANIM_RUNTIME to pet window (no local.config.json write)
 * - Manual actions write local.config.json (persisted, shows as "当前使用")
 * - After manual action, auto-behavior pauses for PAUSE_DURATION
 * - When auto-behavior resumes, it returns to idle fallback
 */

import { BrowserWindow, ipcMain } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS, type AnimConfig } from '../shared/types'
import { loadAssetInfo, getActiveAssetId, computeDisplayAnchor, type AssetInfo } from './utils/assetInfo'
import { getControlPanel } from './windows/controlPanel'
import { getGeneratedDir, getLocalConfigPath, getRuntimeLocalConfigPath, getBundledLocalConfigPath, getPublicDir } from './services/actionPaths'
import { scanValidActions, toActionFramesDir, type ActionEntry } from './services/actionRepository'
import { writeConfigAtomically, readConfigWithFallback } from './services/configStore'

// ─── Constants ──────────────────────────────────────────
const STARTUP_DELAY = 3_000       // Wait for renderer to initialize before first action

// Default parameter values (can be overridden via local.config.json)
const DEFAULT_FIRST_DELAY_SEC = 30
const DEFAULT_MIN_INTERVAL_SEC = 60
const DEFAULT_MAX_INTERVAL_SEC = 120
const DEFAULT_MANUAL_PAUSE_SEC = 120
const MIN_IDLE_DWELL_SEC = 8  // Minimum time to stay on idle before next auto-insert

const GENERATED_DIR = getGeneratedDir()
const LOCAL_CONFIG_PATH = getRuntimeLocalConfigPath()
const BUNDLED_CONFIG_PATH = getBundledLocalConfigPath()
const PUBLIC_DIR = getPublicDir()

// ─── State ──────────────────────────────────────────────
let autoBehaviorEnabled = true
let pauseUntil = 0
let autoTimer: ReturnType<typeof setTimeout> | null = null
let isAutoPlaying = false  // Currently playing a random auto-inserted action
let autoPlayRepeatRemaining = 0  // Remaining repeat count for current auto-insert
let currentAutoInsertConfig: AnimConfig | null = null  // Config for replaying
let currentPlayingActionName: string | null = null  // Track current playing action name (persists through idle)

// ─── Configurable Parameters ────────────────────────────

interface BehaviorParams {
  firstDelaySec: number
  minIntervalSec: number
  maxIntervalSec: number
  manualPauseSec: number
}

function readBehaviorParams(): BehaviorParams {
  const config = readLocalConfig()
  return {
    firstDelaySec: Number.isFinite(config.autoBehaviorFirstDelaySec) && config.autoBehaviorFirstDelaySec >= 0
      ? config.autoBehaviorFirstDelaySec : DEFAULT_FIRST_DELAY_SEC,
    minIntervalSec: Number.isFinite(config.autoBehaviorMinIntervalSec) && config.autoBehaviorMinIntervalSec >= 0
      ? config.autoBehaviorMinIntervalSec : DEFAULT_MIN_INTERVAL_SEC,
    maxIntervalSec: Number.isFinite(config.autoBehaviorMaxIntervalSec) && config.autoBehaviorMaxIntervalSec >= 0
      ? config.autoBehaviorMaxIntervalSec : DEFAULT_MAX_INTERVAL_SEC,
    manualPauseSec: Number.isFinite(config.autoBehaviorManualPauseSec) && config.autoBehaviorManualPauseSec >= 0
      ? config.autoBehaviorManualPauseSec : DEFAULT_MANUAL_PAUSE_SEC,
  }
}

function getParams(): BehaviorParams {
  const p = readBehaviorParams()
  // Ensure min <= max
  if (p.minIntervalSec > p.maxIntervalSec) {
    p.maxIntervalSec = p.minIntervalSec
  }
  return p
}

// ─── Persistence ────────────────────────────────────────

function readLocalConfig(): Record<string, any> {
  // P7A-1: 使用带备份恢复的读取；主配置损坏时尝试从 .bak 恢复
  return readConfigWithFallback(LOCAL_CONFIG_PATH, BUNDLED_CONFIG_PATH)
}

function loadAutoBehaviorEnabled(): boolean {
  const config = readLocalConfig()
  if (typeof config.autoBehaviorEnabled === 'boolean') return config.autoBehaviorEnabled
  return true // default on
}

export function saveAutoBehaviorEnabled(enabled: boolean): void {
  try {
    const config = readLocalConfig()
    config.autoBehaviorEnabled = enabled
    // P7A-1: 原子写入
    if (!writeConfigAtomically(LOCAL_CONFIG_PATH, config)) {
      console.warn('[behavior] failed to save autoBehaviorEnabled: atomic write returned false')
    }
  } catch (e) {
    console.warn('[behavior] failed to save autoBehaviorEnabled:', e)
  }
}

// ─── Asset Scanning ─────────────────────────────────────

interface ValidAsset {
  info: AssetInfo
  path: string
  dirName: string
  source: 'bundled' | 'user'
}

function scanValidAssets(): ValidAsset[] {
  const entries = scanValidActions()
  return entries.map(entry => ({
    info: entry.info,
    path: entry.path,
    dirName: entry.id,
    source: entry.source,
  }))
}

// ─── Idle Fallback Selection ────────────────────────────

function assetToAnimConfig(asset: ValidAsset): AnimConfig {
  const anchor = computeDisplayAnchor(asset.info)
  // Create a temporary ActionEntry to use toActionFramesDir
  const tempEntry: ActionEntry = {
    id: asset.dirName,
    path: asset.path,
    info: asset.info,
    modifiedAt: 0,
    isActive: false,
    source: asset.source,
  }
  return {
    name: asset.info.name,
    label: asset.info.name,
    framesDir: toActionFramesDir(tempEntry),
    fps: asset.info.fpsOverride ?? 12,
    scale: 0.5,
    displayScale: asset.info.displayScale,
    loop: true, // idle fallback always loops
    frameCount: asset.info.frameCount,
    frameWidth: asset.info.frameWidth,
    frameHeight: asset.info.frameHeight,
    framePattern: `{}.${asset.info.format}`,
    anchorX: anchor?.anchorX,
    anchorY: anchor?.anchorY,
  }
}

/**
 * Select idle fallback AnimConfig by priority:
 * 1. isDefault && actionType === 'idle'
 * 2. any isDefault
 * 3. newest actionType === 'idle'
 * 4. current active asset
 * 5. null (caller should use Demo)
 */
export function selectIdleFallback(): AnimConfig | null {
  const assets = scanValidAssets()
  if (assets.length === 0) return null

  // 1. isDefault && actionType === 'idle'
  const defaultIdle = assets.find(a => a.info.isDefault && a.info.actionType === 'idle')
  if (defaultIdle) {
    console.log(`[behavior] idle fallback: default idle "${defaultIdle.info.name}"`)
    return assetToAnimConfig(defaultIdle)
  }

  // 2. any isDefault
  const anyDefault = assets.find(a => a.info.isDefault)
  if (anyDefault) {
    console.log(`[behavior] idle fallback: default "${anyDefault.info.name}"`)
    return assetToAnimConfig(anyDefault)
  }

  // 3. newest actionType === 'idle' (assets are sorted by modifiedAt desc)
  const newestIdle = assets.find(a => a.info.actionType === 'idle')
  if (newestIdle) {
    console.log(`[behavior] idle fallback: newest idle "${newestIdle.info.name}"`)
    return assetToAnimConfig(newestIdle)
  }

  // 4. current active asset
  const activeId = getActiveAssetId()
  if (activeId) {
    const active = assets.find(a => a.dirName === activeId)
    if (active) {
      console.log(`[behavior] idle fallback: current active "${active.info.name}"`)
      return assetToAnimConfig(active)
    }
  }

  // 5. null → Demo
  console.log('[behavior] idle fallback: none found, will use Demo')
  return null
}

// ─── Random Candidate Selection ─────────────────────────

function selectRandomCandidate(): { config: AnimConfig; repeatCount: number } | null {
  const assets = scanValidAssets()
  if (assets.length === 0) return null

  // Determine current idle fallback to exclude it
  const idleFallback = selectIdleFallback()
  const idleFallbackName = idleFallback?.name

  const candidates = assets.filter(a => {
    if (a.info.name === idleFallbackName) return false
    if (!a.info.includeInRandom) return false
    if (a.info.actionType === 'idle') return false
    return true
  })

  if (candidates.length === 0) {
    console.log('[behavior] no random candidates available')
    return null
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  console.log(`[behavior] random candidate: "${pick.info.name}" (${pick.info.actionType}) repeat=${pick.info.autoPlayRepeatCount}`)

  // Build AnimConfig with loop=false for auto-insert (play once per repeat)
  const anchor = computeDisplayAnchor(pick.info)
  // Create temporary ActionEntry for toActionFramesDir
  const tempEntry: ActionEntry = {
    id: pick.dirName,
    path: pick.path,
    info: pick.info,
    modifiedAt: 0,
    isActive: false,
    source: pick.source,
  }
  return {
    config: {
      name: pick.info.name,
      label: pick.info.name,
      framesDir: toActionFramesDir(tempEntry),
      fps: pick.info.fpsOverride ?? 12,
      scale: 0.5,
      displayScale: pick.info.displayScale,
      loop: false, // auto-insert plays once per repeat
      frameCount: pick.info.frameCount,
      frameWidth: pick.info.frameWidth,
      frameHeight: pick.info.frameHeight,
      framePattern: `{}.${pick.info.format}`,
      anchorX: anchor?.anchorX,
      anchorY: anchor?.anchorY,
    },
    repeatCount: Math.max(1, Math.round(pick.info.autoPlayRepeatCount)),
  }
}

// ─── Pet Window Communication ───────────────────────────

function getPetWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(w => {
    if (w.isDestroyed()) return false
    const title = w.getTitle()
    return title === '' || title === 'FurTwin Pet'
  }) ?? null
}

function sendToPet(channel: string, ...args: unknown[]): void {
  const pet = getPetWindow()
  if (pet && !pet.isDestroyed()) {
    try { pet.webContents.send(channel, ...args) } catch {}
  }
}

function switchAnimRuntime(config: AnimConfig): void {
  const pet = getPetWindow()
  const bounds = pet?.getBounds()
  console.log(`[behavior] SWITCH_ANIM_RUNTIME → ${config.name} framesDir=${config.framesDir} display=${config.frameWidth}x${config.frameHeight} scale=${config.displayScale} petBounds=${JSON.stringify(bounds)} petVisible=${pet?.isVisible()}`)
  sendToPet(IPC_CHANNELS.SWITCH_ANIM_RUNTIME, config)
  // Track current playing action for click interaction dedup
  currentPlayingActionName = config.name
}

function notifyControlPanel(): void {
  const cp = getControlPanel()
  if (cp && !cp.isDestroyed()) {
    try { cp.webContents.send(IPC_CHANNELS.AUTO_BEHAVIOR_STATE_CHANGED, autoBehaviorEnabled) } catch {}
  }
}

function notifyAutoPlaying(name: string | null): void {
  const cp = getControlPanel()
  if (cp && !cp.isDestroyed()) {
    try { cp.webContents.send(IPC_CHANNELS.AUTO_PLAYING_CHANGED, name) } catch {}
  }
}

// ─── Behavior Logic ─────────────────────────────────────

function isPaused(): boolean {
  return Date.now() < pauseUntil
}

function getRemainingPause(): number {
  return Math.max(0, pauseUntil - Date.now())
}

function randomInterval(): number {
  const p = getParams()
  return (p.minIntervalSec + Math.random() * (p.maxIntervalSec - p.minIntervalSec)) * 1000
}

/**
 * Calculate idle one-loop duration in ms.
 * Uses the current idle fallback's frameCount and fps.
 */
function idleOneLoopDuration(): number {
  const idle = selectIdleFallback()
  if (!idle) return MIN_IDLE_DWELL_SEC * 1000
  const fps = idle.fps || 12
  const duration = (idle.frameCount / fps) * 1000
  return Math.max(duration, MIN_IDLE_DWELL_SEC * 1000)
}

function playIdle(): void {
  isAutoPlaying = false
  currentAutoInsertConfig = null
  autoPlayRepeatRemaining = 0
  notifyAutoPlaying(null) // clear auto-playing indicator
  const idle = selectIdleFallback()
  if (idle) {
    console.log('[behavior] switching to idle fallback')
    switchAnimRuntime(idle)
  } else {
    console.log('[behavior] no idle fallback available, staying on current')
  }
}

function scheduleNext(delay?: number): void {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }

  const d = delay ?? randomInterval()
  console.log(`[behavior] next auto-action in ${Math.round(d / 1000)}s`)

  autoTimer = setTimeout(() => {
    autoTimer = null
    tick()
  }, d)
}

function tick(): void {
  if (!autoBehaviorEnabled) {
    console.log('[behavior] auto-behavior disabled, stopping')
    return
  }

  if (isPaused()) {
    const remaining = getRemainingPause()
    console.log(`[behavior] paused, ${Math.round(remaining / 1000)}s remaining`)
    scheduleNext(remaining)
    return
  }

  // Pick a random candidate
  const result = selectRandomCandidate()
  if (!result) {
    console.log('[behavior] no candidates, retrying later')
    const p = getParams()
    scheduleNext(p.minIntervalSec * 1000)
    return
  }

  // Play the random action
  isAutoPlaying = true
  autoPlayRepeatRemaining = result.repeatCount - 1  // -1 because we play once now
  currentAutoInsertConfig = result.config
  notifyAutoPlaying(result.config.name)
  console.log(`[behavior] auto-playing "${result.config.name}" (repeat ${result.repeatCount}x)`)
  switchAnimRuntime(result.config)
  // Playback complete will be handled by ANIM_PLAYBACK_COMPLETE from pet
}

/**
 * Called when pet reports non-loop animation finished.
 */
export function onPlaybackComplete(): void {
  if (!isAutoPlaying) {
    console.log('[behavior] playback complete but not auto-playing, ignoring')
    return
  }

  if (autoPlayRepeatRemaining > 0 && currentAutoInsertConfig) {
    // Replay the same action
    autoPlayRepeatRemaining--
    console.log(`[behavior] replaying "${currentAutoInsertConfig.name}" (${autoPlayRepeatRemaining} repeats left)`)
    switchAnimRuntime(currentAutoInsertConfig)
    return
  }

  console.log('[behavior] auto-insert finished, returning to idle')
  currentAutoInsertConfig = null
  autoPlayRepeatRemaining = 0
  playIdle()

  if (autoBehaviorEnabled) {
    // Ensure next auto-insert doesn't interrupt idle before one full loop
    const idleDwell = idleOneLoopDuration()
    const randomDelay = randomInterval()
    const nextDelay = Math.max(randomDelay, idleDwell)
    console.log(`[behavior] idle dwell protection: random=${Math.round(randomDelay/1000)}s idleDwell=${Math.round(idleDwell/1000)}s → next=${Math.round(nextDelay/1000)}s`)
    scheduleNext(nextDelay)
  }
}

/**
 * Called when user manually switches action (from control panel or right-click menu).
 * Pauses auto-behavior.
 */
export function pauseAutoBehavior(): void {
  const p = getParams()
  const pauseMs = p.manualPauseSec * 1000
  pauseUntil = Date.now() + pauseMs
  console.log(`[behavior] paused for ${p.manualPauseSec}s (manual action)`)

  // Clear any pending auto-action timer to prevent immediate switch
  if (autoTimer !== null) {
    clearTimeout(autoTimer)
    autoTimer = null
    console.log('[behavior] cleared pending auto-action timer')
  }

  // Reschedule: after pause expires, tick() will check isPaused() and resume normally
  if (autoBehaviorEnabled) {
    scheduleNext(pauseMs)
    console.log(`[behavior] rescheduled auto-action after ${p.manualPauseSec}s pause`)
  }
}

// ─── Public API ─────────────────────────────────────────

export function initBehavior(): void {
  autoBehaviorEnabled = loadAutoBehaviorEnabled()
  const p = getParams()
  console.log(`[behavior] init: autoBehaviorEnabled=${autoBehaviorEnabled} params=${JSON.stringify(p)}`)

  if (autoBehaviorEnabled) {
    // Delay to let pet renderer initialize and show initial config
    console.log(`[behavior] waiting ${STARTUP_DELAY / 1000}s before first auto-action`)
    setTimeout(() => {
      playIdle()
      scheduleNext(p.firstDelaySec * 1000)
    }, STARTUP_DELAY)
  }
}

export function toggleAutoBehavior(enabled: boolean): void {
  autoBehaviorEnabled = enabled
  saveAutoBehaviorEnabled(enabled)
  console.log(`[behavior] toggled: ${enabled}`)

  // Always clear existing state first
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
  pauseUntil = 0  // Clear any pending manual pause

  if (enabled) {
    // Resume: play idle and schedule next with firstDelaySec
    isAutoPlaying = false
    const p = getParams()
    playIdle()
    scheduleNext(p.firstDelaySec * 1000)
  } else {
    // Disable: stop auto-playing and switch to idle fallback
    playIdle()
  }

  notifyControlPanel()
}

export function isAutoBehaviorActive(): boolean {
  return autoBehaviorEnabled
}

// ─── Click Interaction ──────────────────────────────────

const CLICK_COOLDOWN_MS = 600
let lastClickInteractionTime = 0

/**
 * Select a random click-interaction candidate from assets with triggerOnClick=true.
 * Does NOT exclude idle fallback — if user explicitly enabled triggerOnClick, it's valid.
 * Excludes the currently-playing action when multiple candidates are available.
 */
function selectClickCandidate(): { config: AnimConfig; repeatCount: number } | null {
  const assets = scanValidAssets()
  if (assets.length === 0) return null

  // Filter: triggerOnClick=true, valid resource
  const candidates = assets.filter(a => a.info.triggerOnClick)
  if (candidates.length === 0) {
    console.log('[behavior] no click interaction candidates')
    return null
  }

  // Exclude currently-playing action when there are multiple candidates
  const currentName = currentPlayingActionName
  let pool = candidates
  if (candidates.length > 1 && currentName) {
    const filtered = candidates.filter(a => a.info.name !== currentName)
    if (filtered.length > 0) pool = filtered
    // Only fallback to full list if ALL candidates are the current action (shouldn't happen)
  }

  const pick = pool[Math.floor(Math.random() * pool.length)]
  console.log(`[behavior] click candidate: "${pick.info.name}" repeat=${pick.info.autoPlayRepeatCount} (excluded: ${currentName ?? 'none'})`)

  const anchor = computeDisplayAnchor(pick.info)
  // Create temporary ActionEntry for toActionFramesDir
  const tempEntry: ActionEntry = {
    id: pick.dirName,
    path: pick.path,
    info: pick.info,
    modifiedAt: 0,
    isActive: false,
    source: pick.source,
  }
  return {
    config: {
      name: pick.info.name,
      label: pick.info.name,
      framesDir: toActionFramesDir(tempEntry),
      fps: pick.info.fpsOverride ?? 12,
      scale: 0.5,
      displayScale: pick.info.displayScale,
      loop: false,
      frameCount: pick.info.frameCount,
      frameWidth: pick.info.frameWidth,
      frameHeight: pick.info.frameHeight,
      framePattern: `{}.${pick.info.format}`,
      anchorX: anchor?.anchorX,
      anchorY: anchor?.anchorY,
    },
    repeatCount: Math.max(1, Math.round(pick.info.autoPlayRepeatCount)),
  }
}

/**
 * Triggered by left-click on the pet. Selects a random click-interaction action
 * and plays it (runtime, no local.config.json write). Pauses auto-behavior.
 * Includes cooldown to prevent rapid-fire restarts.
 */
export function triggerClickInteraction(): void {
  const now = Date.now()
  if (now - lastClickInteractionTime < CLICK_COOLDOWN_MS) {
    console.log('[behavior] click interaction: cooldown, ignoring')
    return
  }
  lastClickInteractionTime = now

  const result = selectClickCandidate()
  if (!result) return

  // If already auto-playing, stop current first
  if (isAutoPlaying && autoTimer) {
    // Don't clear timer — let onPlaybackComplete handle it naturally
  }

  // Pause auto-behavior
  pauseAutoBehavior()

  // Play the click action
  isAutoPlaying = true
  autoPlayRepeatRemaining = result.repeatCount - 1
  currentAutoInsertConfig = result.config
  notifyAutoPlaying(result.config.name)
  console.log(`[behavior] click interaction: "${result.config.name}" (repeat ${result.repeatCount}x)`)
  switchAnimRuntime(result.config)
  // Playback complete will be handled by ANIM_PLAYBACK_COMPLETE → onPlaybackComplete
}

// ─── IPC Setup ──────────────────────────────────────────

export function setupBehaviorIPC(): void {
  // Pet renderer reports non-loop animation finished
  ipcMain.on(IPC_CHANNELS.ANIM_PLAYBACK_COMPLETE, () => {
    console.log('[behavior] ANIM_PLAYBACK_COMPLETE received')
    onPlaybackComplete()
  })

  // Control panel toggles auto-behavior
  ipcMain.on(IPC_CHANNELS.TOGGLE_AUTO_BEHAVIOR, (_event, payload: { enabled: boolean }) => {
    if (typeof payload?.enabled !== 'boolean') return
    toggleAutoBehavior(payload.enabled)
  })

  // Pet renderer reports click interaction
  ipcMain.on(IPC_CHANNELS.TRIGGER_CLICK_INTERACTION, () => {
    console.log('[behavior] TRIGGER_CLICK_INTERACTION received')
    triggerClickInteraction()
  })

  // Pet renderer reports current animation resource is missing (frames failed to load)
  ipcMain.on(IPC_CHANNELS.ANIM_RESOURCE_MISSING, () => {
    console.log('[behavior] ANIM_RESOURCE_MISSING received — looking for fallback')
    const idle = selectIdleFallback()
    if (idle) {
      console.log(`[behavior] switching to fallback: ${idle.name}`)
      switchAnimRuntime(idle)
    } else {
      console.log('[behavior] no valid fallback found, restoring demo')
      // Emit RESTORE_DEMO_MENU which preview.ts handles (deletes local.config.json, sends CLEAR_RUNTIME_CONFIG)
      ipcMain.emit(IPC_CHANNELS.RESTORE_DEMO_MENU)
    }
    // Notify control panel to refresh asset list (deleted actions will disappear)
    const cp = getControlPanel()
    if (cp && !cp.isDestroyed()) {
      try { cp.webContents.send(IPC_CHANNELS.ACTIVE_ASSET_CHANGED) } catch {}
    }
  })

  // Control panel requests initial behavior state on startup
  ipcMain.handle(IPC_CHANNELS.GET_BEHAVIOR_STATE, () => {
    const config = readLocalConfig()
    const enabled = typeof config.autoBehaviorEnabled === 'boolean' ? config.autoBehaviorEnabled : true
    const params = getParams()
    return { enabled, params }
  })

  // Control panel saves behavior params
  ipcMain.on(IPC_CHANNELS.SAVE_BEHAVIOR_PARAMS, (_event, payload: Record<string, number>) => {
    if (!payload) return
    try {
      const config = readLocalConfig()
      if (Number.isFinite(payload.firstDelaySec) && payload.firstDelaySec >= 0) config.autoBehaviorFirstDelaySec = payload.firstDelaySec
      if (Number.isFinite(payload.minIntervalSec) && payload.minIntervalSec >= 0) config.autoBehaviorMinIntervalSec = payload.minIntervalSec
      if (Number.isFinite(payload.maxIntervalSec) && payload.maxIntervalSec >= 0) config.autoBehaviorMaxIntervalSec = payload.maxIntervalSec
      if (Number.isFinite(payload.manualPauseSec) && payload.manualPauseSec >= 0) config.autoBehaviorManualPauseSec = payload.manualPauseSec
      // P7A-1: 原子写入
      if (!writeConfigAtomically(LOCAL_CONFIG_PATH, config)) {
        console.warn('[behavior] params save: atomic write returned false')
      }
      console.log(`[behavior] params saved: ${JSON.stringify(payload)}`)

      // Reschedule with new params if auto-behavior is enabled
      if (autoBehaviorEnabled) {
        // Clear old pause — use new manualPauseSec if it was changed,
        // but don't force a pause if user is just adjusting intervals
        // Only clear pause if it was from a manual action and new params suggest shorter pause
        const oldPauseRemaining = getRemainingPause()
        if (oldPauseRemaining > 0) {
          const newPauseMs = (config.autoBehaviorManualPauseSec ?? DEFAULT_MANUAL_PAUSE_SEC) * 1000
          // If new manual pause is shorter than old remaining, reduce it
          if (newPauseMs < oldPauseRemaining) {
            pauseUntil = Date.now() + newPauseMs
            console.log(`[behavior] adjusted pause: ${Math.round(newPauseMs / 1000)}s (was ${Math.round(oldPauseRemaining / 1000)}s remaining)`)
          }
        }

        // Clear old timer and reschedule
        if (autoTimer) {
          clearTimeout(autoTimer)
          autoTimer = null
        }

        // Reschedule with new params
        if (!isPaused()) {
          // Not paused — schedule next with new interval
          const p = getParams()
          scheduleNext(p.firstDelaySec * 1000)
          console.log(`[behavior] rescheduled after settings change: next in ${p.firstDelaySec}s`)
        } else {
          // Still paused — schedule for when pause ends
          const remaining = getRemainingPause()
          scheduleNext(remaining)
          console.log(`[behavior] rescheduled after settings change: paused for ${Math.round(remaining / 1000)}s more`)
        }
      }
    } catch (e) {
      console.warn('[behavior] failed to save params:', e)
    }
  })
}
