import { useEffect, useCallback, useRef, useState } from 'react'
import { useAnimPlayer } from '../hooks/useAnimPlayer'
import type { AnimConfig } from '../../../shared/types'

interface PetSpriteProps {
  config: AnimConfig
  reloadKey?: number
}

export function PetSprite({ config, reloadKey }: PetSpriteProps) {
  const { currentFrameSrc, currentFrame, totalFrames, pause, resume } = useAnimPlayer(config, reloadKey)
  const isDragging = useRef(false)
  const [repaintKey, setRepaintKey] = useState(0)

  const displayWidth = config.frameWidth * config.scale
  const displayHeight = config.frameHeight * config.scale

  // resize window
  useEffect(() => {
    console.log(`[pet] resizeWindow: ${displayWidth}x${displayHeight}`)
    window.petAPI.resizeWindow(displayWidth, displayHeight)
  }, [displayWidth, displayHeight])

  // compute per-frame shapes after config changes
  useEffect(() => {
    if (!config) return
    console.log(`[pet] precomputing per-frame shape: ${config.framesDir}`)
    const timer = setTimeout(() => {
      window.petAPI.computePetShape({
        framesDir: config.framesDir,
        framePattern: config.framePattern,
        frameCount: config.frameCount,
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        scale: config.scale,
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [config, reloadKey])

  // Apply per-frame shape when frame changes (skip during drag)
  useEffect(() => {
    if (isDragging.current) return
    window.petAPI.applyFrameShape(currentFrame)
  }, [currentFrame])

  // FORCE_REPAINT
  useEffect(() => {
    return window.petAPI.onForceRepaint(() => setRepaintKey((k) => k + 1))
  }, [])

  // PET_SURFACE_REFRESH
  useEffect(() => {
    return window.petAPI.onSurfaceRefresh(() => setRepaintKey((k) => k + 1))
  }, [])

  // --- drag: pause animation during drag ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    pause() // freeze animation frame
    e.currentTarget.setPointerCapture(e.pointerId)
    window.petAPI.dragStart({ screenX: e.screenX, screenY: e.screenY })
  }, [pause])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    window.petAPI.dragMove({ screenX: e.screenX, screenY: e.screenY })
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    isDragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    window.petAPI.dragEnd()
    resume() // resume animation
    // Re-apply current frame shape after resume
    window.petAPI.applyFrameShape(currentFrame)
  }, [resume, currentFrame])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    isDragging.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    window.petAPI.dragEnd()
    resume()
  }, [resume])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.petAPI.showContextMenu()
  }, [])

  const imgSrc = currentFrameSrc
    ? `${currentFrameSrc}&r=${repaintKey}`
    : null

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
      {imgSrc && (
        <img
          src={imgSrc}
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
