# FFmpeg 本地二进制

本目录用于放置 packaged build 所需的 FFmpeg 二进制文件。

## 需要手动放入

- `ffmpeg.exe`
- `ffprobe.exe`

可从 [FFmpeg 官方构建](https://github.com/BtbN/FFmpeg-Builds/releases) 下载 Windows 版本。

## 注意事项

- 这两个 `.exe` 不提交到 git（已加入 `.gitignore`）
- `npm run dist` 前会自动检查它们是否存在
- 后续可能改为 Git LFS、下载脚本或安装包内嵌策略
