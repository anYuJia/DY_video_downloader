<div align="center">

<img src="img/logo.png" width="128" height="128" alt="Logo">

[简体中文](README.md) | **English**

# DY Video Downloader

**Download Douyin videos easily, manage your digital assets effortlessly**

[![Python](https://img.shields.io/badge/Python-3.7+-blue.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

</div>

---

## ✨ Why DY Video Downloader?

🚀 **Lightning Fast** - AsyncIO async engine, concurrent downloads, maximize bandwidth

🎯 **Precise Search** - Support nickname / Douyin ID / link, get all works with one click

🧠 **Smart Deduplication** - Fingerprint comparison algorithm, skip downloaded content

🌐 **Modern Interface** - Web console, real-time progress, visual task management

💾 **Resume Downloads** - Handle large files with ease, auto-recover from network interruptions

📦 **Ready to Use** - No environment setup needed, download and run

---

## 🎥 Screenshots

<p align="center">
  <img src="img/index.png" alt="Main Interface">
</p>

<p align="center">
  <img src="img/get_user.png" alt="User Search">
</p>

<p align="center">
  <img src="img/downloading.png" alt="Download Monitor">
</p>

---

## 🚀 Quick Start

### Option 1: Download Release Package (Recommended)

Download the package for your platform from [Releases](../../releases/latest), extract and run.

> **macOS Users**: If you see "cannot verify developer", run this in Terminal:
> ```bash
> sudo xattr -rd com.apple.quarantine /path/to/douyin_downloader.app
> ```

### Option 2: Run from Source

```bash
git clone https://github.com/anYuJia/DY_video_downloader.git
cd DY_video_downloader
pip install -r requirements.txt
python main.py
```

Open http://localhost:5001 in your browser, scan QR code to login.

---

## 📋 Features

| Feature | Description |
|:---|:---|
| User Search | Nickname / Douyin ID / Profile URL |
| Batch Download | Add all works to queue with one click |
| Real-time Progress | WebSocket push, speed and progress visible |
| Task Management | Pause / Resume / Cancel, full control |
| Auto Naming | Organized by creator, files named by timestamp |

---

## ⚠️ Disclaimer

This tool is for personal learning and research only. Do not use for commercial purposes or large-scale scraping. Contributors are not responsible for any consequences caused by misuse.

## 🔗 Related Projects

[Rust Version](https://github.com/anYuJia/douyin-downloader-rust) - Higher performance, smaller binary

---

<p align="center">Find it useful? Give it a ⭐ Star</p>

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" alt="Star History Chart">
  </a>
</p>
