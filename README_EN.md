<div align="center">

<img src="animated_icon.svg" width="128" height="128" alt="DY Video Downloader Logo">

<a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>

# DY Video Downloader

A desktop-grade Douyin Web downloader and local archive manager with a native window and local Web UI for searching creators, parsing share links, downloading media in bulk, and managing download history.

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-2ea44f.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-555.svg?style=flat-square)]()
[![Stars](https://img.shields.io/github/stars/anYuJia/DY_video_downloader?style=flat-square&logo=github)](../../stargazers)

[Core Capabilities](#core-capabilities) • [Screenshots](#screenshots) • [Quick Start](#quick-start) • [Configuration](#configuration) • [FAQ](#faq) • [Project Structure](#project-structure)

</div>

---

## Overview

DY Video Downloader combines Douyin Web access, Cookie acquisition, batch downloading, task scheduling, and local archiving into a visual desktop application. The backend uses Flask + Socket.IO, while pywebview wraps the local UI into a native window. It supports both packaged desktop builds and source-based runs.

It is suitable for personal backup, media organization, and research into Web-side download workflows. It is not intended for commercial collection, large-scale scraping, or any use that violates platform rules.

## Core Capabilities

| Capability | Description |
|:---|:---|
| User search | Locate creators by nickname, Douyin ID, or profile URL |
| Batch download | Fetch a creator's works and queue videos, image posts, and some Live Photo assets |
| Single-item parsing | Paste a share link, inspect item details, and download one work directly |
| Download history | View, open, locate, move, or delete downloaded files from the UI |
| Real-time progress | Push task state, logs, speed, and progress through Socket.IO |
| Task control | Pause, resume, and cancel long-running queues |
| Cookie helpers | Browser login, browser Cookie import, and temporary Cookie generation |
| Desktop startup | Open a pywebview native window instead of requiring a browser tab |

## Screenshots

<p align="center">
  <img src="img/index.png" alt="Main interface">
</p>

<p align="center">
  <img src="img/get_user.png" alt="User selection">
</p>

<p align="center">
  <img src="img/downloading.png" alt="Download monitor">
</p>

## Quick Start

### Option 1: Download a release build

Download the package for your platform from [Releases](../../releases/latest), extract it, and run the application.

Current release outputs roughly include:

- macOS: `.app` and `.dmg`
- Windows: portable `.zip` and installer `.exe`
- Linux: `.tar.gz`

Release builds start the local service and open the desktop window automatically.

If macOS reports that the developer cannot be verified, run:

```bash
sudo xattr -rd com.apple.quarantine /path/to/douyin_downloader.app
```

### Option 2: Run from source

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

#### Desktop mode

```bash
python main.py
```

Notes:

- This starts the local Flask + Socket.IO service.
- It automatically chooses an available port between `5001` and `5010`.
- It opens a pywebview native window rather than a normal browser tab.

#### Browser / headless mode

```bash
python -m src.web.web_app
```

Notes:

- The default bind address is `127.0.0.1:5001`.
- You can override bind address and port with environment variables:

```bash
HOST=127.0.0.1 PORT=5001 python -m src.web.web_app
```

#### Cookie acquisition

Current supported methods:

- built-in login window
- importing Cookie from a local browser
- manually pasting a Cookie

## Usage Flow

1. Start the application and configure Cookie and download directory in Settings.
2. Set Cookie through browser login, browser Cookie import, or manual paste.
3. Search a target user by nickname, Douyin ID, or profile URL.
4. Start download tasks from the work list, single-item detail, liked videos, or liked authors.
5. Monitor progress in the bottom task panel and manage files in "My Downloads".

## Configuration

The application creates `config.json` in the runtime directory. Main fields:

| Field | Description |
|:---|:---|
| `cookie` | Douyin Cookie. Some features are unavailable without it |
| `base_dir` | Current download directory |
| `history_dirs` | Historical download directories shown in the unified downloads view |

Useful environment variables:

| Environment Variable | Purpose |
|:---|:---|
| `DOUYIN_COOKIE` | Inject Cookie on startup |
| `DOUYIN_BASE_DIR` | Set the download root directory |
| `HOST` | Bind address for browser / headless mode |
| `PORT` | Port for browser / headless mode |
| `DEBUG_MODE=true` | Enable more verbose backend and Socket.IO logs |

## Tech Stack

| Module | Technology |
|:---|:---|
| Desktop shell | pywebview |
| Web service | Flask, Flask-SocketIO |
| Download concurrency | asyncio, aiohttp, requests |
| Browser capability | pywebview, browser-cookie3 |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Packaging | PyInstaller |

## Project Structure

```text
.
├── main.py                  # Desktop entrypoint and worker dispatcher
├── src/
│   ├── api/                 # Douyin APIs, signing, Cookie, and browser fallback
│   ├── config/              # Config loading, persistence, and resource paths
│   ├── downloader/          # Media downloads, progress callbacks, and dedupe records
│   ├── user/                # User search, works list, and content parsing
│   ├── utils/               # Generic utilities
│   └── web/                 # Flask routes, Socket.IO, and React build output
├── frontend/                # React/Vite frontend source
├── lib/js/                  # Web signing scripts
├── scripts/                 # Installer and helper scripts
├── icons/                   # Application icons
└── img/                     # README assets
```

## FAQ

### What if the Cookie expires or works cannot be fetched

Douyin Web Cookies expire and can also be affected by account state, platform risk control, or API changes. Refresh the Cookie and confirm that the account can access the target content in a normal browser session.

### What if downloads are slow or fail

Speed depends on network conditions, resource availability, and platform responses. Try another network, reduce concurrent tasks, refresh the Cookie, or retry later.

### Why are already-downloaded works skipped

The project stores download records inside creator directories to avoid downloading the same work repeatedly. If you moved files or changed download directories manually, verify the active directory configuration in "My Downloads".

### Can it run on a Linux server

Yes. Browser / headless mode is more appropriate than desktop mode. If you expose it remotely, handle reverse proxying, access control, and Cookie exposure risks yourself.

## Related Projects

[Rust rewrite](https://github.com/anYuJia/douyin-downloader-rust): a smaller and higher-performance implementation direction.

## Disclaimer

This project is for personal learning, research, and content backup only. Users are responsible for ensuring that their usage complies with applicable laws, platform terms, and copyright requirements. Any consequences caused by misuse, commercial collection, large-scale scraping, or infringement of third-party rights are solely the user's responsibility.

---

<p align="center">If this project helps you, a Star is appreciated.</p>

<p align="center">
  <a href="https://star-history.com/#anYuJia/DY_video_downloader&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/DY_video_downloader&type=Date" alt="Star History Chart">
  </a>
</p>
