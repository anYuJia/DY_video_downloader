# pywebview Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `webbrowser.open()` with pywebview to provide a native app window for the DY Video Downloader.

**Architecture:** Flask/SocketIO runs in a background daemon thread. pywebview runs on the main thread, loading `http://localhost:port`. Window close triggers `socketio.stop()` + `os._exit(0)`. Port auto-increments on conflict.

**Tech Stack:** Python 3.10, Flask, Flask-SocketIO, pywebview>=5.0, PyInstaller

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `main.py` | Modify | Replace `web_app.main()` call with pywebview startup flow |
| `src/web/web_app.py` | Modify | Extract `start_server()` from `main()`, remove `webbrowser.open` logic |
| `build.spec` | Modify | `console=False`, add hiddenimports, add hookspath |
| `requirements.txt` | Modify | Add `pywebview>=5.0` |
| `.github/workflows/release.yml` | Modify | Add Linux system deps for pywebview |

---

### Task 1: Add pywebview dependency

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add pywebview to requirements.txt**

Add after the Playwright section:

```
# 原生窗口
pywebview>=5.0
```

- [ ] **Step 2: Install and verify**

Run: `pip install pywebview>=5.0`
Expected: Successfully installed

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "deps: add pywebview>=5.0"
```

---

### Task 2: Refactor web_app.py — extract start_server from main()

**Files:**
- Modify: `src/web/web_app.py:1928-1975`

The current `main()` does three things: init the app, open a browser, and run socketio (blocking). We need to split it so the server can run in a background thread while pywebview owns the main thread.

- [ ] **Step 1: Replace the `main()` function**

Replace the entire `main()` function (lines 1928-1975) with:

```python
def start_server(port=None):
    """启动Flask/SocketIO服务（在后台线程中调用）"""
    import os

    logger.info("启动抖音下载器Web服务...")
    logger.info(f"SocketIO async_mode: {socketio.async_mode}")

    if port is None:
        port = int(os.environ.get('PORT', 5001))

    # 初始化应用
    init_app()

    run_kwargs = {
        'app': app,
        'host': '0.0.0.0',
        'port': port,
        'debug': False
    }
    if IS_WINDOWS and socketio.async_mode == 'threading':
        run_kwargs['allow_unsafe_werkzeug'] = True

    logger.info(f"Web服务开始监听: 0.0.0.0:{port}")
    socketio.run(**run_kwargs)


def main():
    """启动Web服务（兼容旧版命令行启动方式）"""
    import os
    import webbrowser
    import threading
    import time

    port = int(os.environ.get('PORT', 5001))
    url = f"http://localhost:{port}"

    # 在后台线程启动服务
    server_thread = threading.Thread(target=start_server, kwargs={'port': port}, daemon=True)
    server_thread.start()

    # 等待服务就绪
    time.sleep(1.5)
    try:
        webbrowser.open(url)
        logger.info(f"已自动打开浏览器: {url}")
    except Exception as e:
        logger.warning(f"自动打开浏览器失败: {str(e)}")

    # 阻塞主线程，等待服务线程结束
    server_thread.join()
```

This preserves backward compatibility: calling `main()` still works as before (browser mode), while `start_server()` is the new entry point for pywebview mode.

- [ ] **Step 2: Verify the app still starts normally**

Run: `python main.py` (then Ctrl+C to stop)
Expected: Flask starts on port 5001, browser opens

- [ ] **Step 3: Commit**

```bash
git add src/web/web_app.py
git commit -m "refactor: extract start_server() from web_app.main()"
```

---

### Task 3: Implement pywebview startup in main.py

**Files:**
- Modify: `main.py:49-53`

Replace the `from src.web.web_app import main; main()` block with the full pywebview startup flow.

- [ ] **Step 1: Replace the main process startup logic**

Replace lines 49-53 of `main.py`:

```python
    # ==========================================
    # 常规主进程启动逻辑
    # ==========================================
    from src.web.web_app import main
    main()
```

With:

```python
    # ==========================================
    # 常规主进程启动逻辑 (pywebview 原生窗口)
    # ==========================================
    import socket
    import threading
    import time
    import webview

    from src.web.web_app import start_server, socketio

    def find_free_port(start=5001, end=5010):
        """查找可用端口"""
        for port in range(start, end + 1):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
        return start  # fallback

    def wait_for_server(port, timeout=30):
        """等待Flask服务就绪"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                import urllib.request
                urllib.request.urlopen(f'http://localhost:{port}/', timeout=1)
                return True
            except Exception:
                time.sleep(0.3)
        return False

    def on_closing():
        """窗口关闭回调"""
        try:
            socketio.stop()
        except Exception:
            pass
        os._exit(0)  # os is imported at top of main.py

    # 查找可用端口
    port = find_free_port()

    # 在后台线程启动Flask服务
    server_thread = threading.Thread(
        target=start_server, kwargs={'port': port}, daemon=True
    )
    server_thread.start()

    # 等待服务就绪
    if not wait_for_server(port):
        # 服务启动失败，用pywebview显示错误对话框
        err_win = webview.create_window(
            title='启动失败',
            html=f'<h2>服务启动超时</h2><p>端口 {port} 无法连接，请检查是否有其他程序占用。</p>',
            width=400, height=200,
        )
        webview.start()
        os._exit(1)

    # 创建pywebview窗口
    window = webview.create_window(
        title='抖音下载器',
        url=f'http://localhost:{port}',
        width=1280,
        height=800,
        resizable=True,
        maximizable=True,
    )
    window.events.closing += on_closing

    # 在主线程启动pywebview（阻塞）
    webview.start()
```

- [ ] **Step 2: Test locally**

Run: `python main.py`
Expected: A native window opens showing the web UI, no terminal browser tab

- [ ] **Step 3: Test window close**

Close the pywebview window.
Expected: Process exits cleanly (check with `ps aux | grep douyin`)

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "feat: replace webbrowser.open with pywebview native window"
```

---

### Task 4: Update build.spec for pywebview packaging

**Files:**
- Modify: `build.spec`

- [ ] **Step 1: Update build.spec**

Apply these changes to `build.spec`:

1. Add pywebview import and hookspath at the top (after `project_root` line):

```python
import pywebview
pywebview_hooks = os.path.join(pywebview.__path__[0], 'pkg')
```

2. Add to `hiddenimports` list:

```python
    'pywebview',
    'pyobjc-framework-WebKit',
```

3. Change `hookspath=[]` to:

```python
    hookspath=[pywebview_hooks] if os.path.isdir(pywebview_hooks) else [],
```

4. Change `console=True` to `console=False` in the EXE section.

- [ ] **Step 2: Test local build**

Run: `pyinstaller build.spec --clean --noconfirm`
Expected: Build succeeds, `dist/douyin_downloader/` created

- [ ] **Step 3: Test the built app**

Run: `./dist/douyin_downloader/douyin_downloader` (macOS) or equivalent
Expected: Native window opens, no terminal window appears

- [ ] **Step 4: Commit**

```bash
git add build.spec
git commit -m "build: update spec for pywebview windowed mode"
```

---

### Task 5: Update CI workflow for Linux pywebview deps

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add Linux system deps step**

Insert a new step after "Set up Python" and before "Prepare CI requirements":

```yaml
      - name: Install Linux system dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add Linux system deps for pywebview"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run the app from source**

Run: `python main.py`
Expected: Native window opens, UI loads, SocketIO connects

- [ ] **Step 2: Test port conflict handling**

Open another terminal, run `python -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',5001)); input()"` to occupy port 5001, then run `python main.py`
Expected: App starts on port 5002 instead

- [ ] **Step 3: Test PyInstaller build**

Run: `pyinstaller build.spec --clean --noconfirm && ./dist/douyin_downloader/douyin_downloader`
Expected: Built app opens in native window, no console

- [ ] **Step 4: Push and trigger CI**

Push to a branch and verify the GitHub Actions workflow runs successfully on all three platforms.
