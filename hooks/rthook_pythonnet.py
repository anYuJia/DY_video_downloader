# -*- coding: utf-8 -*-
"""
PyInstaller runtime hook for pythonnet on Windows.
Ensures Python.Runtime.dll can be found and loaded correctly.
"""
import sys
import os

if sys.platform == 'win32':
    # When running from PyInstaller bundle
    if getattr(sys, 'frozen', False):
        # Get the executable directory
        exe_dir = os.path.dirname(sys.executable)

        # Python.Runtime.dll is now placed in root directory (alongside exe)
        runtime_dll = os.path.join(exe_dir, 'Python.Runtime.dll')
        if os.path.exists(runtime_dll):
            os.environ['PYTHONNET_RUNTIME_DLL'] = runtime_dll
            print(f"[rthook] Found Python.Runtime.dll at: {runtime_dll}")
