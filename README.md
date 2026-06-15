# FurTwin

桌面宠物软件 — 让你的宠物照片变成桌面宠物动画。

## 当前阶段

**v0.1 Demo** — 最小桌宠展示基线（第一阶段）

已验证核心链路：透明窗口 + 序列帧动画播放 + 拖动 + 右键菜单。

## 技术栈

- Electron 35
- React 19 + TypeScript
- Vite 6 + electron-vite

## 如何运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 当前 Demo 已实现功能

- 透明、无边框、置顶的桌宠展示窗口
- 窗口不在任务栏显示，无阴影，无菜单栏
- 序列帧动画循环播放（requestAnimationFrame + 时间戳控制帧率）
- 支持配置 fps、scale、loop、frameCount、framePattern
- Pointer Events + setPointerCapture 实现稳定拖动
- 右键菜单（重新加载动画 / 退出应用）
- 窗口尺寸自动匹配动画帧尺寸（frameWidth × scale）
- 安全配置：contextIsolation: true、nodeIntegration: false、preload 桥接
- 12 帧彩色圆形占位动画（用于验证播放链路）

## 当前暂不支持的功能

- FFmpeg 视频处理 / 绿幕扣除
- 宠物创建流程 / 动作管理面板
- .furtwin 宠物包导入/导出
- 控制面板 UI
- 多宠物同时展示
- 点击穿透（透明区域不阻挡其他程序）
- 像素级 alpha 命中测试
- Doubao / Seedance API 集成
- CorridorKey 集成
- 跨平台完整兼容
- 自动更新 / 安装包构建

## 下一阶段计划

1. **视频导入与处理** — FFmpeg 集成，绿幕视频导入，色度键控扣绿幕，序列帧提取与 WebP 转换
2. **后台控制面板** — 宠物列表管理，动作管理，动作预览
3. **宠物包导入/导出** — .furtwin 格式（zip），manifest.json + 序列帧资源

## 项目结构

```
src/
├── main/                     # Electron 主进程
│   ├── index.ts              # 入口
│   └── windows/petWindow.ts  # 桌宠窗口（创建、拖动、右键菜单、尺寸调整）
├── preload/index.ts          # 安全桥接（contextBridge）
├── renderer/
│   ├── pet.html              # 桌宠窗口 HTML
│   ├── index.html            # 控制面板 HTML（占位）
│   ├── public/assets/        # 帧资源目录
│   └── src/
│       ├── pet.tsx           # 桌宠窗口入口
│       ├── App.tsx           # 控制面板（占位）
│       ├── components/PetSprite.tsx  # 精灵组件
│       └── hooks/useAnimPlayer.ts    # 动画播放 hook
└── shared/types.ts           # 共享类型定义
```

## 替换占位动画

当前 demo 使用 12 帧彩色圆形作为占位动画。替换为真实宠物序列帧：

1. 将透明 PNG/WebP 帧文件放入 `src/renderer/public/assets/frames/`
2. 修改 `src/renderer/src/pet.tsx` 中的 `defaultConfig`：

```typescript
const defaultConfig: AnimConfig = {
  framesDir: './assets/frames',
  fps: 12,           // 按视频帧率设置
  scale: 0.5,        // 按需缩放
  loop: true,
  frameCount: 48,    // 真实帧数
  frameWidth: 512,   // 帧宽度
  frameHeight: 512,  // 帧高度
  framePattern: '{}.webp',
}
```

窗口尺寸会自动调整为 `frameWidth × scale` × `frameHeight × scale`。
