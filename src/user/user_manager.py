import asyncio
import json
import os
import urllib.parse
from typing import List, Dict, Optional, Tuple, Union

from src.api.api import DouyinAPI
from src.downloader.downloader import DouyinDownloader

# 移除增强下载器支持
ENHANCED_DOWNLOADER_AVAILABLE = False
EnhancedDouyinDownloader = None

class DouyinUserManager:
    """抖音用户管理类"""
    def __init__(self, api: DouyinAPI, downloader: DouyinDownloader, socketio=None,cookie=None):
        self.api = api
        self.downloader = downloader
        self.socketio = socketio  # 添加WebSocket支持
        self.cookie = cookie
        # 检查是否启用调试模式
        self.debug_mode = os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes')
        if self.debug_mode:
            downloader_type = "Standard"
            print(f"\033[94m[UserManager] 调试模式已启用，使用 {downloader_type} 下载器\033[0m")
        
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
            # 不再直接传递cookie，让API类处理cookie
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/post/', 
                                                     params, 
                                                     {})
            if not succ:
                break
                
            videos.extend(resp.get('aweme_list', []))
            max_cursor = resp.get('max_cursor', 0)
            has_more = resp.get('has_more', 0) == 1
            #try:
            #    with open('user_zuopin.json', 'w', encoding='utf-8') as f:
            #        json.dump(resp, f, ensure_ascii=False, indent=2)
            #    print("\033[92m作品数据已保存到 user_zuopin.json\033[0m")
            #except Exception as e:
            #    print(f"\033[91m保存作品数据失败：{str(e)}\033[0m")
            
        return videos

    async def get_user_detail(self, user_id: str) -> dict:
        """获取用户详情"""
        params = {
            "publish_video_strategy_type": 2,
            "sec_user_id": user_id,
            "personal_center_strategy": 1
        }
        # 不再直接传递cookie，让API类处理cookie
        resp, succ = await self.api.common_request('/aweme/v1/web/user/profile/other/',
                                                 params,
                                                 {})
        return resp.get('user', {}) if succ else {}

    async def search_user(self, keyword: str) -> Optional[dict]:
        """搜索用户
        Returns:
            dict or list: URL搜索返回单个用户dict，关键词搜索返回用户列表
        """
        if self.debug_mode:
            print(f"\033[94m[UserManager] 开始搜索用户: {keyword}\033[0m")
        else:
            print(f"\033[94m开始搜索用户: {keyword}\033[0m")
        
        # 处理URL输入的情况
        if "https" in keyword:
            if self.debug_mode:
                print(f"\033[93m[UserManager] 检测到URL输入，提取用户ID\033[0m")
                user_id = keyword.split("/")[-1].split("?")[0]
                print(f"\033[93m[UserManager] 提取的用户ID: {user_id}\033[0m")
            else:
                print(f"\033[93m检测到URL输入，提取用户ID\033[0m")
                user_id = keyword.split("/")[-1].split("?")[0]
                print(f"\033[93m提取的用户ID: {user_id}\033[0m")
            return {"sec_uid": user_id}
        
        # 处理抖音号搜索
        if keyword.startswith("@") or any(c.isdigit() for c in keyword):
            if self.debug_mode:
                print(f"\033[93m[UserManager] 检测到抖音号或包含数字的关键词，使用精确搜索\033[0m")
            else:
                print(f"\033[93m检测到抖音号或包含数字的关键词，使用精确搜索\033[0m")
                
            params = {
                "keyword": keyword,
                "search_channel": 'aweme_user_web',
                "search_source": 'normal_search',
                "query_correct_type": '1',
                "is_filter_search": '0',
                'offset': 0,
                'count': 1  # 只返回1个结果
            }
            
            # 添加自定义请求头
            headers = {
                "Referer": "https://www.douyin.com/search?type=user&keyword=" + urllib.parse.quote(keyword)
            }
            
            if self.debug_mode:
                print(f"\033[93m[UserManager] 发送抖音号搜索请求\033[0m")
            else:
                print(f"\033[93m发送抖音号搜索请求\033[0m")
                
            # 不再直接传递cookie，让API类处理cookie
            resp, succ = await self.api.common_request('/aweme/v1/web/discover/search/',
                                                     params,
                                                     headers)
                                                     
            if succ:
                if resp.get('user_list'):
                    if self.debug_mode:
                        print(f"\033[92m[UserManager] 搜索成功，找到用户\033[0m")
                    else:
                        print(f"\033[92m搜索成功，找到用户\033[0m")
                    return resp['user_list'][0]['user_info']  # 直接返回用户信息
                else:
                    if self.debug_mode:
                        print(f"\033[91m[UserManager] 搜索成功但未找到用户，响应: {resp}\033[0m")
                    else:
                        print(f"\033[91m搜索成功但未找到用户，响应: {resp}\033[0m")
            else:
                if self.debug_mode:
                    print(f"\033[91m[UserManager] 搜索失败\033[0m")
                else:
                    print(f"\033[91m搜索失败\033[0m")
            return None
            
        # 关键词搜索
        if self.debug_mode:
            print(f"\033[93m[UserManager] 使用关键词搜索: {keyword}\033[0m")
        else:
            print(f"\033[93m使用关键词搜索: {keyword}\033[0m")
            
        params = {
            "keyword": keyword,
            "search_channel": 'aweme_user_web',
            "search_source": 'normal_search',
            "query_correct_type": '1',
            "is_filter_search": '0',
            'offset': 0,
            'count': 4  # 直接获取4个结果
        }
        
        # 添加自定义请求头
        headers = {
            "Referer": "https://www.douyin.com/search?type=user&keyword=" + urllib.parse.quote(keyword)
        }
        
        if self.debug_mode:
            print(f"\033[93m[UserManager] 发送关键词搜索请求\033[0m")
        else:
            print(f"\033[93m发送关键词搜索请求\033[0m")
            
        # 不再直接传递cookie，让API类处理cookie
        resp, succ = await self.api.common_request('/aweme/v1/web/discover/search/',
                                                 params,
                                                 headers)
        if not succ or not resp.get('user_list'):
            if self.debug_mode:
                print(f"\033[91m[UserManager] 关键词搜索失败或未找到用户\033[0m")
            else:
                print(f"\033[91m关键词搜索失败或未找到用户\033[0m")
            return None
        
        if self.debug_mode:
            print(f"\033[92m[UserManager] 关键词搜索成功，找到 {len(resp['user_list'])} 个用户\033[0m")
        else:
            print(f"\033[92m关键词搜索成功，找到 {len(resp['user_list'])} 个用户\033[0m")
        return resp['user_list'] if resp['user_list'] else None

    def _is_image_post(self, post: dict) -> bool:
        """判断是否为图片作品"""
        return post.get("images") is not None and len(post.get("images", [])) > 0

    def get_media_info(self, post: dict) -> Tuple[str, List[Dict[str, str]]]:
        """从帖子数据中提取媒体信息 (URL, 类型)

        Args:
            post: 单个作品的字典数据

        Returns:
            一个元组，包含:
            - str: 媒体类型 ('video', 'image', 'live_photo', 'mixed', 'unknown')
            - list: 包含媒体URL和类型的字典列表
        """
        urls = []
        media_type = 'unknown'

        # 检查是否为图文帖
        if post.get("images"):
            images = post["images"]
            has_live = False
            has_image = False

            for img in images:
                # Live Photo: 包含video字段且有play_addr
                if img.get("video") and img["video"].get("play_addr"):
                    has_live = True
                    video_urls = img["video"]["play_addr"].get("url_list", [])
                    if video_urls:
                        urls.append({
                            'type': 'live_photo',
                            'url': video_urls[0]
                        })
                # 普通图片
                elif img.get("url_list"):
                    has_image = True
                    urls.append({
                        'type': 'image',
                        'url': img["url_list"][-1]  # 通常是最高质量的
                    })

            if has_live and has_image:
                media_type = 'mixed'
            elif has_live:
                media_type = 'live_photo'
            elif has_image:
                media_type = 'image'

        # 检查是否为视频帖
        elif post.get("video") and post["video"].get("play_addr"):
            video_urls = post["video"]["play_addr"].get("url_list", [])
            if video_urls:
                media_type = 'video'
                urls.append({'type': 'video', 'url': video_urls[0]})

        return media_type, urls

    async def get_video_detail(self, aweme_id: str) -> Optional[dict]:
        """根据作品ID获取视频详情

        Args:
            aweme_id: 作品ID

        Returns:
            dict: 视频详情信息，包含媒体URL等
        """
        try:
            # 通过作品ID获取详情的API接口
            params = {
                "aweme_id": aweme_id,
                "aid": "1128",
                "version_name": "23.5.0",
                "device_platform": "webapp",
                "os": "windows"
            }
            
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/detail/',
                                                     params,
                                                     {})
            
            if not succ or not resp.get('aweme_detail'):
                return None
                
            post = resp['aweme_detail']
            
            # 获取媒体信息
            media_type, urls = self.get_media_info(post)
            with open('get_media_info.json', 'w') as f:
                json.dump(post, f, indent=4)
            # 构建详情信息
            detail = {
                'aweme_id': post.get('aweme_id', ''),
                'desc': post.get('desc', ''),
                'create_time': post.get('create_time', 0),
                'digg_count': post.get('statistics', {}).get('digg_count', 0),
                'comment_count': post.get('statistics', {}).get('comment_count', 0),
                'share_count': post.get('statistics', {}).get('share_count', 0),
                'author': {
                    'nickname': post.get('author', {}).get('nickname', ''),
                    'unique_id': post.get('author', {}).get('uid', ''),
                    'sec_uid': post.get('author', {}).get('sec_uid', ''),
                    'avatar_thumb': post.get('author', {}).get('avatar_thumb', {}).get('url_list', [''])[0] if post.get('author', {}).get('avatar_thumb') else ''
                },
                'statistics': {
                    'digg_count': post.get('statistics', {}).get('digg_count', 0),
                    'comment_count': post.get('statistics', {}).get('comment_count', 0),
                    'share_count': post.get('statistics', {}).get('share_count', 0),
                    'play_count': post.get('statistics', {}).get('play_count', 0)
                },
                'media_type': media_type,
                'media_urls': urls,
                'raw_media_type': media_type,
                'cover_url': post.get('video').get('cover', {}).get('url_list', [''])[0],
                # 保留原始数据字段用于调试
                'images': post.get('images'),
                'video': post.get('videos')
            }
            
            # 获取封面图
            if media_type == 'video':
                detail['cover_url'] = post.get('video', {}).get('cover', {}).get('url_list', [''])[0]
            elif media_type in ['image', 'live_photo', 'mixed']:
                images = post.get('images', [])
                if images:
                    detail['cover_url'] = images[0].get('url_list', [''])[-1]
            
            return detail
            
        except Exception as e:
             if self.debug_mode:
                 print(f"\033[91m[UserManager] 获取视频详情失败: {str(e)}\033[0m")
             return None

    async def parse_share_link(self, share_link: str) -> Optional[dict]:
        """解析抖音分享链接
        Args:
            share_link: 抖音分享链接
        Returns:
            dict: 视频信息
        """
        try:
            # 提取真实的视频链接
            import re
            import aiohttp
            # 从分享文本中提取URL
            url_pattern = r'https?://[^\s<>"]+|www\.[^\s<>"]+'
            match = re.search(url_pattern, share_link)
            if match:
                share_link = match.group()
            # 如果是短链接，需要先获取重定向后的真实链接
            if 'v.douyin.com' in share_link:
                try:
                    timeout = aiohttp.ClientTimeout(total=10)  # 设置10秒超时
                    # 创建SSL上下文，跳过证书验证
                    ssl_context = False  # 禁用SSL验证
                    connector = aiohttp.TCPConnector(ssl=ssl_context)
                    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                        async with session.get(share_link, allow_redirects=False) as response:
                            if response.status in [301, 302]:
                                # print("aaaaaaaaa",response.headers)
                                real_url = response.headers.get('Location', '')
                                if real_url:
                                    share_link = real_url
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    print("aaaaaaaaa",e)
                    if self.debug_mode:
                        print(f"\033[93m[UserManager] 获取重定向链接失败: {str(e)}，使用原链接\033[0m")
                    # 如果重定向失败，继续使用原链接
            print(f"重定向后的URL: {share_link}")
            # 从链接中提取视频ID
            aweme_id_match = re.search(r'/video/(\d+)', share_link)
            if not aweme_id_match:
                # 尝试其他模式
                aweme_id_match = re.search(r'aweme_id=(\d+)', share_link)
                if not aweme_id_match:
                    aweme_id_match = re.search(r'modal_id=(\d+)', share_link)
            
            if not aweme_id_match:
                return None
                
            aweme_id = aweme_id_match.group(1)
            print(f"提取的视频ID: {aweme_id}")
            # 使用已有的 get_video_detail 方法获取详情
            return await self.get_video_detail(aweme_id)
            
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[UserManager] 解析分享链接失败: {str(e)}\033[0m")
            return None

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

    async def download_user_videos(self, user_info: dict, auto_confirm: bool = False,web_socket: bool = False):
        """下载用户视频
        Args:
            user_info: 用户信息
            auto_confirm: 是否自动确认下载（不需要用户输入）
            web_socket: 是否使用WebSocket返回下载进度
        """
        user_id = user_info['sec_uid']
        nickname = user_info.get('nickname', 'unknown')
        
        # 获取已下载记录
        downloaded = self.downloader._load_download_record(nickname)
        
        # 获取视频列表
        posts = await self.get_user_videos(user_id, limit=200)
        if not posts:
            error_msg = f"未找到用户 {nickname} 的作品"
            if web_socket and self.socketio:
                self.socketio.emit('download_error', {'message': error_msg})
            else:
                print(f"\033[91m{error_msg}\033[0m")
            raise Exception(error_msg)

        # 过滤出未下载的作品
        new_posts = [post for post in posts if post['aweme_id'] not in downloaded]
        
        if not new_posts:
            info_msg = f"用户 {nickname} 没有新作品需要下载"
            if web_socket and self.socketio:
                self.socketio.emit('download_info', {'message': info_msg})
            else:
                print(f"\033[93m{info_msg}\033[0m")
            return
            
        found_msg = f"找到 {len(new_posts)} 个新作品"
        if web_socket and self.socketio:
            self.socketio.emit('download_info', {'message': found_msg})
        else:
            print(f"\n\033[36m{found_msg}\033[0m")
        
        # 如果是自动确认模式或WebSocket模式，直接下载所有作品
        if auto_confirm or web_socket:
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
            
            progress_msg = f"正在下载第 {i}/{len(selected_posts)} 个 [{type_str}]"
            if web_socket and self.socketio:
                self.socketio.emit('download_progress', {
                    'current': i,
                    'total': len(selected_posts),
                    'message': progress_msg,
                    'type': type_str
                })
            else:
                print(f"\033[36m{progress_msg}\033[0m")
            
            # 处理空描述的情况
            desc = post.get('desc', '').strip()
            if not desc:
                desc = f"无标题_{post['aweme_id']}"  # 使用作品ID作为备用
            else:
                desc = desc.split()[0]  # 只取第一个词
            
            name = f"{nickname}/{desc}"
            aweme_id = post['aweme_id']
            
            if not urls:
                error_msg = f"无法获取媒体URL: {post['desc']}"
                if web_socket and self.socketio:
                    self.socketio.emit('download_error', {'message': error_msg})
                else:
                    print(f"\033[91m{error_msg}\033[0m")
                continue
            
            if media_type == 'mixed':
                # 分别下载Live Photo和普通图片
                live_urls = [{'url': url, 'type': 'live_photo'} for t, url in urls if t == 'live_photo']
                img_urls = [{'url': url, 'type': 'image'} for t, url in urls if t == 'image']
                
                success = True
                
                if live_urls:
                    success &= self.downloader.download_media_group(live_urls, name, None)
                if img_urls:
                    success &= self.downloader.download_media_group(img_urls, name, None)
                    
                if success:
                    self.downloader._save_download_record(nickname, aweme_id)
                    success_msg = f"作品 {name} 下载完成"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_success', {'message': success_msg})
                    else:
                        print(f"\033[92m{success_msg}\033[0m")
                else:
                    error_msg = f"作品 {name} 下载失败"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_error', {'message': error_msg})
                    else:
                        print(f"\033[91m{error_msg}\033[0m")
                
            elif media_type in ['live_photo', 'image']:
                formatted_urls = [{'url': url, 'type': media_type} for url in urls]
                success = self.downloader.download_media_group(formatted_urls, name, aweme_id)
                if success:
                    success_msg = f"作品 {name} 下载完成"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_success', {'message': success_msg})
                    else:
                        print(f"\033[92m{success_msg}\033[0m")
                else:
                    error_msg = f"作品 {name} 下载失败"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_error', {'message': error_msg})
                    else:
                        print(f"\033[91m{error_msg}\033[0m")
            elif media_type == 'video':
                success = self.downloader.download_video(urls[0], name, aweme_id)
                if success:
                    success_msg = f"作品 {name} 下载完成"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_success', {'message': success_msg})
                    else:
                        print(f"\033[92m{success_msg}\033[0m")
                else:
                    error_msg = f"作品 {name} 下载失败"
                    if web_socket and self.socketio:
                        self.socketio.emit('download_error', {'message': error_msg})
                    else:
                        print(f"\033[91m{error_msg}\033[0m")
            else:
                error_msg = f"未知的媒体类型: {post['desc']}"
                if web_socket and self.socketio:
                    self.socketio.emit('download_error', {'message': error_msg})
                else:
                    print(f"\033[91m{error_msg}\033[0m")

    async def get_liked_videos(self, count=20):
        """获取点赞视频列表，返回与parse_share_link相同的数据结构"""
        try:
            params = {
                "count": count,
                "max_cursor": 0
            }
            
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/favorite/', params, {})
            if not succ:
                return []

            posts = resp.get('aweme_list', [])
            if not posts:
                return []

            video_list = []
            for post in posts:
                aweme_id = post.get('aweme_id')
                if aweme_id:
                    # 使用get_video_detail获取完整的视频信息，保持与parse_share_link相同的数据结构
                    video_detail = await self.get_video_detail(aweme_id)
                    if video_detail:
                        video_list.append(video_detail)
                    # 添加短暂延迟避免请求过快
                    await asyncio.sleep(0.1)
                    
            return video_list
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[UserManager] 获取点赞视频时出错: {e}\033[0m")
            else:
                print(f"\033[91m获取点赞视频时出错: {e}\033[0m")
            return []

    async def download_liked_videos(self, count=20):
        """下载点赞视频"""
        try:
            params = {
                "count": count,
                "max_cursor": 0
            }
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/favorite/', params, {'cookie': self.cookie})
            if not succ:
                print("\033[91m获取点赞视频失败\033[0m")
                return

            posts = resp.get('aweme_list', [])
            if not posts:
                print("\033[91m未找到点赞作品\033[0m")
                return

            for post in posts:
                aweme_id = post.get('aweme_id')
                desc = post.get('desc', aweme_id)
                video_detail = await self.get_video_detail(aweme_id)
                if video_detail:
                    media_info = self.get_media_info(video_detail)
                    media_type = media_info.get('media_type')
                    media_urls = media_info.get('media_urls')

                    if media_urls:
                        if media_type == 'live_photo':
                            await self.downloader.download_media_group(aweme_id, desc, media_urls)
                        elif media_type == 'image':
                            await self.downloader.download_media_group(aweme_id, desc, media_urls)
                        else:
                            for media in media_urls:
                                await self.downloader.download_video_direct(aweme_id, desc, [media['url']], media_type)
        except Exception as e:
            print(f"\033[91m下载点赞视频时出错: {e}\033[0m")

    async def get_liked_authors(self, count=20):
        """获取点赞作品的作者列表，返回与parse_share_link中user数据结构相同的格式"""
        try:
            params = {
                "count": count,
                "max_cursor": 0
            }
            
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/favorite/', params, {})
            if not succ:
                return []

            posts = resp.get('aweme_list', [])
            if not posts:
                return []
                
            # 收集所有作者信息
            authors = {}
            for post in posts:
                author = post.get('author', {})
                sec_uid = author.get('sec_uid')
                if sec_uid and sec_uid not in authors:
                    # 获取完整的用户信息
                    user_detail = await self.get_user_detail(sec_uid)
                    # 使用与parse_share_link相同的数据结构
                    authors[sec_uid] = {
                        'nickname': user_detail.get('nickname', ''),
                        'unique_id': user_detail.get('unique_id', ''),
                        'follower_count': user_detail.get('follower_count', 0),
                        'following_count': user_detail.get('following_count', 0),
                        'total_favorited': user_detail.get('total_favorited', 0),
                        'aweme_count': user_detail.get('aweme_count', 0),
                        'signature': user_detail.get('signature', ''),
                        'sec_uid': user_detail.get('sec_uid', ''),
                        'avatar_thumb': user_detail.get('avatar_thumb', {}).get('url_list', [''])[0] if user_detail.get('avatar_thumb') else '',
                        'avatar_larger': user_detail.get('avatar_larger', {}).get('url_list', [''])[0] if user_detail.get('avatar_larger') else ''
                    }
                    # 添加短暂延迟避免请求过快
                    await asyncio.sleep(0.5)
                    
            return list(authors.values())
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[UserManager] 获取点赞作者时出错: {e}\033[0m")
            else:
                print(f"\033[91m获取点赞作者时出错: {e}\033[0m")
            return []

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
            
            # 不再直接传递cookie，让API类处理cookie
            resp, succ = await self.api.common_request('/aweme/v1/web/aweme/favorite/',
                                                     params,
                                                     {})
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