# -*- mode: python ; coding: utf-8 -*-
import os
import sys

# 获取项目根目录，以便于寻址
project_root = os.path.abspath('.')
import pywebview
pywebview_hooks = os.path.join(pywebview.__path__[0], 'pkg')

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
    'pywebview',
]

# macOS WebKit bridge (only available on macOS)
if sys.platform == 'darwin':
    hiddenimports.append('pyobjc-framework-WebKit')

a = Analysis(
    ['main.py'],
    pathex=[project_root],
    binaries=[],
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
