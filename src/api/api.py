import asyncio
import requests
import requests.adapters
import urllib3.util.retry
import urllib.parse
import urllib.request
import os
import execjs
import re
import json
import subprocess
import sys
import random
import string

# Configure a session with retry/SSL resilience
_api_session = requests.Session()
_retry = urllib3.util.retry.Retry(total=3, backoff_factor=0.5, status_forcelist=[502, 503, 504])
_api_session.mount('https://', requests.adapters.HTTPAdapter(max_retries=_retry))



class DouyinAPI:
    """抖音API封装类"""
    
    def __init__(self, cookie: str):
        self.cookie = cookie
        self.host = 'https://www.douyin.com'
        self._cached_webid = None
        self._webid_time = 0
        self._douyin_sign = None  # 懒加载：延迟到第一次使用时初始化

        # 检查是否启用调试模式
        self.debug_mode = os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes')
        if self.debug_mode:
            print("\033[93m[API] 调试模式已启用\033[0m")
        # 通用请求参数
        self.common_params = {
            'device_platform': 'webapp',
            'aid': '6383',
            'channel': 'channel_pc_web',
            'update_version_code': '0',
            'pc_client_type': '1',
            'version_code': '190600',
            'version_name': '19.6.0',
            'cookie_enabled': 'true',
            'screen_width': '1680',
            'screen_height': '1050',
            'browser_language': 'zh-CN',
            'browser_platform': 'MacIntel',
            'browser_name': 'Edge',
            'browser_version': '145.0.0.0',
            'browser_online': 'true',
            'engine_name': 'Blink',
            'engine_version': '145.0.0.0',
            'os_name': 'Mac OS',
            'os_version': '10.15.7',
            'cpu_core_num': '8',
            'device_memory': '8',
            'platform': 'PC',
            'downlink': '10',
            'effective_type': '4g',
            'round_trip_time': '50',
            'pc_libra_divert': 'Mac',
            'support_h265': '1',
            'support_dash': '1',
            'disable_rs': '0',
            'need_filter_settings': '1',
            'list_type': 'single',
        }

        # 通用请求头
        self.common_headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "sec-ch-ua-platform": '"macOS"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua": '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
            "referer": "https://www.douyin.com/",
            "priority": "u=1, i",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
            "accept": "application/json, text/plain, */*",
        }

    @property
    def douyin_sign(self):
        """懒加载：延迟到第一次使用时初始化 JS 签名引擎"""
        if self._douyin_sign is None:
            try:
                from src.config.config import get_resource_path
                with open(get_resource_path('lib/js/douyin.js'), 'r', encoding='utf-8') as f:
                    self._douyin_sign = execjs.compile(f.read())
            except Exception as e:
                print(f"\033[91m[API] 初始化JS签名引擎失败: {e}\033[0m")
        return self._douyin_sign

    async def _get_webid(self, headers: dict) -> str:
        """获取webid（缓存10分钟）"""
        import time
        if self._cached_webid and (time.time() - self._webid_time) < 600:
            return self._cached_webid
        try:
            url = 'https://www.douyin.com/?recommend=1'
            h = headers.copy()
            h['sec-fetch-dest'] = 'document'
            h['sec-fetch-mode'] = 'navigate'
            h['accept'] = 'text/html,application/xhtml+xml'

            response = await asyncio.to_thread(_api_session.get, url, headers=h, timeout=10)
            if self.debug_mode:
                print(f"\033[93m[API] _get_webid 响应状态: {response.status_code}, 内容长度: {len(response.text)}\033[0m")
            if response.status_code != 200 or not response.text:
                if self.debug_mode:
                    print(f"\033[91m[API] 获取webid失败: {response.status_code}\033[0m")
                return None

            # Try multiple patterns
            for pattern in [
                r'\\"user_unique_id\\":\\"(\d+)\\"',
                r'"user_unique_id":"(\d+)"',
                r'"webid":"(\d+)"',
                r'webid=(\d+)',
            ]:
                match = re.search(pattern, response.text)
                if match:
                    webid = match.group(1)
                    self._cached_webid = webid
                    self._webid_time = time.time()
                    if self.debug_mode:
                        print(f"\033[93m[API] 获取到webid: {webid}\033[0m")
                    return webid

            if self.debug_mode:
                print(f"\033[91m[API] 未能从页面提取webid\033[0m")
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 获取webid异常: {e}\033[0m")
        return None
    
    async def _deal_params(self, params: dict, headers: dict) -> dict:
        """处理请求参数"""
        try:
            # 添加cookie到headers
            if self.cookie:
                headers['Cookie'] = self.cookie

            cookie = headers.get('cookie') or headers.get('Cookie')
            if not cookie:
                return params

            cookie_dict = self._cookies_to_dict(cookie)

            # 从cookie中提取参数
            params['msToken'] = self._get_ms_token()
            params['screen_width'] = cookie_dict.get('dy_swidth', params.get('screen_width', 1680))
            params['screen_height'] = cookie_dict.get('dy_sheight', params.get('screen_height', 1050))
            params['cpu_core_num'] = cookie_dict.get('device_web_cpu_core', params.get('cpu_core_num', 8))
            params['device_memory'] = cookie_dict.get('device_web_memory_size', params.get('device_memory', 8))
            s_v_web_id = cookie_dict.get('s_v_web_id') or self._generate_s_v_web_id()
            params['verifyFp'] = s_v_web_id
            params['fp'] = s_v_web_id

            # 从cookie中提取uifid并添加到header和参数
            uifid = cookie_dict.get('UIFID', '')
            if uifid:
                headers['uifid'] = uifid
                params['uifid'] = uifid

            # 获取webid（失败时不添加，避免无效值导致请求被拒）
            webid = await self._get_webid(headers)
            if webid:
                params['webid'] = webid

            return params
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 处理参数失败: {e}\033[0m")
            return params

    def _cookies_to_dict(self, cookie_str: str) -> dict:
        """将cookie字符串转换为字典"""
        cookie_dict = {}
        if not cookie_str:
            return cookie_dict
        
        try:
            for item in cookie_str.split(';'):
                if '=' in item:
                    key, value = item.strip().split('=', 1)
                    cookie_dict[key] = value
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 解析cookie失败: {e}\033[0m")
        
        return cookie_dict

    def _get_ms_token(self) -> str:
        """生成msToken"""
        return ''.join(random.choices(string.ascii_letters + string.digits, k=107))

    def _generate_s_v_web_id(self) -> str:
        """生成s_v_web_id (verifyFp)"""
        charset = string.ascii_lowercase + string.digits
        random_str = ''.join(random.choices(charset, k=16))
        return f"verify_0{random_str}"

    async def common_request(self, uri: str, params: dict, headers: dict, host: str = None, skip_sign: bool = False, method: str = 'GET') -> tuple[dict, bool]:
        """
        请求 douyin
        :param uri: 请求路径
        :param params: 请求参数
        :param headers: 请求头
        :param host: 可选的自定义host
        :param skip_sign: 跳过a_bogus签名（部分接口不需要）
        :param method: 请求方法 ('GET' 或 'POST')
        :return: 返回数据和是否成功
        """
        base_host = host or self.host
        url = f'{base_host}{uri}'
        params.update(self.common_params)
        # 先应用通用头，再用自定义头覆盖
        merged_headers = dict(self.common_headers)
        merged_headers.update(headers)
        headers = merged_headers
        params = await self._deal_params(params, headers)

        if not skip_sign:
            query = '&'.join([f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items()])
            call_name = 'sign_datail'
            if 'reply' in uri:
                call_name = 'sign_reply'
            a_bogus = self.douyin_sign.call(call_name, query, headers["User-Agent"])
            params["a_bogus"] = a_bogus

        if self.debug_mode:
            print(f'\033[94m[API] 请求URL: {url}\033[0m')
            print(f'\033[94m[API] 请求方法: {method}\033[0m')
            print(f'\033[94m[API] 请求参数: {params}\033[0m')

        # 根据方法选择 GET 或 POST
        if method.upper() == 'POST':
            response = await asyncio.to_thread(_api_session.post, url, data=params, headers=headers)
        else:
            response = await asyncio.to_thread(_api_session.get, url, params=params, headers=headers)
        if self.debug_mode:
            print(f'[DEBUG] response.status_code={response.status_code}, len(response.content)={len(response.content)}, len(response.text)={len(response.text)}')
            sys.stderr.write(f'*** [API] 普通请求响应：status={response.status_code}, content_len={len(response.content)} ***\n')
            sys.stderr.flush()
        
        if self.debug_mode:
            print(f'\033[94m[API] 响应状态码: {response.status_code}\033[0m')
            print(f'\033[94m[API] 响应内容长度: {len(response.text)}, 前500字符: {response.text[:500]}\033[0m')

        if response.status_code != 200 or len(response.content) == 0:
            sys.stderr.write(f'*** [API] 请求失败，准备尝试浏览器 fallback ***\n')
            sys.stderr.flush()
            print(f'[API] 普通请求失败 (状态={response.status_code}, 空={len(response.content) == 0}), 尝试浏览器请求...')
            # 回退到浏览器请求
            browser_result = await self.browser_request(uri, params)
            sys.stderr.write(f'*** [API] 浏览器请求返回：succ={browser_result[1]} ***\n')
            sys.stderr.flush()
            print(f'[API] 浏览器请求返回：succ={browser_result[1]}')
            return browser_result
            
        try:
            json_response = response.json()
        except Exception as e:
            if self.debug_mode:
                print(f'\033[91m[API] JSON解析失败: {e}\033[0m')
            return {}, False

        # 检测验证码拦截 - 只有当user_list也为空时才认为需要验证
        nil_info = json_response.get('search_nil_info', {})
        user_list = json_response.get('user_list', [])
        if nil_info.get('search_nil_type') == 'verify_check' and len(user_list) == 0:
            if self.debug_mode:
                print(f'\033[91m[API] 触发滑块验证！尝试使用浏览器模式重试...\033[0m')

            # 使用浏览器模式重试
            sys.stderr.write(f'*** [API] 触发验证，自动切换到浏览器模式 ***\n')
            sys.stderr.flush()
            print(f'[API] 触发验证，自动切换到浏览器模式...')
            browser_result = await self.browser_request(uri, params)
            return browser_result

        # 检测视频详情接口返回空数据（可能是视频不存在或 API 限流）
        if uri and 'aweme/detail' in uri and json_response.get('aweme_detail') is None:
            filter_detail = json_response.get('filter_detail', {})
            filter_reason = filter_detail.get('filter_reason', 'unknown')
            if self.debug_mode:
                print(f'\033[91m[API] 视频详情接口返回空数据：filter_reason={filter_reason}\033[0m')
            return json_response, False

        if json_response.get('status_code', 0) != 0:
            if self.debug_mode:
                print(f'\033[91m[API] API返回错误: status_code={json_response.get("status_code")}, msg={json_response.get("status_msg", "")}\033[0m')
            return json_response, False

        return json_response, True

    async def browser_request(self, uri: str, params: dict) -> tuple[dict, bool]:
        """使用Playwright子进程发起真实浏览器请求，通过页面导航拦截真实API响应"""
        try:
            # 检测 Playwright 是否安装
            from src.utils.playwright_checker import check_playwright_installed
            is_installed, message = check_playwright_installed()

            if not is_installed:
                error_msg = f"Playwright 未正确安装: {message}\n请运行: python -m src.utils.playwright_checker --install"
                if self.debug_mode:
                    print(f"\033[91m[API] {error_msg}\033[0m")
                return {'error': 'playwright_not_installed', 'message': message}, False

            if self.debug_mode:
                print(f"\033[94m[API] 启动浏览器子进程(导航模式)...\033[0m")

            from src.config.config import IS_FROZEN
            
            env = os.environ.copy()
            env['RUN_WORKER'] = 'browser_worker'
            env['PYTHONIOENCODING'] = 'utf-8'
            
            if IS_FROZEN:
                cmd = [sys.executable]
            else:
                worker_path = os.path.join(os.path.dirname(__file__), 'browser_worker.py')
                cmd = [sys.executable, worker_path]

            req_data = json.dumps({
                "cookie": self.cookie or "",
                "api_path": uri,
                "params": params,
                "user_agent": self.common_headers["User-Agent"],
            })

            proc = await asyncio.to_thread(
                subprocess.run,
                cmd,
                input=req_data,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=90,  # 增加超时时间到 90 秒，允许用户完成验证操作
                env=env,
            )

            if proc.returncode != 0:
                if self.debug_mode:
                    print(f"\033[91m[API] 浏览器子进程错误: {proc.stderr[:500]}\033[0m")
                return {}, False

            if self.debug_mode and proc.stderr:
                print(f"\033[93m[API] 浏览器日志: {proc.stderr[:2000]}\033[0m")

            result = json.loads(proc.stdout)

            sys.stderr.write(f'*** [API] 浏览器响应：{json.dumps(result, ensure_ascii=False)[:500]} ***\n')
            sys.stderr.flush()

            if self.debug_mode:
                result_str = json.dumps(result, ensure_ascii=False)
                print(f"\033[94m[API] 浏览器响应: {result_str[:500]}...\033[0m")

            if result and not result.get("error"):
                if result.get('status_code', 0) != 0:
                    sys.stderr.write(f'*** [API] 浏览器响应 status_code != 0，返回 False ***\n')
                    sys.stderr.flush()
                    return result, False
                sys.stderr.write(f'*** [API] 浏览器响应成功，返回 True ***\n')
                sys.stderr.flush()
                return result, True

            if self.debug_mode and result.get("error"):
                print(f"\033[91m[API] 浏览器请求失败: {result['error']}\033[0m")
            sys.stderr.write(f'*** [API] 浏览器响应有 error 或 result 为空，返回 False ***\n')
            sys.stderr.flush()
            return {}, False

        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 浏览器请求异常: {e}\033[0m")
            return {}, False

    async def get_recommended_feed(self, count: int = 20, cursor: int = 0) -> tuple[dict, bool]:
        """获取推荐视频流
        
        Args:
            count: 获取数量
            cursor: 分页游标
            
        Returns:
            tuple[dict, bool]: (响应数据, 是否成功)
        """
        if self.debug_mode:
            print(f"\033[94m[API] 获取推荐视频流: count={count}, cursor={cursor}\033[0m")
        
        # 准备请求参数 - 使用真实浏览器捕获的参数
        params = {
            'module_id': '3003101',  # 推荐模块ID
            'count': str(count),
            'pull_type': '0',  # 刷新类型
            'refresh_index': '1',  # 刷新索引
            'refer_type': '10',  # 引用类型
            'filterGids': '',
            'presented_ids': '',
            'refer_id': '',
            'tag_id': '',
            'use_lite_type': '2',
            'Seo-Flag': '0',
            'pre_log_id': '',
            'pre_item_ids': '',
            'pre_room_ids': '',
            'pre_item_from': 'sati',
            'xigua_user': '0',
            'awemePcRecRawData': '{"is_xigua_user":0,"danmaku_switch_status":0,"is_client":false}',
        }
        
        # 自定义请求头
        headers = {
            "Referer": "https://www.douyin.com/?recommend=1"
        }
        
        # 使用 POST 请求 - 重要！
        # 推荐接口需要 POST 请求，不是 GET
        resp, success = await self.common_request(
            '/aweme/v2/web/module/feed/',
            params,
            headers,
            skip_sign=False,  # 需要签名
            method='POST'  # 使用 POST 方法
        )

        if success and resp.get('aweme_list'):
            aweme_count = len(resp.get('aweme_list', []))
            if self.debug_mode:
                print(f"\033[92m[API] 获取推荐视频成功: {aweme_count} 个\033[0m")

            # 检查是否有视频没有播放地址
            valid_count = 0
            for aweme in resp.get('aweme_list', []):
                video_data = aweme.get('video', {})
                play_addr = video_data.get('play_addr', {})
                if isinstance(play_addr, dict):
                    url_list = play_addr.get('url_list', [])
                    if url_list and url_list[0]:
                        valid_count += 1

            if self.debug_mode and valid_count < aweme_count:
                print(f"\033[93m[API] 有效视频: {valid_count}/{aweme_count}\033[0m")

            return resp, True

        if self.debug_mode:
            print(f"\033[91m[API] 获取推荐视频失败\033[0m")
            if resp:
                print(f"\033[91m[API] 响应: {resp}\033[0m")

        return resp, False

    async def get_temp_cookie(self) -> dict:
        """获取临时 Cookie（无需登录）

        Returns:
            dict: {
                'success': bool,
                'cookie': str (如果成功),
                'message': str
            }
        """
        try:
            if self.debug_mode:
                print(f"\033[94m[API] 获取临时 Cookie...\033[0m")

            # 方法1: 尝试使用纯 HTTP 请求获取 Cookie（不需要 Playwright）
            cookie_str = await self._get_temp_cookie_http()

            if cookie_str:
                return {
                    'success': True,
                    'cookie': cookie_str,
                    'message': '成功获取临时 Cookie（HTTP方式）'
                }

            # 方法2: 如果 HTTP 方式失败，回退到 Playwright
            if self.debug_mode:
                print(f"\033[93m[API] HTTP 方式获取失败，使用 Playwright 回退\033[0m")

            # 检测 Playwright 是否安装
            from src.utils.playwright_checker import check_playwright_installed
            is_installed, check_message = check_playwright_installed()

            if not is_installed:
                error_msg = f"Playwright 未正确安装: {check_message}\n请运行: python -m src.utils.playwright_checker --install"
                if self.debug_mode:
                    print(f"\033[91m[API] {error_msg}\033[0m")
                return {
                    'success': False,
                    'message': f'Playwright 未安装: {check_message}'
                }

            # 使用 Playwright 子进程获取临时 cookie
            from src.config.config import IS_FROZEN

            env = os.environ.copy()
            env['RUN_WORKER'] = 'browser_worker'
            env['PYTHONIOENCODING'] = 'utf-8'

            if IS_FROZEN:
                cmd = [sys.executable]
            else:
                worker_path = os.path.join(os.path.dirname(__file__), 'browser_worker.py')
                cmd = [sys.executable, worker_path]

            req_data = json.dumps({
                "action": "get_temp_cookie"
            })

            proc = await asyncio.to_thread(
                subprocess.run,
                cmd,
                input=req_data,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=30,
                env=env,
            )

            if proc.returncode != 0:
                if self.debug_mode:
                    print(f"\033[91m[API] 获取临时 Cookie 失败: {proc.stderr[:200]}\033[0m")
                return {
                    'success': False,
                    'message': '获取临时 Cookie 失败: ' + proc.stderr[:200]
                }

            result = json.loads(proc.stdout)

            if self.debug_mode:
                print(f"\033[92m[API] 获取临时 Cookie 成功\033[0m")

            return result

        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 获取临时 Cookie 异常: {e}\033[0m")
            return {
                'success': False,
                'message': str(e)
            }

    async def _get_temp_cookie_http(self) -> str:
        """使用纯 HTTP 请求获取临时 Cookie（不需要 Playwright）

        Returns:
            str: Cookie 字符串，失败返回空字符串
        """
        try:
            if self.debug_mode:
                print(f"\033[94m[API] 使用 HTTP 方式获取临时 Cookie\033[0m")

            # 准备请求头
            headers = {
                'User-Agent': self.common_headers['User-Agent'],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }

            # 创建一个 session 来自动处理 Cookie
            session = requests.Session()

            # 发送请求
            response = await asyncio.to_thread(
                session.get,
                'https://www.douyin.com/',
                headers=headers,
                timeout=10
            )

            # 从 session.cookies 中提取 Cookie
            cookies = []
            for cookie in session.cookies:
                cookies.append(f"{cookie.name}={cookie.value}")

            if cookies:
                cookie_str = '; '.join(cookies)
                if self.debug_mode:
                    print(f"\033[92m[API] HTTP 方式获取到 {len(cookies)} 个 Cookie\033[0m")
                    print(f"\033[94m[API] Cookie: {cookie_str[:100]}...\033[0m")
                return cookie_str

            if self.debug_mode:
                print(f"\033[93m[API] HTTP 方式未获取到 Cookie\033[0m")
            return ''

        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] HTTP 获取 Cookie 失败: {e}\033[0m")
            return ''

    @staticmethod
    def get_browser_cookies() -> dict:
        """从浏览器中读取抖音 Cookie（支持 Chrome, Edge, Firefox）

        Returns:
            dict: {
                'success': bool,
                'cookie': str (如果成功),
                'message': str,
                'browser': str (浏览器名称)
            }
        """
        try:
            import browser_cookie3
            import platform

            browsers = []

            # 根据平台选择浏览器
            system = platform.system()
            if system == 'Darwin':  # macOS
                browsers = [
                    ('Chrome', browser_cookie3.chrome),
                    ('Edge', browser_cookie3.edge),
                    ('Firefox', browser_cookie3.firefox),
                    ('Safari', browser_cookie3.safari),
                ]
            elif system == 'Windows':
                browsers = [
                    ('Chrome', browser_cookie3.chrome),
                    ('Edge', browser_cookie3.edge),
                    ('Firefox', browser_cookie3.firefox),
                ]
            elif system == 'Linux':
                browsers = [
                    ('Chrome', browser_cookie3.chrome),
                    ('Firefox', browser_cookie3.firefox),
                ]

            for browser_name, browser_func in browsers:
                try:
                    cookies = browser_func(domain_name='douyin.com')

                    if cookies:
                        cookie_str = '; '.join([f"{c.name}={c.value}" for c in cookies])
                        return {
                            'success': True,
                            'cookie': cookie_str,
                            'message': f'成功从 {browser_name} 浏览器读取到 {len(cookies)} 个 Cookie',
                            'browser': browser_name,
                            'count': len(cookies)
                        }
                except Exception as e:
                    # 该浏览器未安装或无法访问，继续尝试下一个
                    continue

            return {
                'success': False,
                'message': '未能从任何浏览器读取到抖音 Cookie，请确保已在浏览器中登录抖音'
            }

        except ImportError:
            return {
                'success': False,
                'message': '缺少 browser-cookie3 模块，请运行: pip install browser-cookie3'
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'读取浏览器 Cookie 失败: {str(e)}'
            }

