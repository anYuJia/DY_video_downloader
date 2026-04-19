# -*- mode: python ; coding: utf-8 -*-
import os
import sys

# 获取项目根目录，以便于寻址
project_root = os.path.abspath('.')
import webview as _pywebview
pywebview_hooks = os.path.join(_pywebview.__path__[0], 'pkg')

# 图标文件路径
if sys.platform == 'darwin':
    icon_path = os.path.join(project_root, 'icons/icon.icns')
elif sys.platform == 'win32':
    icon_path = os.path.join(project_root, 'icons/icon.ico')
else:
    icon_path = None

block_cipher = None

# 需要被一同打包进程序结构里的相关资源文件
datas = [
    (os.path.join(project_root, 'src/web/templates'), 'src/web/templates'),
    (os.path.join(project_root, 'src/web/static'), 'src/web/static'),
    (os.path.join(project_root, 'lib/js/douyin.js'), 'lib/js'),
    # 如果有其他非 Python 资源，也应添加到这里
]

# 核心依赖项与可能被动态加载的模块
hiddenimports = [
    'engineio.async_drivers.gevent',
    'engineio.async_drivers.threading',
    'gevent',
    'geventwebsocket',
    'greenlet',
    'simple_websocket',
    'playwright',
    'flask',
    'flask_socketio',
    'requests',
    'urllib3',
    'aiohttp',
    'multiprocessing',
    'uuid',
    'logging',
    'datetime',
    'json',
    're',
    'urllib.parse',
    'execjs',
    'src',
    'src.api',
    'src.config',
    'src.downloader',
    'src.user',
    'src.web',
    'src.web.web_app',
    'src.api.cookie_grabber',
    'src.api.browser_worker',
    'webview',
    'webview.platforms',
    'webview.platforms.cocoa',
]

# macOS WebKit bridge (only available on macOS)
if sys.platform == 'darwin':
    hiddenimports.append('pyobjc-framework-WebKit')

# Windows .NET bridge
if sys.platform == 'win32':
    hiddenimports.extend([
        'pythonnet',
        'clr',
        'clr_loader',
        'webview.platforms.winforms',
    ])

# 收集pythonnet运行时DLL（Windows）
binaries = []
if sys.platform == 'win32':
    try:
        import pythonnet
        import os
        pythonnet_path = os.path.dirname(pythonnet.__file__)
        runtime_dll = os.path.join(pythonnet_path, 'runtime', 'Python.Runtime.dll')
        if os.path.exists(runtime_dll):
            binaries.append((runtime_dll, 'pythonnet/runtime'))
            print(f"[build.spec] Found Python.Runtime.dll at: {runtime_dll}")
        else:
            print(f"[build.spec] Warning: Python.Runtime.dll not found at: {runtime_dll}")
    except ImportError:
        print("[build.spec] Warning: pythonnet not installed")

a = Analysis(
    ['main.py'],
    pathex=[project_root],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[pywebview_hooks] if os.path.isdir(pywebview_hooks) else [],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='douyin_downloader',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='douyin_downloader',
)
