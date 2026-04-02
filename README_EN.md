<div align="center">

[简体中文](README.md) | **English**

# 🎥 DY Video Downloader

**A next-generation intelligent, high-performance Douyin (TikTok CN) multimedia resource scraper and management platform**

[![Python 3.7+](https://img.shields.io/badge/Python-3.7+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=for-the-badge)]()
[![Web Interface](https://img.shields.io/badge/Web%20Interface-Modern-brightgreen.svg?style=for-the-badge)]()

[Features](#-features) • [Quick Start](#-quick-start) • [Configuration](#-configuration) • [Usage Guide](#-usage-guide) • [FAQ](#-faq)

</div>

<br/>

**DY Video Downloader** is built for creators and digital marketers who need fast, stable, and bulk access to Douyin platform resources. It goes beyond traditional command-line tools by offering a modern, highly interactive Web console, powered by an efficient async architecture and intelligent fingerprint verification — delivering an enterprise-grade data sync and digital asset management experience.

---

## ✨ Core Features

We've optimized the underlying architecture and redesigned the interaction layer to provide a full set of "zero-config, out-of-the-box" advanced capabilities:

| 🎯 Smart Resource Discovery | 🚀 Ultimate Download Performance |
| :--- | :--- |
| **Multi-dimensional Search**: Supports nickname, Douyin ID, and profile URL for comprehensive discovery. <br> **Dynamic Crawling**: Automatically handles slider CAPTCHAs and anti-scraping mechanisms to deeply extract content data. <br> **Full Format Support**: Seamlessly handles standard videos, image collections, and even Live Photo formats. | **High-Concurrency Engine**: Built on AsyncIO, maximizing network throughput and saturating bandwidth. <br> **Resumable Downloads**: Intelligent chunking and network error recovery — handles multi-GB tasks with ease. <br> **Precise Deduplication**: Fingerprint comparison and local hash caching ensure no video is downloaded twice. |

| 🌐 Modern Dashboard | 💼 Enterprise-Grade Storage |
| :--- | :--- |
| **Full-Duplex Communication**: WebSocket delivers millisecond-level task status streaming, tracking every chunk in progress. <br> **Responsive Design**: Adapts to desktop and tablet, supports drag-to-recognize and batch selection. | **Tiered Archiving**: Creates independent multi-level directories per target creator, with files organized by timestamp/name. <br> **Unified Task Management**: Full task lifecycle management built into the console (pause/resume/cancel/retry). |

---

## 📸 Preview

An intuitive immersive management interface that drastically reduces your learning curve.

> **Dashboard**
> 
> Provides global data oversight, including real-time connection status, target user search, and current configuration overview.
![Main Interface](img/index.png)

> **Deep Search & Profile Analysis**
> 
> Enter a creator's link to instantly retrieve the complete list of posts, including hidden watermark-free content.
![User Search](img/get_user.png)

> **Download Monitoring Center**
> 
> Visual download process analysis — real-time speed, estimated time remaining, and error logs at a glance.
![Download Monitor](img/downloading.png)

---

## 🚀 Quick Start

We provide two deployment options: **standalone packages** and **source code deployment**.

### A. Zero-Config Standalone Package (Recommended)
If you don't want to set up a Python environment, download the release package for your platform from GitHub Releases:

👉 **[Download Latest macOS ARM64 Package (v1.0.0)](../../releases/latest)**

Extract and run `douyin_downloader` directly.

### B. Developer Source Deployment
If you're a developer or need customization:
```bash
# Clone the repository
git clone https://github.com/anYuJia/DY_video_downloader.git
cd DY_video_downloader

# Create and activate a virtual environment (optional)
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt
```

### 2. Start the Service
Once the environment is ready, start the server — it will auto-generate default dependencies and configuration.

```bash
python main.py
```

### 3. Access the Web Console
> 🎉 **Successfully started!** Open [http://localhost:5001](http://localhost:5001) in your browser. The first-run wizard will automatically guide you through authentication and Cookie setup — **no manual config file editing required**.

---

## ⚙️ Configuration

While the system is highly automated, advanced users can customize local parameters by editing the `config.json` generated in the root directory after first run:

| Parameter | Description | Default |
| :--- | :--- | :--- |
| `cookie` | Auth identity token. **Automatically populated when you log in via the Web UI — manual editing is usually unnecessary.** | `""` |
| `base_dir` | Base path for downloaded media, supports relative/absolute paths | `"./douyin_download"` |
| `chunk_size` | TCP stream download chunk size (bytes). Adjust to balance memory usage and I/O performance | `1048576` (1MB) |

---

## 🎯 Usage Guide

**Batch Download a Creator's Content**
1. Navigate to the **Content Search** tab in the sidebar.
2. Enter one of three supported identifiers: `Douyin nickname`, `Douyin ID`, or `full profile URL`.
3. The engine will automatically crawl all data for that user. Use the frontend checkboxes to filter precisely, then click "Add to Download Queue".

---

## 🔧 FAQ

- **Q: User search frequently fails / shows "signature error"?**
  - **A**: Usually caused by an expired Cookie or risk control timeout. Go back to the web interface, re-scan the QR code for verification, and restart with the updated Cookie.
- **Q: Logs show WebSocket failed to start, download progress stuck at 0%?**
  - **A**: Check if port 5001 is occupied by another process (e.g., macOS native Control Center service). Try remapping the port in the `main.py` configuration at the bottom of the file.
- **Q: Can it run headlessly on a Linux server?**
  - **A**: Absolutely. The Web UI frontend and backend are fully decoupled. The server is built entirely on Python native libraries, making it suitable for deployment on CentOS/Ubuntu or other headless systems — just access the console remotely via IP + port.

---

## ⚖️ Disclaimer

This tool is published and shared solely for academic exploration and technical exchange.
1. Do not bypass the target platform's rate limiting for malicious high-frequency requests;
2. Locally cached media content must not be redistributed, repackaged, or used for commercial profit;
3. **The project contributors bear no liability for any consequences arising from misuse of this project, including account bans or legal disputes.**

<br/>
<div align="center">
  If <b>DY Video Downloader</b> has improved your workflow, please consider giving it a ⭐ <b>Star</b>.
  <br><br>
  
  [Report Issues](../../issues) • [Submit Pull Requests](../../pulls)
</div>
