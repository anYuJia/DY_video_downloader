<div align="center">

<img src="animated_icon.svg" width="128" height="128" alt="better-douyin Logo">

# better-douyin

A local Douyin downloader and archive manager for searching creators, parsing links, downloading media, previewing feeds, and managing saved works.

<p>
  <a href="README.md">简体中文</a> | <a href="README_EN.md">English</a>
</p>

<p>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"></a>
  <a href="https://github.com/anYuJia/better-douyin/releases/latest"><img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square" alt="Platform"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2ea44f?style=flat-square" alt="License"></a>
</p>

[Download](../../releases/latest) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [FAQ](#faq)

</div>

---

## Which Version Should I Use?

There are two related projects:

| Version | Best for |
|:---|:---|
| **Python version** | Easier source-level customization and Python-based workflows |
| **Rust / Tauri version** | Recommended for daily desktop use, smaller builds, and smoother local playback |

Rust version: [better-douyin-R](https://github.com/anYuJia/better-douyin-R).

## Features

- Search Douyin creators and open creator profiles
- Parse a shared link and download a single work
- Batch download videos, image posts, and some Live Photo assets
- Preview recommended feeds and download from the player
- Manage local downloads in file mode or work mode
- Search, play, locate, and delete saved files
- Skip works that have already been downloaded
- Configure Cookie through built-in login, browser import, or manual paste
- Keep Cookie, settings, history, and downloaded files on your own machine

## Screenshots

<p align="center">
  <a href="img/index.jpg"><img src="img/preview/index.jpg" width="100%" alt="Main interface"></a>
  <br>
  <strong>Main interface</strong>
</p>

<p align="center">
  <a href="img/get_user.jpg"><img src="img/preview/get_user.jpg" width="100%" alt="User search"></a>
  <br>
  <strong>User search</strong>
</p>

<p align="center">
  <a href="img/user_detail.jpg"><img src="img/preview/user_detail.jpg" width="100%" alt="Creator profile"></a>
  <br>
  <strong>Creator profile / batch download</strong>
</p>

<p align="center">
  <a href="img/recommend.jpg"><img src="img/preview/recommend.jpg" width="100%" alt="Recommended feed"></a>
  <br>
  <strong>Recommended feed</strong>
</p>

<p align="center">
  <a href="img/playvideo.jpg"><img src="img/preview/playvideo.jpg" width="100%" alt="Immersive player"></a>
  <br>
  <strong>Immersive player</strong>
</p>

## Quick Start

### Option 1: Download a release build

Download the package for your platform from [Releases](../../releases/latest), extract it, and run the application.

Common choices:

| Platform | Recommended file |
|:---|:---|
| Windows | `.exe` installer or portable `.zip` |
| macOS | `.dmg` or `.app` |
| Linux | `.tar.gz` |

Release builds start the local service and open the desktop window automatically.

If macOS reports that the developer cannot be verified, run:

```bash
sudo xattr -rd com.apple.quarantine /path/to/better-douyin.app
```

### Option 2: Run from source

```bash
git clone https://github.com/anYuJia/better-douyin.git
cd better-douyin

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..
```

Desktop mode:

```bash
python main.py
```

Browser / headless mode:

```bash
python -m src.web.web_app
```

## First Use

1. Open the app and configure Cookie and download directory in Settings.
2. Set Cookie through built-in login, browser Cookie import, or manual paste.
3. Search a creator or parse a shared link.
4. Download a single work, or batch download from creator, collected, or liked lists.
5. Monitor progress in the bottom task panel and manage saved files in "My Downloads".

## Cookie, Data, and Privacy

- Cookie is only used for local requests to Douyin-related APIs
- Cookie, settings, history, cache, and downloaded files stay on your machine
- Download directory can be changed in Settings
- Recommended feed, collected works, liked works, and some batch features require a valid Cookie
- If an API suddenly stops working, check whether Cookie has expired, the account needs verification, or the network can access Douyin domains

## FAQ

### What if Cookie expires or works cannot be fetched?

Refresh Cookie and confirm that the account can access the target content in a normal browser session.

### What if downloads are slow or fail?

Speed depends on network conditions, resource availability, and platform responses. Try another network, reduce concurrency, refresh Cookie, or retry later.

### Why does changing quality sometimes produce a similar file size?

Some works only expose one downloadable media URL, or different transcoded URLs are close in size. Available quality depends on what the platform returns.

### Why are already-downloaded works skipped?

The app records downloaded works and checks local files to avoid duplicate downloads. If you moved files or changed directories manually, verify the active directory in "My Downloads".

### Can it run on a Linux server?

Yes. Browser / headless mode is more suitable than desktop mode. If you expose it remotely, handle access control, reverse proxying, and Cookie exposure risks yourself.

## Development

| Area | Technology |
|:---|:---|
| Desktop window | pywebview |
| Local service | Flask, Flask-SocketIO |
| Downloading | asyncio, aiohttp, requests |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Packaging | PyInstaller |

## Disclaimer

This project is for personal learning, research, and content backup only. Please follow applicable laws, platform rules, and copyright requirements. Do not use it for commercial collection or large-scale scraping. Users are responsible for the consequences of misuse.

## Star History

<p align="center">
  <a href="https://star-history.com/#anYuJia/better-douyin&Date">
    <img src="https://api.star-history.com/svg?repos=anYuJia/better-douyin&type=Date" width="100%" alt="better-douyin Star History Chart">
  </a>
</p>

---

<p align="center">If this project helps you, a Star is appreciated.</p>
