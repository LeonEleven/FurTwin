import { StrictMode, useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { PetSprite } from './components/PetSprite'
import type { AnimConfig } from '../../shared/types'

const CONFIG_URL = './assets/actions/idle/config.json'
const LOCAL_CONFIG_URL = './assets/actions/idle/local.config.json'

const FALLBACK_CONFIG: AnimConfig = {
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

function logConfig(source: string, cfg: AnimConfig) {
  const effectiveScale = cfg.displayScale ?? cfg.scale
  const winW = Math.round(cfg.frameWidth * effectiveScale)
  const winH = Math.round(cfg.frameHeight * effectiveScale)
  console.log(`[pet] PET_CONFIG source=${source}`)
  console.log(`[pet] framesDir=${cfg.framesDir}`)
  console.log(`[pet] frame=${cfg.frameWidth}x${cfg.frameHeight} scale=${cfg.scale}${cfg.displayScale != null ? ` displayScale=${cfg.displayScale}` : ''} effectiveScale=${effectiveScale}`)
  console.log(`[pet] expectedWindow=${winW}x${winH}`)
  console.log(`[pet] frameCount=${cfg.frameCount} pattern=${cfg.framePattern}`)
}

function PetApp() {
  const [config, setConfig] = useState<AnimConfig | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reloadIdRef = useRef(0)
  const runtimeConfigRef = useRef<AnimConfig | null>(null)
  // Guard: ignore RELOAD_ANIM until first SWITCH_ANIM_RUNTIME arrives from main
  const startupPendingRef = useRef(true)

  const loadConfig = useCallback(() => {
    const currentReloadId = ++reloadIdRef.current
    console.log(`[pet] loadConfig reloadId=${currentReloadId}`)

    window.petAPI.clearPetShape()

    // If a runtime config was set by main process, use it directly
    // Keep the ref set so subsequent RELOAD_ANIM calls also use it
    if (runtimeConfigRef.current) {
      const rc = runtimeConfigRef.current
      if (reloadIdRef.current !== currentReloadId) return
      logConfig('runtime', rc)
      setConfig(rc)
      setReloadKey((k) => k + 1)
      return
    }

    const cacheBuster = `?t=${Date.now()}`

    fetch(LOCAL_CONFIG_URL + cacheBuster, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('no local config')
        return res.json()
      })
      .then((data: AnimConfig) => {
        if (reloadIdRef.current !== currentReloadId) {
          console.log(`[pet] stale reloadId=${currentReloadId}, discarding`)
          return
        }
        // Validate: check that framesDir looks reasonable
        const expectedW = Math.round(data.frameWidth * data.scale)
        const expectedH = Math.round(data.frameHeight * data.scale)
        if (expectedW < 1 || expectedH < 1 || expectedW > 2000 || expectedH > 2000) {
          console.warn(`[pet] local.config has suspicious size ${expectedW}x${expectedH}, falling back to config.json`)
          throw new Error('invalid size')
        }
        logConfig('local.config.json', data)
        setConfig(data)
        setReloadKey((k) => k + 1)
      })
      .catch(() => {
        fetch(CONFIG_URL + cacheBuster, { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error('no config')
            return res.json()
          })
          .then((data: AnimConfig) => {
            if (reloadIdRef.current !== currentReloadId) {
              console.log(`[pet] stale reloadId=${currentReloadId}, discarding`)
              return
            }
            logConfig('config.json', data)
            setConfig(data)
            setReloadKey((k) => k + 1)
          })
          .catch(() => {
            if (reloadIdRef.current !== currentReloadId) return
            logConfig('fallback', FALLBACK_CONFIG)
            setConfig(FALLBACK_CONFIG)
            setReloadKey((k) => k + 1)
          })
      })
  }, [])

  // No initial loadConfig() — wait for main process to push startup config
  // via SWITCH_ANIM_RUNTIME (triggered by PET_RENDERER_READY handshake)

  // 右键菜单 → 重新加载动画
  useEffect(() => {
    const removeListener = window.petAPI.onMenuAction((action) => {
      if (action === 'reload-anim') {
        console.log('[pet] menu: reload-anim')
        loadConfig()
      }
    })
    return removeListener
  }, [loadConfig])

  // 控制面板 -> RELOAD_ANIM
  // Guarded: ignore during startup until first SWITCH_ANIM_RUNTIME arrives
  // NOTE: does NOT clear runtimeConfigRef — preserves current action across reloads
  useEffect(() => {
    const removeListener = window.petAPI.onReloadAnim(() => {
      if (startupPendingRef.current) {
        console.log('[pet] RELOAD_ANIM ignored (startup pending)')
        return
      }
      console.log('[pet] RELOAD_ANIM received')
      loadConfig()
    })
    return removeListener
  }, [loadConfig])

  // shape 更新日志
  useEffect(() => {
    const removeListener = window.petAPI.onPetShapeUpdated((info) => {
      console.log(`[pet] shape updated: rects=${info.rects} active_blocks=${info.activeBlocks}/${info.totalBlocks}`)
    })
    return removeListener
  }, [])

  // 恢复 demo：清除 runtime config 并从文件加载
  useEffect(() => {
    const removeListener = window.petAPI.onClearRuntimeConfig(() => {
      console.log('[pet] CLEAR_RUNTIME_CONFIG received')
      runtimeConfigRef.current = null
      startupPendingRef.current = false
      loadConfig()
    })
    return removeListener
  }, [loadConfig])

  // 行为系统：运行时切换动画（不写 local.config.json）
  // Goes through loadConfig() to reuse the stable resize/shape flow
  useEffect(() => {
    const removeListener = window.petAPI.onSwitchAnimRuntime((animConfig: AnimConfig) => {
      console.log(`[pet] SWITCH_ANIM_RUNTIME: ${animConfig.name} loop=${animConfig.loop} framesDir=${animConfig.framesDir}`)
      startupPendingRef.current = false // startup config received, allow RELOAD_ANIM
      runtimeConfigRef.current = animConfig
      loadConfig()
    })
    return removeListener
  }, [loadConfig])

  // Notify main process that renderer is ready to receive configs
  useEffect(() => {
    window.petAPI.sendRendererReady()
    console.log('[pet] PET_RENDERER_READY sent')
  }, [])

  if (!config) return null

  return (
    <StrictMode>
      <PetSprite config={config} reloadKey={reloadKey} />
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<PetApp />)
