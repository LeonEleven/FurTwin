export {}

interface ExtractOptions {
  input: string
  output: string
  fps: number
  similarity: number
  blend: number
  despill: number
  format: string
  trimAlpha?: boolean
  trimThreshold?: number
  trimPadding?: number
  maskPreset?: string
  maskRegion?: string
  crop?: string
  centerCrop?: string
}

interface PetShapePayload {
  framesDir: string
  framePattern: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  scale: number
}

declare global {
  interface Window {
    petAPI: {
      dragStart: (payload: { screenX: number; screenY: number }) => void
      dragMove: (payload: { screenX: number; screenY: number }) => void
      dragEnd: () => void
      showContextMenu: () => void
      onMenuAction: (callback: (action: string) => void) => () => void
      resizeWindow: (width: number, height: number) => void
      reloadAnim: () => void
      onReloadAnim: (callback: () => void) => () => void
      onForceRepaint: (callback: () => void) => () => void
      onSurfaceRefresh: (callback: () => void) => () => void
      computePetShape: (payload: PetShapePayload) => void
      clearPetShape: () => void
      applyFrameShape: (frameIndex: number) => void
      onPetShapeUpdated: (callback: (info: { rects: number; activeBlocks: number; totalBlocks: number }) => void) => () => void
    }
    controlAPI: {
      selectVideo: () => Promise<string | null>
      extractFrames: (options: ExtractOptions) => void
      onExtractLog: (callback: (log: string) => void) => () => void
      onExtractDone: (callback: (result: { outputDir: string; frameCount: number; frameWidth: number; frameHeight: number; trimWidth: number; trimHeight: number }) => void) => () => void
      onExtractError: (callback: (err: { code: number; message: string }) => void) => () => void
      applyToPreview: (outputDir: string) => void
      restoreDemo: () => void
    }
  }
}
