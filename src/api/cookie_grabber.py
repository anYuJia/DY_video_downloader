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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


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

            page.goto("https://www.douyin.com/", wait_until="load", timeout=30000)
            # 等待页面完全加载，包括验证弹窗
            page.wait_for_timeout(8000)  # 增加到 8 秒
            _status("page_loaded", "抖音页面已加载，检查登录状态...")

            # 轮询检测登录状态
            start_time = time.time()
            poll_interval = 1  # 每 1 秒检查一次（从 2 秒优化为 1 秒）
            consecutive_home_page = 0  # 连续检测到主页的次数
            last_cookie_hash = ""  # 用于检测 Cookie 变化

            while time.time() - start_time < timeout:
                cookies = context.cookies("https://www.douyin.com")
                cookie_dict = {c["name"]: c["value"] for c in cookies}

                # 计算 Cookie 哈希，用于检测 Cookie 是否变化
                current_cookie_hash = ";".join(
                    f"{k}={v[:20]}..." if len(v) > 20 else f"{k}={v}"
                    for k, v in sorted(cookie_dict.items())
                    if k in LOGIN_MARKER_KEYS
                )

                # 检查是否包含登录标志
                has_login = any(
                    key in cookie_dict and cookie_dict[key]
                    for key in LOGIN_MARKER_KEYS
                )

                # 检查页面是否包含验证提示
                try:
                    page_title = page.title()
                    page_url = page.url
                    page_content = page.content()

                    # 更广泛的验证检测（优化：减少内容检查长度）
                    has_verification = (
                        '验证' in page_title or
                        '登录' in page_title or
                        'passport' in page_url.lower() or
                        '手机号' in page_title or
                        'security' in page_url.lower() or
                        '扫码' in page_title or
                        '验证' in page_content[:500] or  # 从 1000 减少到 500
                        '登录' in page_content[:500] or
                        'login' in page_url.lower() or
                        '二维码' in page_title or
                        '请登录' in page_content[:500]
                    )

                    if has_verification:
                        consecutive_home_page = 0
                        elapsed = int(time.time() - start_time)
                        remaining = timeout - elapsed
                        _status(
                            "waiting_verification",
                            f"检测到验证页面，请完成验证... ({elapsed}s / {timeout}s，剩余 {remaining}s)",
                        )
                        time.sleep(poll_interval)
                        continue

                    # 调试输出
                    print(f"[cookie_grabber] 当前页面：title={page_title[:50]}, url={page_url[:60]}", file=sys.stderr, flush=True)
                    print(f"[cookie_grabber] has_login={has_login}, cookie_hash_changed={current_cookie_hash != last_cookie_hash}", file=sys.stderr, flush=True)

                except Exception as e:
                    # 页面可能正在加载或已关闭
                    if 'closed' in str(e).lower():
                        _status("browser_closed", "浏览器窗口被关闭")
                        return {"success": False, "error": "browser_closed"}
                    print(f"[cookie_grabber] 检查页面状态异常：{e}", file=sys.stderr, flush=True)
                    pass

                # 如果有登录标志，检查是否是真正有效的登录
                if has_login:
                    try:
                        current_url = page.url
                        page_title = page.title()

                        # 检查是否在抖音主页（不是登录/验证页面）
                        is_home_page = (
                            'douyin.com' in current_url and
                            'passport' not in current_url.lower() and
                            'login' not in current_url.lower() and
                            '验证' not in page_title and
                            '登录' not in page_title
                        )

                        if is_home_page:
                            # 尝试检测页面上的用户元素（真正登录成功的标志）
                            try:
                                # 检测用户头像元素 - 扩展选择器范围
                                user_avatar = page.query_selector(
                                    '.avatar-icon, '
                                    '[class*="avatar"], '
                                    '[class*="user-avatar"], '
                                    '[class*="header-avatar"], '
                                    '[class*="Avatar"], '
                                    'img[class*="avatar"], '
                                    '[data-e2e="user-avatar"]'
                                )

                                # 检测用户昵称/信息元素
                                user_info = page.query_selector(
                                    '[class*="user-info"], '
                                    '[class*="nickname"], '
                                    '[class*="user-name"], '
                                    '[class*="username"], '
                                    '[data-e2e="user-name"]'
                                )

                                # 检测是否有登录按钮（如果有说明未登录）
                                login_button = page.query_selector(
                                    'text=/登录|登录\\/注册|请登录/'
                                )

                                # 输出调试信息
                                print(f"[cookie_grabber] 检测登录元素: avatar={user_avatar is not None}, user_info={user_info is not None}, login_btn={login_button is not None}, url={current_url[:80]}", file=sys.stderr, flush=True)

                                # 优化判断逻辑：优先使用Cookie标记
                                # 如果Cookie中有登录标记，直接认为已登录（不依赖页面元素）
                                if has_login:
                                    print(f"[cookie_grabber] Cookie包含登录标记，认为已登录", file=sys.stderr, flush=True)
                                    is_truly_logged_in = True
                                else:
                                    # Cookie没有登录标记，通过页面元素判断
                                    is_truly_logged_in = (user_avatar is not None or user_info is not None) and login_button is None

                                if is_truly_logged_in:
                                    # 检测到真正的登录状态
                                    # 同时检查 Cookie 是否有变化（说明是刚登录的）
                                    cookie_changed = current_cookie_hash != last_cookie_hash

                                    if cookie_changed:
                                        # Cookie 有变化，说明是刚登录的，可以立即确认
                                        _status("login_detected", "检测到登录成功，正在提取 Cookie...")
                                    else:
                                        # Cookie 没变化，可能是持久化的旧登录
                                        # 减少检测次数，从5次改为2次
                                        consecutive_home_page += 1
                                        if consecutive_home_page < 2:  # 连续2次确认即可
                                            elapsed = int(time.time() - start_time)
                                            _status(
                                                "waiting",
                                                f"检测到已登录状态，确认中... ({elapsed}s / {timeout}s)",
                                            )
                                            time.sleep(poll_interval)
                                            continue
                                        _status("login_detected", "检测到已登录状态，正在提取 Cookie...")

                                    # 更新 Cookie 哈希
                                    last_cookie_hash = current_cookie_hash

                                    # 增加等待时间，确保所有Cookie和请求都完成
                                    time.sleep(3)

                                    # 获取最新Cookie
                                    cookies = context.cookies("https://www.douyin.com")

                                    # 验证是否包含必要的登录Cookie
                                    cookie_dict = {c["name"]: c["value"] for c in cookies}
                                    if not any(key in cookie_dict and cookie_dict[key] for key in LOGIN_MARKER_KEYS):
                                        _status("cookie_incomplete", "Cookie提取不完整，等待重试...")
                                        consecutive_home_page = 0
                                        continue

                                    cookie_str = "; ".join(
                                        f"{c['name']}={c['value']}" for c in cookies
                                    )

                                    _status(
                                        "cookie_extracted",
                                        "Cookie 提取成功！登录态已保存，下次无需重新登录。",
                                        {"cookie": cookie_str}
                                    )

                                    # 添加短暂延迟后再关闭浏览器
                                    time.sleep(1)
                                    context.close()
                                    return {"success": True, "cookie": cookie_str}
                                else:
                                    # 没有检测到用户元素，可能还在登录中
                                    consecutive_home_page = 0
                                    elapsed = int(time.time() - start_time)
                                    _status(
                                        "waiting",
                                        f"等待登录中... ({elapsed}s / {timeout}s)",
                                    )

                            except Exception as e:
                                print(f"[cookie_grabber] 检测登录元素失败：{e}", file=sys.stderr, flush=True)
                                consecutive_home_page = 0
                        else:
                            # 在验证页面，重置计数器
                            consecutive_home_page = 0

                        # 更新 Cookie 哈希
                        last_cookie_hash = current_cookie_hash

                    except Exception as e:
                        print(f"[cookie_grabber] 检查页面异常：{e}", file=sys.stderr, flush=True)
                        pass
                else:
                    # 没有登录标志，重置计数器
                    consecutive_home_page = 0

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


def _status(event: str, message: str, extra: dict | None = None):
    """向 stderr 输出状态信息（JSON 格式），供父进程读取。"""
    payload = {"event": event, "message": message}
    if extra:
        payload.update(extra)
    status = json.dumps(payload, ensure_ascii=False)
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
