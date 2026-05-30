import logging
import os
import threading
import time
import json
import base64
import urllib.parse
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

RELATION_SIGNER_COOKIE_NAME = 'dy_relation_signer'


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


def apply_cookie_to_window(
    window: Any,
    cookie: str,
    reload_after_apply: bool = True,
    force: bool = False,
    post_load_delay: float = 0.0,
) -> None:
    if not window or not cookie:
        return

    def inject_cookie_script() -> None:
        try:
            if not window.events.loaded.wait(45):
                return
            if post_load_delay > 0:
                time.sleep(post_load_delay)

            cookie_literal = json.dumps(cookie)
            force_literal = 'true' if force else 'false'
            reload_script = 'setTimeout(() => window.location.reload(), 120);' if reload_after_apply else ''
            script = f"""
                (() => {{
                    const rawCookie = {cookie_literal};
                    const forceApply = {force_literal};
                    if (!rawCookie) return;
                    try {{
                        if (!forceApply && window.sessionStorage && sessionStorage.getItem('__dy_verify_cookie_applied') === '1') return;
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
    deduped: dict[str, str] = {}
    for entry in entries:
        name = (entry.get('name') or '').strip()
        value = (entry.get('value') or '').strip()
        if not name or not value or name == RELATION_SIGNER_COOKIE_NAME:
            continue

        domain = (entry.get('domain') or '').strip().lstrip('.').lower()
        applies_to_www = not domain or domain == 'www.douyin.com' or 'www.douyin.com'.endswith(f'.{domain}')
        if applies_to_www:
            deduped[name] = value

    return '; '.join(f'{name}={value}' for name, value in deduped.items())


def extract_relation_signer_entries(entries: list[dict[str, str]]) -> dict[str, str] | None:
    raw_value = ''
    for entry in reversed(entries or []):
        if entry.get('name') == RELATION_SIGNER_COOKIE_NAME:
            raw_value = entry.get('value') or ''
            break
    if not raw_value:
        return None

    try:
        decoded = urllib.parse.unquote(raw_value)
        signer = json.loads(base64.b64decode(decoded).decode('utf-8'))
    except Exception:
        return None

    if not isinstance(signer, dict):
        return None
    required = ('ticket', 'ts_sign', 'public_key', 'ecdh_key', 'uid')
    if any(not str(signer.get(key) or '').strip() for key in required):
        return None
    result = {key: str(signer.get(key) or '').strip() for key in required}
    dtrait = str(signer.get('dtrait') or '').strip()
    if dtrait:
        result['dtrait'] = dtrait
    return result


def inject_relation_signer_probe(window: Any) -> None:
    if not window:
        return
    script = """
        (() => {
            if (window.__dyRelationSignerProbeStarted) return;
            window.__dyRelationSignerProbeStarted = true;
            const save = (payload) => {
                try {
                    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
                    document.cookie = `dy_relation_signer=${encodeURIComponent(encoded)}; domain=.douyin.com; path=/; max-age=600`;
                    document.cookie = `dy_relation_signer=${encodeURIComponent(encoded)}; path=/; max-age=600`;
                } catch (error) {}
            };
            const bytesToBase64 = (value) => {
                const bytes = Array.from(value instanceof Uint8Array ? value : Object.values(value || {}));
                return btoa(String.fromCharCode(...bytes));
            };
            const captureDtrait = () => new Promise((resolve) => {
                let resolved = false;
                const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                const finish = (value) => {
                    if (resolved) return;
                    resolved = true;
                    try { XMLHttpRequest.prototype.setRequestHeader = originalSetHeader; } catch (error) {}
                    resolve(value || "");
                };
                XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
                    if (String(key).toLowerCase() === "x-tt-session-dtrait") {
                        try { originalSetHeader.apply(this, arguments); } catch (error) {}
                        try { this.abort(); } catch (error) {}
                        finish(String(value || ""));
                        return;
                    }
                    return originalSetHeader.apply(this, arguments);
                };
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", "https://www-hj.douyin.com/aweme/v1/web/commit/item/digg/?device_platform=webapp&aid=6383&channel=channel_pc_web");
                    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                    xhr.onloadend = () => setTimeout(() => finish(""), 0);
                    xhr.onerror = () => setTimeout(() => finish(""), 0);
                    xhr.send("aweme_id=0&item_type=0&type=0");
                } catch (error) {
                    finish("");
                }
                setTimeout(() => finish(""), 2500);
            });
            (async () => {
                try {
                    const crypto = window.securitySDK && window.securitySDK.cryptoSDK;
                    if (!crypto) throw new Error("security sdk not ready");
                    const info = await crypto.getKeysInfoWithOrigin({ certType: "header", scene: "web_protect" });
                    const ecdh = await crypto.initECDHKey();
                    const payload = {
                        ticket: info && info.sign && info.sign.ticket || "",
                        ts_sign: info && info.sign && info.sign.ts_sign || "",
                        public_key: info && (info.b64PubKey || (info.sign && info.sign.client_cert || "").replace(/^pub\\./, "")) || "",
                        ecdh_key: bytesToBase64(ecdh),
                        uid: window.SSR_RENDER_DATA && window.SSR_RENDER_DATA.app && window.SSR_RENDER_DATA.app.odin && window.SSR_RENDER_DATA.app.odin.user_id || "",
                        dtrait: "",
                    };
                    payload.dtrait = await captureDtrait();
                    if (payload.ticket && payload.ts_sign && payload.public_key && payload.ecdh_key && payload.uid) {
                        save(payload);
                    } else {
                        window.__dyRelationSignerProbeStarted = false;
                    }
                } catch (error) {
                    window.__dyRelationSignerProbeStarted = false;
                }
            })();
        })();
    """
    try:
        window.run_js(script)
    except Exception as error:
        logger.debug('注入关系动作签名采集脚本失败: %s', error)
