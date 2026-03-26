#!/usr/bin/env python3
"""Playwright 浏览器登录抖音并提取 Cookie 的独立模块。

由于 gevent 与 Playwright 冲突，此模块设计为**子进程**调用。
使用方式：
    python cookie_grabber.py          # 以子进程方式运行
    stdin: {"timeout": 300}           # 可选参数
    stdout: {"cookie": "...", ...}    # 返回结果
"""
import sys
import os
import json
import time
from playwright.sync_api import sync_playwright


# 登录成功的标志 Cookie 键
LOGIN_MARKER_KEYS = {"sessionid", "sid_tt", "uid_tt"}


# 浏览器 channel 映射
BROWSER_CHANNELS = {
    "chrome": "chrome",
    "edge": "msedge",
    "msedge": "msedge",
    "chromium": "chromium",
}


def grab_cookie(timeout: int = 300, headless: bool = False, browser_type: str = "chrome") -> dict:
    """启动浏览器，打开抖音主页，等待用户登录后提取 Cookie。

    使用持久化上下文（persistent context），浏览器数据保存在 data/.browser_profile/
    目录下，下次打开时自动保持登录状态，无需重复登录。

    Args:
        timeout: 最大等待时间（秒），默认 5 分钟
        headless: 是否无头模式（需要用户操作，通常为 False）
        browser_type: 浏览器类型 (chrome / edge / chromium)

    Returns:
        dict: {"success": True, "cookie": "..."}
              或 {"success": False, "error": "..."}
    """
    channel = BROWSER_CHANNELS.get(browser_type, "chrome")
    _status("launching", f"正在启动浏览器 ({browser_type})...")

    # 持久化数据目录（按浏览器类型区分）
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    user_data_dir = os.path.join(project_root, "data", ".browser_profile", browser_type)
    os.makedirs(user_data_dir, exist_ok=True)

    with sync_playwright() as p:
        context = None
        try:
            launch_args = {
                "headless": headless,
                "args": ["--disable-blink-features=AutomationControlled"],
                "user_agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/145.0.0.0 Safari/537.36"
                ),
                "viewport": {"width": 1280, "height": 800},
            }
            # chromium 用内置浏览器，chrome/edge 用系统安装的
            if channel != "chromium":
                launch_args["channel"] = channel

            # 使用持久化上下文，保存登录态
            context = p.chromium.launch_persistent_context(
                user_data_dir,
                **launch_args,
            )

            # 使用已有页面或新建
            page = context.pages[0] if context.pages else context.new_page()

            # 发送状态到 stderr（父进程可读取）
            _status("browser_opened", "浏览器已打开，正在加载抖音...")

            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=30000)
            _status("page_loaded", "抖音页面已加载，检查登录状态...")

            # 轮询检测登录状态
            start_time = time.time()
            poll_interval = 2  # 每 2 秒检查一次

            while time.time() - start_time < timeout:
                cookies = context.cookies("https://www.douyin.com")
                cookie_dict = {c["name"]: c["value"] for c in cookies}

                # 检查是否包含登录标志
                has_login = any(
                    key in cookie_dict and cookie_dict[key]
                    for key in LOGIN_MARKER_KEYS
                )

                if has_login:
                    _status("login_detected", "检测到登录成功，正在提取 Cookie...")

                    # 等待一小段时间让所有 Cookie 稳定
                    time.sleep(2)

                    # 再次获取最新 Cookie
                    cookies = context.cookies("https://www.douyin.com")
                    cookie_str = "; ".join(
                        f"{c['name']}={c['value']}" for c in cookies
                    )

                    _status("cookie_extracted", "Cookie 提取成功！登录态已保存，下次无需重新登录。")
                    context.close()
                    return {"success": True, "cookie": cookie_str}

                # 检查页面是否被关闭
                try:
                    page.title()
                except Exception:
                    _status("browser_closed", "浏览器窗口被关闭")
                    return {"success": False, "error": "browser_closed"}

                elapsed = int(time.time() - start_time)
                remaining = timeout - elapsed
                if elapsed < 5:
                    _status("waiting", "等待登录中...")
                else:
                    _status(
                        "waiting",
                        f"等待登录中... ({elapsed}s / {timeout}s，剩余 {remaining}s)",
                    )
                time.sleep(poll_interval)

            # 超时
            _status("timeout", f"等待登录超时（{timeout}秒）")
            context.close()
            return {"success": False, "error": "timeout"}

        except Exception as e:
            _status("error", f"发生错误: {str(e)}")
            if context:
                try:
                    context.close()
                except Exception:
                    pass
            return {"success": False, "error": str(e)}


def _status(event: str, message: str):
    """向 stderr 输出状态信息（JSON 格式），供父进程读取。"""
    status = json.dumps({"event": event, "message": message}, ensure_ascii=False)
    print(f"[cookie_grabber] {status}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    # 作为子进程运行
    try:
        input_data = sys.stdin.read().strip()
        params = json.loads(input_data) if input_data else {}
    except (json.JSONDecodeError, Exception):
        params = {}

    timeout = params.get("timeout", 300)
    browser_type = params.get("browser", "chrome")
    result = grab_cookie(timeout=timeout, browser_type=browser_type)
    print(json.dumps(result, ensure_ascii=False))
