# FurTwin 发布后维护记录

## 1. 当前版本与基线

### 最新正式发布

- **版本号**：v0.1.4
- **发布日期**：2026-07-10
- **GitHub Release Tag**：`v0.1.4`
- **稳定 Commit**：`c57d946`（fix: 修复安装路径含空格时视频提取失败）
- **完整发布 Commit 链**：`b901d35`（A）→ `c261812`（C0）→ `7368429`（C1）→ `2bb7009`（C2）→ `e79486d`（版本升级）→ `c57d946`（安装路径空格修复）

### 日志文件路径（C1-1 起）

- 主进程日志：`%APPDATA%\FurTwin\logs\furtwin-main.log`

## 2. Release Assets

| 文件 / Tag | 说明 |
|------------|------|
| `furtwin-0.1.4-setup.exe`（tag `v0.1.4`） | v0.1.4 安装向导版 |
| `furtwin-0.1.4-win-unpacked.zip`（tag `v0.1.4`） | v0.1.4 免安装版 |
| `furtwin-0.1.3-setup.exe`（历史 tag `v0.1.3`） | v0.1.3 安装向导版（历史） |
| `furtwin-0.1.3-win-unpacked.zip`（历史 tag `v0.1.3`） | v0.1.3 免安装版（历史） |
| `furtwin-0.1.2-setup.exe`（历史 tag `v0.1.2`） | v0.1.2 安装向导版（历史） |
| `furtwin-0.1.2-win-unpacked.zip`（历史 tag `v0.1.2`） | v0.1.2 免安装版（历史） |

## 3. 发布前验证通过的核心功能

- [x] `npm run dist` 打包成功
- [x] 安装版 `setup.exe` 正常安装
- [x] 安装向导可选择安装目录
- [x] 安装后运行正常
- [x] 免安装 zip 解压运行正常
- [x] Tray 图标正常
- [x] 控制面板正常（默认尺寸、滚动体验）
- [x] 动作切换正常
- [x] 隐身模式 / 鼠标穿透正常
- [x] 自动行为正常
- [x] 退出无残留进程

## 4. 当前固定限制

以下约束适用于 P5 及后续迭代，不可违反：

- 不改 userData 路径
- 不碰 FFmpeg 本身
- 不做旧数据迁移
- 不做一次性大重构
- 不提交 `dist/` 产物到 git

## 5. P5 / v0.1.1 候选方向

### P6A-1：动作库搜索与手动排序

- **状态**：完成
- **Commit**：`dev` 分支
- **内容**：
  - [x] 动作库名称搜索：在当前类型 tab 结果内按名称筛选，兼容批量选择模式
  - [x] 手动排序：上移/下移按钮，仅在"全部"tab、搜索框为空、非批量选择模式下显示
  - [x] 排序持久化：通过 `local.config.json` 的 `customActionOrder` 字段保存
  - [x] 删除动作时自动清理排序项中的已删除 ID
  - [x] 搜索与类型 tab / 批量选择兼容
  - [x] 排序按钮 UI 收口：蓝底白箭头可用态，灰色禁用态

### P6A-1R / P6A-1R2：修复排序和行为配置重启后丢失

- **状态**：完成
- **Commit**：`605b384`
- **内容**：
  - [x] P6A-1R：修复 `actionLib.ts`、`generatedAssets.ts`、`preview.ts` 写 `local.config.json` 时未保留 `customActionOrder` 字段的问题
  - [x] P6A-1R2：修复 `preview.ts` 的 `validateStartupConfig()` 在启动校验失败时删除整个 `local.config.json`，导致所有用户配置（排序、自动行为开关、自动行为参数）丢失；改为只清理 action/preview 相关字段，保留 `customActionOrder`、`autoBehaviorEnabled`、自动行为参数等用户配置
- **测试结果**：排序、自动行为开关、自动行为时间参数重启后均可保持

### P6B-1：显示应用版本号

- **状态**：完成
- **Commit**：`dev` 分支
- **内容**：
  - [x] 控制面板标题区域显示版本号（来源：`app.getVersion()`）
  - [x] Tray 右键菜单底部显示版本号（不可点击）
  - [x] Tray hover tooltip 显示版本号
  - [x] 新增 `GET_APP_VERSION` IPC 通道和 `getAppVersion()` preload API

### 文档与提示词优化

- [x] 文档和控制面板提示词说明中补充：复制提示词到豆包网页端 / App 前，建议用户上传宠物正面全身照（P5C-1 完成）

### 动作库批量操作

- [x] 动作库列表新增批量选择能力（P5B-1R 完成）
- [x] 基于批量选择增加批量删除（P5B-2 完成）
- [x] 基于批量选择增加批量导出（P5B-3 完成）

**批量导出导入兼容性：**
- 单动作包仍按原逻辑导入
- 批量导出包按一级子目录识别多个动作并导入
- 现有多选 zip 导入不受影响

### Bug 修复

- [x] 修复关闭自动行为后停在最后一帧（P5D-1 完成）

### 宠物窗口置顶

- 观察宠物预览偶尔被其他窗口遮挡的问题，在没有稳定复现前不盲目修改置顶逻辑
- 可考虑后续增加"重新置顶宠物窗口"的低风险入口 → **B1 已完成（见 P7 节）**

### P5E-1：功能回归测试

- **状态**：通过
- **Commit**：`1572e3d`
- **验证项**：
  - [x] 控制面板打开正常，不白屏
  - [x] 动作库普通模式正常
  - [x] 批量选择正常
  - [x] 批量删除正常
  - [x] 批量导出正常
  - [x] 批量导出的 zip 可以重新导入
  - [x] 单动作导入/导出正常
  - [x] 自动行为开启/关闭正常
  - [x] 自动行为播放中关闭后不再停最后一帧
  - [x] 点击触发正常
  - [x] 隐身模式/鼠标穿透正常
  - [x] Tray 菜单功能正常
- **结论**：当前 dev 分支可作为 v0.1.1 候选稳定基础

## 6. P7 / v0.1.3 开发态（dev 分支，未发布）

### P7A-1：本地配置写入可靠性

- **状态**：完成
- **Commit**：`5620a98`
- **内容**：
  - [x] 新增 `src/main/services/configStore.ts`，提供 `writeConfigAtomically` / `readConfigWithFallback` / `cleanupStaleTempFiles` 三个能力
  - [x] 原子写：先写 `.tmp` 再 rename 到正式文件；写前将正式文件备份到 `.bak`
  - [x] 读取：主配置解析失败时从 `.bak` 恢复；都失败保持现有 bundled → {} fallback
  - [x] 替换 behavior / actionLib / generatedAssets / preview 共 7 处写入点
  - [x] 启动早期清理残留 `.tmp`

### B1：重新置顶宠物窗口入口

- **状态**：完成
- **Commit**：`f5f149f`
- **内容**：
  - [x] 新增 `restorePetWindow()`：隐身中先 `disableStealthMode`、最小化 `restore`、隐藏 `showInactive`、重新 `setAlwaysOnTop(true, 'screen-saver')`、`moveTop`
  - [x] 引用无效时复用 `createPetWindow()` 重建，不复制窗口创建逻辑
  - [x] Tray 右键菜单 + 宠物右键菜单均加入"找回桌宠"入口（通过 `buildAppMenuTemplate` 的 `includeRestorePet` 选项）
  - [x] 历史"普通窗口遮挡"问题当前无法稳定复现；已验证：点击入口无报错、不创建重复窗口、alwaysOnTop 行为正常

### C1-1：主进程日志记录

- **状态**：完成
- **Commit**：`af88bfc`
- **内容**：
  - [x] 新增 `src/main/services/logger.ts`，提供 `info / warn / error` 三个级别（error 支持 Error.stack）
  - [x] 日志写到 `%APPDATA%\FurTwin\logs\furtwin-main.log`；写失败 try/catch 兜底，不影响主流程
  - [x] 接入点：`index.ts`（启动 / 退出 / 未捕获异常 / 未处理 rejection）、`configStore.ts`（.bak 恢复 / 原子写失败）、`tray.ts`（icon 失败）、`petWindow.ts`（`restorePetWindow` 兜底）
  - [x] 不替换 preview / generatedAssets / actionLib / behavior 中的 console

### C2：渲染错误边界

- **状态**：完成
- **Commit**：`abb407f`
- **修改文件**：`src/renderer/src/components/ErrorBoundary.tsx`（新增）、`src/renderer/src/main.tsx`、`src/renderer/src/pet.tsx`
- **内容**：
  - [x] 最小 React ErrorBoundary (class component + `getDerivedStateFromError` + `componentDidCatch`)，避免控制面板 / 桌宠 renderer 组件异常时白屏
  - [x] `variant: 'control' | 'pet'` 双形态 fallback
  - [x] 控制面板 fallback：中文标题 + 描述 + 开发期 stack + 「重试」/「关闭窗口」按钮；重试重置 state，关闭走 `window.close()`（主进程拦截为 hide）
  - [x] 桌宠 fallback：生产包 `return null`；开发包 10px 极淡红字仅供调试；强制 `background: transparent` + `pointerEvents: none`，不影响透明 overlay 与点击穿透
  - [x] 不接主进程 logger；不新增 IPC；不引新依赖
- **测试结果**：
  - T2 控制面板注入 throw → fallback UI 正常显示；T3 桌宠注入 throw → 透明、无大块错误 UI、点击穿透正常
  - 故障注入清理后 `rg C2-test` / `rg C2-pet-test` 零命中
  - `tsc --noEmit` 零错误

## 7. P7-RC0 组合回归测试（dev 分支，v0.1.3 开发态）

测试日期：2026-07-07

| 阶段 | 项数 | 结果 |
|------|------|------|
| A. 启动 / 退出 | 6 | ✅ 全部通过 |
| B. 桌宠显示 / 透明 / 拖拽 / 右键 | 6 | ✅ 全部通过 |
| C. Tray 菜单 / 找回桌宠 | 8 | ✅ 全部通过 |
| D. 控制面板 | 3 | ✅ 全部通过 |
| E. 动作库 | 6 | ✅ 全部通过 |
| F. 自动行为 | 3 | ✅ 全部通过 |
| G. local.config.json | 6 | ✅ 5 项通过，1 项部分（见下方说明）|
| H. 主进程日志 | 7 | ✅ 全部通过 |
| I. 控制面板 ErrorBoundary | 5 | ✅ 全部通过 |
| J. 桌宠 ErrorBoundary | 5 | ✅ 全部通过 |
| K. Git / 产物 | 4 | ✅ 全部通过 |
| **合计** | **59** | **58 通过 / 1 部分 / 0 未测** |

### G3/G4 部分说明

- **测试点**：`.bak` 恢复 / 双坏 fallback
- **本轮结果**：未深度破坏实测
- **原因**：该测试需要故意破坏 `local.config.json` 并重启开发进程，存在人工误操作成本，未在 RC 阶段执行
- **依据**：P7A-1 单项阶段已直接验证配置损坏恢复逻辑（原子写 + bak 恢复代码路径）；RC 阶段通过正常保存、日志、tmp 清理、代码路径复核确认无退化
- **建议**：发布前如有余力可选做 1 次 G3/G4 深度复测，但不作为 v0.1.3 发布的阻塞项

### P7-RC0 后的当前状态

- 版本号：**未升级**
- git merge master：**未执行**
- tag：**未打**
- v0.1.3 GitHub Release：**未进入流程**

## 8. 后续开发原则

1. **小步任务**：每个任务拆分到可独立完成的粒度
2. **单独测试**：每个任务完成后单独验证
3. **稳定点 commit**：验证通过后立即提交，commit message 使用中文
4. **分支策略**：
   - `master`：仅保留正式发布稳定版本（当前指向 v0.1.2 / `54359eb`）
   - `dev`：日常开发分支（当前指向 v0.1.3 开发态 / `abb407f`，未 merge master、未打 tag、未升级版本号、未进入发布流程）

## 8. 更新日志

| 日期 | 内容 |
|------|------|
| 2026-07-02 | 初始化：v0.1.0 正式发布，建立发布后维护记录 |
| 2026-07-02 | P5A：建立 dev 分支策略，新增发布后维护记录文档 |
| 2026-07-02 | P5C-1：补充上传宠物正面全身照提示 |
| 2026-07-02 | P5B-1R：动作库批量选择模式 |
| 2026-07-02 | P5B-2：动作库批量删除功能 |
| 2026-07-02 | P5B-3：动作库批量导出功能 |
| 2026-07-02 | P5D-1：修复关闭自动行为后停在最后一帧 |
| 2026-07-02 | P5E-1：功能回归测试通过，dev 分支可作为 v0.1.1 候选稳定基础 |
| 2026-07-03 | P6A-1：动作库搜索与手动排序完成 |
| 2026-07-03 | P6A-1R / P6A-1R2：修复排序和行为配置重启后丢失 |
| 2026-07-03 | P6B-1：显示应用版本号完成 |
| 2026-07-03 | v0.1.2 正式发布（54359eb，master / dev 同步，tag v0.1.2） |
| 2026-07-06 | P7A-1：本地配置写入可靠性完成（5620a98） |
| 2026-07-06 | B1：重新置顶宠物窗口入口完成（f5f149f） |
| 2026-07-06 | C1-1：主进程日志记录完成（af88bfc） |
| 2026-07-07 | C2：渲染错误边界完成（abb407f） |
| 2026-07-07 | P7-RC0：v0.1.3 组合回归测试通过（58 通过 / 1 部分 / 0 未测；dev 基线 abb407f） |
| 2026-07-09 | A：控制面板退出入口完成（b901d35） |
| 2026-07-09 | C0：清理 preload 遗留调试输出（c261812） |
| 2026-07-09 | C1：控制面板日志/配置目录入口完成（7368429） |
| 2026-07-09 | C2：控制面板主进程日志尾部查看完成（2bb7009） |
| 2026-07-09 | 版本号升级到 0.1.4（e79486d） |
| 2026-07-10 | 修复安装路径含空格时视频提取失败（c57d946）；已验证 `C:\Program Files\furtwin` 默认路径、中文视频路径、含空格免安装目录 |
| 2026-07-10 | v0.1.4 发布文档收口（发布前候选资产已生成，待 tag 建立后重新干净构建正式资产） |

## 9. v0.1.4 发布前候选资产（测试证据，非正式 Release 资产）

> 以下哈希为发布前人工验证通过的候选资产。最终 tag 建立后将重新干净构建正式资产，并记录最终哈希。

| 类型 | 文件名 | SHA-256 |
|------|--------|---------|
| 安装版候选 | `furtwin-0.1.4-setup.exe` | `335A6BFC3BF95DF7647195B09F8532BC3A9F9FB26615027BE623FFF32C57A317` |
| 免安装版候选 | `furtwin-0.1.4-win-unpacked.zip` | `FDAA2598A6407EDF9027933C68E02C2799C3575D27A53BE4B3BA273CAC3E4D5A` |

### 已验证矩阵

- 开发环境回归通过
- 安装版「仅为我安装」通过
- 安装版「所有用户安装」默认 `C:\Program Files\furtwin` 路径通过
- 免安装版在含中文和空格的解压目录中通过
- 视频提取、动作播放、诊断入口、退出流程通过
- 退出后无 EPIPE、uncaughtException、unhandledRejection
- `dist/out/exe/zip` 不进入 Git

### 不进入本版本的内容

- 配置写入并发保护（B）
- 手动检查更新（D）
- 单实例治理（E）
- userData 迁移
- FFmpeg 二进制升级
