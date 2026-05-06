<div align="center">

<img src="img/logo.png" width="128" height="128" alt="DY Video Downloader Logo">

<a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>

# DY Video Downloader

面向抖音 Web 端的桌面级下载与内容归档工具，提供原生窗口和本地 Web 控制台，用于搜索用户、解析作品链接、批量下载资源，并管理下载历史。

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-2ea44f.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-555.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

[核心能力](#核心能力) • [界面预览](#界面预览) • [快速开始](#快速开始) • [配置说明](#配置说明) • [常见问题](#常见问题) • [项目结构](#项目结构)

</div>

---

## 项目简介

DY Video Downloader 将抖音 Web 接口访问、Cookie 获取、批量下载、任务调度和本地归档整合到一个可视化桌面应用中。后端基于 Flask + Socket.IO，桌面外壳使用 pywebview，既支持直接下载发行版，也支持源码运行。

适合个人内容备份、素材整理和 Web 端下载流程研究。不建议也不支持商业采集、批量爬取或任何违反平台规则的用途。

## 核心能力

| 能力 | 说明 |
|:---|:---|
| 用户检索 | 支持昵称、抖音号、主页链接等方式定位用户 |
| 批量下载 | 获取作品列表并加入下载队列，支持视频、图集与部分 Live Photo 资源 |
| 单条解析 | 粘贴作品链接后解析详情并下载单条资源 |
| 下载历史 | 在界面中查看、打开、定位、移动或删除已下载文件 |
| 实时进度 | 通过 Socket.IO 推送任务状态、日志、速度和进度 |
| 任务控制 | 支持暂停、恢复、取消，适合长队列下载 |
| Cookie 辅助 | 支持浏览器登录、浏览器 Cookie 读取和临时 Cookie 获取 |
| 桌面运行 | 默认打开 pywebview 原生窗口，不必手动启动浏览器 |

## 界面预览

<p align="center">
  <img src="img/index.png" alt="主界面">
</p>

<p align="center">
  <img src="img/get_user.png" alt="用户选择">
</p>

<p align="center">
  <img src="img/downloading.png" alt="下载监控">
</p>

## 快速开始

### 方式一：下载发行版

从 [Releases](../../releases/latest) 下载对应平台的安装包或压缩包，解压后运行即可。

当前发行产物大致包括：

- macOS：`.app` 和 `.dmg`
- Windows：便携版 `.zip` 和安装版 `.exe`
- Linux：`.tar.gz`

发行版会自动启动本地服务并打开桌面窗口。

macOS 如果提示“无法验证开发者”，可在终端执行：

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
```

#### 桌面模式

```bash
python main.py
```

说明：

- 会启动本地 Flask + Socket.IO 服务。
- 会自动选择 `5001` 到 `5010` 间的空闲端口。
- 会打开 pywebview 原生窗口，而不是普通浏览器标签页。

#### 浏览器 / 无界面模式

```bash
python -m src.web.web_app
```

说明：

- 默认监听 `127.0.0.1:5001`。
- 可通过环境变量调整监听地址和端口：

```bash
HOST=127.0.0.1 PORT=5001 python -m src.web.web_app
```

#### Cookie 获取方式

当前支持 3 种方式：

- 内置登录窗口
- 从本机浏览器读取 Cookie
- 手动粘贴 Cookie

## 使用流程

1. 启动应用并在设置中配置 Cookie 和下载目录。
2. 通过浏览器登录、浏览器 Cookie 读取或手动粘贴方式完成 Cookie 配置。
3. 使用昵称、抖音号或主页链接检索目标用户。
4. 从作品列表、单条详情、点赞视频或点赞作者入口发起下载任务。
5. 在底部任务面板查看实时进度，并在“我的下载”中管理本地文件。

## 配置说明

应用会在程序执行目录下生成 `config.json`。当前主要字段：

| 字段 | 说明 |
|:---|:---|
| `cookie` | 抖音 Cookie。未配置时，部分接口不可用 |
| `base_dir` | 当前下载目录 |
| `history_dirs` | 历史下载目录列表，用于统一展示已下载文件 |

常用环境变量：

| 环境变量 | 作用 |
|:---|:---|
| `DOUYIN_COOKIE` | 启动时注入 Cookie |
| `DOUYIN_BASE_DIR` | 指定下载根目录 |
| `HOST` | 浏览器 / 无界面模式下的监听地址 |
| `PORT` | 浏览器 / 无界面模式下的监听端口 |
| `DEBUG_MODE=true` | 开启更详细的后端与 Socket.IO 日志 |

## 技术栈

| 模块 | 技术 |
|:---|:---|
| 桌面容器 | pywebview |
| Web 服务 | Flask, Flask-SocketIO |
| 并发下载 | asyncio, aiohttp, requests |
| 浏览器能力 | pywebview, browser-cookie3 |
| 前端界面 | Bootstrap, 原生 JavaScript |
| 打包分发 | PyInstaller |

## 项目结构

```text
.
├── main.py                  # 桌面入口与子进程分发
├── src/
│   ├── api/                 # 抖音接口、签名、Cookie 与浏览器回退
│   ├── config/              # 配置加载、保存与资源路径
│   ├── downloader/          # 媒体下载、进度回调与去重记录
│   ├── user/                # 用户检索、作品列表与内容解析
│   ├── utils/               # 通用工具
│   └── web/                 # Flask 路由、Socket.IO 与前端资源
├── lib/js/                  # Web 端签名脚本
├── scripts/                 # 安装器与辅助脚本
├── icons/                   # 应用图标资源
└── img/                     # README 展示图片
```

## 常见问题

### Cookie 失效或无法获取作品怎么办

抖音 Web 端 Cookie 有时效性，也可能受账号状态、风控或接口变动影响。建议重新登录获取 Cookie，并确认当前账号在浏览器中可以正常访问目标内容。

### 下载速度慢或失败怎么办

速度受网络、资源可用性和平台响应影响。可以尝试更换网络、减少并发任务、重新获取 Cookie，或稍后重试。

### 为什么已下载作品会被跳过

项目会在作者目录下维护下载记录，以避免重复下载同一作品。如果你移动了文件或手动修改了下载目录，请在“我的下载”中确认当前目录配置。

### Linux 服务器能不能跑

可以。更适合使用浏览器 / 无界面模式，而不是桌面模式；如果需要远程访问，请自行处理反向代理、访问控制和 Cookie 暴露风险。

## 相关项目

[Rust 重构版](https://github.com/anYuJia/douyin-downloader-rust)：更小体积、更高性能的实现方向。

## 免责声明

本项目仅供个人学习、研究和内容备份使用。使用者应自行确认下载行为符合相关法律法规、平台服务条款和内容版权要求。任何因不当使用、商业采集、批量爬取或侵犯第三方权益导致的后果，均由使用者自行承担。

---

<p align="center">如果这个项目对你有帮助，欢迎 Star 支持。</p>

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" alt="Star History Chart">
  </a>
</p>
