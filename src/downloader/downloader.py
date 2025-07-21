import os
import json
import re
import requests
from typing import List

from src.config.config import Config
from src.api.api import DouyinAPI

class DouyinDownloader:
    """抖音下载器类"""
    def __init__(self, api: DouyinAPI, socketio=None):
        self.api = api
        self.download_dir = Config.DOWNLOAD_DIR
        self.socketio = socketio  # 添加WebSocket支持
        
        # 检查是否启用调试模式
        self.debug_mode = os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes')
        if self.debug_mode:
            print(f"\033[94m[Downloader] 调试模式已启用\033[0m")
            
        self._ensure_download_dirs()
        
    def _ensure_download_dirs(self):
        """确保下载目录存在"""
        download_path = self.download_dir
        if self.debug_mode:
            print(f"\033[93m[Downloader] 确保下载目录存在: {download_path}\033[0m")
        os.makedirs(download_path, exist_ok=True)

    def _get_record_path(self, user_dir: str) -> str:
        """获取用户下载记录文件路径"""
        # 在用户目录下创建记录文件
        user_path = os.path.join(self.download_dir, user_dir)
        if self.debug_mode:
            print(f"\033[93m[Downloader] 创建用户目录: {user_path}\033[0m")
        os.makedirs(user_path, exist_ok=True)
        record_path = os.path.join(user_path, "download_record.json")
        if self.debug_mode:
            print(f"\033[93m[Downloader] 下载记录文件路径: {record_path}\033[0m")
        return record_path

    def _load_download_record(self, user_dir: str) -> set:
        """加载用户下载记录"""
        record_path = self._get_record_path(user_dir)
        try:
            if os.path.exists(record_path):
                if self.debug_mode:
                    print(f"\033[93m[Downloader] 加载下载记录: {record_path}\033[0m")
                with open(record_path, 'r', encoding='utf-8') as f:
                    records = set(json.load(f))
                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 已下载记录数: {len(records)}\033[0m")
                    return records
            elif self.debug_mode:
                print(f"\033[93m[Downloader] 下载记录文件不存在，创建新记录\033[0m")
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 加载下载记录失败: {str(e)}\033[0m")
            else:
                print(f"\033[91m加载下载记录失败\033[0m")
        return set()

    def _save_download_record(self, user_dir: str, aweme_id: str):
        """保存下载记录"""
        record_path = self._get_record_path(user_dir)
        downloaded = self._load_download_record(user_dir)
        downloaded.add(aweme_id)
        
        if self.debug_mode:
            print(f"\033[93m[Downloader] 添加下载记录: {aweme_id}\033[0m")
            print(f"\033[93m[Downloader] 当前记录总数: {len(downloaded)}\033[0m")
            
        try:
            with open(record_path, 'w', encoding='utf-8') as f:
                json.dump(list(downloaded), f)
                
            if self.debug_mode:
                print(f"\033[92m[Downloader] 保存下载记录成功: {record_path}\033[0m")
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 保存下载记录失败: {str(e)}\033[0m")
            else:
                print(f"\033[91m保存下载记录失败：{str(e)}\033[0m")

    def _get_download_headers(self):
        """获取下载用的请求头"""
        headers = Config.COMMON_HEADERS.copy()
        headers.update({
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Range': 'bytes=0-',
            'Referer': 'https://www.douyin.com/'
        })
        
        # 只有在有cookie的情况下才添加cookie
        if self.api.cookie:
            if self.debug_mode:
                print(f"\033[93m[Downloader] 添加Cookie到下载请求头\033[0m")
            headers['Cookie'] = self.api.cookie
        elif self.debug_mode:
            print(f"\033[93m[Downloader] 无Cookie可用于下载请求\033[0m")
            
        if self.debug_mode:
            print(f"\033[93m[Downloader] 下载请求头: {headers}\033[0m")
            
        return headers
        
    def download_media_group(self, urls: List[dict], name: str, aweme_id: str = None, socketio=None, task_id=None) -> bool:
        """下载一组媒体文件（图片、视频或Live Photo）
        Args:
            urls: [{'url': 'https://example.com/file.mp4', 'type': 'video'|'image'|'live_photo'}]
            name: 文件名格式 "用户名/文件名"
            aweme_id: 作品ID，用于记录下载历史
            socketio: WebSocket对象，用于发送进度更新
            task_id: WebSocket任务ID，用于发送进度更新
        Returns:
            bool: 是否全部下载成功
        """
        # 使用传入的socketio参数，如果没有则使用实例的socketio
        socketio = socketio or self.socketio
        try:
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始下载媒体组: {name}, 共{len(urls)}个文件\033[0m")
                if aweme_id:
                    print(f"\033[93m[Downloader] 作品ID: {aweme_id}\033[0m")
                
            user_dir, filename = name.split('/', 1)
            filename = self._sanitize_filename(filename)
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 用户目录: {user_dir}, 文件名: {filename}\033[0m")
            
            # 只有当提供了aweme_id时才检查下载记录
            if aweme_id and aweme_id in self._load_download_record(user_dir):
                if self.debug_mode:
                    print(f"\033[93m[Downloader] 作品已在下载记录中: {aweme_id}\033[0m")
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return True

            # 下载所有文件
            success = True
            for i, url_info in enumerate(urls):
                try:
                    url = url_info['url']
                    file_type = url_info['type']  # 'video', 'image', 'live_photo'
                    
                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 开始下载第 {i+1}/{len(urls)} 个文件: {url}\033[0m")
                        print(f"\033[93m[Downloader] 文件类型: {file_type}\033[0m")
                    
                    # 发送WebSocket进度更新 - 开始下载单个文件
                    if socketio and task_id:
                        from datetime import datetime
                        progress = ((i + 0.5) / len(urls)) * 100
                        file_type_display = {
                            'video': '视频',
                            'image': '图片', 
                            'live_photo': 'Live Photo'
                        }.get(file_type, '文件')
                        socketio.emit('download_progress', {
                            'task_id': task_id,
                            'progress': progress,
                            'completed': i,
                            'total': len(urls),
                            'status': 'downloading'
                        })
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'正在下载第 {i+1}/{len(urls)} 个文件 ({file_type_display})',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                        
                    headers = self._get_download_headers()
                    response = requests.get(url, headers=headers, stream=True)
                    response.raise_for_status()
                    
                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 请求状态码: {response.status_code}\033[0m")
                    
                    # 改进文件命名逻辑，避免重复
                    if len(urls) == 1:
                        # 单个文件不添加索引
                        filename_with_index = self._sanitize_filename(filename)
                    else:
                        # 多个文件添加索引
                        filename_with_index = self._sanitize_filename(f"{filename}_{i+1:02d}")
                    
                    user_path = os.path.join(self.download_dir, user_dir)
                    os.makedirs(user_path, exist_ok=True)
                    
                    # 根据文件类型确定扩展名
                    if file_type == 'video' or file_type == 'live_photo':
                        extension = "mp4"
                    else:  # image
                        extension = "jpg"
                    
                    filepath = os.path.join(user_path, f"{filename_with_index}.{extension}")
                    
                    # 如果文件已存在，添加时间戳避免覆盖
                    if os.path.exists(filepath):
                        import time
                        timestamp = int(time.time())
                        filename_with_index = f"{filename_with_index}_{timestamp}"
                        filepath = os.path.join(user_path, f"{filename_with_index}.{extension}")
                        if self.debug_mode:
                            print(f"\033[93m[Downloader] 文件已存在，使用新名称: {filepath}\033[0m")
                    
                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 保存文件路径: {filepath}\033[0m")
                    
                    with open(filepath, "wb") as f:
                        total_size = 0
                        for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                            if chunk:
                                f.write(chunk)
                                total_size += len(chunk)
                                if self.debug_mode and total_size % (Config.CHUNK_SIZE * 10) == 0:
                                    print(f"\033[93m[Downloader] 已下载: {total_size/1024:.2f} KB\033[0m")
                    
                    if self.debug_mode:
                        print(f"\033[92m[Downloader] 文件下载完成: {filepath}, 大小: {os.path.getsize(filepath)/1024:.2f} KB\033[0m")
                    
                    file_type_display = {
                        'video': '视频',
                        'image': '图片', 
                        'live_photo': 'Live Photo'
                    }.get(file_type, '文件')
                    print(f"\033[93m下载{file_type_display} ({i+1}/{len(urls)}) 成功：{user_dir}/{filename_with_index}.{extension}\033[0m")
                    
                    # 发送WebSocket进度更新 - 单个文件完成
                    if socketio and task_id:
                        progress = ((i + 1) / len(urls)) * 100
                        socketio.emit('download_progress', {
                            'task_id': task_id,
                            'progress': progress,
                            'completed': i + 1,
                            'total': len(urls),
                            'status': 'downloading'
                        })
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'✅ 第 {i+1}/{len(urls)} 个文件下载成功 ({filename_with_index}.{extension})',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                        
                except Exception as e:
                    if self.debug_mode:
                        print(f"\033[91m[Downloader] 下载第 {i+1}/{len(urls)} 个文件失败: {str(e)}\033[0m")
                        print(f"\033[91m[Downloader] 失败URL: {url_info}\033[0m")
                    print(f"\033[91m下载第 {i+1}/{len(urls)} 个文件失败：{str(e)}\033[0m")
                    success = False
                    
                    # 发送WebSocket错误消息
                    if socketio and task_id:
                        from datetime import datetime
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'❌ 第 {i+1}/{len(urls)} 个文件下载失败: {str(e)}',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })

            # 只有当提供了aweme_id且所有文件都下载成功时才记录
            if success and aweme_id:
                if self.debug_mode:
                    print(f"\033[93m[Downloader] 所有文件下载成功，记录作品ID: {aweme_id}\033[0m")
                self._save_download_record(user_dir, aweme_id)
            elif not success and self.debug_mode:
                print(f"\033[91m[Downloader] 部分文件下载失败，不记录作品ID\033[0m")
            
            return success
        
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 下载媒体组失败: {str(e)}\033[0m")
                print(f"\033[91m[Downloader] 媒体组名称: {name}\033[0m")
                if aweme_id:
                    print(f"\033[91m[Downloader] 作品ID: {aweme_id}\033[0m")
            print(f"\033[91m下载失败：{str(e)}\033[0m")
            return False



    def download_video(self, url: str, name: str, aweme_id: str) -> bool:
        """下载视频
        Returns:
            bool: 下载是否成功
        """
        try:
            user_dir, filename = name.split('/', 1)
            filename = self._sanitize_filename(filename)
            
            # 检查是否已下载
            if aweme_id in self._load_download_record(user_dir):
                if self.debug_mode:
                    print(f"\033[93m[Downloader] 作品已在下载记录中: {aweme_id}\033[0m")
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return True  # 已下载视为成功

            headers = self._get_download_headers()
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            user_path = os.path.join(self.download_dir, user_dir)
            os.makedirs(user_path, exist_ok=True)
            filepath = os.path.join(user_path, f"{filename}.mp4")
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始下载视频: {filepath}\033[0m")
            
            with open(filepath, "wb") as f:
                total_size = 0
                for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)
                        if self.debug_mode and total_size % (Config.CHUNK_SIZE * 10) == 0:
                            print(f"\033[93m[Downloader] 已下载: {total_size/1024:.2f} KB\033[0m")
            
            if self.debug_mode:
                file_size = os.path.getsize(filepath)
                print(f"\033[92m[Downloader] 视频下载完成: {filepath}, 大小: {file_size/1024:.2f} KB\033[0m")
                
            print(f"\033[93m下载视频成功：{user_dir}/{filename}.mp4\033[0m")
            
            # 保存下载记录
            self._save_download_record(user_dir, aweme_id)
            return True
            
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 下载视频失败: {str(e)}\033[0m")
            print(f"\033[91m下载视频失败：{str(e)}\033[0m")
            return False

    def download_image(self, url: str, name: str, aweme_id: str, is_live: bool = False) -> bool:
        """下载图片或Live Photo
        Returns:
            bool: 下载是否成功
        """
        try:
            # 分离用户名和文件名
            user_dir, filename = name.split('/', 1)
            
            # 检查是否已下载
            if aweme_id in self._load_download_record(user_dir):
                if self.debug_mode:
                    print(f"\033[93m[Downloader] 作品已在下载记录中: {aweme_id}\033[0m")
                print(f"\033[93m作品已下载，跳过：{user_dir}/{filename}\033[0m")
                return True  # 已下载视为成功
                
            headers = self._get_download_headers()
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            filename = self._sanitize_filename(filename)
            user_path = os.path.join(self.download_dir, user_dir)
            os.makedirs(user_path, exist_ok=True)
            
            # 根据是否是Live Photo决定扩展名
            extension = "mp4" if is_live else "jpg"
            filepath = os.path.join(user_path, f"{filename}.{extension}")
            
            if self.debug_mode:
                file_type = "Live Photo" if is_live else "图片"
                print(f"\033[93m[Downloader] 开始下载{file_type}: {filepath}\033[0m")
            
            with open(filepath, "wb") as f:
                total_size = 0
                for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)
                        if self.debug_mode and total_size % (Config.CHUNK_SIZE * 10) == 0:
                            print(f"\033[93m[Downloader] 已下载: {total_size/1024:.2f} KB\033[0m")
            
            if self.debug_mode:
                file_size = os.path.getsize(filepath)
                file_type = "Live Photo" if is_live else "图片"
                print(f"\033[92m[Downloader] {file_type}下载完成: {filepath}, 大小: {file_size/1024:.2f} KB\033[0m")
                
            file_type = "Live Photo" if is_live else "图片"
            print(f"\033[93m下载{file_type}成功：{user_dir}/{filename}.{extension}\033[0m")
            
            # 保存下载记录
            self._save_download_record(user_dir, aweme_id)
            return True
            
        except Exception as e:
            if self.debug_mode:
                file_type = "Live Photo" if is_live else "图片"
                print(f"\033[91m[Downloader] 下载{file_type}失败: {str(e)}\033[0m")
            print(f"\033[91m下载失败：{str(e)}\033[0m")
            return False

    def download_video_direct(self, url: str, filename: str) -> bool:
        """直接通过URL下载视频文件"""
        try:
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始直接下载视频: {filename}\033[0m")
                print(f"\033[93m[Downloader] 视频URL: {url}\033[0m")
                
            headers = self._get_download_headers()
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始发送视频下载请求\033[0m")
                
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 请求状态码: {response.status_code}\033[0m")
                print(f"\033[93m[Downloader] 响应内容类型: {response.headers.get('Content-Type', '未知')}\033[0m")
                if 'Content-Length' in response.headers:
                    print(f"\033[93m[Downloader] 文件大小: {int(response.headers['Content-Length'])/1024/1024:.2f} MB\033[0m")
            
            # 创建下载目录
            download_path = os.path.join(self.download_dir, "direct_downloads")
            os.makedirs(download_path, exist_ok=True)
            filepath = os.path.join(download_path, filename)
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 保存文件路径: {filepath}\033[0m")
            
            with open(filepath, "wb") as f:
                total_size = 0
                for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)
                        if self.debug_mode and total_size % (Config.CHUNK_SIZE * 10) == 0:
                            print(f"\033[93m[Downloader] 已下载: {total_size/1024/1024:.2f} MB\033[0m")
            
            if self.debug_mode:
                file_size = os.path.getsize(filepath)
                print(f"\033[92m[Downloader] 视频下载完成: {filepath}\033[0m")
                print(f"\033[92m[Downloader] 文件大小: {file_size/1024/1024:.2f} MB\033[0m")
                
            print(f"\033[92m直接下载视频成功：{filename}\033[0m")
            return True
            
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 直接下载视频失败: {str(e)}\033[0m")
                print(f"\033[91m[Downloader] 视频URL: {url}\033[0m")
            print(f"\033[91m直接下载视频失败：{str(e)}\033[0m")
            return False

    def download_image_direct(self, url: str, filename: str) -> bool:
        """直接通过URL下载图片文件"""
        try:
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始直接下载图片: {filename}\033[0m")
                print(f"\033[93m[Downloader] 图片URL: {url}\033[0m")
                
            headers = self._get_download_headers()
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始发送图片下载请求\033[0m")
                
            response = requests.get(url, headers=headers, stream=True)
            response.raise_for_status()
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 请求状态码: {response.status_code}\033[0m")
                print(f"\033[93m[Downloader] 响应内容类型: {response.headers.get('Content-Type', '未知')}\033[0m")
                if 'Content-Length' in response.headers:
                    print(f"\033[93m[Downloader] 文件大小: {int(response.headers['Content-Length'])/1024:.2f} KB\033[0m")
            
            # 创建下载目录
            download_path = os.path.join(self.download_dir, "direct_downloads")
            os.makedirs(download_path, exist_ok=True)
            filepath = os.path.join(download_path, filename)
            
            if self.debug_mode:
                print(f"\033[93m[Downloader] 保存文件路径: {filepath}\033[0m")
            
            with open(filepath, "wb") as f:
                total_size = 0
                for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)
                        if self.debug_mode and total_size % (Config.CHUNK_SIZE * 10) == 0:
                            print(f"\033[93m[Downloader] 已下载: {total_size/1024:.2f} KB\033[0m")
            
            if self.debug_mode:
                file_size = os.path.getsize(filepath)
                print(f"\033[92m[Downloader] 图片下载完成: {filepath}\033[0m")
                print(f"\033[92m[Downloader] 文件大小: {file_size/1024:.2f} KB\033[0m")
                
            print(f"\033[93m直接下载图片成功：{filename}\033[0m")
            return True
            
        except Exception as e:
            if self.debug_mode:
                print(f"\033[91m[Downloader] 直接下载图片失败: {str(e)}\033[0m")
                print(f"\033[91m[Downloader] 图片URL: {url}\033[0m")
            print(f"\033[91m直接下载图片失败：{str(e)}\033[0m")
            return False

    def _sanitize_filename(self, name: str, max_length: int = Config.MAX_FILENAME_LENGTH) -> str:
        """清理文件名"""
        if self.debug_mode:
            print(f"\033[93m[Downloader] 清理文件名: {name}\033[0m")
            
        # 移除非法字符
        sanitized = re.sub(r'[\\/:*?"<>|]', '_', name)
        # 移除多余空格
        sanitized = ' '.join(sanitized.split())
        result = sanitized[:max_length]
        
        if self.debug_mode and result != name:
            print(f"\033[93m[Downloader] 文件名已清理: {result}\033[0m")
            
        return result