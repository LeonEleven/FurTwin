import { useState, useEffect, useRef, useCallback } from 'react'
import type { AnimConfig } from '../../../shared/types'

interface UseAnimPlayerReturn {
  currentFrameSrc: string | null
  isPlaying: boolean
  currentFrame: number
  totalFrames: number
  restart: () => void
  pause: () => void
  resume: () => void
}

/**
 * 序列帧动画播放 hook
 * requestAnimationFrame + 时间戳控制帧率。
 */
export function useAnimPlayer(config: AnimConfig | null, reloadKey?: number): UseAnimPlayerReturn {
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)

  const restart = useCallback(() => {
    if (!config) return
    frameRef.current = 0
    lastTimeRef.current = 0
    pausedRef.current = false
    setCurrentFrame(0)
    setIsPlaying(true)
  }, [config])

  const pause = useCallback(() => {
    pausedRef.current = true
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    lastTimeRef.current = 0 // reset timer to avoid time jump
  }, [])

  useEffect(() => {
    if (!config) {
      setIsPlaying(false)
      return
    }

    const interval = 1000 / config.fps
    frameRef.current = 0
    lastTimeRef.current = 0
    pausedRef.current = false
    setCurrentFrame(0)
    setIsPlaying(true)

    function tick(timestamp: number) {
      if (pausedRef.current) {
        // Keep the raf loop alive but don't advance frames
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp
      }

      const elapsed = timestamp - lastTimeRef.current

      if (elapsed >= interval) {
        lastTimeRef.current = timestamp - (elapsed % interval)
        frameRef.current += 1

        if (frameRef.current >= config!.frameCount) {
          if (config!.loop) {
            frameRef.current = 0
          } else {
            frameRef.current = config!.frameCount - 1
            setCurrentFrame(frameRef.current)
            setIsPlaying(false)
            return
          }
        }

        setCurrentFrame(frameRef.current)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [config, reloadKey])

  const buildFrameSrc = useCallback(
    (frameIndex: number): string | null => {
      if (!config) return null
      const num = String(frameIndex + 1).padStart(4, '0')
      const filename = config.framePattern.replace('{}', num)
      return `${config.framesDir}/${filename}?v=${reloadKey ?? 0}`
    },
    [config, reloadKey]
  )

  return {
    currentFrameSrc: buildFrameSrc(currentFrame),
    isPlaying,
    currentFrame,
    totalFrames: config?.frameCount ?? 0,
    restart,
    pause,
    resume,
  }
}
