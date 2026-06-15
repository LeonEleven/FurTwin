import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { PetSprite } from './components/PetSprite'
import type { AnimConfig } from '../../shared/types'

/**
 * 默认动作配置路径
 * 替换真实宠物序列帧时，修改此配置文件即可，无需改代码。
 *
 * 配置文件位置：public/assets/actions/<动作名>/config.json
 * 帧文件位置：  public/assets/actions/<动作名>/frames/
 */
const ACTION_CONFIG_URL = './assets/actions/idle/config.json'

/** 加载失败时的兜底配置 */
const FALLBACK_CONFIG: AnimConfig = {
  name: 'idle',
  label: '待机',
  framesDir: './assets/actions/idle/frames',
  fps: 12,
  scale: 1,
  loop: true,
  frameCount: 12,
  frameWidth: 64,
  frameHeight: 64,
  framePattern: '{}.png',
}

function PetApp() {
  const [config, setConfig] = useState<AnimConfig | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 加载动作配置
  useEffect(() => {
    fetch(ACTION_CONFIG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: AnimConfig) => setConfig(data))
      .catch(() => setConfig(FALLBACK_CONFIG))
  }, [])

  // 监听主进程菜单动作
  useEffect(() => {
    const removeListener = window.petAPI.onMenuAction((action) => {
      if (action === 'reload-anim') {
        setReloadKey((k) => k + 1)
      }
    })
    return removeListener
  }, [])

  if (!config) return null

  return (
    <StrictMode>
      <PetSprite config={config} reloadKey={reloadKey} />
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<PetApp />)
