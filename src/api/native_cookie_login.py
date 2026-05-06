import logging
import os
import threading
import time
import json
from dataclasses import dataclass, field
from http.cookies import SimpleCookie
from typing import Any

logger = logging.getLogger(__name__)

LOGIN_MARKER_KEYS = {
    'sessionid',
    'sessionid_ss',
    'sid_guard',
    'uid_tt',
}


@dataclass
class NativeCookieLoginSession:
    window: Any
    created_at: float = field(default_factory=time.monotonic)
    cancel_event: threading.Event = field(default_factory=threading.Event)
    finished_event: threading.Event = field(default_factory=threading.Event)
    last_cookie_value: str = ''
    last_verify_at: float = 0.0
    last_event: str = ''
    last_message: str = ''

    def is_active(self) -> bool:
        return not self.finished_event.is_set()


def is_native_cookie_login_available() -> bool:
    if os.environ.get('USE_PYWEBVIEW') != '1':
        return False

    try:
        import webview
    except Exception:
        return False

    return bool(getattr(webview, 'guilib', None) and getattr(webview, 'windows', None))


def create_native_douyin_window(
    title: str,
    url: str,
    width: int = 1100,
    height: int = 820,
):
    import webview

    return webview.create_window(
        title=title,
        url=url,
        width=width,
        height=height,
        resizable=True,
        focus=True,
    )


def create_login_window():
    return create_native_douyin_window('登录抖音账号', 'https://www.douyin.com/')


def apply_cookie_to_window(window: Any, cookie: str, reload_after_apply: bool = True) -> None:
    if not window or not cookie:
        return

    def inject_cookie_script() -> None:
        try:
            if not window.events.loaded.wait(45):
                return

            cookie_literal = json.dumps(cookie)
            reload_script = 'setTimeout(() => window.location.reload(), 120);' if reload_after_apply else ''
            script = f"""
                (() => {{
                    const rawCookie = {cookie_literal};
                    if (!rawCookie) return;
                    try {{
                        if (window.sessionStorage && sessionStorage.getItem('__dy_verify_cookie_applied') === '1') return;
                    }} catch (error) {{}}
                    rawCookie.split(';').map(item => item.trim()).filter(Boolean).forEach(item => {{
                        try {{
                            document.cookie = `${{item}}; domain=.douyin.com; path=/`;
                        }} catch (error) {{}}
                    }});
                    try {{
                        if (window.sessionStorage) {{
                            sessionStorage.setItem('__dy_verify_cookie_applied', '1');
                            {reload_script}
                        }}
                    }} catch (error) {{}}
                }})();
            """
            window.run_js(script)
        except Exception as error:
            logger.debug('向原生窗口注入 Cookie 失败: %s', error)

    threading.Thread(target=inject_cookie_script, daemon=True).start()


def destroy_window_safely(window: Any) -> None:
    if not window:
        return

    try:
        if not window.events.closed.is_set():
            window.destroy()
    except Exception as error:
        logger.debug('关闭原生登录窗口失败: %s', error)


def normalize_cookie_entries(raw_cookies: list[Any] | None) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for raw_cookie in raw_cookies or []:
        if isinstance(raw_cookie, str):
            simple_cookie = SimpleCookie()
            simple_cookie.load(raw_cookie)
            cookie_items = simple_cookie.items()
        elif isinstance(raw_cookie, SimpleCookie):
            cookie_items = raw_cookie.items()
        elif hasattr(raw_cookie, 'items'):
            cookie_items = raw_cookie.items()
        else:
            continue

        for name, morsel in cookie_items:
            value = morsel.value if hasattr(morsel, 'value') else str(morsel)
            if not value:
                continue

            key = (str(name).strip(), str(value).strip())
            if key in seen:
                continue
            seen.add(key)

            normalized.append({
                'name': key[0],
                'value': key[1],
                'domain': (morsel['domain'] or '').strip() if hasattr(morsel, '__getitem__') else '',
                'path': (morsel['path'] or '/').strip() if hasattr(morsel, '__getitem__') else '/',
            })

    return normalized


def has_login_cookie(entries: list[dict[str, str]]) -> bool:
    names = {entry['name'] for entry in entries if entry.get('name')}
    passport_auth_status = next(
        (entry.get('value', '') for entry in entries if entry.get('name') == 'passport_auth_status'),
        '',
    )
    return passport_auth_status == '1' or any(name in names for name in LOGIN_MARKER_KEYS)


def serialize_cookie_entries(entries: list[dict[str, str]]) -> str:
    return '; '.join(f"{entry['name']}={entry['value']}" for entry in entries if entry.get('name'))
