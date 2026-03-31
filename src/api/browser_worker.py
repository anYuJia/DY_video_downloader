#!/usr/bin/env python3
"""独立的Playwright浏览器请求进程，避免gevent冲突
通过拦截浏览器内部XHR请求获取带签名的API响应"""
import sys
import json
import time
import urllib.parse
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth


def browser_fetch(cookie: str, url: str, user_agent: str) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, channel='chrome')
        context = browser.new_context(
            user_agent=user_agent,
            viewport={"width": 1680, "height": 1050},
        )

        # 设置cookie
        if cookie:
            cookies = []
            for item in cookie.split(';'):
                if '=' in item:
                    key, value = item.strip().split('=', 1)
                    cookies.append({
                        "name": key,
                        "value": value,
                        "domain": ".douyin.com",
                        "path": "/"
                    })
            context.add_cookies(cookies)

        page = context.new_page()

        # 先访问主页，让bdms初始化
        page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(3000)

        # 使用XMLHttpRequest而非fetch，因为bdms可能会hook XHR
        result = page.evaluate("""
            (url) => {
                return new Promise((resolve) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', url, true);
                    xhr.withCredentials = true;
                    xhr.onload = function() {
                        try {
                            if (xhr.responseText && xhr.responseText.length > 0) {
                                resolve(JSON.parse(xhr.responseText));
                            } else {
                                resolve({"error": "empty_response", "status": xhr.status});
                            }
                        } catch(e) {
                            resolve({"error": e.message, "raw_length": xhr.responseText ? xhr.responseText.length : 0});
                        }
                    };
                    xhr.onerror = function() {
                        resolve({"error": "xhr_error", "status": xhr.status});
                    };
                    xhr.timeout = 15000;
                    xhr.ontimeout = function() {
                        resolve({"error": "timeout"});
                    };
                    xhr.send();
                });
            }
        """, url)

        browser.close()
        return result


def browser_fetch_via_navigation(cookie: str, api_path: str, params: dict, user_agent: str) -> dict:
    """通过连接已有浏览器会话或启动新浏览器来获取API数据"""
    with sync_playwright() as p:
        # 优先尝试连接已有的浏览器（远程调试端口）
        browser = None
        context = None
        reuse_browser = False

        try:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            # 使用已有的context（包含登录会话）
            contexts = browser.contexts
            if contexts:
                context = contexts[0]
                reuse_browser = True
                print(f"[browser_worker] 已连接到现有浏览器, {len(context.pages)} 个标签页", file=sys.stderr)
            else:
                print("[browser_worker] 浏览器无可用context", file=sys.stderr)
                browser.close()
                browser = None
        except Exception as e:
            print(f"[browser_worker] 无法连接已有浏览器: {e}", file=sys.stderr)
            print("[browser_worker] 请用以下命令启动浏览器:", file=sys.stderr)
            print("[browser_worker]   Edge: /Applications/Microsoft\\ Edge.app/Contents/MacOS/Microsoft\\ Edge --remote-debugging-port=9222", file=sys.stderr)
            print("[browser_worker]   Chrome: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222", file=sys.stderr)
            # Fallback: 启动新浏览器
            pass

        if not browser:
            # 启动新浏览器
            try:
                print("[browser_worker] 启动新浏览器实例...", file=sys.stderr)
                browser = p.chromium.launch(headless=False, channel='chrome')
                context = browser.new_context(
                    user_agent=user_agent,
                    viewport={"width": 1680, "height": 1050},
                )
                # 设置 cookie
                if cookie:
                    cookies = []
                    for item in cookie.split(';'):
                        if '=' in item:
                            key, value = item.strip().split('=', 1)
                            cookies.append({
                                "name": key,
                                "value": value,
                                "domain": ".douyin.com",
                                "path": "/"
                            })
                    context.add_cookies(cookies)
                reuse_browser = False
            except Exception as e:
                print(f"[browser_worker] 启动新浏览器失败：{e}", file=sys.stderr)
                return {"error": "browser_launch_failed", "hint": str(e)}

        if not context:
            return {"error": "no_browser_context"}

        # 创建新标签页
        page = context.new_page()

        # 拦截API响应
        api_result = {"data": None}

        # Debug: log all responses
        all_urls = []
        def handle_response(response):
            url = response.url
            all_urls.append(url[:120])
            if api_path in url and api_result["data"] is None:
                try:
                    body = response.body()
                    if body and len(body) > 0:
                        api_result["data"] = json.loads(body)
                        print(f"[browser_worker] CAPTURED: {url[:100]}", file=sys.stderr)
                except Exception as e:
                    print(f"[browser_worker] capture error: {e}", file=sys.stderr)

        page.on("response", handle_response)

        # 如果是用户搜索接口，导航到搜索页触发真实请求
        if 'discover/search' in api_path or 'general/search' in api_path:
            keyword = params.get('keyword', '')
            search_url = f"https://www.douyin.com/search/{urllib.parse.quote(keyword)}?type=user"
            page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(5000)
        elif 'user/profile' in api_path:
            # 对于用户详情，访问用户主页
            sec_uid = params.get('sec_user_id', '')
            if sec_uid:
                user_url = f"https://www.douyin.com/user/{sec_uid}"
                print(f"[browser_worker] navigating to: {user_url}", file=sys.stderr)
                page.goto(user_url, wait_until="load", timeout=25000)
                page.wait_for_timeout(6000)
                # Print all API URLs seen
                api_urls = [u for u in all_urls if 'aweme' in u or 'api' in u]
                print(f"[browser_worker] API URLs seen ({len(api_urls)}): {api_urls[:10]}", file=sys.stderr)
        elif 'aweme/post' in api_path:
            # 用户作品列表，也访问用户主页
            sec_uid = params.get('sec_user_id', '')
            if sec_uid:
                user_url = f"https://www.douyin.com/user/{sec_uid}"
                page.goto(user_url, wait_until="domcontentloaded", timeout=20000)
                page.wait_for_timeout(5000)
        elif 'aweme/detail' in api_path:
            # 视频详情接口，需要先访问视频页面触发真实 API 请求
            aweme_id = params.get('aweme_id', '')
            if aweme_id:
                video_url = f"https://www.douyin.com/video/{aweme_id}"
                print(f"[browser_worker] navigating to video page: {video_url}", file=sys.stderr)
                try:
                    page.goto(video_url, wait_until="load", timeout=25000)
                except Exception as e:
                    print(f"[browser_worker] 页面加载失败：{e}", file=sys.stderr)

                # 等待 API 响应被捕获或超时（最多 60 秒）
                # 这样用户有足够时间完成手机号验证等操作
                print(f"[browser_worker] 等待 API 响应，最多 60 秒...", file=sys.stderr)
                start_wait = time.time()
                max_wait = 60  # 最大等待时间（秒）
                page_closed = False

                for i in range(max_wait):
                    # 检查页面是否被关闭
                    try:
                        if page.is_closed():
                            print(f"[browser_worker] 页面已关闭，停止等待", file=sys.stderr)
                            page_closed = True
                            break
                    except Exception:
                        page_closed = True
                        break

                    # 检查是否捕获到有效的 API 响应
                    if api_result["data"] is not None:
                        # 检查响应是否包含有效的 aweme_detail
                        aweme_detail = api_result["data"].get("aweme_detail")
                        filter_detail = api_result["data"].get("filter_detail", {})

                        if aweme_detail is not None:
                            # 有效响应，退出等待
                            print(f"[browser_worker] 已捕获有效 API 响应！(after {int(time.time()-start_wait)}s)", file=sys.stderr)
                            break
                        elif filter_detail.get('filter_reason') == 'core_dep':
                            # 需要用户验证或登录，继续等待
                            if i % 5 == 0:
                                print(f"[browser_worker] API 返回 core_dep，等待用户验证... ({int(time.time()-start_wait)}s)", file=sys.stderr)
                        else:
                            # 其他错误，也继续等待
                            if i % 10 == 0:
                                print(f"[browser_worker] API 返回 filter_reason={filter_detail.get('filter_reason')}，继续等待... ({int(time.time()-start_wait)}s)", file=sys.stderr)

                    # 等待 1 秒，检查页面是否关闭
                    try:
                        page.wait_for_timeout(1000)
                    except Exception as e:
                        if 'closed' in str(e).lower():
                            print(f"[browser_worker] 页面等待时被关闭：{e}", file=sys.stderr)
                            page_closed = True
                            break

                    # 检查页面是否被关闭或导航到其他页面
                    try:
                        current_url = page.url
                        if 'login' in current_url.lower() or 'passport' in current_url.lower():
                            if i % 10 == 0:
                                print(f"[browser_worker] 当前页面为登录页，请完成验证... ({int(time.time()-start_wait)}s)", file=sys.stderr)
                    except Exception:
                        # 无法获取 URL，页面可能已关闭
                        pass

                # Print all API URLs seen
                api_urls = [u for u in all_urls if 'aweme' in u or 'api' in u]
                print(f"[browser_worker] API URLs seen ({len(api_urls)}): {api_urls[:10]}", file=sys.stderr)

                # 如果还没捕获到有效 API 响应，尝试从页面获取
                if api_result["data"] is None or api_result["data"].get("aweme_detail") is None:
                    print(f"[browser_worker] 未捕获有效 API 响应 (页面已关闭：{page_closed})", file=sys.stderr)
                    if not page_closed:
                        try:
                            # 检查页面是否有错误信息
                            page_content = page.content()
                            if '验证' in page_content or '登录' in page_content:
                                print(f"[browser_worker] 页面包含验证或登录提示，需要用户手动操作", file=sys.stderr)
                        except Exception as e:
                            print(f"[browser_worker] 获取页面内容失败：{e}", file=sys.stderr)
            else:
                # 没有 aweme_id，使用通用 fetch
                query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
                url = f"https://www.douyin.com{api_path}?{query}"
                page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=15000)
                page.wait_for_timeout(2000)
                result = page.evaluate("""
                    async (url) => {
                        try {
                            const resp = await fetch(url);
                            return await resp.json();
                        } catch(e) {
                            return {"error": e.message};
                        }
                    }
                """, url)
                page.close()
                return result
        else:
            # 通用：直接fetch
            query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
            url = f"https://www.douyin.com{api_path}?{query}"
            page.goto("https://www.douyin.com/", wait_until="domcontentloaded", timeout=15000)
            page.wait_for_timeout(2000)
            result = page.evaluate("""
                async (url) => {
                    try {
                        const resp = await fetch(url);
                        return await resp.json();
                    } catch(e) {
                        return {"error": e.message};
                    }
                }
            """, url)
            page.close()
            return result

        # 关闭标签页（不关闭浏览器）
        page.close()

        if api_result["data"]:
            return api_result["data"]
        return {"error": "no_api_response_captured"}


if __name__ == '__main__':
    req = json.loads(sys.stdin.read())
    try:
        # 优先用导航模式（拦截真实浏览器请求）
        if req.get('params') and req.get('api_path'):
            result = browser_fetch_via_navigation(
                req['cookie'], req['api_path'], req['params'], req['user_agent']
            )
        else:
            result = browser_fetch(req['cookie'], req['url'], req['user_agent'])
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
