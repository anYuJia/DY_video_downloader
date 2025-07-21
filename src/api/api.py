import requests
import urllib.parse
import os
import execjs
import re



class DouyinAPI:
    """抖音API封装类"""
    
    def __init__(self, cookie: str):
        self.cookie = cookie
        self.host = 'https://www.douyin.com'
        
        # 检查是否启用调试模式
        self.debug_mode = os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes')
        if self.debug_mode:
            print("\033[93m[API] 调试模式已启用\033[0m")
        
        # 初始化JS签名引擎
        try:
            with open('lib/js/douyin.js', 'r', encoding='utf-8') as f:
                self.douyin_sign = execjs.compile(f.read())
        except Exception as e:
            print(f"\033[91m[API] 初始化JS签名引擎失败: {e}\033[0m")
            self.douyin_sign = None
        # 通用请求参数
        self.common_params = {
            'device_platform': 'webapp',
            'aid': '6383',
            'channel': 'channel_pc_web',
            'update_version_code': '170400',
            'pc_client_type': '1',
            'version_code': '190500',
            'version_name': '19.5.0',
            'cookie_enabled': 'true',
            'screen_width': '1680',
            'screen_height': '1050',
            'browser_language': 'zh-CN',
            'browser_platform': 'Win32',
            'browser_name': 'Chrome',
            'browser_version': '126.0.0.0',
            'browser_online': 'true',
            'engine_name': 'Blink',
            'engine_version': '126.0.0.0',
            'os_name': 'Windows',
            'os_version': '10',
            'cpu_core_num': '8',
            'device_memory': '8',
            'platform': 'PC',
            'downlink': '10',
            'effective_type': '4g',
            'round_trip_time': '50',
        }
        
        # 通用请求头
        self.common_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "sec-ch-ua-platform": "Windows",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            "referer": "https://www.douyin.com/?recommend=1",
            "priority": "u=1, i",
            "pragma": "no-cache",
            "cache-control": "no-cache",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            "accept": "application/json, text/plain, */*",
            "dnt": "1",
        }

    async def _get_webid(self, headers: dict) -> str:
        """获取webid"""
        try:
            url = 'https://www.douyin.com/?recommend=1'
            headers = headers.copy()
            headers['sec-fetch-dest'] = 'document'
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code != 200 or not response.text:
                if self.debug_mode:
                    print(f"\033[91m[API] 获取webid失败: {response.status_code}\033[0m")
                return None
                
            pattern = r'\\"user_unique_id\\":\\"(\d+)\\"'
            match = re.search(pattern, response.text)
            if match:
                webid = match.group(1)
                if self.debug_mode:
                    print(f"\033[93m[API] 获取到webid: {webid}\033[0m")
                return webid
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
            params['verifyFp'] = cookie_dict.get('s_v_web_id',None)
            params['fp'] = cookie_dict.get('s_v_web_id',None)
            # 获取webid
            webid = await self._get_webid(headers)
            if webid:
                params['webid'] = webid
            else:
                params['webid'] = "7393173430232106534"  # 默认值
                
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
        import random
        import string
        return ''.join(random.choices(string.ascii_letters + string.digits, k=107))

    async def common_request(self, uri: str, params: dict, headers: dict) -> tuple[dict, bool]:
        """
        请求 douyin
        :param uri: 请求路径
        :param params: 请求参数
        :param headers: 请求头
        :return: 返回数据和是否成功
        """
        url = f'{self.host}{uri}'
        params.update(self.common_params)
        headers.update(self.common_headers)
        params = await self._deal_params(params, headers)
        query = '&'.join([f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items()])
        call_name = 'sign_datail'
        if 'reply' in uri:
            call_name = 'sign_reply'
        a_bogus = self.douyin_sign.call(call_name, query, headers["User-Agent"])
        params["a_bogus"] = a_bogus

        if self.debug_mode:
            print(f'\033[94m[API] 请求URL: {url}\033[0m')
            print(f'\033[94m[API] 请求参数: {params}\033[0m')
            
        response = requests.get(url, params=params, headers=headers)
        
        if self.debug_mode:
            print(f'\033[94m[API] 响应状态码: {response.status_code}\033[0m')
            print(f'\033[94m[API] 响应内容: {response.text[:500]}...\033[0m')

        if response.status_code != 200 or response.text == '':
            if self.debug_mode:
                print(f'\033[91m[API] 请求失败: 状态码 {response.status_code}\033[0m')
            return {}, False
            
        try:
            json_response = response.json()
        except Exception as e:
            if self.debug_mode:
                print(f'\033[91m[API] JSON解析失败: {e}\033[0m')
            return {}, False
            
        if json_response.get('status_code', 0) != 0:
            if self.debug_mode:
                print(f'\033[91m[API] API返回错误: status_code={json_response.get("status_code")}, msg={json_response.get("status_msg", "")}\033[0m')
            return json_response, False

        return json_response, True