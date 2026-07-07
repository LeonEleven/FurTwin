import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// C2: ErrorBoundary 包在 StrictMode 外面，避免开发期 double-invoke 噪声
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary variant="control">
    <StrictMode>
      <App />
    </StrictMode>
  </ErrorBoundary>
)
