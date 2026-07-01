import { useState, useEffect, useRef, useCallback } from 'react'

type Status = 'idle' | 'processing' | 'success' | 'error'

interface GeneratedAsset {
  id: string; path: string; name: string; sourceVideo: string;
  createdAt: string; frameCount: number; frameWidth: number;
  frameHeight: number; format: string; modifiedAt: number; displayScale: number;
  isActive?: boolean
  actionType: string; loop: boolean; isDefault: boolean;
  includeInRandom: boolean; interruptible: boolean; fpsOverride: number | null;
  autoPlayRepeatCount: number
  sourceWidth: number | null; sourceHeight: number | null;
  trimBox: { x: number; y: number; w: number; h: number } | null
  anchorOffsetX: number; anchorOffsetY: number
  triggerOnClick: boolean
}

interface ExtractResult {
  outputDir: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  trimWidth: number
  trimHeight: number
  actionId?: string
}

export function App() {
  const [videoPath, setVideoPath] = useState('')
  const [fps, setFps] = useState(12)
  const [similarity, setSimilarity] = useState(0.30)
  const [blend, setBlend] = useState(0.05)
  const [despill, setDespill] = useState(0.95)
  const [format, setFormat] = useState<'png' | 'webp'>('png')
  const [maskPreset, setMaskPreset] = useState(false)
  const [maskRegion, setMaskRegion] = useState('')
  const [crop, setCrop] = useState('')
  const [centerCrop, setCenterCrop] = useState('')
  const [trimAlpha, setTrimAlpha] = useState(true)
  const [trimPadding, setTrimPadding] = useState(16)
  const [trimThreshold, setTrimThreshold] = useState(48)

  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [logs, setLogs] = useState('')
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)
  const [pendingExtract, setPendingExtract] = useState<boolean>(false)
  const [previewApplied, setPreviewApplied] = useState<boolean>(false)
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [autoBehaviorEnabled, setAutoBehaviorEnabled] = useState(true)
  const [behaviorParams, setBehaviorParams] = useState<{
    firstDelaySec: number | string
    minIntervalSec: number | string
    maxIntervalSec: number | string
    manualPauseSec: number | string
  }>({
    firstDelaySec: 30, minIntervalSec: 60, maxIntervalSec: 120, manualPauseSec: 120,
  })
  const [showBehaviorParams, setShowBehaviorParams] = useState(true)
  const [stealthMode, setStealthMode] = useState(false)
  const [autoPlayingName, setAutoPlayingName] = useState<string | null>(null)
  const [expandingAnchorId, setExpandingAnchorId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'actions' | 'get-video' | 'extract' | 'behavior'>('actions')

  // 提示词生成器 state
  const [promptOptions, setPromptOptions] = useState({
    ratio: '16:9', duration: '5', fixedCamera: true,
    firstFrameRef: true, loopFrames: true, moderateMotion: true, centerAnimal: true,
    avoidWatermarkCorner: true,
  })
  const [presetCategory, setPresetCategory] = useState<string>('idle')
  const [presetAction, setPresetAction] = useState<string>('stand')
  const [customActionText, setCustomActionText] = useState<string>('')
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [promptGenerated, setPromptGenerated] = useState<boolean>(false)
  const [promptEditMode, setPromptEditMode] = useState<boolean>(false)
  const [promptManualMode, setPromptManualMode] = useState<boolean>(false)
  const [promptOutOfSync, setPromptOutOfSync] = useState<boolean>(false)
  const [editedPrompt, setEditedPrompt] = useState<string>('')
  const [customActionError, setCustomActionError] = useState<boolean>(false)
  const customActionRef = useRef<HTMLTextAreaElement>(null)

  const logRef = useRef<HTMLDivElement>(null)

  const refreshAssets = useCallback(async () => {
    try {
      const list = await window.controlAPI.listGeneratedAssets()
      setAssets(list)
    } catch {}
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  useEffect(() => {
    refreshAssets()
  }, [refreshAssets, status])

  useEffect(() => {
    const offLog = window.controlAPI.onExtractLog((log) => setLogs((prev) => prev + log))
    const offDone = window.controlAPI.onExtractDone((result) => { setStatus('success'); setExtractResult(result); setPendingExtract(true) })
    const offErr = window.controlAPI.onExtractError((err) => { setStatus('error'); setErrorMsg(err.message) })
    return () => { offLog(); offDone(); offErr() }
  }, [])

  // Listen for active asset changes from right-click menu or restore demo
  useEffect(() => {
    const off = window.controlAPI.onActiveAssetChanged(() => {
      console.log('[control] ACTIVE_ASSET_CHANGED received, refreshing assets')
      refreshAssets()
    })
    return off
  }, [refreshAssets])

  // Listen for auto-behavior state changes
  useEffect(() => {
    const off = window.controlAPI.onAutoBehaviorChanged((enabled) => {
      console.log(`[control] auto-behavior changed: ${enabled}`)
      setAutoBehaviorEnabled(enabled)
    })
    return off
  }, [])

  // Listen for auto-playing state (runtime indicator)
  useEffect(() => {
    const off = window.controlAPI.onAutoPlayingChanged((name) => {
      setAutoPlayingName(name)
    })
    return off
  }, [])

  // Listen for stealth mode state changes
  useEffect(() => {
    const off = window.petAPI.onStealthModeChanged((enabled) => {
      setStealthMode(enabled)
    })
    return off
  }, [])

  // Read initial auto-behavior state + params from main process (userData config)
  useEffect(() => {
    window.controlAPI.getBehaviorState().then(({ enabled, params }) => {
      setAutoBehaviorEnabled(enabled)
      setBehaviorParams(params)
    }).catch(() => {})
  }, [])

  const handleSelectVideo = useCallback(async () => {
    const path = await window.controlAPI.selectVideo()
    if (path) { setVideoPath(path); setLogs(''); setStatus('idle'); setErrorMsg(''); setExtractResult(null) }
  }, [])

  const handleExtract = useCallback(async () => {
    if (!videoPath || status === 'processing') return
    // P3C-1: If there's a pending extract, discard it first
    if (pendingExtract && extractResult?.actionId) {
      await window.controlAPI.discardExtract(extractResult.actionId)
    }
    setLogs(''); setStatus('processing'); setErrorMsg(''); setExtractResult(null); setPendingExtract(false); setPreviewApplied(false)
    window.controlAPI.extractFrames({
      input: videoPath, output: '', fps, similarity, blend, despill, format,
      trimAlpha, trimThreshold, trimPadding,
      maskPreset: maskPreset ? 'doubao-free' : undefined,
      maskRegion: maskRegion || undefined,
      crop: crop || undefined,
      centerCrop: centerCrop || undefined,
    })
  }, [videoPath, fps, similarity, blend, despill, format, trimAlpha, trimThreshold, trimPadding, maskPreset, maskRegion, crop, centerCrop, status, pendingExtract, extractResult])

  const handleApplyPreview = useCallback(() => {
    if (!extractResult) return
    if (extractResult.trimWidth > 800 || extractResult.trimHeight > 600) {
      if (!confirm(`裁剪后画布仍然较大（${extractResult.trimWidth}x${extractResult.trimHeight}），是否应用？`)) return
    }
    // P3C-1: pending preview uses temporary mode (no local.config.json write)
    window.controlAPI.applyToPreview(extractResult.outputDir, 0.5, pendingExtract)
    setPreviewApplied(true)
  }, [extractResult, pendingExtract])

  const handleRestoreDemo = useCallback(() => {
    window.controlAPI.restoreDemo()
    setTimeout(() => refreshAssets(), 300)
  }, [refreshAssets])

  const handleOpenOutputDir = useCallback(async () => {
    if (!extractResult?.outputDir) return
    const res = await window.controlAPI.openPath(extractResult.outputDir)
    if (!res.ok) console.warn('[renderer] openPath failed:', res.error)
  }, [extractResult])

  // P3C-1: 重置提取表单到初始状态
  const resetExtractForm = useCallback(() => {
    setVideoPath(''); setLogs(''); setStatus('idle'); setErrorMsg('')
    setExtractResult(null); setPendingExtract(false); setPreviewApplied(false)
    setMaskPreset(false); setMaskRegion(''); setCrop(''); setCenterCrop('')
  }, [])

  // P3C-1: 确认提取结果加入动作库
  const handleConfirmExtract = useCallback(async () => {
    if (!extractResult?.actionId) return
    const res = await window.controlAPI.confirmExtract(extractResult.actionId)
    if (res.ok) {
      if (previewApplied) window.controlAPI.cancelPreview()
      setPreviewApplied(false)
      resetExtractForm()
      refreshAssets()
      setActiveTab('actions')
    } else {
      alert(`确认失败：${res.error}`)
    }
  }, [extractResult, refreshAssets, resetExtractForm, previewApplied])

  // P3C-1: 丢弃提取结果
  const handleDiscardExtract = useCallback(async () => {
    if (!extractResult?.actionId) return
    const res = await window.controlAPI.discardExtract(extractResult.actionId)
    if (res.ok) {
      if (previewApplied) window.controlAPI.cancelPreview()
      setPreviewApplied(false)
      resetExtractForm()
    } else {
      alert(`丢弃失败：${res.error}`)
    }
  }, [extractResult, resetExtractForm, previewApplied])

  // P3C-1: 重新提取（丢弃当前 pending 结果，但保留视频路径和参数）
  const handleReExtract = useCallback(async () => {
    if (extractResult?.actionId) {
      await window.controlAPI.discardExtract(extractResult.actionId)
    }
    if (previewApplied) window.controlAPI.cancelPreview()
    setPreviewApplied(false)
    setLogs(''); setStatus('idle'); setErrorMsg('')
    setExtractResult(null); setPendingExtract(false)
  }, [extractResult, previewApplied])

  const handleApplyAsset = useCallback((asset: GeneratedAsset) => {
    // Save current UI displayScale to metadata before switching
    // This ensures the latest value from the input box is persisted,
    // not a stale value from a previous metadata read
    window.controlAPI.saveAssetDisplayScale(asset.path, asset.displayScale)
    window.controlAPI.switchToAsset(asset.path)
    // Delay refresh to let local.config.json be written
    setTimeout(() => refreshAssets(), 300)
  }, [refreshAssets])

  const handleOpenAssetDir = useCallback(async (asset: GeneratedAsset) => {
    const res = await window.controlAPI.openPath(asset.path)
    if (!res.ok) console.warn('[renderer] openPath failed:', res.error)
  }, [])

  const handleDisplayScaleChange = useCallback((assetId: string, value: string) => {
    const num = parseFloat(value)
    if (!Number.isFinite(num) || num <= 0) return
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, displayScale: num } : a))
  }, [])

  const handleSaveDisplayScale = useCallback((asset: GeneratedAsset) => {
    window.controlAPI.saveAssetDisplayScale(asset.path, asset.displayScale)
  }, [])

  const handleStartRename = useCallback((asset: GeneratedAsset) => {
    setRenamingId(asset.id)
    setRenameValue(asset.name)
  }, [])

  const handleConfirmRename = useCallback((asset: GeneratedAsset) => {
    const name = renameValue.trim() || 'unnamed'
    window.controlAPI.renameAsset(asset.path, name)
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, name } : a))
    setRenamingId(null)
    setRenameValue('')
  }, [renameValue])

  const handleCancelRename = useCallback(() => { setRenamingId(null); setRenameValue('') }, [])

  const handleDeleteAsset = useCallback(async (asset: GeneratedAsset) => {
    let msg = `确认删除「${asset.name}」？\n\n将删除：${asset.path}\n无法恢复。`
    if (asset.isActive) msg += '\n\n⚠ 该动作正在使用，删除后将自动切换到其他可用动作。'
    if (asset.isDefault) msg += '\n\n⚠ 该动作是默认动作，删除后将清除默认设置。'
    if (!confirm(msg)) return
    const res = await window.controlAPI.deleteAsset(asset.path)
    if (res.ok) { refreshAssets() } else { alert(`删除失败：${res.error}`) }
  }, [refreshAssets])

  const handleExportAsset = useCallback(async (asset: GeneratedAsset) => {
    const res = await window.controlAPI.exportAssetPackage(asset.path, asset.name)
    if (res.ok) {
      alert(`导出成功：${res.path}`)
    } else if (res.error !== '用户取消') {
      alert(`导出失败：${res.error}`)
    }
  }, [])

  const handleImportAsset = useCallback(async () => {
    const res = await window.controlAPI.importAssetPackage()
    if (res.error === '用户取消') return

    if (res.batch && res.results) {
      // Batch import: show summary
      const failed = res.results.filter(r => !r.ok)
      if (failed.length === 0) {
        alert(`全部导入成功：共 ${res.succeeded} 个动作包`)
      } else {
        const failLines = failed.map(r => `• ${r.file}：${r.error}`).join('\n')
        alert(`导入完成\n成功 ${res.succeeded} 个，失败 ${res.failed} 个\n\n失败详情：\n${failLines}`)
      }
      if (res.succeeded && res.succeeded > 0) refreshAssets()
    } else if (res.ok) {
      // Single import success
      refreshAssets()
    } else {
      alert(`导入失败：${res.error}`)
    }
  }, [refreshAssets])

  const ACTION_TYPES: Array<{ value: string; label: string; color: string }> = [
    { value: 'idle', label: '待机', color: '#4caf50' },
    { value: 'play', label: '玩耍', color: '#ff9800' },
    { value: 'sleep', label: '睡觉', color: '#7c4dff' },
    { value: 'eat', label: '进食', color: '#e91e63' },
    { value: 'clean', label: '清洁', color: '#00bcd4' },
    { value: 'interact', label: '互动', color: '#2196f3' },
    { value: 'custom', label: '自定义', color: '#9e9e9e' },
  ]

  // 提示词生成器：动作预设
  const PRESET_CATEGORIES: Record<string, { label: string; presets: { id: string; label: string; desc: string }[] }> = {
    idle: { label: '待机', presets: [
      { id: 'stand', label: '原地站立', desc: '原地站立不动，微微摇尾巴，偶尔眨眼' },
      { id: 'breathe', label: '轻微呼吸', desc: '安静站立，身体随呼吸轻微起伏' },
      { id: 'blink', label: '眨眼看镜头', desc: '站立不动，偶尔眨眼看向镜头' },
      { id: 'look', label: '左右看', desc: '站立不动，头部缓慢左右转动张望' },
    ]},
    play: { label: '玩耍', presets: [
      { id: 'jump', label: '开心小跳', desc: '开心地小幅度原地跳跃' },
      { id: 'turn', label: '转身', desc: '原地转一圈' },
      { id: 'wag', label: '轻快摆尾', desc: '站立，尾巴轻快地左右摆动' },
    ]},
    sleep: { label: '睡觉', presets: [
      { id: 'doze', label: '趴下打瞌睡', desc: '趴在地上，头低垂，偶尔抬一下头' },
      { id: 'sleep', label: '闭眼呼吸', desc: '趴在地上闭眼睡觉，身体随呼吸起伏' },
      { id: 'stretch', label: '伸懒腰', desc: '趴着然后伸一个懒腰，前爪向前伸展' },
    ]},
    eat: { label: '进食', presets: [
      { id: 'eat', label: '低头进食', desc: '低头吃东西，嘴巴咀嚼' },
      { id: 'lick', label: '舔嘴', desc: '吃完后舔舔嘴巴' },
      { id: 'chew', label: '咀嚼', desc: '嘴巴持续咀嚼食物' },
    ]},
    clean: { label: '清洁', presets: [
      { id: 'paw', label: '舔爪爪', desc: '坐着抬起前爪舔舐' },
      { id: 'belly', label: '舔肚子', desc: '侧躺舔肚子上的毛' },
      { id: 'groom', label: '梳理毛发', desc: '用舌头梳理身体上的毛发' },
    ]},
    interact: { label: '互动', presets: [
      { id: 'tilt', label: '歪头看镜头', desc: '歪头好奇地看着镜头' },
      { id: 'look-up', label: '抬头看镜头', desc: '抬头望向镜头' },
      { id: 'approach', label: '靠近镜头卖萌', desc: '慢慢走向镜头，凑近看' },
    ]},
    custom: { label: '自定义', presets: [] },
  }

  // 提示词生成器：构建提示词文本（纯函数，供生成和自动同步共用）
  const buildPromptText = useCallback(() => {
    const actionDesc = presetCategory === 'custom'
      ? customActionText.trim()
      : (PRESET_CATEGORIES[presetCategory]?.presets.find(p => p.id === presetAction)?.desc || '')
    if (!actionDesc) return ''

    const parts: string[] = []
    parts.push('请参考图片中的动物，生成一段视频。')
    parts.push('严格参考图片中的动物，动物的外形、毛色、花纹、体型、尾巴、耳朵要和图片尽量一致。')
    parts.push('使用纯绿色绿幕背景，画面中没有阴影、影子、反光和光影变化。')
    parts.push('画面中只有这只动物，不要出现人、道具、文字、字幕、Logo 或其他物体。')
    parts.push('动物全身包括尾巴始终完整可见，不要裁切身体。')

    const camera: string[] = []
    if (promptOptions.fixedCamera) camera.push('固定机位，不要拉近或推远')
    if (promptOptions.firstFrameRef) camera.push('首帧姿态参考图片')
    if (promptOptions.loopFrames) camera.push('首帧和尾帧尽量相同，方便循环播放')
    if (promptOptions.moderateMotion) camera.push('动作幅度适中')
    if (promptOptions.centerAnimal) camera.push('动物保持在画面中央')
    if (camera.length > 0) parts.push(camera.join('，') + '。')

    parts.push(`视频比例 ${promptOptions.ratio}，时长 ${promptOptions.duration} 秒。`)
    parts.push('静音，写实风格，不要动漫风格。')
    if (promptOptions.avoidWatermarkCorner) {
      parts.push('动作主要发生在画面中央区域，不要让头部、尾巴、四肢或关键动作靠近左上角和右下角。')
    }
    parts.push(`动作描述：${actionDesc}。`)

    return parts.join('\n')
  }, [promptOptions, presetCategory, presetAction, customActionText])

  // 提示词生成器：自动同步（仅在自动生成模式下生效，手动编辑和手动模式下不运行）
  useEffect(() => {
    if (!promptGenerated || promptEditMode || promptManualMode) return
    const text = buildPromptText()
    if (text) {
      setGeneratedPrompt(text)
      setCopySuccess(false)
      setPromptOutOfSync(false)
    }
  }, [promptGenerated, promptEditMode, promptManualMode, buildPromptText])

  // 提示词生成器：手动模式下参数变化时标记为不同步
  useEffect(() => {
    if (!promptManualMode || promptEditMode) return
    setPromptOutOfSync(true)
  }, [promptOptions, presetCategory, presetAction, customActionText])

  // 提示词生成器：切换类型时自动选中第一个预设
  const handlePresetCategoryChange = useCallback((category: string) => {
    setPresetCategory(category)
    const presets = PRESET_CATEGORIES[category]?.presets
    setPresetAction(presets && presets.length > 0 ? presets[0].id : '')
    setCustomActionError(false)
  }, [])

  // 提示词生成器：生成提示词（首次点击或重新生成）
  const handleGeneratePrompt = useCallback(() => {
    // 自定义动作校验
    if (presetCategory === 'custom' && !customActionText.trim()) {
      setCustomActionError(true)
      customActionRef.current?.focus()
      return
    }
    setCustomActionError(false)
    const text = buildPromptText()
    if (!text) return
    setGeneratedPrompt(text)
    setPromptGenerated(true)
    setPromptEditMode(false)
    setPromptManualMode(false)
    setPromptOutOfSync(false)
    setCopySuccess(false)
  }, [buildPromptText, presetCategory, customActionText])

  // 提示词生成器：进入编辑模式
  const handleEnterEditMode = useCallback(() => {
    setEditedPrompt(generatedPrompt)
    setPromptEditMode(true)
    setPromptManualMode(true)
  }, [generatedPrompt])

  // 提示词生成器：退出编辑模式（完成编辑）
  const handleFinishEdit = useCallback(() => {
    setGeneratedPrompt(editedPrompt)
    setPromptEditMode(false)
    // 保持 promptManualMode = true，防止 useEffect 自动覆盖
  }, [editedPrompt])

  // 提示词生成器：重新生成覆盖
  const handleRegenerate = useCallback(() => {
    if (presetCategory === 'custom' && !customActionText.trim()) {
      setCustomActionError(true)
      customActionRef.current?.focus()
      return
    }
    setCustomActionError(false)
    const text = buildPromptText()
    if (!text) return
    setGeneratedPrompt(text)
    setPromptEditMode(false)
    setPromptManualMode(false)
    setPromptOutOfSync(false)
    setCopySuccess(false)
  }, [buildPromptText, presetCategory, customActionText])

  // 提示词生成器：复制到剪贴板
  const handleCopyPrompt = useCallback(async () => {
    const textToCopy = promptEditMode ? editedPrompt : generatedPrompt
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = textToCopy
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }, [promptEditMode, editedPrompt, generatedPrompt])

  const handleChangeActionType = useCallback((asset: GeneratedAsset, newType: string) => {
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, actionType: newType } : a))
    window.controlAPI.setAssetPlayback(asset.path, { actionType: newType })
  }, [])

  const handleToggleDefault = useCallback((asset: GeneratedAsset) => {
    window.controlAPI.setDefaultAsset(asset.path)
    if (asset.isDefault) {
      setAssets(prev => prev.map(a => ({ ...a, isDefault: false })))
    } else {
      setAssets(prev => prev.map(a => ({ ...a, isDefault: a.id === asset.id })))
    }
  }, [])

  const handleToggleLoop = useCallback((asset: GeneratedAsset) => {
    const newVal = !asset.loop
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, loop: newVal } : a))
    window.controlAPI.setAssetPlayback(asset.path, { loop: newVal })
    // If this is the currently active asset, also update local.config.json and notify pet
    if (asset.isActive) {
      window.controlAPI.updateActivePlayback({ loop: newVal })
    }
  }, [])

  const handleToggleRandom = useCallback((asset: GeneratedAsset) => {
    const newVal = !asset.includeInRandom
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, includeInRandom: newVal } : a))
    window.controlAPI.setAssetPlayback(asset.path, { includeInRandom: newVal })
  }, [])

  const handleToggleTriggerOnClick = useCallback((asset: GeneratedAsset) => {
    const newVal = !asset.triggerOnClick
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, triggerOnClick: newVal } : a))
    window.controlAPI.setAssetPlayback(asset.path, { triggerOnClick: newVal })
  }, [])

  const handleChangeRepeatCount = useCallback((asset: GeneratedAsset, value: string) => {
    const num = parseInt(value, 10)
    if (!Number.isFinite(num) || num < 1) return
    const clamped = Math.min(10, Math.max(1, num))
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, autoPlayRepeatCount: clamped } : a))
    window.controlAPI.setAssetPlayback(asset.path, { autoPlayRepeatCount: clamped })
  }, [])

  const handleRebuildAnchor = useCallback(async (asset: GeneratedAsset) => {
    const res = await window.controlAPI.rebuildAnchor(asset.path, asset.id)
    if (res.ok && res.rebuilt) {
      refreshAssets()
    } else if (res.ok && !res.rebuilt) {
      alert('无法重建：源视频不存在或已有对齐数据。')
    } else {
      alert(`重建失败：${res.error}`)
    }
  }, [refreshAssets])

  const handleToggleAutoBehavior = useCallback(() => {
    const newVal = !autoBehaviorEnabled
    setAutoBehaviorEnabled(newVal)
    window.controlAPI.toggleAutoBehavior(newVal)
  }, [autoBehaviorEnabled])

  // UI uses visual direction: positive X = right, positive Y = down
  // Internal anchorOffset is opposite: positive moves anchor right → window moves left → pet moves left
  // Conversion: internal = -visual

  const handleAnchorOffsetChange = useCallback((asset: GeneratedAsset, axis: 'x' | 'y', visualValue: string) => {
    const num = parseFloat(visualValue)
    if (!Number.isFinite(num)) return
    // No artificial clamp — only prevent NaN/Infinity
    // Store as internal value (negated)
    const internalVal = -num
    if (axis === 'x') {
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, anchorOffsetX: internalVal } : a))
    } else {
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, anchorOffsetY: internalVal } : a))
    }
  }, [])

  const handleSaveAnchorOffset = useCallback((asset: GeneratedAsset) => {
    window.controlAPI.setAssetPlayback(asset.path, { anchorOffsetX: asset.anchorOffsetX, anchorOffsetY: asset.anchorOffsetY })
  }, [])

  const handleNudgeAnchor = useCallback((asset: GeneratedAsset, axis: 'x' | 'y', visualDelta: number) => {
    // visualDelta is in user direction (+5 = right/down)
    // Internal delta is opposite
    const internalDelta = -visualDelta
    const current = axis === 'x' ? asset.anchorOffsetX : asset.anchorOffsetY
    // No artificial clamp — allow any valid number
    const newVal = current + internalDelta
    const updated = axis === 'x' ? { ...asset, anchorOffsetX: newVal } : { ...asset, anchorOffsetY: newVal }
    setAssets(prev => prev.map(a => a.id === asset.id ? updated : a))
    window.controlAPI.setAssetPlayback(asset.path, axis === 'x' ? { anchorOffsetX: newVal } : { anchorOffsetY: newVal })
  }, [])

  const handleResetAnchorOffset = useCallback((asset: GeneratedAsset) => {
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, anchorOffsetX: 0, anchorOffsetY: 0 } : a))
    window.controlAPI.setAssetPlayback(asset.path, { anchorOffsetX: 0, anchorOffsetY: 0 })
  }, [])

  const handleBehaviorParamChange = useCallback((key: string, value: string) => {
    // Allow empty string for editing (user deleting all digits)
    if (value === '' || value === '-') {
      setBehaviorParams(prev => ({ ...prev, [key]: value }))
      return
    }
    const num = parseInt(value, 10)
    if (!Number.isFinite(num) || num < 0) return
    setBehaviorParams(prev => {
      const updated = { ...prev, [key]: num }
      // Save immediately when value is a valid number
      const numericParams = {
        firstDelaySec: typeof updated.firstDelaySec === 'string' ? (parseInt(updated.firstDelaySec, 10) || 30) : updated.firstDelaySec,
        minIntervalSec: typeof updated.minIntervalSec === 'string' ? (parseInt(updated.minIntervalSec, 10) || 60) : updated.minIntervalSec,
        maxIntervalSec: typeof updated.maxIntervalSec === 'string' ? (parseInt(updated.maxIntervalSec, 10) || 120) : updated.maxIntervalSec,
        manualPauseSec: typeof updated.manualPauseSec === 'string' ? (parseInt(updated.manualPauseSec, 10) || 120) : updated.manualPauseSec,
      }
      if (numericParams.minIntervalSec > numericParams.maxIntervalSec) {
        numericParams.maxIntervalSec = numericParams.minIntervalSec
      }
      window.controlAPI.saveBehaviorParams(numericParams)
      return updated
    })
  }, [])

  const handleSaveBehaviorParams = useCallback(() => {
    // Auto-correct: ensure min <= max
    const params = { ...behaviorParams }
    // Convert string values to numbers, use defaults for empty strings
    const numericParams = {
      firstDelaySec: typeof params.firstDelaySec === 'string' ? (parseInt(params.firstDelaySec, 10) || 30) : params.firstDelaySec,
      minIntervalSec: typeof params.minIntervalSec === 'string' ? (parseInt(params.minIntervalSec, 10) || 60) : params.minIntervalSec,
      maxIntervalSec: typeof params.maxIntervalSec === 'string' ? (parseInt(params.maxIntervalSec, 10) || 120) : params.maxIntervalSec,
      manualPauseSec: typeof params.manualPauseSec === 'string' ? (parseInt(params.manualPauseSec, 10) || 120) : params.manualPauseSec,
    }
    if (numericParams.minIntervalSec > numericParams.maxIntervalSec) {
      numericParams.maxIntervalSec = numericParams.minIntervalSec
    }
    // Update state with numeric values
    setBehaviorParams(numericParams)
    window.controlAPI.saveBehaviorParams(numericParams)
  }, [behaviorParams])

  // Check if there are any valid random candidates
  const hasRandomCandidates = assets.some(a => a.includeInRandom && a.actionType !== 'idle')

  // Type filter: counts and filtered list
  const typeCounts = ACTION_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t.value] = assets.filter(a => a.actionType === t.value).length
    return acc
  }, {})
  const filteredAssets = typeFilter === 'all' ? assets : assets.filter(a => a.actionType === typeFilter)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #ccc',
    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#555',
  }

  return (
    <div style={{ padding: '16px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: '100%', margin: '0 auto', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>FurTwin</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>FFmpeg 绿幕视频 → 透明序列帧</p>

      {/* Tab 导航 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '2px solid #e0e0e0', paddingBottom: 0 }}>
        {([
          { key: 'actions' as const, label: '动作库' },
          { key: 'behavior' as const, label: '行为与模式' },
          { key: 'get-video' as const, label: '获取视频' },
          { key: 'extract' as const, label: '提取视频' },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', fontSize: 13, cursor: 'pointer', border: 'none', borderRadius: '6px 6px 0 0',
              backgroundColor: activeTab === tab.key ? '#f5f5f5' : 'transparent',
              color: activeTab === tab.key ? '#333' : '#888',
              fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom: activeTab === tab.key ? '2px solid #f5f5f5' : '2px solid transparent',
              marginBottom: -2,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {activeTab === 'get-video' && (
        <div style={{ fontSize: 13, maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
          {/* 固定硬性要求 */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#fff7e6', borderRadius: 6, border: '1px solid #ffe0b2' }}>
            <p style={{ fontWeight: 600, margin: '0 0 6px', fontSize: 12, color: '#e65100' }}>固定硬性要求（每次生成自动包含）</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#666', fontSize: 12, lineHeight: 1.8 }}>
              <li>严格参考图片中的动物</li>
              <li>动物外形、毛色、花纹、体型、尾巴、耳朵尽量一致</li>
              <li>纯绿色绿幕背景</li>
              <li>没有阴影、影子、反光和光影变化</li>
              <li>画面中只有这只动物</li>
              <li>全身包括尾巴始终完整可见，不要裁切身体</li>
              <li>不要出现人、道具、文字、字幕、Logo 或其他物体</li>
              <li>静音</li>
              <li>写实风格，不要动漫风格</li>
            </ul>
          </div>

          {/* 可选参数 */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7' }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px', fontSize: 12 }}>可选参数</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                title="生成视频的画面比例，16:9 横屏，9:16 竖屏，1:1 正方形">
                <span>比例</span>
                <select value={promptOptions.ratio} onChange={e => setPromptOptions(p => ({ ...p, ratio: e.target.value }))}
                  style={{ padding: '2px 4px', fontSize: 12, border: '1px solid #ccc', borderRadius: 3 }}>
                  <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                title="生成视频的时长。5 秒适合单个动作，10 秒适合组合动作或慢动作">
                <span>时长</span>
                <select value={promptOptions.duration} onChange={e => setPromptOptions(p => ({ ...p, duration: e.target.value }))}
                  style={{ padding: '2px 4px', fontSize: 12, border: '1px solid #ccc', borderRadius: 3 }}>
                  <option value="5">5 秒</option><option value="10">10 秒</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {([
                { key: 'fixedCamera' as const, label: '固定机位', tip: '镜头保持不动，不拉近推远，避免画面抖动' },
                { key: 'firstFrameRef' as const, label: '首帧参考图片', tip: '视频第一帧尽量匹配参考图片的姿态' },
                { key: 'loopFrames' as const, label: '首尾帧循环', tip: '视频首帧和尾帧尽量相同，方便无缝循环播放' },
                { key: 'moderateMotion' as const, label: '动作幅度适中', tip: '动作幅度不要过大，适合桌面宠物日常使用' },
                { key: 'centerAnimal' as const, label: '动物居中', tip: '动物保持在画面中央，不要偏移' },
                { key: 'avoidWatermarkCorner' as const, label: '避开水印角落', tip: '豆包免费版可能在左上角和右下角添加水印。勾选后提示词会要求动物关键动作避开这些区域' },
              ]).map(opt => (
                <label key={opt.key} title={opt.tip} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 12, color: '#666' }}>
                  <input type="checkbox" checked={promptOptions[opt.key]}
                    onChange={e => setPromptOptions(p => ({ ...p, [opt.key]: e.target.checked }))}
                    style={{ cursor: 'pointer' }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* 动作预设 */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0' }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px', fontSize: 12 }}>动作描述</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <select value={presetCategory} onChange={e => handlePresetCategoryChange(e.target.value)}
                title="选择动作类型。不同类型对应不同的预设动作描述。选择「自定义」可自己填写。"
                style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #ccc', borderRadius: 3 }}>
                {Object.entries(PRESET_CATEGORIES).map(([key, cat]) => (
                  <option key={key} value={key}>{cat.label}</option>
                ))}
              </select>
              {presetCategory !== 'custom' && PRESET_CATEGORIES[presetCategory]?.presets.length > 0 && (
                <select value={presetAction} onChange={e => setPresetAction(e.target.value)}
                  title="选择具体动作预设。预设描述会自动填入提示词。"
                  style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #ccc', borderRadius: 3 }}>
                  {PRESET_CATEGORIES[presetCategory].presets.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              )}
            </div>
            {presetCategory === 'custom' && (
              <>
                <textarea ref={customActionRef} value={customActionText}
                  onChange={e => { setCustomActionText(e.target.value); if (customActionError) setCustomActionError(false) }}
                  placeholder="请描述你想要的动作，例如：趴在地上，头枕着前爪，尾巴缓慢左右摆动"
                  title="自定义动作描述。尽量详细描述动物的动作、姿态和运动方式，豆包会根据描述生成视频。"
                  style={{ width: '100%', height: 60, padding: 6, fontSize: 12, border: customActionError ? '2px solid #f44336' : '1px solid #ccc', borderRadius: 3, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                {customActionError && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f44336' }}>
                    请先填写你想让宠物做什么动作
                  </p>
                )}
              </>
            )}
            {presetCategory !== 'custom' && presetAction && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888' }}>
                预设描述：{PRESET_CATEGORIES[presetCategory]?.presets.find(p => p.id === presetAction)?.desc}
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#e65100' }}>
              ⚠ 豆包免费版可能在左上角和右下角添加水印。建议让宠物动作主要发生在画面中央，避免头部、尾巴或关键动作靠近左上角/右下角。
            </p>
          </div>

          {/* 生成按钮 */}
          <div style={{ marginBottom: 16 }}>
            <button onClick={handleGeneratePrompt}
              title="根据上方参数生成完整提示词。生成后修改参数会自动更新提示词。"
              style={{ padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#4a90d9', color: '#fff', border: 'none', borderRadius: 4 }}>
              生成提示词
            </button>
          </div>

          {/* 生成结果 */}
          {generatedPrompt && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#e8f5e9', borderRadius: 6, border: '1px solid #c8e6c9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontWeight: 600, margin: 0, fontSize: 12 }}>
                  生成结果
                  {promptEditMode && <span style={{ color: '#e65100', fontWeight: 400 }}>（编辑模式：参数变化不会自动覆盖）</span>}
                  {!promptEditMode && promptManualMode && !promptOutOfSync && <span style={{ color: '#888', fontWeight: 400 }}>（手动编辑版本）</span>}
                  {!promptEditMode && promptManualMode && promptOutOfSync && <span style={{ color: '#e65100', fontWeight: 400 }}>（手动编辑版本，参数已变化）</span>}
                </p>
                <div style={{ display: 'flex', gap: 4 }}>
                  {promptEditMode ? (
                    <>
                      <button onClick={handleFinishEdit}
                        title="保存当前编辑内容，退出编辑模式"
                        style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 3 }}>
                        完成编辑
                      </button>
                      <button onClick={handleRegenerate}
                        title="用当前参数重新生成提示词，覆盖编辑内容"
                        style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: 3 }}>
                        重新生成覆盖
                      </button>
                    </>
                  ) : (
                    <>
                      {promptManualMode && (
                        <button onClick={handleRegenerate}
                          title="用当前参数重新生成提示词，替换手动编辑版本"
                          style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: 3 }}>
                          重新生成覆盖
                        </button>
                      )}
                      <button onClick={handleEnterEditMode}
                        title="手动编辑提示词内容。编辑模式下参数变化不会自动覆盖。"
                        style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#e0e0e0', color: '#333', border: 'none', borderRadius: 3 }}>
                        编辑提示词
                      </button>
                      <button onClick={handleCopyPrompt}
                        title="将提示词复制到剪贴板，然后去豆包网页端/App 粘贴使用"
                        style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: copySuccess ? '#4caf50' : '#e0e0e0', color: copySuccess ? '#fff' : '#333', border: 'none', borderRadius: 3 }}>
                        {copySuccess ? '✓ 已复制' : '复制提示词'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {!promptEditMode && promptManualMode && promptOutOfSync && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#e65100' }}>
                  ⚠ 上方参数已变化，当前提示词可能未同步。如需同步，请点击「重新生成覆盖」。
                </p>
              )}
              {!promptEditMode && promptManualMode && !promptOutOfSync && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#888' }}>
                  当前提示词包含手动修改，不会被参数变化自动覆盖。如需恢复自动生成，请点击「重新生成覆盖」。
                </p>
              )}
              {promptEditMode ? (
                <textarea value={editedPrompt} onChange={e => setEditedPrompt(e.target.value)}
                  style={{ width: '100%', height: 200, padding: 8, fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 4, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', whiteSpace: 'pre-wrap' }} />
              ) : (
                <pre style={{ margin: 0, padding: 8, backgroundColor: '#fff', borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', border: '1px solid #e0e0e0', maxWidth: '100%', boxSizing: 'border-box' }}>
                  {generatedPrompt}
                </pre>
              )}
            </div>
          )}

          {/* 使用说明 */}
          <div style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0', color: '#888', fontSize: 12 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>使用流程</p>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>选择动作和参数，点击「生成提示词」</li>
              <li>点击「复制提示词」复制到剪贴板</li>
              <li>打开豆包网页端或 App，上传参考图片并粘贴提示词</li>
              <li>生成视频后保存到本地</li>
              <li>回到「提取视频」Tab，选择视频进行提取</li>
            </ol>
          </div>
        </div>
      )}

      {activeTab === 'extract' && (<div style={{ maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* 输入视频 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle} title="选择要处理的绿幕视频。建议使用固定机位、纯绿幕、主体完整的视频。">输入视频</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={videoPath} readOnly placeholder="点击选择绿幕视频..."
            title="选择要处理的绿幕视频。建议使用固定机位、纯绿幕、主体完整的视频。"
            style={{ ...inputStyle, flex: 1, backgroundColor: '#f5f5f5' }} />
          <button onClick={handleSelectVideo} style={{ padding: '6px 16px', cursor: 'pointer' }}
            title="选择要处理的绿幕视频。建议使用固定机位、纯绿幕、主体完整的视频。">选择</button>
        </div>
      </div>

      {/* 扣绿参数 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={labelStyle} title="导出序列帧的帧率。数值越高动画越流畅，但文件更多、资源更大。">FPS</label><input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))} style={inputStyle} title="导出序列帧的帧率。数值越高动画越流畅，但文件更多、资源更大。" /></div>
        <div><label style={labelStyle} title="绿幕颜色匹配范围。数值越大，去除的绿色范围越宽；过大可能误删主体边缘。">Similarity</label><input type="number" step="0.01" value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} style={inputStyle} title="绿幕颜色匹配范围。数值越大，去除的绿色范围越宽；过大可能误删主体边缘。" /></div>
        <div><label style={labelStyle} title="绿幕边缘混合强度。数值越大边缘越柔和；过大可能导致主体边缘发虚。">Blend</label><input type="number" step="0.01" value={blend} onChange={(e) => setBlend(Number(e.target.value))} style={inputStyle} title="绿幕边缘混合强度。数值越大边缘越柔和；过大可能导致主体边缘发虚。" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={labelStyle} title="绿色溢色去除强度。用于减少主体边缘残留的绿色反光。">Despill</label><input type="number" step="0.01" value={despill} onChange={(e) => setDespill(Number(e.target.value))} style={inputStyle} title="绿色溢色去除强度。用于减少主体边缘残留的绿色反光。" /></div>
        <div><label style={labelStyle} title="选择导出的透明帧格式。PNG 兼容性好，适合当前流程。">输出格式</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'webp')} style={inputStyle} title="选择导出的透明帧格式。PNG 兼容性好，适合当前流程。">
            <option value="png">PNG</option><option value="webp">WebP</option>
          </select></div>
      </div>

      {/* 透明边界裁剪 */}
      <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7' }}>
        <label style={{ ...labelStyle, marginBottom: 8 }}>透明边界自动裁剪</label>
        <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}
          title="根据透明区域自动裁剪帧尺寸，减少空白区域，并生成更紧凑的动作资源。">
          <input type="checkbox" checked={trimAlpha} onChange={(e) => setTrimAlpha(e.target.checked)} />
          启用 trim-alpha
        </label>
        {trimAlpha && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={labelStyle} title="判断像素是否属于主体的 alpha 阈值。数值越高，越容易裁掉半透明边缘。">阈值</label><input type="number" value={trimThreshold} onChange={(e) => setTrimThreshold(Number(e.target.value))} style={inputStyle} title="判断像素是否属于主体的 alpha 阈值。数值越高，越容易裁掉半透明边缘。" /></div>
            <div><label style={labelStyle} title="裁剪后额外保留的透明边距，避免主体边缘被切掉。">边距</label><input type="number" value={trimPadding} onChange={(e) => setTrimPadding(Number(e.target.value))} style={inputStyle} title="裁剪后额外保留的透明边距，避免主体边缘被切掉。" /></div>
          </div>
        )}
      </div>

      {/* 水印遮罩 */}
      <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 6, border: '1px solid #eee' }}>
        <label style={{ ...labelStyle, marginBottom: 8 }}>水印规避（可选）</label>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            title="尝试遮罩豆包免费生成视频中的常见水印区域。若水印与主体重叠，可能影响主体。">
            <input type="checkbox" checked={maskPreset} onChange={(e) => setMaskPreset(e.target.checked)} />
            豆包免费版水印遮罩（doubao-free）
          </label>
        </div>
        <div>
          <label style={labelStyle} title="手动填写要遮罩的区域，格式为 x:y:w:h，多个区域用逗号分隔。">自定义遮罩区域</label>
          <input value={maskRegion} onChange={(e) => setMaskRegion(e.target.value)} placeholder="x:y:w,h，逗号分隔" style={inputStyle}
            title="手动填写要遮罩的区域，格式为 x:y:w:h，多个区域用逗号分隔。" />
        </div>
      </div>

      {/* 高级裁剪 */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer', marginBottom: 8 }}
          title="手动裁剪视频画面。可用于去除边缘水印或无用区域，但可能裁掉宠物主体，请谨慎使用。">高级：手动裁剪（Crop）⚠ 可能裁掉宠物主体</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <div><label style={labelStyle} title="裁剪格式为 w:h:x:y，对应宽高和左上角坐标。">手动裁剪 (w:h:x:y)</label><input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="1024:576:128:72" style={inputStyle} title="裁剪格式为 w:h:x:y，对应宽高和左上角坐标。" /></div>
          <div><label style={labelStyle} title="从画面中心裁剪指定尺寸，格式为 w:h。">中心裁剪 (w:h)</label><input value={centerCrop} onChange={(e) => setCenterCrop(e.target.value)} placeholder="1024:576" style={inputStyle} title="从画面中心裁剪指定尺寸，格式为 w:h。" /></div>
        </div>
      </details>

      {/* 提取按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleExtract} disabled={!videoPath || status === 'processing'}
          title="使用当前参数调用 FFmpeg，从绿幕视频生成透明序列帧动作资源。"
          style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: !videoPath || status === 'processing' ? 'not-allowed' : 'pointer', backgroundColor: status === 'processing' ? '#ccc' : '#4a90d9', color: '#fff', border: 'none', borderRadius: 6 }}>
          {status === 'processing' ? '处理中...' : '开始提取'}
        </button>
        {status === 'success' && <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 600 }}>✅ 提取完成</span>}
        {status === 'error' && <span style={{ color: '#f44336', fontSize: 13 }}>❌ {errorMsg}</span>}
      </div>

      {/* 日志 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle} title="显示 FFmpeg 处理过程、帧数、裁剪尺寸、错误信息等。">输出日志</label>
        <div ref={logRef} style={{ height: 160, overflow: 'auto', backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'Consolas, "Courier New", monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: '100%', boxSizing: 'border-box' }}>
          {logs || '等待执行...'}
        </div>
      </div>

      {status === 'success' && extractResult && (
        <div style={{ padding: 12, backgroundColor: pendingExtract ? '#fff3e0' : '#e8f5e9', borderRadius: 6, border: pendingExtract ? '1px solid #ffe0b2' : '1px solid #c8e6c9', fontSize: 13, marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>{pendingExtract ? '提取结果（待确认）' : '提取结果'}</p>
          <p>帧数: {extractResult.frameCount}</p>
          {extractResult.frameWidth > 0 && <p>原始尺寸: {extractResult.frameWidth}x{extractResult.frameHeight}</p>}
          {extractResult.trimWidth > 0 && <p>裁剪后: {extractResult.trimWidth}x{extractResult.trimHeight}</p>}
          {extractResult.trimWidth > 800 && <p style={{ color: '#e65100' }}>⚠ 画布仍偏大</p>}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleApplyPreview} title="临时预览提取结果，不正式加入动作库" style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#2196f3', color: '#fff', border: 'none', borderRadius: 4 }}>预览结果</button>
            {pendingExtract && (
              <>
                <button onClick={handleConfirmExtract} title="将提取结果正式加入动作库" style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 4 }}>确认加入动作库</button>
                <button onClick={handleReExtract} title="清空当前结果，重新选择视频提取" style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: 4 }}>重新提取</button>
                <button onClick={handleDiscardExtract} title="丢弃提取结果并删除临时文件" style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: 4 }}>丢弃结果</button>
              </>
            )}
            <button onClick={handleOpenOutputDir} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#607d8b', color: '#fff', border: 'none', borderRadius: 4 }}>打开输出目录</button>
          </div>
        </div>
      )}
      </div>
      )}

      {activeTab === 'behavior' && (
      <div style={{ maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
            title="开启后，桌宠会在待机动作之间自动播放已勾选的动作。关闭后只保持用户手动选择的动作。">
            <input type="checkbox" checked={autoBehaviorEnabled} onChange={handleToggleAutoBehavior} style={{ cursor: 'pointer' }} />
            <span style={{ fontWeight: 600 }}>自动行为</span>
            <span style={{ color: '#888', fontSize: 11 }}>({autoBehaviorEnabled ? '开启' : '关闭'} — 自动播放已勾选的动作)</span>
          </label>
          {autoBehaviorEnabled && autoPlayingName && (
            <span style={{ fontSize: 11, color: '#4a90d9', fontWeight: 600 }}>正在播放：{autoPlayingName}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); setShowBehaviorParams(!showBehaviorParams) }}
            style={{ fontSize: 11, color: '#4a90d9', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 6px' }}
            title="展开或收起自动行为的时间参数。">
            {showBehaviorParams ? '收起设置 ▲' : '时间设置 ▼'}
          </button>
        </div>
        {showBehaviorParams && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }} title="启动或开启自动行为后，等待多少秒才开始第一次自动播放。">首次等待(秒)</label>
              <input type="number" min="0" value={behaviorParams.firstDelaySec}
                onChange={(e) => handleBehaviorParamChange('firstDelaySec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                title="启动或开启自动行为后，等待多少秒才开始第一次自动播放。"
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }} title="两次自动播放之间的最短等待时间。">最小间隔(秒)</label>
              <input type="number" min="0" value={behaviorParams.minIntervalSec}
                onChange={(e) => handleBehaviorParamChange('minIntervalSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                title="两次自动播放之间的最短等待时间。"
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }} title="两次自动播放之间的最长等待时间。系统会在最小和最大间隔之间随机选择。">最大间隔(秒)</label>
              <input type="number" min="0" value={behaviorParams.maxIntervalSec}
                onChange={(e) => handleBehaviorParamChange('maxIntervalSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                title="两次自动播放之间的最长等待时间。系统会在最小和最大间隔之间随机选择。"
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }} title="手动切换动作或预览提取结果后，自动行为会暂停这段时间，避免马上被随机动作打断。">手动暂停(秒)</label>
              <input type="number" min="0" value={behaviorParams.manualPauseSec}
                onChange={(e) => handleBehaviorParamChange('manualPauseSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                title="手动切换动作或预览提取结果后，自动行为会暂停这段时间，避免马上被随机动作打断。"
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
          </div>
        )}
        {autoBehaviorEnabled && !hasRandomCandidates && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#e65100' }}>
            当前没有可自动播放的动作。请至少设置一个非待机类型，并勾选「参与自动行为」。
          </p>
        )}
        {behaviorParams.minIntervalSec < 5 && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#e65100' }}>
            间隔过短可能导致待机动作来不及完整播放。
          </p>
        )}
      </div>

      <div style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7', fontSize: 13 }}>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          title="开启后，鼠标移动到宠物区域时，宠物会暂时隐藏，并允许点击后方窗口。">
          <input type="checkbox" checked={stealthMode}
            onChange={() => window.petAPI.toggleStealthMode()}
            style={{ cursor: 'pointer' }} />
          <span style={{ fontWeight: 600 }}>隐身模式</span>
          <span style={{ color: '#888', fontSize: 11 }}>({stealthMode ? '开启' : '关闭'})</span>
        </label>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888' }}>
          开启后，鼠标移动到宠物区域时，宠物会暂时隐藏，并允许点击后方窗口。
        </p>
      </div>
      </div>
      )}

      {activeTab === 'actions' && (
      <div style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 13, marginTop: 12, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontWeight: 600, margin: 0 }}>动作库</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleImportAsset} style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3 }} title="从 zip 动作包导入动作资源。">导入动作包</button>
            <button onClick={refreshAssets} style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3 }} title="重新扫描动作库。">刷新</button>
          </div>
        </div>
        {assets.length === 0 && (
          <div style={{ color: '#888', fontSize: 12, padding: '12px 0', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px' }}>当前没有动作。你可以导入动作包，也可以先到「获取视频」生成提示词并制作视频，再到「提取视频」导入生成动作。</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setActiveTab('get-video')}
                style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3 }}>
                去获取视频
              </button>
              <button onClick={() => setActiveTab('extract')}
                style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3 }}>
                去提取视频
              </button>
            </div>
          </div>
        )}
        {assets.length > 0 && (<>
          {/* 类型筛选 tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 8, flexWrap: 'wrap' }}>
            {[{ value: 'all', label: '全部' }, ...ACTION_TYPES.map(t => ({ value: t.value, label: t.label }))].map(tab => {
              const isActive = typeFilter === tab.value
              const count = tab.value === 'all' ? assets.length : (typeCounts[tab.value] || 0)
              return (
                <button key={tab.value} onClick={() => setTypeFilter(tab.value)}
                  style={{
                    padding: '3px 8px', fontSize: 11, cursor: 'pointer', border: 'none', borderRadius: 3,
                    backgroundColor: isActive ? '#4a90d9' : '#e0e0e0',
                    color: isActive ? '#fff' : '#666',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                  {tab.label} {count}
                </button>
              )
            })}
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {filteredAssets.length === 0 && (
              <p style={{ margin: 0, color: '#888', fontSize: 12, padding: '12px 0', textAlign: 'center' }}>
                当前类型下暂无动作。
              </p>
            )}
            {filteredAssets.map((asset) => {
              const date = new Date(asset.modifiedAt)
              const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
              const isRenaming = renamingId === asset.id
              const typeInfo = ACTION_TYPES.find(t => t.value === asset.actionType) || ACTION_TYPES.find(t => t.value === 'custom')!

              const btnStyle = (bg: string): React.CSSProperties => ({
                padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                backgroundColor: bg, color: '#fff', border: 'none', borderRadius: 3,
              })

              return (
                <div key={asset.id} style={{
                  padding: '8px 6px', marginBottom: 6,
                  borderBottom: '1px solid #e0e0e0',
                  backgroundColor: asset.isActive ? '#e8f5e9' : '#fff',
                  borderRadius: 4,
                }}>
                  {/* 第一行：名称/重命名 + 类型下拉 + 状态标记 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    {isRenaming ? (
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(asset); if (e.key === 'Escape') handleCancelRename() }}
                        autoFocus style={{ padding: '2px 6px', fontSize: 13, fontWeight: 600, border: '1px solid #4a90d9', borderRadius: 3, width: 140 }} />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{asset.name}</span>
                    )}
                    <select
                      value={asset.actionType}
                      onChange={(e) => handleChangeActionType(asset, e.target.value)}
                      title="设置动作类型，用于动作库整理和后续行为逻辑。"
                      style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, border: '1px solid #ccc', backgroundColor: typeInfo.color, color: '#fff', cursor: 'pointer', outline: 'none' }}
                    >
                      {ACTION_TYPES.map(t => (
                        <option key={t.value} value={t.value} style={{ backgroundColor: '#fff', color: '#333' }}>{t.label}</option>
                      ))}
                    </select>
                    {asset.isActive && <span style={{ fontSize: 10, color: '#4caf50', fontWeight: 600 }}>● 当前使用</span>}
                    {asset.isDefault && <span style={{ fontSize: 10, color: '#ff9800', fontWeight: 600 }}>★ 默认</span>}
                    {!asset.sourceWidth && <span style={{ fontSize: 10, color: '#999' }} title="缺少对齐元数据，切换时可能位移">⚠ 未校准</span>}
                  </div>

                  {/* 第二行：状态/元信息 */}
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    {timeStr} · {asset.frameCount}帧 · {asset.frameWidth}×{asset.frameHeight} · {asset.format}
                  </div>

                  {/* 第三行：设置项（重命名时禁用交互） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6, pointerEvents: isRenaming ? 'none' : 'auto', opacity: isRenaming ? 0.5 : 1 }}>
                    <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}
                      title="调整该动作在桌面上的显示大小。">
                      <span>缩放</span>
                      <input type="number" step="0.1" min="0.1" max="2" value={asset.displayScale}
                        onChange={(e) => handleDisplayScaleChange(asset.id, e.target.value)}
                        onBlur={() => handleSaveDisplayScale(asset)}
                        style={{ width: 48, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3 }} />
                    </label>
                    <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                      title="手动点击「应用」使用此动作时，是否持续循环播放。">
                      <input type="checkbox" checked={asset.loop}
                        onChange={() => handleToggleLoop(asset)}
                        style={{ cursor: 'pointer' }} />
                      手动循环
                    </label>
                    <span style={{ borderLeft: '1px solid #e0e0e0', height: 12, margin: '0 2px' }} />
                    <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                      title="左键点击桌宠时，此动作可作为互动动作候选。拖动和右键不会触发。">
                      <input type="checkbox" checked={asset.triggerOnClick}
                        onChange={() => handleToggleTriggerOnClick(asset)}
                        style={{ cursor: 'pointer' }} />
                      点击触发
                    </label>
                    <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                      title="开启自动行为时，此动作可参与随机播放。待机动作通常不参与。">
                      <input type="checkbox" checked={asset.includeInRandom}
                        onChange={() => handleToggleRandom(asset)}
                        style={{ cursor: 'pointer' }} />
                      参与自动行为
                    </label>
                    <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                      title="轮数仅在参与自动行为或点击触发时生效。">
                        <span>轮数</span>
                        <input type="number" min="1" max="10" value={asset.autoPlayRepeatCount}
                          disabled={!asset.includeInRandom && !asset.triggerOnClick}
                          onChange={(e) => handleChangeRepeatCount(asset, e.target.value)}
                          style={{ width: 36, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3, opacity: (!asset.includeInRandom && !asset.triggerOnClick) ? 0.4 : 1 }} />
                    </label>
                  </div>

                  {/* 第四行：操作按钮（重命名时切换为确定/取消） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {isRenaming ? (
                      <>
                        <button onClick={() => handleConfirmRename(asset)} style={btnStyle('#4caf50')}>确定</button>
                        <button onClick={handleCancelRename} style={btnStyle('#999')}>取消</button>
                      </>
                    ) : (
                      <>
                        {/* 主操作 */}
                        <button onClick={() => handleApplyAsset(asset)} style={btnStyle('#4caf50')} title="将此动作设为当前使用动作，并立即播放。">应用</button>
                        <span style={{ borderLeft: '1px solid #e0e0e0', height: 14, margin: '0 2px' }} />
                        {/* 常用操作 */}
                        <button onClick={() => handleOpenAssetDir(asset)} style={btnStyle('#1677ff')} title="打开此动作资源所在文件夹。">打开</button>
                        <button onClick={() => handleExportAsset(asset)} style={btnStyle('#1677ff')} title="将此动作打包为 zip，便于备份或迁移。">导出</button>
                        <button onClick={() => handleStartRename(asset)} style={btnStyle('#1677ff')} title="修改此动作在动作库中的显示名称。">重命名</button>
                        <span style={{ borderLeft: '1px solid #e0e0e0', height: 14, margin: '0 2px' }} />
                        {/* 危险操作 */}
                        <button onClick={() => handleDeleteAsset(asset)} style={btnStyle('#f44336')} title="删除此动作资源。若正在使用，将自动切换到其他可用动作。">删除</button>
                        <span style={{ borderLeft: '1px solid #e0e0e0', height: 14, margin: '0 2px' }} />
                        {/* 低频操作 */}
                        <button onClick={() => handleToggleDefault(asset)}
                          style={btnStyle(asset.isDefault ? '#ff9800' : '#bbb')}
                          title={asset.isDefault ? '取消此动作的默认状态。不会自动指定新的默认动作。' : '将此动作设为默认 fallback 动作。当前动作失效或需要默认动作时会优先使用。'}>
                          {asset.isDefault ? '取消默认' : '设为默认'}
                        </button>
                        {!asset.sourceWidth && (
                          <button onClick={() => handleRebuildAnchor(asset)}
                            style={btnStyle('#bbb')} title="从源视频重新计算对齐数据。用于旧资源或对齐信息缺失的动作。">
                            重建对齐
                          </button>
                        )}
                        {asset.sourceWidth && (
                          <button onClick={() => setExpandingAnchorId(expandingAnchorId === asset.id ? null : asset.id)}
                            style={btnStyle(expandingAnchorId === asset.id ? '#78909c' : '#bbb')}
                            title="微调该动作的显示位置，用于修正不同动作切换时的视觉偏移。">
                            {expandingAnchorId === asset.id ? '收起微调 ▲' : '对齐微调 ▼'}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* 对齐微调（折叠） */}
                  {expandingAnchorId === asset.id && asset.sourceWidth && (
                    <div style={{ marginTop: 6, padding: '6px 8px', backgroundColor: '#f5f5f5', borderRadius: 4, fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: '#666', fontWeight: 600 }}>水平修正</span>
                        <button onClick={() => handleNudgeAnchor(asset, 'x', -5)} style={{ ...btnStyle('#bbb'), padding: '1px 6px' }}>←</button>
                        <input type="number" step="1" value={-asset.anchorOffsetX}
                          onChange={(e) => handleAnchorOffsetChange(asset, 'x', e.target.value)}
                          onBlur={() => handleSaveAnchorOffset(asset)}
                          style={{ width: 52, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3, textAlign: 'center' }} />
                        <button onClick={() => handleNudgeAnchor(asset, 'x', 5)} style={{ ...btnStyle('#bbb'), padding: '1px 6px' }}>→</button>
                        <span style={{ borderLeft: '1px solid #ddd', height: 14, margin: '0 2px' }} />
                        <span style={{ color: '#666', fontWeight: 600 }}>垂直修正</span>
                        <button onClick={() => handleNudgeAnchor(asset, 'y', -5)} style={{ ...btnStyle('#bbb'), padding: '1px 6px' }}>↑</button>
                        <input type="number" step="1" value={-asset.anchorOffsetY}
                          onChange={(e) => handleAnchorOffsetChange(asset, 'y', e.target.value)}
                          onBlur={() => handleSaveAnchorOffset(asset)}
                          style={{ width: 52, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3, textAlign: 'center' }} />
                        <button onClick={() => handleNudgeAnchor(asset, 'y', 5)} style={{ ...btnStyle('#bbb'), padding: '1px 6px' }}>↓</button>
                        <span style={{ borderLeft: '1px solid #ddd', height: 14, margin: '0 2px' }} />
                        <button onClick={() => handleResetAnchorOffset(asset)} style={{ ...btnStyle('#ff7043'), padding: '2px 8px' }} title="将水平和垂直微调恢复为 0。">重置微调</button>
                      </div>
                      <p style={{ margin: '4px 0 0', color: '#999' }}>
                        正数向右/向下移动宠物画面，负数向左/向上。修改当前动作时即时生效。
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>)}
      </div>
      )}

      </div>

    </div>
  )
}
