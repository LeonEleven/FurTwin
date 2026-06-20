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

interface AnimConfig {
  name: string
  label: string
  framesDir: string
  fps: number
  scale: number
  displayScale?: number
  loop: boolean
  frameCount: number
  frameWidth: number
  frameHeight: number
  framePattern: string
  anchorX?: number
  anchorY?: number
}

interface PetShapePayload {
  framesDir: string
  framePattern: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  effectiveScale: number
}

type ActionType = 'idle' | 'play' | 'sleep' | 'eat' | 'clean' | 'custom'

interface GeneratedAssetInfo {
  id: string
  path: string
  name: string
  sourceVideo: string
  createdAt: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  format: string
  modifiedAt: number
  displayScale: number
  isActive?: boolean
  actionType: ActionType
  loop: boolean
  isDefault: boolean
  includeInRandom: boolean
  interruptible: boolean
  fpsOverride: number | null
  autoPlayRepeatCount: number
  sourceWidth: number | null
  sourceHeight: number | null
  trimBox: { x: number; y: number; w: number; h: number } | null
  anchorOffsetX: number
  anchorOffsetY: number
  triggerOnClick: boolean
}

declare global {
  interface Window {
    petAPI: {
      dragStart: (payload: { screenX: number; screenY: number }) => void
      dragMove: (payload: { screenX: number; screenY: number }) => void
      dragEnd: () => void
      showContextMenu: () => void
      onMenuAction: (callback: (action: string) => void) => () => void
      resizeWindow: (width: number, height: number, oldAnchorX?: number, oldAnchorY?: number, newAnchorX?: number, newAnchorY?: number) => void
      reloadAnim: () => void
      onReloadAnim: (callback: () => void) => () => void
      onForceRepaint: (callback: () => void) => () => void
      onSurfaceRefresh: (callback: () => void) => () => void
      computePetShape: (payload: PetShapePayload) => void
      clearPetShape: () => void
      applyFrameShape: (frameIndex: number) => void
      onPetShapeUpdated: (callback: (info: { rects: number; activeBlocks: number; totalBlocks: number }) => void) => () => void
      onSwitchAnimRuntime: (callback: (config: AnimConfig) => void) => () => void
      notifyPlaybackComplete: () => void
      triggerClickInteraction: () => void
    }
    controlAPI: {
      selectVideo: () => Promise<string | null>
      extractFrames: (options: ExtractOptions) => void
      onExtractLog: (callback: (log: string) => void) => () => void
      onExtractDone: (callback: (result: { outputDir: string; frameCount: number; frameWidth: number; frameHeight: number; trimWidth: number; trimHeight: number }) => void) => () => void
      onExtractError: (callback: (err: { code: number; message: string }) => void) => () => void
      applyToPreview: (outputDir: string, displayScale?: number) => void
      restoreDemo: () => void
      openPath: (path: string) => Promise<{ ok: boolean; error?: string }>
      listGeneratedAssets: () => Promise<GeneratedAssetInfo[]>
      saveAssetDisplayScale: (path: string, displayScale: number) => void
      renameAsset: (path: string, name: string) => void
      deleteAsset: (path: string) => Promise<{ ok: boolean; error?: string }>
      switchToAsset: (assetPath: string) => void
      setAssetPlayback: (path: string, fields: {
        actionType?: string; loop?: boolean;
        includeInRandom?: boolean; interruptible?: boolean; fpsOverride?: number | null;
        autoPlayRepeatCount?: number; anchorOffsetX?: number; anchorOffsetY?: number;
        triggerOnClick?: boolean
      }) => void
      setDefaultAsset: (path: string) => void
      rebuildAnchor: (path: string, dirName: string) => Promise<{ ok: boolean; rebuilt?: boolean; error?: string }>
      exportAssetPackage: (path: string, name: string) => Promise<{ ok: boolean; path?: string; error?: string }>
      importAssetPackage: () => Promise<{ ok: boolean; dirName?: string; name?: string; error?: string }>
      updateActivePlayback: (fields: { loop?: boolean; fps?: number }) => void
      onActiveAssetChanged: (callback: () => void) => () => void
      toggleAutoBehavior: (enabled: boolean) => void
      onAutoBehaviorChanged: (callback: (enabled: boolean) => void) => () => void
      saveBehaviorParams: (params: { firstDelaySec?: number; minIntervalSec?: number; maxIntervalSec?: number; manualPauseSec?: number }) => void
      onAutoPlayingChanged: (callback: (name: string | null) => void) => () => void
    }
  }
}
