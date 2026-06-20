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
}

interface ExtractResult {
  outputDir: string
  frameCount: number
  frameWidth: number
  frameHeight: number
  trimWidth: number
  trimHeight: number
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
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [autoBehaviorEnabled, setAutoBehaviorEnabled] = useState(true)
  const [behaviorParams, setBehaviorParams] = useState({
    firstDelaySec: 30, minIntervalSec: 60, maxIntervalSec: 120, manualPauseSec: 120,
  })
  const [showBehaviorParams, setShowBehaviorParams] = useState(false)
  const [autoPlayingName, setAutoPlayingName] = useState<string | null>(null)
  const [expandingAnchorId, setExpandingAnchorId] = useState<string | null>(null)

  const logRef = useRef<HTMLDivElement>(null)

  const refreshAssets = useCallback(async () => {
    try {
      const list = await window.controlAPI.listGeneratedAssets()
      setAssets(list.slice(0, 20))
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
    const offDone = window.controlAPI.onExtractDone((result) => { setStatus('success'); setExtractResult(result) })
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

  // Read initial auto-behavior state + params from local.config.json
  useEffect(() => {
    fetch('./assets/actions/idle/local.config.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then((config: any) => {
        if (typeof config.autoBehaviorEnabled === 'boolean') {
          setAutoBehaviorEnabled(config.autoBehaviorEnabled)
        }
        setBehaviorParams(prev => ({
          firstDelaySec: Number.isFinite(config.autoBehaviorFirstDelaySec) ? config.autoBehaviorFirstDelaySec : prev.firstDelaySec,
          minIntervalSec: Number.isFinite(config.autoBehaviorMinIntervalSec) ? config.autoBehaviorMinIntervalSec : prev.minIntervalSec,
          maxIntervalSec: Number.isFinite(config.autoBehaviorMaxIntervalSec) ? config.autoBehaviorMaxIntervalSec : prev.maxIntervalSec,
          manualPauseSec: Number.isFinite(config.autoBehaviorManualPauseSec) ? config.autoBehaviorManualPauseSec : prev.manualPauseSec,
        }))
      })
      .catch(() => {})
  }, [])

  const handleSelectVideo = useCallback(async () => {
    const path = await window.controlAPI.selectVideo()
    if (path) { setVideoPath(path); setLogs(''); setStatus('idle'); setErrorMsg(''); setExtractResult(null) }
  }, [])

  const handleExtract = useCallback(() => {
    if (!videoPath || status === 'processing') return
    setLogs(''); setStatus('processing'); setErrorMsg(''); setExtractResult(null)
    window.controlAPI.extractFrames({
      input: videoPath, output: '', fps, similarity, blend, despill, format,
      trimAlpha, trimThreshold, trimPadding,
      maskPreset: maskPreset ? 'doubao-free' : undefined,
      maskRegion: maskRegion || undefined,
      crop: crop || undefined,
      centerCrop: centerCrop || undefined,
    })
  }, [videoPath, fps, similarity, blend, despill, format, trimAlpha, trimThreshold, trimPadding, maskPreset, maskRegion, crop, centerCrop, status])

  const handleApplyPreview = useCallback(() => {
    if (!extractResult) return
    if (extractResult.trimWidth > 800 || extractResult.trimHeight > 600) {
      if (!confirm(`裁剪后画布仍然较大（${extractResult.trimWidth}x${extractResult.trimHeight}），是否应用？`)) return
    }
    window.controlAPI.applyToPreview(extractResult.outputDir, 0.5)
  }, [extractResult])

  const handleRestoreDemo = useCallback(() => {
    window.controlAPI.restoreDemo()
    setTimeout(() => refreshAssets(), 300)
  }, [refreshAssets])

  const handleOpenOutputDir = useCallback(async () => {
    if (!extractResult?.outputDir) return
    const res = await window.controlAPI.openPath(extractResult.outputDir)
    if (!res.ok) console.warn('[renderer] openPath failed:', res.error)
  }, [extractResult])

  const handleApplyAsset = useCallback((asset: GeneratedAsset) => {
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
    if (!confirm(`确认删除「${asset.name}」？\n\n将删除：${asset.path}\n无法恢复。`)) return
    const res = await window.controlAPI.deleteAsset(asset.path)
    if (res.ok) { refreshAssets() } else { alert(`删除失败：${res.error}`) }
  }, [refreshAssets])

  const ACTION_TYPES: Array<{ value: string; label: string; color: string }> = [
    { value: 'idle', label: '待机', color: '#4caf50' },
    { value: 'play', label: '玩耍', color: '#ff9800' },
    { value: 'sleep', label: '睡觉', color: '#7c4dff' },
    { value: 'eat', label: '进食', color: '#e91e63' },
    { value: 'clean', label: '清洁', color: '#00bcd4' },
    { value: 'custom', label: '自定义', color: '#9e9e9e' },
  ]

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
    const clamped = Math.max(-200, Math.min(200, num))
    // Store as internal value (negated)
    const internalVal = -clamped
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
    const newVal = Math.max(-200, Math.min(200, current + internalDelta))
    const updated = axis === 'x' ? { ...asset, anchorOffsetX: newVal } : { ...asset, anchorOffsetY: newVal }
    setAssets(prev => prev.map(a => a.id === asset.id ? updated : a))
    window.controlAPI.setAssetPlayback(asset.path, axis === 'x' ? { anchorOffsetX: newVal } : { anchorOffsetY: newVal })
  }, [])

  const handleResetAnchorOffset = useCallback((asset: GeneratedAsset) => {
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, anchorOffsetX: 0, anchorOffsetY: 0 } : a))
    window.controlAPI.setAssetPlayback(asset.path, { anchorOffsetX: 0, anchorOffsetY: 0 })
  }, [])

  const handleBehaviorParamChange = useCallback((key: string, value: string) => {
    const num = parseInt(value, 10)
    if (!Number.isFinite(num) || num < 0) return
    setBehaviorParams(prev => ({ ...prev, [key]: num }))
  }, [])

  const handleSaveBehaviorParams = useCallback(() => {
    // Auto-correct: ensure min <= max
    const params = { ...behaviorParams }
    if (params.minIntervalSec > params.maxIntervalSec) {
      params.maxIntervalSec = params.minIntervalSec
      setBehaviorParams(params)
    }
    window.controlAPI.saveBehaviorParams(params)
  }, [behaviorParams])

  // Check if there are any valid random candidates
  const hasRandomCandidates = assets.some(a => a.includeInRandom && a.actionType !== 'idle')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #ccc',
    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#555',
  }

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>FurTwin</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>FFmpeg 绿幕视频 → 透明序列帧</p>

      {/* 输入视频 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>输入视频</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={videoPath} readOnly placeholder="点击选择绿幕视频..."
            style={{ ...inputStyle, flex: 1, backgroundColor: '#f5f5f5' }} />
          <button onClick={handleSelectVideo} style={{ padding: '6px 16px', cursor: 'pointer' }}>选择</button>
        </div>
      </div>

      {/* 扣绿参数 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={labelStyle}>FPS</label><input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))} style={inputStyle} /></div>
        <div><label style={labelStyle}>Similarity</label><input type="number" step="0.01" value={similarity} onChange={(e) => setSimilarity(Number(e.target.value))} style={inputStyle} /></div>
        <div><label style={labelStyle}>Blend</label><input type="number" step="0.01" value={blend} onChange={(e) => setBlend(Number(e.target.value))} style={inputStyle} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={labelStyle}>Despill</label><input type="number" step="0.01" value={despill} onChange={(e) => setDespill(Number(e.target.value))} style={inputStyle} /></div>
        <div><label style={labelStyle}>输出格式</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'webp')} style={inputStyle}>
            <option value="png">PNG</option><option value="webp">WebP</option>
          </select></div>
      </div>

      {/* 透明边界裁剪 */}
      <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7' }}>
        <label style={{ ...labelStyle, marginBottom: 8 }}>透明边界自动裁剪</label>
        <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <input type="checkbox" checked={trimAlpha} onChange={(e) => setTrimAlpha(e.target.checked)} />
          启用 trim-alpha
        </label>
        {trimAlpha && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={labelStyle}>阈值</label><input type="number" value={trimThreshold} onChange={(e) => setTrimThreshold(Number(e.target.value))} style={inputStyle} /></div>
            <div><label style={labelStyle}>边距</label><input type="number" value={trimPadding} onChange={(e) => setTrimPadding(Number(e.target.value))} style={inputStyle} /></div>
          </div>
        )}
      </div>

      {/* 水印遮罩 */}
      <div style={{ marginBottom: 12, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 6, border: '1px solid #eee' }}>
        <label style={{ ...labelStyle, marginBottom: 8 }}>水印规避（可选）</label>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={maskPreset} onChange={(e) => setMaskPreset(e.target.checked)} />
            豆包免费版水印遮罩（doubao-free）
          </label>
        </div>
        <div>
          <label style={labelStyle}>自定义遮罩区域</label>
          <input value={maskRegion} onChange={(e) => setMaskRegion(e.target.value)} placeholder="x:y:w,h，逗号分隔" style={inputStyle} />
        </div>
      </div>

      {/* 高级裁剪 */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer', marginBottom: 8 }}>高级：手动裁剪（Crop）⚠ 可能裁掉宠物主体</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <div><label style={labelStyle}>手动裁剪 (w:h:x:y)</label><input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="1024:576:128:72" style={inputStyle} /></div>
          <div><label style={labelStyle}>中心裁剪 (w:h)</label><input value={centerCrop} onChange={(e) => setCenterCrop(e.target.value)} placeholder="1024:576" style={inputStyle} /></div>
        </div>
      </details>

      {/* 提取按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleExtract} disabled={!videoPath || status === 'processing'}
          style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: !videoPath || status === 'processing' ? 'not-allowed' : 'pointer', backgroundColor: status === 'processing' ? '#ccc' : '#4a90d9', color: '#fff', border: 'none', borderRadius: 6 }}>
          {status === 'processing' ? '处理中...' : '开始提取'}
        </button>
        {status === 'success' && <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 600 }}>✅ 提取完成</span>}
        {status === 'error' && <span style={{ color: '#f44336', fontSize: 13 }}>❌ {errorMsg}</span>}
      </div>

      {/* 日志 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>输出日志</label>
        <div ref={logRef} style={{ height: 160, overflow: 'auto', backgroundColor: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'Consolas, "Courier New", monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {logs || '等待执行...'}
        </div>
      </div>

      {/* 提取结果 */}
      {status === 'success' && extractResult && (
        <div style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 6, border: '1px solid #c8e6c9', fontSize: 13, marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>提取结果</p>
          <p>帧数: {extractResult.frameCount}</p>
          {extractResult.frameWidth > 0 && <p>原始尺寸: {extractResult.frameWidth}x{extractResult.frameHeight}</p>}
          {extractResult.trimWidth > 0 && <p>裁剪后: {extractResult.trimWidth}x{extractResult.trimHeight}</p>}
          {extractResult.trimWidth > 800 && <p style={{ color: '#e65100' }}>⚠ 画布仍偏大</p>}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleApplyPreview} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 4 }}>应用到桌宠预览</button>
            <button onClick={handleRestoreDemo} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: 4 }}>恢复 Demo 预览</button>
            <button onClick={handleOpenOutputDir} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: '#607d8b', color: '#fff', border: 'none', borderRadius: 4 }}>打开输出目录</button>
          </div>
        </div>
      )}

      {/* 自动行为开关 */}
      <div style={{ marginTop: 12, padding: '8px 12px', backgroundColor: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e3f7', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <input type="checkbox" checked={autoBehaviorEnabled} onChange={handleToggleAutoBehavior} style={{ cursor: 'pointer' }} />
            <span style={{ fontWeight: 600 }}>自动行为</span>
            <span style={{ color: '#888', fontSize: 11 }}>({autoBehaviorEnabled ? '开启' : '关闭'} — 自动插播随机动作)</span>
          </label>
          {autoBehaviorEnabled && autoPlayingName && (
            <span style={{ fontSize: 11, color: '#4a90d9', fontWeight: 600 }}>正在播放：{autoPlayingName}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); setShowBehaviorParams(!showBehaviorParams) }}
            style={{ fontSize: 11, color: '#4a90d9', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 6px' }}>
            {showBehaviorParams ? '收起设置 ▲' : '时间设置 ▼'}
          </button>
        </div>
        {showBehaviorParams && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }}>首次等待(秒)</label>
              <input type="number" min="0" value={behaviorParams.firstDelaySec}
                onChange={(e) => handleBehaviorParamChange('firstDelaySec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }}>最小间隔(秒)</label>
              <input type="number" min="0" value={behaviorParams.minIntervalSec}
                onChange={(e) => handleBehaviorParamChange('minIntervalSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }}>最大间隔(秒)</label>
              <input type="number" min="0" value={behaviorParams.maxIntervalSec}
                onChange={(e) => handleBehaviorParamChange('maxIntervalSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#666', marginBottom: 2 }}>手动暂停(秒)</label>
              <input type="number" min="0" value={behaviorParams.manualPauseSec}
                onChange={(e) => handleBehaviorParamChange('manualPauseSec', e.target.value)}
                onBlur={handleSaveBehaviorParams}
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3 }} />
            </div>
          </div>
        )}
        {autoBehaviorEnabled && !hasRandomCandidates && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#e65100' }}>
            当前没有可自动插播动作。请至少设置一个非待机类型，并勾选「参与自动随机」。
          </p>
        )}
        {behaviorParams.minIntervalSec < 5 && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#e65100' }}>
            间隔过短可能导致待机动作来不及完整播放。
          </p>
        )}
      </div>

      {/* 动作库 */}
      {assets.length > 0 && (
        <div style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 13, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>动作库</p>
            <button onClick={refreshAssets} style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer', backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3 }}>刷新</button>
          </div>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {assets.map((asset) => {
              const date = new Date(asset.modifiedAt)
              const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
              const isRenaming = renamingId === asset.id
              const typeInfo = ACTION_TYPES.find(t => t.value === asset.actionType) || ACTION_TYPES[4]

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
                  {/* 第一行：名称 + 类型 + 状态标记 + 帧信息 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {isRenaming ? (
                      <>
                        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(asset); if (e.key === 'Escape') handleCancelRename() }}
                          autoFocus style={{ padding: '2px 6px', fontSize: 12, border: '1px solid #4a90d9', borderRadius: 3, width: 140 }} />
                        <button onClick={() => handleConfirmRename(asset)} style={btnStyle('#4caf50')}>确定</button>
                        <button onClick={handleCancelRename} style={btnStyle('#999')}>取消</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{asset.name}</span>
                        <select
                          value={asset.actionType}
                          onChange={(e) => handleChangeActionType(asset, e.target.value)}
                          style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, border: '1px solid #ccc', backgroundColor: typeInfo.color, color: '#fff', cursor: 'pointer', outline: 'none' }}
                        >
                          {ACTION_TYPES.map(t => (
                            <option key={t.value} value={t.value} style={{ backgroundColor: '#fff', color: '#333' }}>{t.label}</option>
                          ))}
                        </select>
                        {asset.isActive && <span style={{ fontSize: 11, color: '#4caf50', fontWeight: 600 }}>● 当前使用</span>}
                        {asset.isDefault && <span style={{ fontSize: 11, color: '#ff9800', fontWeight: 600 }}>★ 默认</span>}
                        {!asset.sourceWidth && <span style={{ fontSize: 10, color: '#999' }} title="缺少对齐元数据，切换时可能位移">⚠ 未校准</span>}
                        <span style={{ color: '#999', fontSize: 11, marginLeft: 'auto' }}>
                          {timeStr} · {asset.frameCount}帧 · {asset.frameWidth}×{asset.frameHeight} · {asset.format}
                        </span>
                      </>
                    )}
                  </div>

                  {/* 第二行：缩放 + 循环 + 参与自动随机 + 自动轮数 */}
                  {!isRenaming && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span>缩放</span>
                        <input type="number" step="0.1" min="0.1" max="2" value={asset.displayScale}
                          onChange={(e) => handleDisplayScaleChange(asset.id, e.target.value)}
                          onBlur={() => handleSaveDisplayScale(asset)}
                          style={{ width: 48, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3 }} />
                      </label>
                      <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input type="checkbox" checked={asset.loop}
                          onChange={() => handleToggleLoop(asset)}
                          style={{ cursor: 'pointer' }} />
                        循环
                      </label>
                      <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input type="checkbox" checked={asset.includeInRandom}
                          onChange={() => handleToggleRandom(asset)}
                          style={{ cursor: 'pointer' }} />
                        参与自动随机
                      </label>
                      {asset.includeInRandom && (
                        <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span>自动轮数</span>
                          <input type="number" min="1" max="10" value={asset.autoPlayRepeatCount}
                            onChange={(e) => handleChangeRepeatCount(asset, e.target.value)}
                            style={{ width: 36, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3 }} />
                        </label>
                      )}
                    </div>
                  )}

                  {/* 第三行：操作按钮 */}
                  {!isRenaming && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <button onClick={() => handleApplyAsset(asset)} style={btnStyle('#4caf50')}>应用</button>
                      <button onClick={() => handleOpenAssetDir(asset)} style={btnStyle('#607d8b')}>打开</button>
                      <button onClick={() => handleStartRename(asset)} style={btnStyle('#2196f3')}>重命名</button>
                      <button onClick={() => handleDeleteAsset(asset)} style={btnStyle('#f44336')}>删除</button>
                      <span style={{ borderLeft: '1px solid #ddd', height: 14, margin: '0 2px' }} />
                      <button onClick={() => handleToggleDefault(asset)}
                        style={btnStyle(asset.isDefault ? '#ff9800' : '#bbb')}>
                        {asset.isDefault ? '取消默认' : '设为默认'}
                      </button>
                      {!asset.sourceWidth && (
                        <button onClick={() => handleRebuildAnchor(asset)}
                          style={btnStyle('#795548')} title="从源视频重建对齐元数据">
                          重建对齐
                        </button>
                      )}
                      {asset.sourceWidth && (
                        <button onClick={() => setExpandingAnchorId(expandingAnchorId === asset.id ? null : asset.id)}
                          style={btnStyle(expandingAnchorId === asset.id ? '#00897b' : '#78909c')}>
                          {expandingAnchorId === asset.id ? '收起微调 ▲' : '对齐微调 ▼'}
                        </button>
                      )}
                    </div>
                  )}
                  {/* 第四行：对齐微调（折叠） */}
                  {!isRenaming && expandingAnchorId === asset.id && asset.sourceWidth && (
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
                        <button onClick={() => handleResetAnchorOffset(asset)} style={{ ...btnStyle('#ff7043'), padding: '2px 8px' }}>重置微调</button>
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
        </div>
      )}
    </div>
  )
}
