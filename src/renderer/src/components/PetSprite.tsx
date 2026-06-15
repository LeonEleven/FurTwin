import { useEffect, useCallback, useRef } from 'react'
import { useAnimPlayer, type AnimConfig } from '../hooks/useAnimPlayer'

interface PetSpriteProps {
  config: AnimConfig
  reloadKey?: number
}

/**
 * 桌宠精灵组件
 * - 序列帧动画播放
 * - Pointer Events + setPointerCapture 实现手动拖动
 * - 右键菜单通过 IPC 由主进程弹出
 */
export function PetSprite({ config, reloadKey }: PetSpriteProps) {
  const { currentFrameSrc, currentFrame, totalFrames } = useAnimPlayer(config, reloadKey)
  const isDragging = useRef(false)

  const displayWidth = config.frameWidth * config.scale
  const displayHeight = config.frameHeight * config.scale

  // 通知主进程调整窗口尺寸
  useEffect(() => {
    window.petAPI.resizeWindow(displayWidth, displayHeight)
  }, [displayWidth, displayHeight])

  // --- 左键拖动 ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    window.petAPI.dragStart({ screenX: e.screenX, screenY: e.screenY })
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    window.petAPI.dragMove({ screenX: e.screenX, screenY: e.screenY })
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    isDragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    window.petAPI.dragEnd()
  }, [])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    isDragging.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    window.petAPI.dragEnd()
  }, [])

  // --- 右键菜单 ---
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.petAPI.showContextMenu()
  }, [])

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
      style={{
        width: displayWidth,
        height: displayHeight,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        border: 'none',
        boxShadow: 'none',
        backgroundColor: 'transparent',
      }}
    >
      {currentFrameSrc && (
        <img
          src={currentFrameSrc}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            WebkitUserDrag: 'none',
          }}
        />
      )}
    </div>
  )
}
