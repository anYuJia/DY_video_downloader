import os
import execjs
import requests
import urllib.parse
import re
import random
import json
import asyncio
import ssl
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass
from config import Config as AppConfig

# 禁用SSL验证
ssl._create_default_https_context = ssl._create_unverified_context

@dataclass
class DouyinConfig:
    """抖音API配置类"""
    HOST = 'https://www.douyin.com'
    DOWNLOAD_DIR = "/Users/pyu/Movies/myvideos/douyin/"
    
    COMMON_PARAMS = {
        'device_platform': 'webapp',
        'aid': '6383',
        'channel': 'channel_pc_web',
        'update_version_code': '170400',
        'pc_client_type': '1',  # Windows
        'version_code': '190500',
        'version_name': '19.5.0',
        'cookie_enabled': 'true',
        'screen_width': '1680',  # from cookie dy_swidth
        'screen_height': '1050',  # from cookie dy_sheight
        'browser_language': 'zh-CN',
        'browser_platform': 'Win32',
        'browser_name': 'Chrome',
        'browser_version': '126.0.0.0',
        'browser_online': 'true',
        'engine_name': 'Blink',
        'engine_version': '126.0.0.0',
        'os_name': 'Windows',
        'os_version': '10',
        'cpu_core_num': '8',  # device_web_cpu_core
        'device_memory': '8',  # device_web_memory_size
        'platform': 'PC',
        'downlink': '10',
        'effective_type': '4g',
        'round_trip_time': '50',
        # 'webid': '7378325321550546458',   # from doc
        # 'verifyFp': 'verify_lx6xgiix_cde2e4d7_7a43_e749_7cda_b5e7c149c780',   # from cookie s_v_web_id
        # 'fp': 'verify_lx6xgiix_cde2e4d7_7a43_e749_7cda_b5e7c149c780', # from cookie s_v_web_id
        # 'msToken': 'hfAykirauBE-RKDm8bF2o2_cKuSdwHsbGXjJBuo8s3w9n46-Tu0CtxX7-iiZWZ8D7mRUAmRAkeiaU35194AJehc9u6_mei3Q9s_LABQuoANQmbd81DDS3wuA5u9UVIo%3D',  # from cookie msToken
        # 'a_bogus': 'xJRwQfLfDkdsgDyh54OLfY3q66M3YQnV0trEMD2f5V3WF639HMPh9exLx-TvU6DjNs%2FDIeEjy4haT3nprQVH8qw39W4x%2F2CgQ6h0t-P2so0j53iJCLgmE0hE4vj3SlF85XNAiOk0y7ICKY00AInymhK4bfebY7Y6i6tryE%3D%3D' # sign
    }

class DouyinAPI:
    """抖音API封装类"""
    def __init__(self, cookie: str):
        self.cookie = cookie
        self.douyin_sign = execjs.compile(open('lib/js/douyin.js').read())
        
    async def common_request(self, uri: str, params: dict, headers: dict) -> Tuple[dict, bool]:
        """通用请求方法"""
        url = f'{DouyinConfig.HOST}{uri}'
        params.update(DouyinConfig.COMMON_PARAMS)
        headers.update(AppConfig.COMMON_HEADERS)
        
        params = await self._deal_params(params, headers)
        query = '&'.join([f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items()])
        
        call_name = 'sign_reply' if 'reply' in uri else 'sign_datail'
        params["a_bogus"] = self.douyin_sign.call(call_name, query, headers["User-Agent"])

        try:
            response = requests.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data, data.get('status_code', -1) == 0
        except Exception as e:
            print(f"Request failed: {str(e)}")
            return {}, False

    async def _deal_params(self, params: dict, headers: dict) -> dict:
        """处理请求参数"""
        cookie_dict = self._cookies_to_dict(headers.get('cookie') or headers.get('Cookie', ''))
        params.update({
            'msToken': self._get_ms_token(),
            'screen_width': cookie_dict.get('dy_swidth', 2560),
            'screen_height': cookie_dict.get('dy_sheight', 1440),
            'cpu_core_num': cookie_dict.get('device_web_cpu_core', 24),
            'device_memory': cookie_dict.get('device_web_memory_size', 8),
            'verifyFp': cookie_dict.get('s_v_web_id'),
            'fp': cookie_dict.get('s_v_web_id'),
            'webid': "7393173430232106534"
        })
        return params

    @staticmethod
    def _cookies_to_dict(cookie_string: str) -> dict:
        """将cookie字符串转换为字典"""
        return {
            cookie.split('=', 1)[0]: cookie.split('=', 1)[1]
            for cookie in cookie_string.split('; ')
            if cookie and cookie != 'douyin.com' and '=' in cookie
        }

    @staticmethod
    def _get_ms_token(length: int = 120) -> str:
        """生成随机msToken"""
        base_str = 'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789='
        return ''.join(random.choice(base_str) for _ in range(length))

class DouyinDownloader:
    """抖音下载器类"""
    def __init__(self, api: DouyinAPI):
        self.api = api
        self._ensure_download_dirs()
        
    def _ensure_download_dirs(self):
        """确保下载目录存在"""
        os.makedirs(os.path.join(DouyinConfig.DOWNLOAD_DIR, "file"), exist_ok=True)

    def _get_record_path(self, user_dir: str) -> str:
        """获取用户下载记录文件路径"""
        # 在用户目录下创建记录文件
        user_path = os.path.join(DouyinConfig.DOWNLOAD_DIR, "file", user_dir)
        os.makedirs(user_path, exist_ok=True)
        return os.path.join(user_path, "download_record.json")

    def _load_download_record(self, user_dir: str) -> set:
        """加载用户下载记录"""
        record_path = self._get_record_path(user_dir)
        try:
            if os.path.exists(record_path):
                with open(record_path, 'r', encoding='utf-8') as f:
                    return set(json.load(f))
        except Exception:
            pass
        return set()

    def _save_download_record(self, user_dir: str, aweme_id: str):
        """保存下载记录"""
        record_path = self._get_record_path(user_dir)
        downloaded = self._load_download_record(user_dir)
        downloaded.add(aweme_id)
        try:
            with open(record_path, 'w', encoding='utf-8') as f:
                json.dump(list(downloaded), f)
        except Exception as e:
            print(f"\033[91m保存下载记录失败：{str(e)}\033[0m")

    def _get_download_headers(self):
        """获取下载用的请求头"""
        headers = AppConfig.COMMON_HEADERS.copy()
        headers.update({
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Range': 'bytes=0-',
            'Referer': 'https://www.douyin.com/',
            'Cookie': self.api.cookie
        })
        return headers
        
    def download_media_group(self, urls: List[str], name: str, aweme_id: str = None, is_live: bool = False) -> bool:
        """下载一组媒体文件（图片或Live Photo）
        Returns:
            bool: 是否全部下载成功
        """
        try:
            user_dir, filename = name.split('/', 1)
            filename = self._sanitize_filename(filename)
            
            # 只有当提供了aweme_id时才检查下载记录
            if aweme_id and aweme_id in self._load_download_record(user_dir):
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return True

            # 下载所有文件
            success = True
            for i, url in enumerate(urls):
                try:
                    headers = self._get_download_headers()
                    response = requests.get(url, headers=headers, stream=True)
                    response.raise_for_status()
                    
                    filename_with_index = self._sanitize_filename(f"{filename}_{i+1}")
                    user_path = os.path.join(DouyinConfig.DOWNLOAD_DIR, "file", user_dir)
                    os.makedirs(user_path, exist_ok=True)
                    
                    extension = "mp4" if is_live else "jpg"
                    filepath = os.path.join(user_path, f"{filename_with_index}.{extension}")
                    
                    with open(filepath, "wb") as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    print(f"\033[93m下载{'Live Photo' if is_live else '图片'} ({i+1}/{len(urls)}) 成功：{user_dir}/{filename_with_index}.{extension}\033[0m")
                except Exception as e:
                    print(f"\033[91m下载第 {i+1}/{len(urls)} 个文件失败：{str(e)}\033[0m")
                    success = False

            # 只有当提供了aweme_id且所有文件都下载成功时才记录
            if success and aweme_id:
                self._save_download_record(user_dir, aweme_id)
            
            return success
        
        except Exception as e:
            print(f"\033[91m下载失败：{str(e)}\033[0m")
            return False

    def download_video(self, url: str, name: str, aweme_id: str):
        """下载视频"""
        try:
            user_dir, filename = name.split('/', 1)
            filename = self._sanitize_filename(filename)
            
            # 检查是否已下载
            if aweme_id in self._load_download_record(user_dir):
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return

            headers = self._get_download_headers()
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            user_path = os.path.join(DouyinConfig.DOWNLOAD_DIR, "file", user_dir)
            os.makedirs(user_path, exist_ok=True)
            filepath = os.path.join(user_path, f"{filename}.mp4")
            
            with open(filepath, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            print(f"\033[92m下载视频成功：{user_dir}/{filename}.mp4\033[0m")
            
            # 下载成功后记录作品ID
            self._save_download_record(user_dir, aweme_id)
            
        except Exception as e:
            print(f"\033[91m下载视频失败：{str(e)}\033[0m")

    def download_image(self, url: str, name: str, aweme_id: str, is_live: bool = False):
        """下载图片或Live Photo"""
        try:
            # 分离用户名和文件名
            user_dir, filename = name.split('/', 1)
            
            # 检查是否已下载
            if aweme_id in self._load_download_record(user_dir):
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return
                
            headers = self._get_download_headers()
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            filename = self._sanitize_filename(filename)
            user_path = os.path.join(DouyinConfig.DOWNLOAD_DIR, "file", user_dir)
            os.makedirs(user_path, exist_ok=True)
            
            extension = "mp4" if is_live else "jpg"
            filepath = os.path.join(user_path, f"{filename}.{extension}")
            
            with open(filepath, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            print(f"\033[93m下载{'Live Photo' if is_live else '图片'}成功：{user_dir}/{filename}.{extension}\033[0m")
            
            # 保存下载记录
            self._save_download_record(user_dir, aweme_id)
            
        except Exception as e:
            print(f"\033[91m下载失败：{str(e)}\033[0m")

    @staticmethod
    def _sanitize_filename(name: str, max_length: int = 50) -> str:
        """清理文件名"""
        # 移除非法字符
        name = re.sub(r'[\\/:*?"<>|]', '_', name)
        # 移除多余空格
        name = ' '.join(name.split())
        return name[:max_length]

class DouyinUserManager:
    """抖音用户管理类"""
    def __init__(self, api: DouyinAPI, downloader: DouyinDownloader):
        self.api = api
        self.downloader = downloader
        
    async def get_user_videos(self, user_id: str, offset: int = 0, limit: int = 10) -> List[dict]:
        """获取用户视频列表"""
        videos = []
        max_cursor = 0
        has_more = True
        
        while has_more and len(videos) < offset + limit:
            params = {
                "publish_video_strategy_type": 2,
                "max_cursor": max_cursor,
                "sec_user_id": user_id,
                "locate_query": False,
                'show_live_replay_strategy': 1,
                'need_time_list': 0,
                'time_list_query': 0,
                'whale_cut_token': '',
                'count': 18
            }
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/post/', 
                                                     params, 
                                                     {"cookie": self.api.cookie})
            if not succ:
                break
                
            videos.extend(resp.get('aweme_list', []))
            max_cursor = resp.get('max_cursor', 0)
            has_more = resp.get('has_more', 0) == 1
            """
            # 保存完整的响应数据到JSON文件
            try:
                with open('user_zuopin.json', 'w', encoding='utf-8') as f:
                    json.dump(resp, f, ensure_ascii=False, indent=2)
                print("\033[92m作品数据已保存到 user_zuopin.json\033[0m")
            except Exception as e:
                print(f"\033[91m保存作品数据失败：{str(e)}\033[0m")
                """
            
        return videos

    async def get_user_detail(self, user_id: str) -> dict:
        """获取用户详情"""
        params = {
            "publish_video_strategy_type": 2,
            "sec_user_id": user_id,
            "personal_center_strategy": 1
        }
        resp, succ = await self.api.common_request('/aweme/v1/web/user/profile/other/',
                                                 params,
                                                 {"cookie": self.api.cookie})
        return resp.get('user', {}) if succ else {}

    async def search_user(self, keyword: str) -> Optional[dict]:
        """搜索用户
        Returns:
            dict or list: URL搜索返回单个用户dict，关键词搜索返回用户列表
        """
        # 处理URL输入的情况
        if "https" in keyword:
            user_id = keyword.split("/")[-1].split("?")[0]
            return {"sec_uid": user_id}
        
        # 处理抖音号搜索
        if keyword.startswith("@") or any(c.isdigit() for c in keyword):
            params = {
                "keyword": keyword,
                "search_channel": 'aweme_user_web',
                "search_source": 'normal_search',
                "query_correct_type": '1',
                "is_filter_search": '0',
                'offset': 0,
                'count': 1  # 只返回1个结果
            }
            
            resp, succ = await self.api.common_request('/aweme/v1/web/discover/search/',
                                                     params,
                                                     {"cookie": self.api.cookie})
            if succ and resp.get('user_list'):
                return resp['user_list'][0]['user_info']  # 直接返回用户信息
            return None
            
        # 关键词搜索
        params = {
            "keyword": keyword,
            "search_channel": 'aweme_user_web',
            "search_source": 'normal_search',
            "query_correct_type": '1',
            "is_filter_search": '0',
            'offset': 0,
            'count': 4  # 直接获取4个结果
        }
        
        resp, succ = await self.api.common_request('/aweme/v1/web/discover/search/',
                                                 params,
                                                 {"cookie": self.api.cookie})
        if not succ or not resp.get('user_list'):
            return None
        
        return resp['user_list'] if resp['user_list'] else None

    def _is_image_post(self, post: dict) -> bool:
        """判断是否为图片作品"""
        return post.get("images") is not None and len(post.get("images", [])) > 0

    def _get_media_info(self, post: dict) -> tuple[str, list]:
        """获取媒体信息
        Returns:
            tuple: (media_type, urls)
            media_type: 'video' 或 'mixed' 或 'image' 或 'live_photo'
            urls: 媒体URL列表，对于mixed类型，返回[(type, url)]格式的列表
        """
        # 判断媒体类型
        if post.get("images"):
            images = post.get("images", [])
            urls = []
            has_live = False
            has_image = False

            for img in images:
                # Live Photo特征：包含video字段且有play_addr
                if img.get("video") and img["video"].get("play_addr"):
                    has_live = True
                    urls.append(('live_photo', img["video"]["play_addr"]["url_list"][0]))
                else:
                    has_image = True
                    # 普通图片使用url_list的最后一个URL（通常是最高质量的）
                    urls.append(('image', img["url_list"][-1]))

            # 如果同时包含Live Photo和普通图片，返回mixed类型
            if has_live and has_image:
                return 'mixed', urls
            elif has_live:
                return 'live_photo', [url for _, url in urls]
            else:
                return 'image', [url for _, url in urls]
            
        elif post.get("video"):
            # 视频类型
            video_url = post.get("video", {}).get("play_addr", {}).get("url_list", [""])[0]
            return 'video', [video_url] if video_url else []

        # 默认返回空
        return 'unknown', []

    async def download_user_videos(self, user_info: dict, auto_confirm: bool = False):
        """下载用户视频
        Args:
            user_info: 用户信息
            auto_confirm: 是否自动确认下载（不需要用户输入）
        """
        user_id = user_info['sec_uid']
        nickname = user_info.get('nickname', 'unknown')
        
        # 获取已下载记录
        downloaded = self.downloader._load_download_record(nickname)
        
        # 获取视频列表
        posts = await self.get_user_videos(user_id, limit=200)
        if not posts:
            print(f"\033[91m未找到作品\033[0m")
            return

        # 过滤出未下载的作品
        new_posts = [post for post in posts if post['aweme_id'] not in downloaded]
        
        if not new_posts:
            print(f"\033[93m没有新作品需要下载\033[0m")
            return
            
        print(f"\n\033[36m找到 {len(new_posts)} 个新作品\033[0m")
        
        # 如果是自动确认模式，直接下载所有作品
        if auto_confirm:
            selected_posts = new_posts
        else:
            # 显示作品列表
            for i, post in enumerate(new_posts):
                media_type, urls = self._get_media_info(post)
                if media_type == 'mixed':
                    live_count = sum(1 for t, _ in urls if t == 'live_photo')
                    img_count = sum(1 for t, _ in urls if t == 'image')
                    type_str = f'图片({img_count}张)+Live图({live_count}张)'
                else:
                    type_str = {
                        'video': '视频',
                        'image': f'图片({len(urls)}张)',
                        'live_photo': f'Live图({len(urls)}张)',
                        'unknown': '未知'
                    }.get(media_type, '未知')
                
                print(f"\033[36m{i}. [{type_str}] {post['desc']}\033[0m")

            # 处理用户输入
            str_sub = input("\033[31m请输入要下载的序号\n1. 单个数字下载单个作品，多个数字用空格隔开下载多个作品\n2. 片段用-隔开\n3. 直接回车下载全部\033[0m\n")
            
            selected_posts = []
            if str_sub:
                for part in str_sub.split():
                    if '-' in part:
                        start, end = map(int, part.split('-'))
                        selected_posts.extend(new_posts[start:end+1])
                    else:
                        selected_posts.append(new_posts[int(part)])
            else:
                selected_posts = new_posts

        # 下载选中的作品
        for i, post in enumerate(selected_posts, 1):
            media_type, urls = self._get_media_info(post)
            if media_type == 'mixed':
                live_count = sum(1 for t, _ in urls if t == 'live_photo')
                img_count = sum(1 for t, _ in urls if t == 'image')
                type_str = f'图片({img_count}张)+Live图({live_count}张)'
            else:
                type_str = {
                    'video': '视频',
                    'image': f'图片({len(urls)}张)',
                    'live_photo': f'Live图({len(urls)}张)',
                    'unknown': '未知'
                }.get(media_type, '未知')
            
            print(f"\033[36m正在下载第 {i}/{len(selected_posts)} 个 [{type_str}]\033[0m")
            
            # 处理空描述的情况
            desc = post.get('desc', '').strip()
            if not desc:
                desc = f"无标题_{post['aweme_id']}"  # 使用作品ID作为备用
            else:
                desc = desc.split()[0]  # 只取第一个词
            
            name = f"{nickname}/{desc}"
            aweme_id = post['aweme_id']
            
            if not urls:
                print(f"\033[91m无法获取媒体URL: {post['desc']}\033[0m")
                continue
            
            if media_type == 'mixed':
                # 分别下载Live Photo和普通图片
                live_urls = [url for t, url in urls if t == 'live_photo']
                img_urls = [url for t, url in urls if t == 'image']
                
                success = True
                
                if live_urls:
                    success &= self.downloader.download_media_group(live_urls, name, None, is_live=True)
                if img_urls:
                    success &= self.downloader.download_media_group(img_urls, name, None, is_live=False)
                    
                if success:
                    self.downloader._save_download_record(nickname, aweme_id)
                    print(f"\033[92m作品 {name} 下载完成\033[0m")
                else:
                    print(f"\033[91m作品 {name} 下载失败\033[0m")
                
            elif media_type in ['live_photo', 'image']:
                self.downloader.download_media_group(urls, name, aweme_id, is_live=(media_type == 'live_photo'))
            elif media_type == 'video':
                self.downloader.download_video(urls[0], name, aweme_id)
            else:
                print(f"\033[91m未知的媒体类型: {post['desc']}\033[0m")

    async def download_liked_authors(self):
        """下载点赞作品的作者的所有作品"""
        try:
            # 获取用户想要获取的点赞作品数量
            count = input("\n请输入要获取的点赞作品数量(直接回车默认20个): ") or "20"
            count = int(count)
            
            params = {
                "count": count,
                "max_cursor": 0
            }
            
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/favorite/',
                                                     params,
                                                     {"cookie": self.api.cookie})
            if not succ:
                print("\033[91m获取点赞视频失败\033[0m")
                return

            posts = resp.get('aweme_list', [])
            if not posts:
                print("\033[91m未找到点赞作品\033[0m")
                return

            # 收集所有作者信息
            authors = {}
            for post in posts:
                author = post.get('author', {})
                sec_uid = author.get('sec_uid')
                if sec_uid and sec_uid not in authors:
                    # 获取完整的用户信息
                    user_detail = await self.get_user_detail(sec_uid)
                    authors[sec_uid] = {
                        'sec_uid': sec_uid,
                        'nickname': user_detail.get('nickname', author.get('nickname', '未知')),
                        'unique_id': user_detail.get('unique_id', author.get('unique_id', '未设置')),
                        'follower_count': user_detail.get('follower_count', author.get('follower_count', 0)),
                        'signature': user_detail.get('signature', author.get('signature', '无'))
                    }
                    # 添加短暂延迟避免请求过快
                    await asyncio.sleep(0.5)

            if not authors:
                print("\033[91m未找到作者信息\033[0m")
                return

            # 显示作者列表
            print(f"\n\033[36m找到 {len(authors)} 个作者:\033[0m")
            for i, author in enumerate(authors.values()):
                print(f"\n{i}. \033[95m昵称: {author['nickname']}\033[0m")
                print(f"   \033[92m抖音号: {author['unique_id']}\033[0m")
                print(f"   \033[35m粉丝数: {author['follower_count']}\033[0m")
                print(f"   \033[96m主页: https://www.douyin.com/user/{author['sec_uid']}\033[0m")

            # 处理用户输入
            str_sub = input("\n\033[31m请输入要下载的作者序号\n1. 单个数字下载单个作者，多个数字用空格隔开下载多个作者\n2. 片段用-隔开\n3. 直接回车下载全部\033[0m\n")
            
            selected_authors = []
            author_list = list(authors.values())
            
            if str_sub:
                for part in str_sub.split():
                    if '-' in part:
                        start, end = map(int, part.split('-'))
                        selected_authors.extend(author_list[start:end+1])
                    else:
                        selected_authors.append(author_list[int(part)])
            else:
                selected_authors = author_list

            # 下载每个选中作者的作品
            for i, author in enumerate(selected_authors, 1):
                print(f"\n\033[36m正在处理第 {i}/{len(selected_authors)} 个作者: {author['nickname']}\033[0m")
                await self.download_user_videos(author, auto_confirm=True)

        except Exception as e:
            print(f"\033[91m处理失败：{str(e)}\033[0m")

async def run_main():
    # 使用AppConfig中的COOKIE
    api = DouyinAPI(AppConfig.COOKIE)
    downloader = DouyinDownloader(api)
    user_manager = DouyinUserManager(api, downloader)
    
    while True:
        print("\n1. 搜索用户下载视频")
        print("2. 下载点赞视频")
        print("3. 下载点赞作者的作品")
        print("4. 退出")
        
        choice = input("\n请选择功能 (1-4): ") or "1"  # 默认选择1
        
        if choice == "1":
            keyword = input("输入昵称/主页url/抖音号: ")
            users = await user_manager.search_user(keyword)
            
            if users is None:
                print("\033[91m未找到用户\033[0m")
                continue
            
            if isinstance(users, dict):  # URL输入或抖音号搜索的情况
                user_info = users
                # 简洁显示单个用户信息
                print("\n\033[95m昵称: {}\033[0m".format(user_info.get('nickname', '')))
                print("\033[35m粉丝数: {}\033[0m".format(user_info.get('follower_count', 0)))  # 添加粉丝数显示
                if input("\n确认下载? (Y/N): ").upper() != 'N':
                    await user_manager.download_user_videos(user_info)
            else:  # 关键词搜索的情况
                print("\n找到以下用户:")
                for i, user in enumerate(users):
                    user_info = user['user_info']
                    # 去除简介中的换行符
                    signature = user_info.get('signature', '无').replace('\n', ' ')
                    print(f"\n{i+1}. \033[95m昵称: {user_info.get('nickname', '')}\033[0m")  # 粉色
                    print(f"   \033[92m抖音号: {user_info.get('unique_id', '未设置')}\033[0m")  # 绿色
                    print(f"   \033[35m粉丝数: {user_info.get('follower_count', 0)}\033[0m")  # 紫色
                    print(f"   \033[93m简介: {signature}\033[0m")  # 淡黄色
                    print(f"   \033[96m主页: https://www.douyin.com/user/{user_info['sec_uid']}\033[0m")  # 青色
                    
                while True:
                    try:
                        choice = input("\n请选择用户序号(1-4): ") or "1"  # 默认选择1
                        idx = int(choice) - 1
                        if 0 <= idx < len(users):
                            user_info = users[idx]['user_info']
                            if input("\n确认下载? (Y/N): ").upper() != 'N':
                                await user_manager.download_user_videos(user_info)
                            break
                        else:
                            print("\033[91m无效的序号，请重试\033[0m")
                    except ValueError:
                        print("\033[91m请输入有效的数字\033[0m")
                
        elif choice == "2":
            await user_manager.download_liked_videos()
        elif choice == "3":
            await user_manager.download_liked_authors()
        elif choice == "4":
            break
        else:
            print("无效的选择，请重试")

def main():
    asyncio.run(run_main())

if __name__ == '__main__':
    main()
