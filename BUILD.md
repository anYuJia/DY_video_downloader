# 构建说明

## 打包格式

### macOS
- **格式**: `.app` bundle
- **文件名**: `DY Video Downloader.app`
- **分发包**: `DY-Video-Downloader-{version}-macos-{arch}.tar.gz`
- **架构**:
  - `arm64`: Apple Silicon (M1/M2/M3)
  - `intel`: Intel-based Mac

### Windows
- **格式**: 单文件 `.exe`
- **文件名**: `DY Video Downloader.exe`
- **分发包**: `DY-Video-Downloader-{version}-windows-x64.zip`
- **安装**: 解压后直接运行，无需安装

### Linux
- **格式**: 文件夹
- **文件名**: `douyin_downloader/`
- **分发包**: `DY-Video-Downloader-{version}-linux-x64.tar.gz`

## 本地构建

### 前提条件
```bash
pip install pyinstaller
```

### 构建命令
```bash
pyinstaller build.spec --clean --noconfirm
```

### 构建产物
- **macOS**: `dist/DY Video Downloader.app`
- **Windows**: `dist/DY Video Downloader.exe`
- **Linux**: `dist/douyin_downloader/`

## GitHub Actions 自动构建

推送到 tag 或手动触发 workflow 后，GitHub Actions 会自动：
1. 在 macOS、Windows、Linux 上构建
2. 打包成对应的格式
3. 创建 GitHub Release
4. 上传构建产物

## Windows 安装包（可选）

如需创建 Windows 安装包，可使用 `build/windows_installer.nsi` (NSIS):

```bash
# 安装 NSIS
choco install nsis

# 编译安装包
makensis build/windows_installer.nsi
```

生成的安装包: `dist/DY_Video_Downloader_Setup_v{version}.exe`
