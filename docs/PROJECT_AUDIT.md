# FurTwin 项目盘点报告

盘点日期：2026-07-01
盘点范围：项目全部文件（只读，不删除、不移动）

---

## 一、核心源码目录

### `src/main/` — Electron 主进程

| 文件 | 用途 |
|------|------|
| `index.ts` | 主进程入口 |
| `behavior.ts` | 自动行为逻辑 |
| `tray.ts` | 系统托盘 |
| `ipc/` | IPC 处理（动作库、资源包、提取等） |
| `services/` | 服务层（路径、仓库、FFmpeg、userData 协议） |
| `utils/` | 工具函数（资源信息、图标路径） |
| `windows/` | 窗口管理（控制面板、宠物窗口） |

### `src/preload/` — 预加载脚本

| 文件 | 用途 |
|------|------|
| `index.ts` | 预加载入口，暴露 IPC API |

### `src/renderer/` — 渲染进程（React）

| 文件 | 用途 |
|------|------|
| `index.html` | 控制面板 HTML |
| `pet.html` | 宠物窗口 HTML |
| `src/App.tsx` | 控制面板根组件 |
| `src/main.tsx` | 控制面板入口 |
| `src/pet.tsx` | 宠物窗口入口 |
| `src/components/PetSprite.tsx` | 宠物精灵组件 |
| `src/hooks/useAnimPlayer.ts` | 动画播放 Hook |
| `src/global.d.ts` | 全局类型声明 |
| `public/assets/actions/idle/` | 内置 idle 动作资源 |

---

## 二、配置文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `package.json` | 项目配置、依赖、脚本 | 正常 |
| `package-lock.json` | 依赖锁定 | 正常 |
| `tsconfig.json` | TypeScript 根配置 | 正常 |
| `tsconfig.node.json` | Node 端 TS 配置 | 正常 |
| `tsconfig.web.json` | Web 端 TS 配置 | 正常 |
| `electron.vite.config.ts` | electron-vite 构建配置 | 正常 |
| `electron-builder.yml` | 打包配置 | 正常 |
| `.gitignore` | Git 忽略规则 | 正常 |

---

## 三、打包相关

### `build/`

| 文件 | 用途 |
|------|------|
| `icon.png` | 应用主图标（用于安装版、控制面板等） |

### `resources/`

| 文件/目录 | 用途 |
|-----------|------|
| `tray.png` | 系统托盘图标 |
| `bin/ffmpeg.exe` | FFmpeg 二进制（不提交，打包时需要） |
| `bin/ffprobe.exe` | FFprobe 二进制（不提交，打包时需要） |
| `bin/README.md` | FFmpeg 放置说明 |
| `bin/.gitkeep` | 保持空目录 |
| `scripts/extract-transparent-frames.bundle.cjs` | 提取脚本 bundle（构建产物，不提交） |

### Windows 发行产物（P4B-1 后）

| 产物 | 命令 | 说明 |
|------|------|------|
| `FurTwin-版本号-setup.exe` | `npm run dist` 或 `npm run dist:win` | 安装版，含安装向导，可选安装目录 |
| `FurTwin-版本号-win-unpacked.zip` | `npm run dist` 或 `npm run dist:win:zip` | 免安装版，解压即用 |

---

## 四、文档文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `README.md` | 项目说明 | 正常 |
| `USER_GUIDE.md` | 用户使用指南 | 正常 |
| `docs/PROJECT_AUDIT.md` | 项目盘点报告（本文件） | 正常 |
| `docs/RELEASE_CHECKLIST.md` | 发行前回归测试清单 | 正常 |
| `docs/RELEASE_NOTES_DRAFT.md` | GitHub Release Notes 草稿 | 正常 |
| `docs/ai-generation-prompt.md` | AI 视频生成 Prompt 指南 | 正常 |
| `docs/ffmpeg-keying.md` | FFmpeg 扣绿说明 | 正常 |

---

## 五、脚本目录

### `scripts/`

| 文件 | 用途 |
|------|------|
| `build-extract-script.mjs` | 构建提取脚本 bundle |
| `check-ffmpeg-assets.mjs` | 打包前检查 FFmpeg 二进制 |
| `extract-transparent-frames.mjs` | 透明帧提取（源码） |
| `generate-test-frames.mjs` | 测试帧生成 |

---

## 六、构建产物目录

### `dist/` — 打包产物（不提交）

| 文件/目录 | 用途 |
|-----------|------|
| `furtwin-0.1.1-setup.exe` | 安装版 |
| `furtwin-0.1.1-win-unpacked.zip` | 免安装版 |
| `win-unpacked/` | 解压后的免安装版 |
| `*.blockmap` | 增量更新用 |
| `latest.yml` | 版本信息 |
| `builder-debug.yml` | 调试配置 |
| `builder-effective-config.yaml` | 生效配置 |
| `.icon-ico/` | 图标缓存 |

### `out/` — Vite 构建产物（不提交）

| 目录 | 用途 |
|------|------|
| `main/` | 主进程编译输出 |
| `preload/` | 预加载编译输出 |
| `renderer/` | 渲染进程编译输出 |

---

## 七、依赖目录

### `node_modules/` — npm 依赖（不提交）

正常，已在 .gitignore。

---

## 八、已清理文件

| 文件 | 说明 | 处理 |
|------|------|------|
| `electron.vite.config.1782027285346.mjs` | 带时间戳的临时配置文件，含本机绝对路径 | 已从 Git 移除并删除 |
| `src/renderer/public/assets/actions/idle/generated/你在干什么？.zip` | 测试用生成动作包 | 已删除（generated 目录已在 .gitignore） |

---

## 九、不应提交到 Git 的文件/目录

以下已在 `.gitignore` 中正确配置：

| 文件/目录 | 原因 |
|-----------|------|
| `node_modules/` | npm 依赖 |
| `out/` | Vite 构建产物 |
| `dist/` | 打包产物 |
| `*.log` | 日志文件 |
| `FurTwin.md` | 早期背景资料，已清理 |
| `resources/bin/*.exe` | FFmpeg 二进制 |
| `resources/scripts/*.bundle.*` | 构建产物 |
| `**/shape-cache.json` | 运行时缓存 |
| `**/generated/` | 用户生成的动作包 |
| `**/frames_real/` | 真实帧 |
| `**/frames_test/` | 测试帧 |
| `**/frames_tmp/` | 临时帧 |
| `**/source/` | 源素材 |
| `*.mp4`、`*.mov`、`*.avi` | 视频文件 |
| `test_chromakey_*.png`、`test_colorkey_*.png` | 测试输出 |

---

## 十、建议后续清理（需人工确认）

无待清理文件。如有新增可疑文件，请在此记录。

---

## 目录结构概览

```
FurTwin/
├── build/                    # 打包资源（图标）
├── dist/                     # 打包产物（不提交）
├── docs/                     # 文档
│   ├── PROJECT_AUDIT.md      # 项目盘点报告（本文件）
│   ├── RELEASE_CHECKLIST.md  # 发行前回归测试清单
│   ├── RELEASE_NOTES_DRAFT.md # Release Notes 草稿
│   ├── ai-generation-prompt.md # AI 视频提示词指南
│   ├── ffmpeg-keying.md      # FFmpeg 扣绿说明
│   └── images/               # 文档图片资源
│       └── user-guide/       # 用户指南图片/GIF
├── node_modules/             # 依赖（不提交）
├── out/                      # Vite 构建产物（不提交）
├── resources/                # 运行时资源
│   ├── bin/                  # FFmpeg 二进制（不提交）
│   ├── scripts/              # 提取脚本 bundle（不提交）
│   └── tray.png              # 托盘图标
├── scripts/                  # 构建脚本
├── src/                      # 源码
│   ├── main/                 # Electron 主进程
│   ├── preload/              # 预加载脚本
│   └── renderer/             # 渲染进程（React）
├── .gitignore
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── package-lock.json
├── README.md
├── USER_GUIDE.md             # 用户使用指南
└── tsconfig*.json
```

---

*盘点完成于 2026-07-01*
