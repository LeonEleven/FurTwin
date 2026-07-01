# FurTwin

FurTwin 是一款 Windows 桌面宠物软件，支持从绿幕视频提取透明动作帧，并管理桌面宠物动作库。

## 项目亮点

- **桌面宠物透明叠加** — 透明窗口显示在桌面上，支持拖动和右键菜单
- **自定义动作库** — 管理、导入、导出宠物动作
- **批量导入动作包** — 支持导入包含多个动作的 zip 包
- **自动行为** — 按间隔随机切换动作，保持宠物活力
- **点击触发** — 点击宠物触发互动动作
- **隐身模式 / 鼠标穿透** — 鼠标移到宠物区域时自动隐藏，点击穿透到后方窗口
- **提示词生成器** — 生成 AI 视频提示词，支持自定义动作描述
- **绿幕视频提取** — 从绿幕视频提取透明序列帧
- **安装版和免安装版** — 满足不同用户需求

## 下载与安装

### 安装版（推荐）

下载 `FurTwin-版本号-setup.exe`，双击运行：
- 支持安装向导
- 可选择安装目录
- 安装完成后从开始菜单、桌面快捷方式或安装目录启动

### 免安装版

下载 `FurTwin-版本号-win-unpacked.zip`：
- 解压到任意目录
- 运行 `furtwin.exe`
- 适合不想安装的用户

> 当前仅验证 Windows 系统。

## 快速开始

1. 启动 FurTwin，桌面会显示宠物
2. 右键托盘图标或宠物 → 显示控制面板
3. 在控制面板中导入动作包或提取视频
4. 在动作库中点击动作卡片切换动作

## 文档

| 文档 | 说明 |
|------|------|
| [USER_GUIDE.md](USER_GUIDE.md) | 用户使用指南 |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | 发行前回归清单 |
| [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) | 项目盘点报告 |
| [docs/ai-generation-prompt.md](docs/ai-generation-prompt.md) | AI 视频提示词指南 |
| [docs/ffmpeg-keying.md](docs/ffmpeg-keying.md) | FFmpeg 扣绿说明 |

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 打包（安装版 + 免安装版）
npm run dist

# 仅打包安装版
npm run dist:win

# 仅打包免安装版
npm run dist:win:zip
```

### 打包注意事项

- 打包过程可能需要下载 Electron / electron-builder 相关资源，请确保网络环境正常
- **不要**使用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 作为正式方案
- exe/zip 产物不需要提交到 git，作为 GitHub Release assets 上传

## 常见注意事项

- **首次运行卡顿** — 动作首次运行需要计算 shape-cache，可能轻微卡顿，后续运行会流畅
- **开机自启不生效** — 可能受 Windows 权限或安全软件影响，尝试以管理员身份运行一次

## 技术栈

- Electron 35
- React 19 + TypeScript
- Vite 6 + electron-vite
- FFmpeg（视频处理）

## 问题反馈

反馈时请提供：
1. 操作步骤（如何复现问题）
2. 截图或录屏
3. 使用环境：安装版 / 免安装版 / 开发版

---

*最后更新：2026-07-01*
