#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import os
import multiprocessing

# PyInstaller 打包时需要调用这个方法以防在双击执行时进入多进程递归死循环
multiprocessing.freeze_support()

if __name__ == '__main__':
    # ==========================================
    # 子进程分发器 (Dispatcher)
    # 彻底解决 PyInstaller / 一键打包环境中
    # subprocess 无法执行 .py 脚本的问题。
    # ==========================================
    if os.environ.get('RUN_WORKER') == 'cookie_grabber':
        # 在子进程中执行 Cookie 获取组件
        from src.api.cookie_grabber import grab_cookie
        import json
        try:
            input_data = sys.stdin.read().strip()
            params = json.loads(input_data) if input_data else {}
        except Exception:
            params = {}
        timeout = params.get("timeout", 300)
        browser_type = params.get("browser", "chrome")

        result = grab_cookie(timeout=timeout, browser_type=browser_type)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    elif os.environ.get('RUN_WORKER') == 'browser_worker':
        # 在子进程中执行 模拟浏览器请求组件
        from src.api.browser_worker import browser_fetch_via_navigation, browser_fetch
        import json
        try:
            req = json.loads(sys.stdin.read())
            if req.get('params') and req.get('api_path'):
                result = browser_fetch_via_navigation(
                    req['cookie'], req['api_path'], req['params'], req['user_agent']
                )
            else:
                result = browser_fetch(req['cookie'], req['url'], req['user_agent'])
            print(json.dumps(result, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        sys.exit(0)

    # ==========================================
    # 常规主进程启动逻辑 (pywebview 原生窗口)
    # ==========================================
    import socket
    import threading
    import time
    import json

    # macOS 上跳过 gevent patch，避免与 Cocoa 运行循环冲突
    os.environ['USE_PYWEBVIEW'] = '1'

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
                urllib.request.urlopen('http://127.0.0.1:{}/'.format(port), timeout=1)
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
        os._exit(0)

    # 查找可用端口
    port = find_free_port()

    # 在后台线程启动Flask服务
    server_thread = threading.Thread(
        target=start_server, kwargs={'port': port}, daemon=True
    )
    server_thread.start()

    # 等待服务就绪
    if not wait_for_server(port):
        # 服务启动失败，延迟导入 webview 显示错误对话框
        import webview
        err_win = webview.create_window(
            title='启动失败',
            html='<h2>服务启动超时</h2><p>端口 {} 无法连接，请检查是否有其他程序占用。</p>'.format(port),
            width=400, height=200,
        )
        webview.start()
        os._exit(1)

    # 延迟导入 webview，避免启动时加载
    import webview

    # 创建pywebview窗口
    window = webview.create_window(
        title='抖音下载器',
        url='http://127.0.0.1:{}'.format(port),
        width=1280,
        height=800,
        resizable=True,
        text_select=True,
        zoomable=True,
    )
    window.events.closing += on_closing

    # 在主线程启动pywebview（阻塞），debug模式查看控制台错误
    webview.start()