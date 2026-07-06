# FurTwin 发布后维护记录

## 1. 当前版本与基线

### 最新正式发布

- **版本号**：v0.1.2
- **发布日期**：2026-07-03
- **GitHub Release Tag**：`v0.1.2`
- **稳定 Commit**：`54359eb`（master / dev 共同指向）

### 当前开发基线

- **基线 Commit**：`af88bfc`（dev 分支，v0.1.3 开发态，**未发布**）
- **状态**：dev 分支处于 v0.1.3 开发态；未 merge master、未打 tag、未升级版本号、未进入发布流程

### 日志文件路径（C1-1 起）

- 主进程日志：`%APPDATA%\FurTwin\logs\furtwin-main.log`

## 2. Release Assets

| 文件 / Tag | 说明 |
|------------|------|
| `furtwin-0.1.2-setup.exe`（tag `v0.1.2`） | v0.1.2 安装向导版 |
| `furtwin-0.1.2-win-unpacked.zip`（tag `v0.1.2`） | v0.1.2 免安装版 |
| `furtwin-0.1.0-setup.exe`（历史 tag `v0.1.0`） | v0.1.0 安装向导版（历史） |
| `furtwin-0.1.0-win-unpacked.zip`（历史 tag `v0.1.0`） | v0.1.0 免安装版（历史） |

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

## 7. 后续开发原则

1. **小步任务**：每个任务拆分到可独立完成的粒度
2. **单独测试**：每个任务完成后单独验证
3. **稳定点 commit**：验证通过后立即提交，commit message 使用中文
4. **分支策略**：
   - `master`：仅保留正式发布稳定版本（当前指向 v0.1.2 / `54359eb`）
   - `dev`：日常开发分支（当前指向 v0.1.3 开发态 / `af88bfc`，未 merge master、未打 tag、未升级版本号、未进入发布流程）

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
