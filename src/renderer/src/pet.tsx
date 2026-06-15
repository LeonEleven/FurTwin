import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { PetSprite } from './components/PetSprite'
import type { AnimConfig } from '../../shared/types'

/**
 * 默认动画配置
 * 后续替换真实宠物序列帧时，只需修改此处或从配置文件加载。
 * 帧文件放在 public/assets/frames/ 下，命名格式与 framePattern 一致。
 *
 * 窗口尺寸会自动根据 frameWidth * scale 和 frameHeight * scale 调整。
 */
const defaultConfig: AnimConfig = {
  framesDir: './assets/frames',
  fps: 12,
  scale: 1,
  loop: true,
  frameCount: 12,
  frameWidth: 64,
  frameHeight: 64,
  framePattern: '{}.png',
}

function PetApp() {
  const [reloadKey, setReloadKey] = useState(0)

  // 监听主进程菜单动作（右键菜单由主进程处理，此处只接收结果）
  useEffect(() => {
    const removeListener = window.petAPI.onMenuAction((action) => {
      if (action === 'reload-anim') {
        setReloadKey((k) => k + 1)
      }
    })
    return removeListener
  }, [])

  return (
    <StrictMode>
      <PetSprite config={defaultConfig} reloadKey={reloadKey} />
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<PetApp />)
