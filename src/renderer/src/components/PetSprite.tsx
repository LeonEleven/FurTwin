import { useEffect, useCallback, useRef, useState } from 'react'
import { useAnimPlayer } from '../hooks/useAnimPlayer'
import type { AnimConfig } from '../../../shared/types'

interface PetSpriteProps {
  config: AnimConfig
  reloadKey?: number
}

export function PetSprite({ config, reloadKey }: PetSpriteProps) {
  const { currentFrameSrc, currentFrame, totalFrames, isPlaying, pause, resume } = useAnimPlayer(config, reloadKey)
  const isDragging = useRef(false)
  const [repaintKey, setRepaintKey] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Unified effectiveScale
  const effectiveScale = config.displayScale ?? config.scale
  const displayWidth = Math.round(config.frameWidth * effectiveScale)
  const displayHeight = Math.round(config.frameHeight * effectiveScale)

  // DOM diagnostic log
  useEffect(() => {
    const timer = setTimeout(() => {
      const wrapper = wrapperRef.current
      const img = imgRef.current
      if (!wrapper || !img) return

      const wRect = wrapper.getBoundingClientRect()
      const iRect = img.getBoundingClientRect()
      const wStyle = getComputedStyle(wrapper)
      const iStyle = getComputedStyle(img)

      console.log(`[pet-dom] window=${window.innerWidth}x${window.innerHeight}`)
      console.log(`[pet-dom] wrapperRect=${Math.round(wRect.width)}x${Math.round(wRect.height)} pos=${Math.round(wRect.left)},${Math.round(wRect.top)}`)
      console.log(`[pet-dom] imgRect=${Math.round(iRect.width)}x${Math.round(iRect.height)} pos=${Math.round(iRect.left)},${Math.round(iRect.top)}`)
      console.log(`[pet-dom] imgNatural=${img.naturalWidth}x${img.naturalHeight}`)
      console.log(`[pet-dom] wrapperStyle display=${wStyle.display} width=${wStyle.width} height=${wStyle.height} transform=${wStyle.transform}`)
      console.log(`[pet-dom] imgStyle display=${iStyle.display} width=${iStyle.width} height=${iStyle.height} objectFit=${iStyle.objectFit} transform=${iStyle.transform}`)
      console.log(`[pet-dom] effectiveScale=${effectiveScale} displaySize=${displayWidth}x${displayHeight} frame=${config.frameWidth}x${config.frameHeight}`)
    }, 300)
    return () => clearTimeout(timer)
  }, [effectiveScale, displayWidth, displayHeight, config.frameWidth, config.frameHeight, currentFrameSrc])

  // Resize window
  useEffect(() => {
    console.log(`[pet] resizeWindow: ${displayWidth}x${displayHeight}`)
    window.petAPI.resizeWindow(displayWidth, displayHeight)
  }, [displayWidth, displayHeight])

  // Compute per-frame shapes
  useEffect(() => {
    if (!config) return
    console.log(`[pet] precomputing shape: ${config.framesDir} effectiveScale=${effectiveScale}`)
    const timer = setTimeout(() => {
      window.petAPI.computePetShape({
        framesDir: config.framesDir,
        framePattern: config.framePattern,
        frameCount: config.frameCount,
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        effectiveScale,
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [config, reloadKey, effectiveScale])

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

  // Detect non-loop animation playback complete
  useEffect(() => {
    if (!isPlaying && !config.loop) {
      console.log('[pet] non-loop animation finished, notifying main process')
      window.petAPI.notifyPlaybackComplete()
    }
  }, [isPlaying, config.loop])

  // --- drag ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    pause()
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
    resume()
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
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: displayWidth,
        height: displayHeight,
        overflow: 'hidden',
        cursor: 'grab',
        margin: 0,
        padding: 0,
        outline: 'none',
        border: 'none',
        boxShadow: 'none',
        background: 'transparent',
        display: 'block',
      }}
    >
      {imgSrc && (
        <img
          ref={imgRef}
          src={imgSrc}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            display: 'block',
            width: displayWidth,
            height: displayHeight,
            objectFit: 'fill',
            maxWidth: 'none',
            maxHeight: 'none',
            margin: 0,
            padding: 0,
            pointerEvents: 'none',
            WebkitUserDrag: 'none',
          }}
        />
      )}
    </div>
  )
}
