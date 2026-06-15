import { useState, useEffect, useRef, useCallback } from 'react'
import type { AnimConfig } from '../../../shared/types'

interface UseAnimPlayerReturn {
  currentFrameSrc: string | null
  isPlaying: boolean
  currentFrame: number
  totalFrames: number
  /** 重新从第 0 帧开始播放 */
  restart: () => void
}

/**
 * 序列帧动画播放 hook
 * 使用 requestAnimationFrame + 时间戳控制帧率，保证稳定播放。
 *
 * @param config  动画配置，为 null 时停止播放
 * @param reloadKey 外部递增此值可强制重启动画
 */
export function useAnimPlayer(config: AnimConfig | null, reloadKey?: number): UseAnimPlayerReturn {
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const rafRef = useRef<number>(0)

  // 重启动画（供右键菜单"重新加载动画"使用）
  const restart = useCallback(() => {
    if (!config) return
    frameRef.current = 0
    lastTimeRef.current = 0
    setCurrentFrame(0)
    setIsPlaying(true)
  }, [config])

  useEffect(() => {
    if (!config) {
      setIsPlaying(false)
      return
    }

    const interval = 1000 / config.fps
    frameRef.current = 0
    lastTimeRef.current = 0
    setCurrentFrame(0)
    setIsPlaying(true)

    function tick(timestamp: number) {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp
      }

      const elapsed = timestamp - lastTimeRef.current

      if (elapsed >= interval) {
        // 扣除多余时间，避免帧漂移
        lastTimeRef.current = timestamp - (elapsed % interval)
        frameRef.current += 1

        if (frameRef.current >= config!.frameCount) {
          if (config!.loop) {
            frameRef.current = 0
          } else {
            // 非循环：停在最后一帧
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

  /** 根据帧索引构建图片路径 */
  const buildFrameSrc = useCallback(
    (frameIndex: number): string | null => {
      if (!config) return null
      const num = String(frameIndex + 1).padStart(4, '0')
      const filename = config.framePattern.replace('{}', num)
      return `${config.framesDir}/${filename}`
    },
    [config]
  )

  return {
    currentFrameSrc: buildFrameSrc(currentFrame),
    isPlaying,
    currentFrame,
    totalFrames: config?.frameCount ?? 0,
    restart,
  }
}
