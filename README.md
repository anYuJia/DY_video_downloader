<div align="center">

<img src="animated_icon.svg" width="128" height="128" alt="DY Video Downloader Logo">

# DY Video Downloader

抖音内容下载与本地归档工具，支持用户搜索、链接解析、批量下载、推荐流预览和本地文件管理。

<p>
  <a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>
</p>

<p>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"></a>
  <a href="https://github.com/anYuJia/DY_video_downloader/releases/latest"><img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square" alt="Platform"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="License"></a>
</p>

[下载发行版](../../releases/latest) · [界面预览](#界面预览) · [快速开始](#快速开始) · [常见问题](#常见问题)

</div>

---

## 项目选择

当前有两个版本：

| 版本 | 适合人群 |
|:---|:---|
| **Python 版** | 想直接看源码、方便改功能，或更熟悉 Python 生态 |
| **Rust / Tauri 版** | 更推荐日常桌面使用，体积更小，启动和本地播放体验更好 |

Rust 版见：[douyin-downloader-rust](https://github.com/anYuJia/douyin-downloader-rust)。

## 主要功能

- 搜索抖音用户，查看用户主页、作品、收藏、点赞等内容
- 粘贴分享链接解析单条作品，并支持直接下载
- 批量下载视频、图集和部分 Live Photo 内容
- 推荐视频流预览，支持沉浸式播放和一键下载
- “我的下载”支持文件模式/作品模式、搜索、播放、定位和删除
- 自动识别已下载作品，避免重复下载
- Cookie 支持内置登录、浏览器读取和手动粘贴
- 数据、Cookie 和下载文件均保存在本机

## 界面预览

<p align="center">
  <a href="img/index.jpg"><img src="img/preview/index.jpg" width="100%" alt="主界面"></a>
  <br>
  <strong>主界面</strong>
</p>

<p align="center">
  <a href="img/get_user.jpg"><img src="img/preview/get_user.jpg" width="100%" alt="搜索用户"></a>
  <br>
  <strong>搜索用户</strong>
</p>

<p align="center">
  <a href="img/user_detail.jpg"><img src="img/preview/user_detail.jpg" width="100%" alt="用户主页"></a>
  <br>
  <strong>用户主页 / 批量下载</strong>
</p>

<p align="center">
  <a href="img/recommend.jpg"><img src="img/preview/recommend.jpg" width="100%" alt="推荐视频流"></a>
  <br>
  <strong>推荐视频流</strong>
</p>

<p align="center">
  <a href="img/playvideo.jpg"><img src="img/preview/playvideo.jpg" width="100%" alt="沉浸式播放器"></a>
  <br>
  <strong>沉浸式播放器</strong>
</p>

## 快速开始

### 方式一：下载发行版

从 [Releases](../../releases/latest) 下载对应平台的安装包或压缩包，解压后运行即可。

常见文件选择：

| 平台 | 推荐下载 |
|:---|:---|
| Windows | `.exe` 安装版或 `.zip` 便携版 |
| macOS | `.dmg` 或 `.app` |
| Linux | `.tar.gz` |

发行版会自动启动本地服务，并打开桌面窗口。

macOS 首次运行如果提示“无法验证开发者”，可执行：

```bash
sudo xattr -rd com.apple.quarantine /path/to/douyin_downloader.app
```

### 方式二：源码运行

```bash
git clone https://github.com/anYuJia/DY_video_downloader.git
cd DY_video_downloader

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..
```

桌面模式：

```bash
python main.py
```

浏览器 / 无界面模式：

```bash
python -m src.web.web_app
```

## 首次使用

1. 打开应用，在设置中配置 Cookie 和下载目录。
2. 通过内置登录、浏览器 Cookie 读取或手动粘贴完成登录态配置。
3. 使用“搜索用户”或“解析链接”获取内容。
4. 选择单个作品下载，或进入用户主页、收藏、点赞列表进行批量下载。
5. 在底部任务面板查看进度，在“我的下载”中管理本地文件。

## Cookie、数据与隐私

- Cookie 只用于本机请求抖音相关接口，不会上传到本项目服务器
- 下载历史、配置和缓存数据保存在本机
- 下载目录可在设置中修改
- 推荐、收藏、点赞和部分批量能力依赖有效 Cookie
- 如果接口突然不可用，优先检查 Cookie 是否过期、账号是否需要重新验证、网络是否可访问抖音相关域名

## 常见问题

### Cookie 失效或无法获取作品怎么办？

重新登录或重新读取 Cookie，并确认当前账号在浏览器中可以正常访问目标内容。

### 下载速度慢或失败怎么办？

速度受网络、资源可用性和平台响应影响。可以尝试更换网络、减少并发任务、刷新 Cookie，或稍后重试。

### 为什么下载质量切换后文件大小差不多？

部分作品本身只提供一种可下载地址，或不同清晰度经过平台转码后体积接近。实际可选质量取决于平台返回内容。

### 为什么已下载作品会被跳过？

应用会记录已下载作品并检查本地文件，避免重复下载。如果手动移动过文件或修改过下载目录，请在“我的下载”中确认当前目录。

### 可以在 Linux 服务器上运行吗？

可以。服务器环境更适合使用浏览器 / 无界面模式。若要远程访问，请自行处理访问控制、反向代理和 Cookie 暴露风险。

## 从源码开发

| 模块 | 技术 |
|:---|:---|
| 桌面窗口 | pywebview |
| 本地服务 | Flask, Flask-SocketIO |
| 下载能力 | asyncio, aiohttp, requests |
| 前端界面 | React, Vite, TypeScript, Tailwind CSS |
| 打包分发 | PyInstaller |

项目结构：

```text
.
├── main.py
├── src/
│   ├── api/
│   ├── config/
│   ├── downloader/
│   ├── user/
│   ├── utils/
│   └── web/
├── frontend/
├── scripts/
├── icons/
└── img/
```

## 免责声明

本项目仅供个人学习、研究和内容备份使用。请遵守相关法律法规、平台规则和内容版权要求，不得用于商业采集或大规模爬取。因不当使用造成的后果由使用者自行承担。

## Star History

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" width="100%" alt="DY_video_downloader Star History Chart">
  </a>
</p>

---

<p align="center">如果这个项目对你有帮助，欢迎 Star 支持。</p>
