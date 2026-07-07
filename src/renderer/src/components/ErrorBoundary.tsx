/**
 * 最小 React ErrorBoundary（C2）
 *
 * 避免控制面板或桌宠 renderer 组件异常时直接白屏。
 *
 * 关键边界：
 * - 控制面板（variant="control"）：显示简短错误提示 + 重试/关闭按钮
 * - 桌宠（variant="pet"）：生产包 return null，仅开发包显示极小的调试文字
 *   并保持 background:transparent + pointerEvents:none，不影响透明 overlay 与点击穿透
 *
 * 第一版不接主进程 logger，componentDidCatch 仅 console.error。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorBoundaryVariant = 'control' | 'pet'

interface Props {
  variant: ErrorBoundaryVariant
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const isDev = process.env.NODE_ENV === 'development'

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // C2 第一版：窗内 console.error，不走主进程 logger / 不新增 IPC
    console.error(`[ErrorBoundary:${this.props.variant}] render error:`, error, info)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return this.props.variant === 'pet'
        ? <PetFallback />
        : <ControlFallback error={this.state.error} onRetry={this.handleRetry} />
    }
    return this.props.children
  }
}

// ─── 桌宠 fallback ─────────────────────────────────────────────────────────────
//
// 设计原则：桌宠窗口是透明 overlay（transparent:true / focusable:false），
// 任何大块 UI 都会破坏视觉和鼠标穿透，因此 fallback 极简：
//   - 背景：transparent
//   - 点击穿透：pointerEvents:none
//   - 开发期：10px 极淡红字，仅肉眼仔细看可见
//   - 生产期：null（完全无视觉痕迹）

function PetFallback() {
  if (!isDev) return null

  return (
    <div
      data-role="error-boundary-pet-fallback"
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        pointerEvents: 'none',
        color: 'rgba(255, 60, 60, 0.18)',
        fontSize: 10,
        fontFamily: 'system-ui, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      pet render error
    </div>
  )
}

// ─── 控制面板 fallback ─────────────────────────────────────────────────────────
//
// 控制面板是不透明窗口，可以显示常规错误 UI。提供：
// - 简短中文提示
// - 开发期可选显示 error.stack
// - 重试按钮（重置 ErrorBoundary state）
// - 关闭按钮：复用 window.close()（close 事件会被主进程拦截转为 hide）

const controlFallbackStyles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    background: '#fafafa',
    color: '#333',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '48px 40px',
    boxSizing: 'border-box',
    overflow: 'auto',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 12,
  },
  desc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 1.6,
  },
  stack: {
    fontSize: 11,
    color: '#999',
    background: '#f0f0f0',
    padding: 12,
    borderRadius: 4,
    maxHeight: 160,
    overflow: 'auto',
    width: '100%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
    marginBottom: 20,
  },
  actions: {
    display: 'flex',
    gap: 12,
  },
  retry: {
    padding: '8px 18px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  close: {
    padding: '8px 18px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
}

function ControlFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div style={controlFallbackStyles.container}>
      <h2 style={controlFallbackStyles.title}>界面发生错误</h2>
      <p style={controlFallbackStyles.desc}>
        控制面板渲染出现异常。请尝试点击「重试」恢复，或关闭后重启应用。
        如问题反复出现，请查看主进程日志：
        <br />
        <code style={{ fontSize: 12, color: '#888' }}>
          %APPDATA%\FurTwin\logs\furtwin-main.log
        </code>
      </p>

      {isDev && error?.stack && (
        <pre style={controlFallbackStyles.stack}>{error.stack}</pre>
      )}

      <div style={controlFallbackStyles.actions}>
        <button style={controlFallbackStyles.retry} onClick={onRetry}>
          重试
        </button>
        <button style={controlFallbackStyles.close} onClick={() => window.close()}>
          关闭窗口
        </button>
      </div>
    </div>
  )
}
