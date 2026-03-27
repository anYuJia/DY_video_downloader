#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import os
import json
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
    # 常规主进程启动逻辑
    # ==========================================
    from src.web.web_app import main
    main()