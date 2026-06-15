# FurTwin

桌面宠物软件 — 让你的宠物照片变成桌面宠物动画。

## 当前阶段

**v0.1 Demo** — 最小桌宠展示基线（第二阶段）

已验证核心链路：透明窗口 + 序列帧动画播放 + 拖动 + 右键菜单 + 配置驱动的动作目录。

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

## 当前已实现功能

- 透明、无边框、置顶的桌宠展示窗口
- 窗口不在任务栏显示，无阴影，无菜单栏
- 序列帧动画循环播放（requestAnimationFrame + 时间戳控制帧率）
- 动作配置驱动：每个动作独立目录，含 config.json + frames/
- 支持配置 fps、scale、loop、frameCount、frameWidth、frameHeight、framePattern
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
- 多动作切换
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
├── main/                         # Electron 主进程
│   ├── index.ts                  # 入口
│   └── windows/petWindow.ts      # 桌宠窗口管理
├── preload/index.ts              # 安全桥接（contextBridge）
├── renderer/
│   ├── pet.html                  # 桌宠窗口 HTML
│   ├── index.html                # 控制面板 HTML（占位）
│   ├── public/assets/actions/    # 动作资源目录
│   │   └── idle/                 # 示例动作：待机
│   │       ├── config.json       # 动作配置
│   │       └── frames/           # 序列帧文件
│   └── src/
│       ├── pet.tsx               # 桌宠窗口入口（加载动作配置）
│       ├── App.tsx               # 控制面板（占位）
│       ├── components/PetSprite.tsx  # 精灵组件
│       └── hooks/useAnimPlayer.ts    # 动画播放 hook
└── shared/types.ts               # 共享类型定义
```

## 替换为真实宠物序列帧

只需两步，无需修改代码：

### 1. 放入帧文件

将透明 PNG 或 WebP 序列帧放入动作目录的 `frames/` 文件夹：

```
src/renderer/public/assets/actions/idle/frames/
├── 0001.webp
├── 0002.webp
├── 0003.webp
└── ...
```

帧文件命名格式需与 config.json 中的 `framePattern` 一致（默认 `{四位序号}.png`）。

### 2. 修改 config.json

编辑 `src/renderer/public/assets/actions/idle/config.json`：

```json
{
  "name": "idle",
  "label": "待机",
  "framesDir": "./assets/actions/idle/frames",
  "fps": 12,
  "scale": 0.5,
  "loop": true,
  "frameCount": 48,
  "frameWidth": 512,
  "frameHeight": 512,
  "framePattern": "{}.webp"
}
```

| 字段 | 说明 |
|------|------|
| `name` | 动作标识 |
| `label` | 显示名称 |
| `framesDir` | 帧文件目录（相对于 renderer 根） |
| `fps` | 帧率 |
| `scale` | 缩放比例（1.0 = 原始尺寸） |
| `loop` | 是否循环 |
| `frameCount` | 总帧数 |
| `frameWidth` | 单帧宽度（像素） |
| `frameHeight` | 单帧高度（像素） |
| `framePattern` | 帧文件名模板，`{}` 替换为序号 |

窗口尺寸会自动调整为 `frameWidth × scale` × `frameHeight × scale`。

### 添加新动作

在 `assets/actions/` 下创建新目录，例如 `walk/`：

```
assets/actions/walk/
├── config.json
└── frames/
    └── ...
```

当前版本只加载默认动作（idle），多动作切换将在后续版本中支持。
