# pywebview Integration Design

## Goal

Replace `webbrowser.open()` with `pywebview` to provide a native app window for the DY Video Downloader web UI, instead of opening a system browser tab.

## Approach

**B1: pywebview + embedded HTTP server** — Flask/SocketIO runs in a background thread, pywebview window loads `http://localhost:port`. This preserves full SocketIO support.

## Startup Flow

```
main()
  ├─ Flask/SocketIO starts in background thread
  ├─ Poll localhost:port until server responds (replaces fixed 1.5s delay)
  ├─ webview.create_window() on main thread (blocks)
  └─ On window close:
      ├─ socketio.stop() to terminate Flask
      └─ sys.exit(0)
```

- pywebview must run on the main thread (macOS requirement).
- Server readiness is confirmed via HTTP poll instead of a fixed sleep.
- Window close triggers cleanup and process exit.

## Window Configuration

- Size: 1280x800, resizable, maximizable
- Title: `抖音下载器`
- No system tray, no custom menu bar (keep it simple)
- No app icon for now (default icon, replace later)

## Code Changes

### main.py

Replace the `webbrowser.open` + `socketio.run` blocking call with:

1. Start Flask in a daemon thread via `socketio.run()`
2. Poll `http://localhost:port` until 200 response
3. Create `webview.create_window(url=f'http://localhost:{port}', ...)`
4. Start `webview.start()` on main thread (blocks)
5. On window close callback: `socketio.stop()`, `sys.exit(0)`

### build.spec

- `console=True` → `console=False`
- Add `pywebview` to `hiddenimports`
- Add pywebview PyInstaller hook path: `hookspath=[pywebview.__path__[0] + '/pkg']` for native backend binary collection

### requirements.txt

- Add `pywebview>=5.0`

### .github/workflows/build.yml

- Linux runner: add `apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev` before pip install
- macOS/Windows: no extra system deps needed
- Rest of workflow unchanged

## Platform Notes

| Platform | Rendering Backend | Extra CI Deps |
|----------|------------------|---------------|
| macOS | WebKit (built-in) | None |
| Windows | EdgeChromium (built-in) | None |
| Linux | gtk + WebKit2 | libgtk-3-dev, libwebkit2gtk-4.1-dev |

## Out of Scope

- System tray integration
- Custom app icon
- Auto-update mechanism
- Custom window menus
