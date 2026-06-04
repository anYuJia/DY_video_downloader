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
    for optional_key in ('dtrait', 'client_cert', 'private_key'):
        value = str(signer.get(optional_key) or '').strip()
        if value:
            result[optional_key] = value
    return result


def relation_signer_ready(signer: dict[str, str] | None) -> bool:
    return bool(isinstance(signer, dict) and str(signer.get('dtrait') or '').strip())


def relation_signer_ready_for_uid(signer: dict[str, str] | None, uid: str) -> bool:
    uid = str(uid or '').strip()
    return bool(
        isinstance(signer, dict)
        and uid
        and str(signer.get('uid') or '').strip() == uid
        and str(signer.get('ticket') or '').strip()
        and str(signer.get('ts_sign') or '').strip()
        and str(signer.get('public_key') or '').strip()
        and str(signer.get('ecdh_key') or '').strip()
        and str(signer.get('dtrait') or '').strip()
    )


def relation_signer_has_ticket_guard(signer: dict[str, str] | None, uid: str = '') -> bool:
    uid = str(uid or '').strip()
    if not isinstance(signer, dict):
        return False
    if uid and str(signer.get('uid') or '').strip() != uid:
        return False
    return bool(
        str(signer.get('ticket') or '').strip()
        and str(signer.get('ts_sign') or '').strip()
        and str(signer.get('public_key') or '').strip()
        and str(signer.get('ecdh_key') or '').strip()
    )


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
            const looksLikeDtrait = (value) => String(value || "").trim().length > 20;
            const readStoredDtrait = () => {
                const direct = [window.__dtrait__, window.__dyRelationLatestDtrait];
                for (const value of direct) {
                    if (looksLikeDtrait(value)) return String(value);
                }
                for (const storage of [window.localStorage, window.sessionStorage]) {
                    try {
                        for (let index = 0; index < storage.length; index += 1) {
                            const key = storage.key(index);
                            const value = storage.getItem(key);
                            if (looksLikeDtrait(value)) return String(value);
                        }
                    } catch (error) {}
                }
                return "";
            };
            const findAwemeId = () => {
                try {
                    const candidates = Array.from(document.querySelectorAll("a[href*='/video/']"))
                        .map((node) => {
                            const href = node.getAttribute("href") || "";
                            const match = href.match(/\\/video\\/(\\d+)/);
                            return match && match[1] || "";
                        })
                        .filter(Boolean);
                    if (candidates.length > 0) return candidates[0];
                } catch (error) {}
                try {
                    const html = document.documentElement && document.documentElement.innerHTML || "";
                    const match = html.match(/"aweme_id"\\s*:\\s*"(\\d{10,})"/) || html.match(/aweme_id=(\\d{10,})/);
                    return match && match[1] || "";
                } catch (error) {}
                return "";
            };
            const patchDtraitCapture = (onValue) => {
                window.__dyRelationDtraitListeners = window.__dyRelationDtraitListeners || [];
                if (typeof onValue === "function") {
                    window.__dyRelationDtraitListeners.push(onValue);
                    if (window.__dyRelationLatestDtrait) {
                        try { onValue(window.__dyRelationLatestDtrait); } catch (error) {}
                    }
                }
                if (window.__dyRelationDtraitPatched) return;
                window.__dyRelationDtraitPatched = true;
                const emit = (value) => {
                    const text = String(value || "").trim();
                    if (!text) return;
                    window.__dyRelationLatestDtrait = text;
                    for (const listener of window.__dyRelationDtraitListeners || []) {
                        try { listener(window.__dyRelationLatestDtrait); } catch (error) {}
                    }
                };
                try {
                    const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                    XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
                        if (String(key).toLowerCase() === "x-tt-session-dtrait" && value) {
                            emit(String(value));
                        }
                        return originalSetHeader.apply(this, arguments);
                    };
                } catch (error) {}
                try {
                    const originalFetch = window.fetch;
                    window.fetch = function(input, init) {
                        try {
                            const headers = init && init.headers;
                            let value = "";
                            if (headers && typeof headers.get === "function") {
                                value = headers.get("x-tt-session-dtrait") || "";
                            } else if (Array.isArray(headers)) {
                                const found = headers.find((item) => String(item && item[0]).toLowerCase() === "x-tt-session-dtrait");
                                value = found && found[1] || "";
                            } else if (headers && typeof headers === "object") {
                                value = headers["x-tt-session-dtrait"] || headers["X-Tt-Session-Dtrait"] || "";
                            }
                            if (!value && input && input.headers && typeof input.headers.get === "function") {
                                value = input.headers.get("x-tt-session-dtrait") || "";
                            }
                            if (value) emit(String(value));
                        } catch (error) {}
                        return originalFetch.apply(this, arguments);
                    };
                } catch (error) {}
            };
            const captureDtrait = () => new Promise((resolve) => {
                let resolved = false;
                const finish = (value) => {
                    if (resolved) return;
                    resolved = true;
                    resolve(value || "");
                };
                const stored = readStoredDtrait();
                if (stored) {
                    finish(stored);
                    return;
                }
                patchDtraitCapture(finish);
                try {
                    const awemeId = findAwemeId() || "7640032041598198757";
                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", "https://www-hj.douyin.com/aweme/v1/web/commit/item/digg/?device_platform=webapp&aid=6383&channel=channel_pc_web&pc_client_type=1&pc_libra_divert=Mac&update_version_code=170400&support_h265=1&support_dash=1&version_code=170400&version_name=17.4.0&cookie_enabled=true&browser_language=zh-CN&browser_platform=MacIntel&browser_name=Chrome&browser_version=148.0.0.0&browser_online=true&engine_name=Blink&engine_version=148.0.0.0&os_name=Mac%20OS&os_version=10.15.7&cpu_core_num=8&device_memory=16&platform=PC");
                    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                    xhr.setRequestHeader("x-secsdk-csrf-token", "DOWNGRADE");
                    xhr.onloadend = () => setTimeout(() => finish(window.__dyRelationLatestDtrait || readStoredDtrait() || ""), 0);
                    xhr.onerror = () => setTimeout(() => finish(window.__dyRelationLatestDtrait || readStoredDtrait() || ""), 0);
                    xhr.send(`aweme_id=${awemeId}&item_type=0&type=0`);
                } catch (error) {
                    finish(window.__dyRelationLatestDtrait || readStoredDtrait() || "");
                }
                setTimeout(() => finish(window.__dyRelationLatestDtrait || readStoredDtrait() || ""), 4000);
            });
            (async () => {
                try {
                    const crypto = window.securitySDK && window.securitySDK.cryptoSDK;
                    if (!crypto) throw new Error("security sdk not ready");
                    const info = await crypto.getKeysInfoWithOrigin({ certType: "header", scene: "web_protect" });
                    const ecdh = await crypto.initECDHKey();
                    let privateKey = "";
                    try {
                        const storedCrypto = window.localStorage && window.localStorage.getItem("security-sdk/s_sdk_crypt_sdk") || "";
                        const outer = storedCrypto ? JSON.parse(storedCrypto) : {};
                        const inner = outer && outer.data ? JSON.parse(outer.data) : {};
                        privateKey = inner && inner.ec_privateKey || "";
                    } catch (error) {}
                    const clientCert = info && info.sign && info.sign.client_cert || "";
                    const payload = {
                        ticket: info && info.sign && info.sign.ticket || "",
                        ts_sign: info && info.sign && info.sign.ts_sign || "",
                        public_key: info && (info.b64PubKey || clientCert.replace(/^pub\\./, "")) || "",
                        client_cert: clientCert,
                        private_key: privateKey,
                        ecdh_key: bytesToBase64(ecdh),
                        uid: window.SSR_RENDER_DATA && window.SSR_RENDER_DATA.app && window.SSR_RENDER_DATA.app.odin && window.SSR_RENDER_DATA.app.odin.user_id || "",
                        dtrait: "",
                    };
                    patchDtraitCapture((value) => {
                        payload.dtrait = value || payload.dtrait;
                        if (payload.ticket && payload.ts_sign && payload.public_key && payload.ecdh_key && payload.dtrait) save(payload);
                    });
                    payload.dtrait = await captureDtrait();
                    if (payload.ticket && payload.ts_sign && payload.public_key && payload.ecdh_key) {
                        save(payload);
                        if (!payload.dtrait) window.__dyRelationSignerProbeStarted = false;
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
