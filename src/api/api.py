import asyncio
import requests
import requests.adapters
import urllib3.util.retry
import urllib.parse
import urllib.request
import os
import re
import json
import sys
import random
import string
import threading

# Configure a session with retry/SSL resilience
_retry = urllib3.util.retry.Retry(total=3, backoff_factor=0.5, status_forcelist=[502, 503, 504])
_thread_local = threading.local()


def _create_api_session():
    session = requests.Session()
    session.mount('https://', requests.adapters.HTTPAdapter(max_retries=_retry))
    return session


def _get_api_session():
    session = getattr(_thread_local, 'api_session', None)
    if session is None:
        session = _create_api_session()
        _thread_local.api_session = session
    return session


def _api_get(*args, **kwargs):
    return _get_api_session().get(*args, **kwargs)


def _api_post(*args, **kwargs):
    return _get_api_session().post(*args, **kwargs)


def _redact_headers(headers: dict) -> dict:
    redacted = dict(headers or {})
    for key in list(redacted.keys()):
        if key.lower() in ('cookie', 'authorization'):
            redacted[key] = '<redacted>'
    return redacted


def _redact_params(params: dict) -> dict:
    redacted = dict(params or {})
    for key in ('msToken', 'a_bogus', 'verifyFp', 'fp', 'webid', 'uifid'):
        if key in redacted:
            redacted[key] = '<redacted>'
    return redacted



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
                import execjs  # 延迟导入，避免启动时加载 Node.js
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

            response = await asyncio.to_thread(_api_get, url, headers=h, timeout=10)
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

    def _build_verify_hint(self, uri: str, params: dict, response=None) -> tuple[dict, bool]:
        """构造统一的验证提示结果。"""
        verify_url = 'https://www.douyin.com/'

        try:
            if uri and 'discover/search' in uri:
                keyword = params.get('keyword', '')
                if keyword:
                    verify_url = f"https://www.douyin.com/jingxuan/search/{urllib.parse.quote(str(keyword))}?type=user"
            elif uri and 'user/profile' in uri:
                sec_uid = params.get('sec_user_id', '')
                if sec_uid:
                    verify_url = f'https://www.douyin.com/user/{sec_uid}'
            elif uri and 'aweme/post' in uri:
                sec_uid = params.get('sec_user_id', '')
                if sec_uid:
                    verify_url = f'https://www.douyin.com/user/{sec_uid}'
            elif uri and 'aweme/favorite' in uri:
                verify_url = 'https://www.douyin.com/'
            elif uri and 'module/feed' in uri:
                verify_url = 'https://www.douyin.com/?recommend=1'
            elif uri and 'aweme/detail' in uri:
                aweme_id = params.get('aweme_id', '')
                if aweme_id:
                    verify_url = f'https://www.douyin.com/video/{aweme_id}'
            elif uri and 'comment/list' in uri:
                aweme_id = params.get('aweme_id', '')
                if aweme_id:
                    verify_url = f'https://www.douyin.com/video/{aweme_id}'
        except Exception:
            pass

        message = '需要完成验证后重试'
        if response is not None:
            try:
                if getattr(response, 'status_code', 0):
                    message = f'请求被拒绝（HTTP {response.status_code}），请完成验证后重试'
            except Exception:
                pass

        return {
            '_need_verify': True,
            '_verify_url': verify_url,
            'message': message,
        }, False

    def _extract_api_message(self, data: dict, fallback: str = '请求失败') -> str:
        if not isinstance(data, dict):
            return fallback

        for key in ('message', 'status_msg', 'log_pb'):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        return fallback

    def _looks_like_logged_out_error(self, data: dict) -> bool:
        if not isinstance(data, dict):
            return False

        status_code = data.get('status_code')
        if status_code in (8, '8'):
            return True

        text_parts = []
        for key in ('message', 'status_msg', 'prompts', 'status_msg_extra'):
            value = data.get(key)
            if isinstance(value, str):
                text_parts.append(value)
            elif value is not None:
                text_parts.append(str(value))

        text = ' '.join(text_parts).lower()
        return any(
            token in text
            for token in (
                '用户未登录',
                '未登录',
                '登录态',
                '重新登录',
                'session expired',
                'not login',
                'not logged in',
                'login required',
            )
        )

    def _build_login_required_error(self, data: dict | None = None) -> dict:
        data = data if isinstance(data, dict) else {}
        api_message = self._extract_api_message(data, '用户未登录')
        return {
            '_need_login': True,
            'status_code': data.get('status_code'),
            'status_msg': data.get('status_msg', ''),
            'message': f'{api_message}，请在设置中重新登录并刷新 Cookie',
        }

    def _looks_like_login_or_verify_error(self, uri: str, data: dict) -> bool:
        if not isinstance(data, dict):
            return False

        text_parts = []
        for key in ('message', 'status_msg', 'prompts', 'status_msg_extra'):
            value = data.get(key)
            if isinstance(value, str):
                text_parts.append(value)
            elif value is not None:
                text_parts.append(str(value))

        filter_detail = data.get('filter_detail')
        if isinstance(filter_detail, dict):
            text_parts.extend(str(value) for value in filter_detail.values() if value is not None)

        text = ' '.join(text_parts).lower()
        if not text:
            return False

        if any(token in text for token in ('verify', 'captcha', 'passport', 'login')):
            return True
        if any(token in text for token in ('验证', '登录', 'cookie', '风控', '访问频繁', '请稍后重试')):
            return True

        sensitive_uri = any(
            fragment in (uri or '')
            for fragment in ('aweme/post', 'aweme/favorite', 'module/feed', 'user/profile', 'comment/list')
        )
        return sensitive_uri and '请求失败' in text

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
            sign_engine = self.douyin_sign
            if sign_engine is None:
                return {
                    'status_code': -1,
                    'status_msg': '签名引擎初始化失败',
                    'message': '签名引擎初始化失败，请确认 PyExecJS 和 Node.js 可用后重试',
                }, False
            try:
                a_bogus = sign_engine.call(call_name, query, headers["User-Agent"])
            except Exception as e:
                if self.debug_mode:
                    print(f"\033[91m[API] 生成 a_bogus 失败: {e}\033[0m")
                return {
                    'status_code': -1,
                    'status_msg': '签名生成失败',
                    'message': f'签名生成失败: {e}',
                }, False
            params["a_bogus"] = a_bogus

        if self.debug_mode:
            print(f'\033[94m[API] 请求URL: {url}\033[0m')
            print(f'\033[94m[API] 请求方法: {method}\033[0m')
            print(f'\033[94m[API] 请求参数: {_redact_params(params)}\033[0m')
            print(f'\033[94m[API] 请求头: {_redact_headers(headers)}\033[0m')

        try:
            # 根据方法选择 GET 或 POST
            if method.upper() == 'POST':
                response = await asyncio.to_thread(
                    _api_post,
                    url,
                    data=params,
                    headers=headers,
                    timeout=(10, 30),
                )
            else:
                response = await asyncio.to_thread(
                    _api_get,
                    url,
                    params=params,
                    headers=headers,
                    timeout=(10, 30),
                )
        except requests.RequestException as e:
            if self.debug_mode:
                print(f'\033[91m[API] 网络请求异常: {e}\033[0m')
            return {
                'status_code': -1,
                'status_msg': '网络请求失败',
                'message': f'网络请求失败: {e}',
            }, False
        if self.debug_mode:
            print(f'[DEBUG] response.status_code={response.status_code}, len(response.content)={len(response.content)}, len(response.text)={len(response.text)}')
            sys.stderr.write(f'*** [API] 普通请求响应：status={response.status_code}, content_len={len(response.content)} ***\n')
            sys.stderr.flush()
        
        if self.debug_mode:
            print(f'\033[94m[API] 响应状态码: {response.status_code}\033[0m')
            print(f'\033[94m[API] 响应内容长度: {len(response.text)}, 前500字符: {response.text[:500]}\033[0m')

        response_content_type = response.headers.get('Content-Type', '').lower()
        response_url = getattr(response, 'url', '') or ''
        looks_like_verify = (
            response.status_code in (401, 403)
            or 'passport' in response_url.lower()
            or 'login' in response_url.lower()
            or ('text/html' in response_content_type and len(response.content) > 0)
        )

        if looks_like_verify:
            if self.debug_mode:
                print(f'\033[93m[API] 检测到验证/登录页响应，提示用户手动完成验证\033[0m')
            if response.status_code == 401:
                return self._build_login_required_error({
                    'status_code': response.status_code,
                    'status_msg': '用户未登录',
                }), False
            return self._build_verify_hint(uri, params, response)

        if response.status_code != 200 or len(response.content) == 0:
            if self.debug_mode:
                print(
                    f"\033[91m[API] 普通请求失败: status={response.status_code}, empty={len(response.content) == 0}\033[0m"
                )
            failure_payload = {
                'status_code': response.status_code,
                'status_msg': '请求失败',
                'message': '请求失败，请检查 Cookie 或稍后重试',
            }
            if self._looks_like_login_or_verify_error(uri, failure_payload):
                verify_hint, _ = self._build_verify_hint(uri, params, response)
                verify_hint.update(failure_payload)
                return verify_hint, False
            return failure_payload, False
            
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
                print(f'\033[91m[API] 触发滑块验证！返回验证标记由上层处理...\033[0m')

            # 返回验证标记和搜索验证URL，由上层打开浏览器让用户完成验证
            json_response['_need_verify'] = True
            keyword = params.get('keyword', '')
            if keyword:
                json_response['_verify_url'] = f"https://www.douyin.com/jingxuan/search/{urllib.parse.quote(str(keyword))}?type=user"
            return json_response, False

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
            if self._looks_like_logged_out_error(json_response):
                return self._build_login_required_error(json_response), False
            if self._looks_like_login_or_verify_error(uri, json_response):
                verify_hint, _ = self._build_verify_hint(uri, params, response)
                api_message = self._extract_api_message(json_response)
                verify_hint.update({
                    'status_code': json_response.get('status_code'),
                    'status_msg': json_response.get('status_msg', ''),
                    'message': f'{api_message}，请完成验证或重新获取 Cookie 后重试',
                })
                return verify_hint, False
            return json_response, False

        return json_response, True

    async def get_current_user(self) -> tuple[dict, bool]:
        """获取当前登录用户，用于强校验 Cookie 是否仍被抖音服务端认可。"""
        resp, success = await self.common_request(
            '/aweme/v1/web/user/profile/self/',
            {},
            {'Referer': 'https://www.douyin.com/'},
            skip_sign=True,
        )

        if not success:
            return resp, False

        user = resp.get('user') if isinstance(resp, dict) else None
        if not isinstance(user, dict) or not user:
            return {
                '_need_login': True,
                'message': '登录态校验失败：抖音未返回当前用户，请重新登录获取 Cookie',
            }, False

        return user, True

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
        resp = {}
        success = False
        for skip_sign in (False, True):
            try:
                resp, success = await self.common_request(
                    '/aweme/v2/web/module/feed/',
                    dict(params),
                    dict(headers),
                    skip_sign=skip_sign,
                    method='POST'  # 使用 POST 方法
                )
            except Exception as error:
                if self.debug_mode:
                    print(f"\033[91m[API] 推荐接口请求异常(skip_sign={skip_sign}): {error}\033[0m")
                resp, success = {'message': str(error)}, False

            if success or (isinstance(resp, dict) and resp.get('_need_verify')):
                break

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

    async def get_comments(self, aweme_id: str, count: int = 20, cursor: int = 0) -> tuple[dict, bool]:
        """获取视频评论列表。"""
        params = {
            'aweme_id': str(aweme_id or ''),
            'cursor': str(cursor or 0),
            'count': str(count or 20),
        }
        headers = {
            'Referer': f'https://www.douyin.com/video/{aweme_id}',
        }

        resp = {}
        success = False
        for skip_sign in (False, True):
            try:
                resp, success = await self.common_request(
                    '/aweme/v1/web/comment/list/',
                    dict(params),
                    dict(headers),
                    skip_sign=skip_sign,
                )
            except Exception as error:
                if self.debug_mode:
                    print(f"\033[91m[API] 评论接口请求异常(skip_sign={skip_sign}): {error}\033[0m")
                resp, success = {'message': str(error)}, False

            if success or (isinstance(resp, dict) and resp.get('_need_verify')):
                break

        return resp, success

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

            # 仅使用纯 HTTP 请求获取临时 Cookie
            cookie_str = await self._get_temp_cookie_http()

            if cookie_str:
                return {
                    'success': True,
                    'cookie': cookie_str,
                    'message': '成功获取临时 Cookie（HTTP方式）'
                }

            return {
                'success': False,
                'message': '获取临时 Cookie 失败，请稍后重试或改用登录账号 / 浏览器读取 Cookie'
            }

        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[API] 获取临时 Cookie 异常: {e}\033[0m")
            return {
                'success': False,
                'message': str(e)
            }

    async def _get_temp_cookie_http(self) -> str:
        """使用纯 HTTP 请求获取临时 Cookie

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
