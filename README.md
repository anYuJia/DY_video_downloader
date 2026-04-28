<div align="center">

<img src="img/logo.png" width="128" height="128" alt="DY Video Downloader Logo">

<a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>

# DY Video Downloader

**面向抖音 Web 端的桌面级视频下载与内容归档工具**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-2ea44f.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-555.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

</div>

---

## 项目简介

DY Video Downloader 将抖音 Web 接口解析、Cookie 获取、批量下载、任务调度和本地归档整合到一个可视化桌面应用中。项目采用 Flask + Socket.IO 提供实时任务反馈，并通过 pywebview 封装为原生窗口，兼顾源码运行和打包分发场景。

适合用于个人内容备份、素材整理和 Web 端下载流程研究。不建议也不支持用于商业采集、批量爬取或任何违反平台规则的用途。

## 核心能力

| 能力 | 说明 |
|:---|:---|
| 用户检索 | 支持昵称、抖音号、主页链接等方式定位用户 |
| 批量下载 | 获取用户作品列表并加入下载队列，支持视频与图集资源 |
| 单条解析 | 支持作品链接解析、详情获取和单作品下载 |
| 实时进度 | 基于 WebSocket 推送任务状态、速度、进度和日志 |
| 任务控制 | 支持暂停、恢复、取消，适合长队列下载场景 |
| 本地归档 | 按作者目录保存文件，维护下载记录并自动跳过重复作品 |
| 下载历史 | 在 Web 界面中查看、打开、移动或删除已下载文件 |
| Cookie 辅助 | 支持浏览器登录、浏览器 Cookie 读取和临时 Cookie 获取 |

## 界面预览

<p align="center">
  <img src="img/index.png" alt="主界面">
</p>

<p align="center">
  <img src="img/get_user.png" alt="用户搜索">
</p>

<p align="center">
  <img src="img/downloading.png" alt="下载监控">
</p>

## 快速开始

### 方式一：下载发行版

从 [Releases](../../releases/latest) 下载对应平台的安装包或压缩包，解压后运行即可。发行版会自动启动本地服务并打开桌面窗口。

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
python main.py
```

应用默认会在 `127.0.0.1:5001` 到 `127.0.0.1:5010` 之间选择可用端口，并通过 pywebview 打开桌面窗口。若窗口未自动打开，可在终端输出中查看实际端口并用浏览器访问。

如需使用浏览器自动登录或 Cookie 辅助能力，首次运行可能需要安装 Playwright 浏览器依赖：

```bash
python -m playwright install chromium
```

## 使用流程

1. 启动应用，进入配置页设置 Cookie 和下载目录。
2. 通过浏览器登录、浏览器 Cookie 读取或手动粘贴方式完成 Cookie 配置。
3. 使用昵称、抖音号或主页链接检索目标用户。
4. 选择作品列表、单条作品或喜欢列表等入口发起下载任务。
5. 在任务面板查看实时进度，并在下载历史中管理本地文件。

## 配置说明

应用会在程序执行目录下生成 `config.json`，用于保存 Cookie、下载目录和历史目录信息。默认下载目录为：

```text
./douyin_download
```

也可以通过环境变量覆盖部分配置：

| 环境变量 | 作用 |
|:---|:---|
| `DOUYIN_COOKIE` | 启动时注入 Cookie |
| `DOUYIN_BASE_DIR` | 指定下载根目录 |
| `DEBUG_MODE=true` | 开启后端与 Socket.IO 调试日志 |

## 技术栈

| 模块 | 技术 |
|:---|:---|
| 桌面容器 | pywebview |
| Web 服务 | Flask, Flask-SocketIO |
| 并发下载 | asyncio, aiohttp, requests |
| 浏览器能力 | Playwright, browser-cookie3 |
| 前端界面 | Bootstrap, 原生 JavaScript |
| 打包分发 | PyInstaller |

## 项目结构

```text
.
├── main.py                  # 桌面应用入口与子进程分发
├── src/
│   ├── api/                 # 抖音接口、签名、Cookie 与浏览器请求
│   ├── config/              # 配置加载、保存与资源路径处理
│   ├── downloader/          # 媒体下载、进度回调与去重记录
│   ├── user/                # 用户检索、作品列表与内容解析
│   ├── utils/               # Playwright 环境检测
│   └── web/                 # Flask 路由、Socket.IO 与前端资源
├── lib/js/                  # Web 端签名相关脚本
├── scripts/                 # 打包与安装器脚本
├── icons/                   # 应用图标资源
└── img/                     # README 截图与展示图片
```

## 常见问题

**Cookie 失效或无法获取作品怎么办？**

抖音 Web 端 Cookie 有时效性，也可能受账号状态、风控或接口变动影响。建议重新登录获取 Cookie，并确认当前账号在浏览器中可以正常访问目标内容。

**下载速度慢或失败怎么办？**

速度受网络、目标资源可用性和平台响应影响。可以尝试更换网络、减少并发任务、重新获取 Cookie，或稍后重试。

**为什么已经下载过的作品会被跳过？**

项目会在作者目录下维护下载记录，用于避免重复下载同一作品。如果移动或手动修改下载目录，请在下载历史中确认当前目录配置。

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
