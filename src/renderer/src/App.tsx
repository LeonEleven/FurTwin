import { useState, useEffect, useRef, useCallback } from 'react'

type Status = 'idle' | 'processing' | 'success' | 'error'

interface GeneratedAsset {
  id: string; path: string; frameCount: number;
  frameWidth: number; frameHeight: number;
  format: string; modifiedAt: number; displayScale: number
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
  const [history, setHistory] = useState<GeneratedAsset[]>([])

  const logRef = useRef<HTMLDivElement>(null)

  const refreshHistory = useCallback(async () => {
    try {
      const assets = await window.controlAPI.listGeneratedAssets()
      setHistory(assets.slice(0, 10))
    } catch {}
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  // Load history on mount and after successful extraction
  useEffect(() => {
    refreshHistory()
  }, [refreshHistory, status])

  useEffect(() => {
    const offLog = window.controlAPI.onExtractLog((log) => {
      setLogs((prev) => prev + log)
    })

    const offDone = window.controlAPI.onExtractDone((result) => {
      console.log('[renderer] EXTRACT_DONE result=', JSON.stringify(result))
      setStatus('success')
      setExtractResult({
        outputDir: result.outputDir,
        frameCount: result.frameCount,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        trimWidth: result.trimWidth,
        trimHeight: result.trimHeight,
      })
      console.log('[renderer] UI status=success hasExtractResult=true')
    })

    const offErr = window.controlAPI.onExtractError((err) => {
      console.log('[renderer] EXTRACT_ERROR:', err.message)
      setStatus('error')
      setErrorMsg(err.message)
    })

    return () => { offLog(); offDone(); offErr() }
  }, [])

  const handleSelectVideo = useCallback(async () => {
    const path = await window.controlAPI.selectVideo()
    if (path) {
      setVideoPath(path)
      setLogs('')
      setStatus('idle')
      setErrorMsg('')
      setExtractResult(null)
    }
  }, [])

  const handleExtract = useCallback(() => {
    if (!videoPath || status === 'processing') return
    console.log('[renderer] starting extract')
    setLogs('')
    setStatus('processing')
    setErrorMsg('')
    setExtractResult(null)

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
      const ok = confirm(
        `裁剪后画布仍然较大（${extractResult.trimWidth}x${extractResult.trimHeight}），可能遮挡桌面。\n\n是否仍然应用？`
      )
      if (!ok) return
    }
    console.log('[renderer] applyToPreview:', extractResult.outputDir)
    window.controlAPI.applyToPreview(extractResult.outputDir, 0.5)
  }, [extractResult])

  const handleRestoreDemo = useCallback(() => {
    console.log('[renderer] restoreDemo')
    window.controlAPI.restoreDemo()
  }, [])

  const handleOpenOutputDir = useCallback(async () => {
    if (!extractResult?.outputDir) return
    const res = await window.controlAPI.openPath(extractResult.outputDir)
    if (!res.ok) console.warn('[renderer] openPath failed:', res.error)
  }, [extractResult])

  const handleApplyHistory = useCallback((asset: GeneratedAsset) => {
    console.log('[renderer] apply history:', asset.id, 'displayScale:', asset.displayScale)
    // Save displayScale to asset metadata
    window.controlAPI.saveAssetDisplayScale(asset.path, asset.displayScale)
    window.controlAPI.applyToPreview(asset.path, asset.displayScale)
  }, [])

  const handleDisplayScaleChange = useCallback((assetId: string, value: string) => {
    const num = parseFloat(value)
    if (!Number.isFinite(num) || num <= 0) return
    setHistory(prev => prev.map(a => a.id === assetId ? { ...a, displayScale: num } : a))
  }, [])

  const handleOpenHistoryDir = useCallback(async (asset: GeneratedAsset) => {
    const res = await window.controlAPI.openPath(asset.path)
    if (!res.ok) console.warn('[renderer] openPath failed:', res.error)
  }, [])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #ccc',
    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#555',
  }

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>FurTwin 控制面板</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
        FFmpeg 绿幕视频 → 透明序列帧
      </p>

      {/* 输入视频 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>输入视频</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={videoPath} readOnly placeholder="点击右侧按钮选择绿幕视频..."
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
        <label style={{ ...labelStyle, marginBottom: 8 }}>透明边界自动裁剪（推荐）</label>
        <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <input type="checkbox" checked={trimAlpha} onChange={(e) => setTrimAlpha(e.target.checked)} />
          启用 trim-alpha（自动裁掉透明空白边界）
        </label>
        {trimAlpha && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={labelStyle}>Threshold</label><input type="number" value={trimThreshold} onChange={(e) => setTrimThreshold(Number(e.target.value))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Padding</label><input type="number" value={trimPadding} onChange={(e) => setTrimPadding(Number(e.target.value))} style={inputStyle} /></div>
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
          <p style={{ fontSize: 11, color: '#999', marginLeft: 20 }}>⚠ 如果水印与宠物主体重叠，会擦掉主体部分</p>
        </div>
        <div>
          <label style={labelStyle}>自定义遮罩区域</label>
          <input value={maskRegion} onChange={(e) => setMaskRegion(e.target.value)} placeholder="x:y:w:h, 逗号分隔多个区域" style={inputStyle} />
        </div>
      </div>

      {/* 高级裁剪 */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer', marginBottom: 8 }}>高级：手动裁剪（Crop）⚠ 可能裁掉宠物主体</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <div><label style={labelStyle}>手动裁剪 (w:h:x:y)</label><input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="1024:576:128:72" style={inputStyle} /></div>
          <div><label style={labelStyle}>中心裁剪 (w:h) ⚠</label><input value={centerCrop} onChange={(e) => setCenterCrop(e.target.value)} placeholder="1024:576" style={inputStyle} /></div>
        </div>
      </details>

      {/* 执行按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleExtract} disabled={!videoPath || status === 'processing'}
          style={{
            padding: '10px 24px', fontSize: 14, fontWeight: 600,
            cursor: !videoPath || status === 'processing' ? 'not-allowed' : 'pointer',
            backgroundColor: status === 'processing' ? '#ccc' : '#4a90d9',
            color: '#fff', border: 'none', borderRadius: 6,
          }}>
          {status === 'processing' ? '处理中...' : '开始提取'}
        </button>
        {status === 'success' && <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 600 }}>✅ 提取完成</span>}
        {status === 'error' && <span style={{ color: '#f44336', fontSize: 13 }}>❌ {errorMsg}</span>}
      </div>

      {/* 日志 */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>输出日志</label>
        <div ref={logRef} style={{
          height: 180, overflow: 'auto', backgroundColor: '#1e1e1e', color: '#d4d4d4',
          padding: 12, borderRadius: 6, fontSize: 12,
          fontFamily: 'Consolas, "Courier New", monospace',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {logs || '等待执行...'}
        </div>
      </div>

      {/* 结果区域 —— 依赖 extractResult 结构化数据，不依赖日志文本 */}
      {status === 'success' && extractResult && (
        <div style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 6, border: '1px solid #c8e6c9', fontSize: 13, marginBottom: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>提取结果</p>
          <p>帧数: {extractResult.frameCount}</p>
          {extractResult.frameWidth > 0 && <p>原始尺寸: {extractResult.frameWidth}x{extractResult.frameHeight}</p>}
          {extractResult.trimWidth > 0 && <p>裁剪后: {extractResult.trimWidth}x{extractResult.trimHeight}</p>}
          <p>输出目录: <code style={{ fontSize: 11 }}>{extractResult.outputDir}</code></p>
          {extractResult.trimWidth > 800 && (
            <p style={{ color: '#e65100', marginTop: 4 }}>⚠ 裁剪后画布仍然较大，可能遮挡桌面。</p>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleApplyPreview} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 4,
            }}>应用到桌宠预览</button>
            <button onClick={handleRestoreDemo} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', backgroundColor: '#ff9800', color: '#fff', border: 'none', borderRadius: 4,
            }}>恢复 Demo 预览</button>
            <button onClick={handleOpenOutputDir} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', backgroundColor: '#607d8b', color: '#fff', border: 'none', borderRadius: 4,
            }}>打开输出目录</button>
          </div>
        </div>
      )}

      {/* 历史生成结果 */}
      {history.length > 0 && (
        <div style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>历史生成结果</p>
            <button onClick={refreshHistory} style={{
              padding: '2px 8px', fontSize: 11, cursor: 'pointer',
              backgroundColor: '#e0e0e0', border: 'none', borderRadius: 3,
            }}>刷新</button>
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            {history.map((asset) => {
              const date = new Date(asset.modifiedAt)
              const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
              return (
                <div key={asset.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid #e0e0e0',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{timeStr}</span>
                    <span style={{ color: '#888', marginLeft: 8 }}>
                      {asset.frameCount} 帧 · {asset.frameWidth}x{asset.frameHeight} · {asset.format}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#666' }}>缩放</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="2"
                      value={asset.displayScale}
                      onChange={(e) => handleDisplayScaleChange(asset.id, e.target.value)}
                      style={{ width: 48, padding: '2px 4px', fontSize: 11, border: '1px solid #ccc', borderRadius: 3 }}
                    />
                    <button onClick={() => handleApplyHistory(asset)} style={{
                      padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                      backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: 3,
                    }}>应用</button>
                    <button onClick={() => handleOpenHistoryDir(asset)} style={{
                      padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                      backgroundColor: '#607d8b', color: '#fff', border: 'none', borderRadius: 3,
                    }}>打开</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
