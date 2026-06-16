# FFmpeg 绿幕扣除参数测试指南

## 当前实测最优参数

以下是针对当前样例绿幕视频（念念睡觉）测试后较优的参数组合：

```powershell
ffmpeg -i niannian-sleep.mp4 -vf "chromakey=0x00FF00:0.30:0.05,despill=green:0.95:0.95,format=rgba,fps=12" "%04d.png"
```

| 参数 | 值 | 说明 |
|------|-----|------|
| chromakey color | `0x00FF00` | 标准绿色 |
| similarity | `0.30` | 较高的相似度阈值，扣除更彻底 |
| blend | `0.05` | 较低的边缘混合，保持边缘清晰 |
| despill strength | `0.95` | 强力去除绿色光晕 |
| despill brightness | `0.95` | 去光晕后的亮度平衡 |
| fps | `12` | 抽帧到 12fps |

### FFmpeg chromakey 的局限性

FFmpeg 的 `chromakey` 滤镜基于简单的颜色空间匹配，存在以下限制：

- **毛发边缘**：宠物毛发边缘容易被误扣或残留绿色
- **绿幕反光**：绿色光容易反射到宠物身上，despill 无法完全消除
- **半透明区域**：耳朵薄光、胡须等半透明区域可能被过度扣除
- **光照不均**：绿幕光照不均匀时，单一 similarity 值难以覆盖全部区域

**后续方向**：更高质量的扣像可能需要 CorridorKey（基于 AI 的 matting 工具）或其他专业 keying 软件。当前 FurTwin v0.1 以 FFmpeg 作为默认本地基础方案，优先验证完整链路。

## 前置条件

- FFmpeg 已安装并加入 PATH
- 输入视频为绿幕 MP4（纯绿色背景，动物/宠物主体）

## 核心滤镜

FFmpeg 有两个用于绿幕扣除的滤镜：

| 滤镜 | 色彩空间 | 适用场景 |
|------|----------|----------|
| `chromakey` | YCbCr | 视频绿幕，推荐首选 |
| `colorkey` | RGB | 纯色背景，边缘要求高时备选 |

## 参数说明

### chromakey

```
chromakey=0x00FF00:similarity:blend
```

| 参数 | 含义 | 范围 | 建议起始值 |
|------|------|------|-----------|
| 第一个参数 | 关键色（绿色） | 颜色值 | `0x00FF00` |
| `similarity` | 颜色相似度阈值 | 0.01 ~ 1.0 | 0.15 ~ 0.30 |
| `blend` | 边缘混合程度 | 0.0 ~ 1.0 | 0.10 ~ 0.30 |

- `similarity` 越大，扣除越激进（更多绿色被移除，但可能吃掉主体边缘）
- `blend` 越大，边缘越柔和（透明过渡更自然，但可能残留绿色光晕）

### colorkey

```
colorkey=0x00FF00:similarity:blend
```

参数含义与 chromakey 相同，但色彩空间不同，边缘处理可能有差异。

## 推荐测试命令

以下命令在 PowerShell 中运行。将 `INPUT.mp4` 替换为你的绿幕视频路径。

### 测试 1：chromakey 保守参数

绿色扣除较少，边缘保留完整，适合检查主体是否被误扣。

```powershell
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.10:0.10,format=rgba" -frames:v 10 "test_chromakey_conservative_%04d.png"
```

### 测试 2：chromakey 中等参数

推荐起始值，多数绿幕视频适用。

```powershell
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,format=rgba" -frames:v 10 "test_chromakey_medium_%04d.png"
```

### 测试 3：chromakey 激进参数

绿色扣除更彻底，但可能吃掉主体边缘或半透明区域。

```powershell
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.35:0.25,format=rgba" -frames:v 10 "test_chromakey_aggressive_%04d.png"
```

### 测试 4：colorkey 中等参数

对比 chromakey 的边缘差异。

```powershell
ffmpeg -i INPUT.mp4 -vf "colorkey=0x00FF00:0.20:0.15,format=rgba" -frames:v 10 "test_colorkey_medium_%04d.png"
```

### 测试 5：带边缘去绿光（green screen spill）

绿幕常有绿色反光溢出到主体边缘，可用 `despill` 滤镜处理：

```powershell
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,despill=green:0.5:0.5,format=rgba" -frames:v 10 "test_chromakey_despill_%04d.png"
```

### 测试 6：缩放 + 裁剪

如果视频分辨率太大或需要裁剪画面：

```powershell
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,format=rgba,scale=512:-1" -frames:v 10 "test_chromakey_scaled_%04d.png"
```

## 完整提取命令

测试满意后，提取全部帧：

```powershell
# 提取全部帧为 PNG（保留透明通道）
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,format=rgba" "frames_real/%04d.png"

# 如果帧数过多，可以按帧率抽帧（例如每 2 帧取 1 帧）
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,format=rgba,fps=12" "frames_real/%04d.png"

# 输出 WebP（体积更小，但需要确认 FFmpeg 编译时包含 libwebp）
ffmpeg -i INPUT.mp4 -vf "chromakey=0x00FF00:0.20:0.15,format=rgba" -lossless 0 -quality 90 "frames_real/%04d.webp"
```

## 参数调优思路

### 绿色残留 → 增大 similarity

如果输出 PNG 中仍有绿色区域，增大 `similarity`：

```
chromakey=0x00FF00:0.25:0.15  →  chromakey=0x00FF00:0.30:0.15
```

### 主体边缘被吃掉 → 减小 similarity

如果主体边缘（毛发、耳朵）被误扣成透明，减小 `similarity`：

```
chromakey=0x00FF00:0.20:0.15  →  chromakey=0x00FF00:0.15:0.10
```

### 边缘太硬 / 锯齿 → 增大 blend

如果透明和实体之间过渡太生硬，增大 `blend`：

```
chromakey=0x00FF00:0.20:0.10  →  chromakey=0x00FF00:0.20:0.25
```

### 边缘有绿色光晕 → 加 despill

如果边缘有绿色反光，加 `despill` 滤镜：

```
chromakey=0x00FF00:0.20:0.15,despill=green:0.5:0.5
```

## 验证输出 PNG 是否透明

### 方法 1：文件大小对比

透明 PNG 比同尺寸的绿色背景 PNG 小很多。如果输出文件只有几 KB，可能没有正确编码 alpha 通道。

### 方法 2：用图片查看器打开

用支持 alpha 通道的查看器（如 Windows 照片应用、GIMP、Photoshop）打开 PNG：
- ✅ 透明：主体外区域显示为灰白棋盘格或完全透明
- ❌ 不透明：主体外区域仍为绿色

### 方法 3：FFmpeg 探测 alpha 通道

```powershell
# 查看 PNG 的像素格式，应包含 "rgba" 或 "pal8" + "alpha"
ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "test_chromakey_medium_0001.png"
```

输出应为 `rgba` 或 `rgba64`，如果输出 `rgb24` 则没有 alpha 通道。

### 方法 4：Python 脚本检查（可选）

```python
from PIL import Image
img = Image.open("test_chromakey_medium_0001.png")
print(f"模式: {img.mode}")  # 应输出 RGBA
alpha = img.getchannel("A")
print(f"Alpha 范围: {alpha.getextrema()}")  # 应输出 (0, 255)，既有透明也有不透明
```

## 接入 FurTwin 播放器

测试满意后：

1. 将输出帧放入 `src/renderer/public/assets/actions/idle/frames_real/`
2. 修改 `src/renderer/public/assets/actions/idle/config.json`：

```json
{
  "name": "idle",
  "label": "待机",
  "framesDir": "./assets/actions/idle/frames_real",
  "fps": 12,
  "scale": 0.5,
  "loop": true,
  "frameCount": 48,
  "frameWidth": 512,
  "frameHeight": 512,
  "framePattern": "{}.png"
}
```

3. `npm run dev` 运行验证

## 水印区域透明遮罩（Watermark Mask）

### 水印问题的来源

水印问题**主要出现在豆包网页端 / App 端免费生成的视频中**。免费渠道的视频通常在 **左上角** 和 **右下角** 带有平台水印。

后续如果 FurTwin 接入正式 API 生成流程（如 Doubao-Seedance API），或用户使用其他无水印素材来源，水印问题可能不存在。因此 FurTwin 不应为了免费渠道的水印而过度设计。

### FFmpeg 能力边界

FFmpeg 当前适合做：

- 绿幕扣除（chromakey / colorkey）
- 去绿色溢色（despill）
- 裁剪画面（crop）
- 把固定矩形区域设为透明（drawbox + replace=1）
- 输出透明 PNG/WebP 序列帧

FFmpeg **不适合**做：

- 自动识别复杂水印
- 恢复被水印遮挡的宠物毛发、身体、尾巴、脸部或物体
- 跨帧一致的视频级图像修复
- 真正意义上的自动去水印

### 当前 v0.1 策略

v0.1 **不做** 自动去水印、图像修复（inpaint）或内容补全。

优先级排序：

1. **首选：使用无水印素材来源** — 付费版豆包、正式 API、其他无水印生成工具
2. **后续：正式 API 生成** — 如果 API 输出无水印视频，则不需要水印处理
3. **当前测试：角落遮罩** — `--mask-preset doubao-free` 或 `--mask-region`，把水印角落设为透明
4. **高级手动：裁剪** — `--crop` / `--center-crop`，会改变画布尺寸，可能裁到主体
5. **不建议 v0.1 实现** — 自动去水印、inpaint、AI 修复、复杂专业工具集成

### 推荐方案：水印区域透明遮罩

与中心裁剪不同，遮罩方案**不改变画布尺寸**，只把左上角和右下角的小矩形区域设为透明。

原理：在 FFmpeg 滤镜链中，扣绿并输出 rgba 后，使用 `drawbox` + `replace=1` 把指定区域的像素（含 alpha）覆盖为完全透明。

```
chromakey → despill → format=rgba → drawbox(replace=1) → scale → fps
```

#### 使用预设

针对 1280×720 豆包免费视频，自动遮罩左上角（220×90）和右下角（260×90）：

```powershell
node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-preset doubao-free
```

#### 手动指定遮罩区域

可指定多个矩形区域（逗号分隔），格式 `x:y:w:h`：

```powershell
node scripts/extract-transparent-frames.mjs --input cat.mp4 --mask-region "0:0:220:90,1020:630:260:90"
```

### 遮罩方案的能力边界

`--mask-preset doubao-free` 和 `--mask-region` 的本质是**把指定矩形区域变成透明**，不是修复水印。

**适合的场景：**

- 水印位于画面角落（左上角、右下角）
- 宠物主体远离水印区域
- 用户接受角落区域变透明

**不适合的场景：**

- 宠物尾巴、身体、脸部、食盆等与水印区域重叠
- 需要完整保留主体细节的正式素材
- 水印不在固定角落位置

如果水印区域与宠物主体重叠，遮罩会把主体也擦掉。此时建议重新生成无水印素材，或调整生成构图让主体远离水印区域。

### 生成视频时的建议

推荐在 prompt 中强调主体位于画面中央并保留安全边距：

> 动物主体始终完整位于画面中，四周保留少量安全边距，不要贴边。

这样水印区域与主体不会重叠，遮罩方案效果最好。

### 高级：手动裁剪（Crop）

裁剪会改变画布尺寸，可能裁掉宠物主体，仅在明确需要时使用：

```powershell
# 手动裁剪（FFmpeg 原生格式 w:h:x:y）
node scripts/extract-transparent-frames.mjs --input cat.mp4 --crop "1024:576:128:72"

# 中心裁剪（自动计算偏移，⚠️ 可能裁掉宠物主体）
node scripts/extract-transparent-frames.mjs --input cat.mp4 --center-crop "1024:576"
```

⚠️ 实测发现 1024×576 中心裁剪可能裁掉躺卧、横向伸展、尾巴靠近边缘的宠物。**不推荐作为默认方案**。

### 后续方向（v0.2+）

更高级的去水印或视频修复可以作为后续研究项，但不进入 v0.1：

- **Video inpainting** — 视频级内容感知修复，需要 AI 模型
- **Object removal** — 自动识别并移除水印，需要 AI 模型
- **Professional compositing / keying tools** — 专业后期工具
- **CorridorKey** — 主要解决扣像质量（matting/keying），不等同于去水印
- **自动 alpha bbox 裁剪** — 扫描所有帧的 alpha 通道，自动计算包含主体的最小 bounding box

## 已知限制

- `chromakey` 对光照不均匀的绿幕效果有限，可能需要分区域调参
- 深色毛发动物（黑猫、黑狗）的边缘可能较难处理
- 半透明区域（如耳朵薄光）可能被过度扣除
- 免费生成视频可能有水印，遮罩方案只适合水印不与主体重叠的情况
- 当前仅测试 Windows PowerShell 命令，macOS/Linux 路径格式不同
