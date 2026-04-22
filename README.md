<div align="center">

<img src="img/logo.png" width="128" height="128" alt="Logo">

<a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>

# DY Video Downloader

**一键下载抖音视频，轻松管理你的数字资产**

[![Python](https://img.shields.io/badge/Python-3.7+-blue.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

</div>

---

## ✨ 为什么选择 DY Video Downloader？

🚀 **极速下载** - AsyncIO 异步引擎，多任务并发，跑满带宽

🎯 **精准检索** - 支持昵称/抖音号/链接，一键获取全部作品

🧠 **智能去重** - 指纹对比算法，自动跳过已下载内容

🌐 **现代界面** - Web 控制台，实时进度，任务可视化管理

💾 **断点续传** - 大文件也不怕，网络中断自动恢复

📦 **开箱即用** - 无需配置环境，下载即运行

---

## 🎥 界面预览

<p align="center">
  <img src="img/index.png" alt="主界面">
</p>

<p align="center">
  <img src="img/get_user.png" alt="用户搜索">
</p>

<p align="center">
  <img src="img/downloading.png" alt="下载监控">
</p>

---

## 🚀 快速开始

### 方式一：下载运行包（推荐）

从 [Releases](../../releases/latest) 下载对应平台的包，解压运行即可。

> **macOS 用户**：如果提示"无法验证开发者"，在终端执行：
> ```bash
> sudo xattr -rd com.apple.quarantine /path/to/douyin_downloader.app
> ```

### 方式二：源码运行

```bash
git clone https://github.com/anYuJia/DY_video_downloader.git
cd DY_video_downloader
pip install -r requirements.txt
python main.py
```

浏览器打开 http://localhost:5001，扫码登录后即可使用。

---

## 📋 功能清单

| 功能 | 描述 |
|:---|:---|
| 用户检索 | 昵称 / 抖音号 / 主页链接，三种方式任选 |
| 批量下载 | 一键添加全部作品到队列 |
| 实时进度 | WebSocket 推送，网速、进度实时可见 |
| 任务管理 | 暂停 / 恢复 / 取消，完全掌控 |
| 自动命名 | 按博主分类，作品按时间戳命名 |

---

## ⚠️ 免责声明

本工具仅供个人学习研究使用，请勿用于商业用途或大规模爬取。因滥用导致的后果，项目贡献者不承担责任。

---

<p align="center">觉得有用？给个 ⭐ Star 支持一下</p>

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" alt="Star History Chart">
  </a>
</p>
