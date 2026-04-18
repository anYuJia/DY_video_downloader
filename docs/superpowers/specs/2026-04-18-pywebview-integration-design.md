# pywebview Integration Design

## Goal

Replace `webbrowser.open()` with `pywebview` to provide a native app window for the DY Video Downloader web UI, instead of opening a system browser tab.

## Approach

**B1: pywebview + embedded HTTP server** — Flask/SocketIO runs in a background thread, pywebview window loads `http://localhost:port`. This preserves full SocketIO support.

## Startup Flow

```
main()
  ├─ Find a free port (try 5001, then 5002, 5003... up to 5010)
  ├─ Flask/SocketIO starts in background thread on chosen port
  ├─ Poll localhost:port until server responds (30s timeout)
  │   ├─ If timeout: show error dialog, exit
  │   └─ If ready: proceed
  ├─ webview.create_window() on main thread (blocks)
  └─ On window close:
      ├─ Set shutdown flag
      ├─ socketio.stop() to terminate Flask
      ├─ os._exit(0) to ensure clean exit
```

- pywebview must run on the main thread (macOS requirement).
- Server readiness is confirmed via HTTP poll instead of a fixed sleep.
- Port conflict handling: auto-increment from 5001 if port is in use.
- Poll timeout: 30 seconds. If exceeded, show a pywebview error dialog and exit.
- Window close triggers cleanup and process exit.

## Window Configuration

- Size: 1280x800, resizable, maximizable
- Title: `抖音下载器`
- No system tray, no custom menu bar (keep it simple)
- No app icon for now (default icon, replace later)

## Code Changes

### main.py

Replace the `webbrowser.open` + `socketio.run` blocking call with:

1. Find a free port: try 5001, increment to 5002, 5003... up to 5010
2. Start Flask in a daemon thread via `socketio.run()`
3. Poll `http://localhost:port` until 200 response (30s timeout)
4. On timeout: show error dialog via pywebview, then exit
5. Create `webview.create_window(url=f'http://localhost:{port}', ...)`
6. Start `webview.start()` on main thread (blocks)
7. On window close callback: `socketio.stop()`, `os._exit(0)`

### build.spec

- `console=True` → `console=False`
- Add `pywebview` to `hiddenimports`
- Add `pyobjc-framework-WebKit` to `hiddenimports` (macOS WebKit bridge)
- Add pywebview PyInstaller hook path for native backend binary collection:
  ```python
  import pywebview
  hookspath=[os.path.join(pywebview.__path__[0], 'pkg')]
  ```
  Note: verify this path exists at build time; if absent, manual `binaries=` entries may be needed for the WebView library.

### requirements.txt

- Add `pywebview>=5.0`

### .github/workflows/release.yml

- Linux runner: add `apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev` before pip install
- macOS/Windows: no extra system deps needed
- Rest of workflow unchanged

## Platform Notes

| Platform | Rendering Backend | Extra CI Deps | Python Deps |
|----------|------------------|---------------|-------------|
| macOS | WebKit (built-in) | None | pyobjc-framework-WebKit (auto-installed) |
| Windows | EdgeChromium (built-in) | None | None |
| Linux | gtk + WebKit2 | libgtk-3-dev, libwebkit2gtk-4.1-dev | None |

## Shutdown Behavior

- Window close sets a shutdown flag and calls `socketio.stop()`, then `os._exit(0)`
- Active downloads in progress are cancelled (acceptable for MVP — the app is closing anyway)
- Playwright subprocesses (cookie_grabber, browser_worker) are daemon processes and will be terminated by `os._exit(0)`
- `console=False` means subprocess worker stdout/stderr is suppressed; this is safe since the dispatcher in `main.py` communicates via stdin/stdout JSON, not the terminal

## Out of Scope

- System tray integration
- Custom app icon
- Auto-update mechanism
- Custom window menus
- Graceful download cancellation on exit (future improvement)
