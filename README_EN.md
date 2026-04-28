<div align="center">

<img src="img/logo.png" width="128" height="128" alt="DY Video Downloader Logo">

<a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>

# DY Video Downloader

**A desktop-grade Douyin Web video downloader and local archive manager**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-2ea44f.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-555.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

</div>

---

## Overview

DY Video Downloader integrates Douyin Web API access, Cookie acquisition, batch downloads, task scheduling, and local file archiving into a visual desktop application. It uses Flask + Socket.IO for real-time task feedback and wraps the local Web UI with pywebview for a native desktop experience.

This project is intended for personal content backup, media organization, and research into Web-side download workflows. It is not intended for commercial collection, large-scale scraping, or any usage that violates platform rules.

## Core Capabilities

| Capability | Description |
|:---|:---|
| User search | Locate users by nickname, Douyin ID, or profile URL |
| Batch download | Fetch a creator's works and add videos or image posts to the download queue |
| Single-item parsing | Parse shared links, fetch item details, and download individual works |
| Real-time progress | Push task status, speed, progress, and logs through WebSocket |
| Task control | Pause, resume, and cancel long-running download queues |
| Local archive | Save files by creator folder and skip duplicated works with download records |
| Download history | View, open, move, or delete downloaded files from the Web UI |
| Cookie helpers | Browser login, browser Cookie reading, and temporary Cookie generation |

## Screenshots

<p align="center">
  <img src="img/index.png" alt="Main interface">
</p>

<p align="center">
  <img src="img/get_user.png" alt="User search">
</p>

<p align="center">
  <img src="img/downloading.png" alt="Download monitor">
</p>

## Quick Start

### Option 1: Download a Release

Download the package for your platform from [Releases](../../releases/latest), extract it, and run the application. Release builds start the local service and open the desktop window automatically.

If macOS reports that the developer cannot be verified, run:

```bash
sudo xattr -rd com.apple.quarantine /path/to/douyin_downloader.app
```

### Option 2: Run from Source

```bash
git clone https://github.com/anYuJia/DY_video_downloader.git
cd DY_video_downloader

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
python main.py
```

The application chooses an available port between `127.0.0.1:5001` and `127.0.0.1:5010`, then opens a pywebview desktop window. If the window does not open automatically, check the terminal output for the actual port and open it in a browser.

If you need browser login or Cookie helper features, install Playwright browser dependencies first:

```bash
python -m playwright install chromium
```

## Usage Flow

1. Start the application and configure Cookie and download directory in settings.
2. Set Cookie through browser login, browser Cookie reading, or manual paste.
3. Search a target user by nickname, Douyin ID, or profile URL.
4. Start a download task from the work list, a single item, or liked-content entry points.
5. Monitor progress in the task panel and manage local files in download history.

## Configuration

The application creates `config.json` next to the executable or project root to store Cookie, download directory, and historical download directories. The default download directory is:

```text
./douyin_download
```

Some configuration can also be overridden through environment variables:

| Environment Variable | Purpose |
|:---|:---|
| `DOUYIN_COOKIE` | Inject Cookie on startup |
| `DOUYIN_BASE_DIR` | Set the download root directory |
| `DEBUG_MODE=true` | Enable backend and Socket.IO debug logs |

## Tech Stack

| Module | Technology |
|:---|:---|
| Desktop shell | pywebview |
| Web service | Flask, Flask-SocketIO |
| Download concurrency | asyncio, aiohttp, requests |
| Browser automation | Playwright, browser-cookie3 |
| Frontend | Bootstrap, vanilla JavaScript |
| Packaging | PyInstaller |

## Project Structure

```text
.
├── main.py                  # Desktop entrypoint and worker dispatcher
├── src/
│   ├── api/                 # Douyin APIs, signing, Cookie, and browser requests
│   ├── config/              # Config loading, persistence, and resource paths
│   ├── downloader/          # Media downloads, progress callbacks, and dedupe records
│   ├── user/                # User search, work lists, and content parsing
│   ├── utils/               # Playwright environment checks
│   └── web/                 # Flask routes, Socket.IO, and frontend assets
├── lib/js/                  # Web signing scripts
├── scripts/                 # Packaging and installer scripts
├── icons/                   # Application icons
└── img/                     # README screenshots and display assets
```

## FAQ

**Cookie expired or works cannot be fetched?**

Douyin Web Cookies expire and may be affected by account status, risk control, or API changes. Refresh the Cookie and confirm the account can access the target content in a normal browser session.

**Downloads are slow or fail?**

Download speed depends on network conditions, resource availability, and platform responses. Try another network, reduce concurrent tasks, refresh Cookie, or retry later.

**Why are already downloaded works skipped?**

The project keeps download records in creator directories to avoid downloading the same work repeatedly. If you moved files or changed download directories manually, check the current directory configuration in download history.

## Related Projects

[Rust rewrite](https://github.com/anYuJia/douyin-downloader-rust): a smaller and higher-performance implementation direction.

## Disclaimer

This project is for personal learning, research, and content backup only. Users are responsible for ensuring that their usage complies with applicable laws, platform terms, and content copyright requirements. Any consequences caused by misuse, commercial collection, large-scale scraping, or infringement of third-party rights are solely the user's responsibility.

---

<p align="center">If this project helps you, a Star is appreciated.</p>

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" alt="Star History Chart">
  </a>
</p>
