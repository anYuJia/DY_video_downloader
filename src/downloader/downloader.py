import os
import json
import re
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import List

from src.config.config import Config
from src.api.api import DouyinAPI

# 带重试的 requests session
_session = requests.Session()
_retry = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
_session.mount('https://', HTTPAdapter(max_retries=_retry))
_session.mount('http://', HTTPAdapter(max_retries=_retry))

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

    def _get_response_size(self, response) -> int:
        """从响应头获取文件大小，取不到时返回 0。"""
        content_length = response.headers.get('Content-Length')
        if content_length and content_length.isdigit():
            return int(content_length)

        content_range = response.headers.get('Content-Range', '')
        if '/' in content_range:
            total = content_range.rsplit('/', 1)[-1]
            if total.isdigit():
                return int(total)

        return 0

    def _emit_download_progress(self, socketio, task_id, progress_callback=None, **payload):
        """同时兼容旧 download_progress 事件和新的批量当前作品回调。"""
        if socketio and task_id:
            socketio.emit('download_progress', {
                'task_id': task_id,
                **payload
            })

        if progress_callback:
            try:
                progress_callback(payload)
            except Exception as e:
                if self.debug_mode:
                    print(f"\033[91m[Downloader] 进度回调失败: {str(e)}\033[0m")
        
    def download_media_group(self, urls: List[dict], name: str, aweme_id: str = None, socketio=None, task_id=None, cancel_event=None, progress_callback=None) -> bool:
        """下载一组媒体文件（图片、视频或Live Photo）
        Args:
            urls: [{'url': 'https://example.com/file.mp4', 'type': 'video'|'image'|'live_photo'}]
            name: 文件名格式 "用户名/文件名"
            aweme_id: 作品ID，用于记录下载历史
            socketio: WebSocket对象，用于发送进度更新
            task_id: WebSocket任务ID，用于发送进度更新
            cancel_event: 可选的取消事件，用于中断下载
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

            # 检查取消信号
            if cancel_event and cancel_event.is_set():
                print(f"\033[93m媒体组下载被取消（开始前）：{name}\033[0m")
                return False

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
            downloaded_files = []  # 记录已下载的文件，用于取消时清理

            for i, url_info in enumerate(urls):
                # 检查取消信号
                if cancel_event and cancel_event.is_set():
                    print(f"\033[93m媒体组下载被取消（下载中），清理已下载文件：{name}\033[0m")
                    # 清理已下载的文件
                    for filepath in downloaded_files:
                        if os.path.exists(filepath):
                            os.remove(filepath)
                            print(f"\033[93m已删除：{filepath}\033[0m")
                    return False

                try:
                    url = url_info['url']
                    file_type = url_info['type']  # 'video', 'image', 'live_photo'

                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 开始下载第 {i+1}/{len(urls)} 个文件: {url}\033[0m")
                        print(f"\033[93m[Downloader] 文件类型: {file_type}\033[0m")
                    
                    # 发送WebSocket进度更新 - 开始下载单个文件
                    file_started_at = time.monotonic()
                    file_type_display = {
                        'video': '视频',
                        'image': '图片',
                        'live_photo': 'Live Photo'
                    }.get(file_type, '文件')
                    if socketio and task_id:
                        from datetime import datetime
                        progress = (i / len(urls)) * 100
                        self._emit_download_progress(
                            socketio, task_id, progress_callback,
                            progress=progress,
                            completed=i,
                            total=len(urls),
                            status='downloading',
                            file_index=i + 1,
                            file_total=len(urls),
                            file_progress=0,
                            bytes_downloaded=0,
                            bytes_total=0,
                            speed_bps=0,
                            eta_seconds=None,
                            file_type=file_type,
                            file_type_display=file_type_display
                        )
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'正在下载第 {i+1}/{len(urls)} 个文件 ({file_type_display})',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                    elif progress_callback:
                        progress = (i / len(urls)) * 100
                        self._emit_download_progress(
                            socketio, task_id, progress_callback,
                            progress=progress,
                            completed=i,
                            total=len(urls),
                            status='downloading',
                            file_index=i + 1,
                            file_total=len(urls),
                            file_progress=0,
                            bytes_downloaded=0,
                            bytes_total=0,
                            speed_bps=0,
                            eta_seconds=None,
                            file_type=file_type,
                            file_type_display=file_type_display
                        )
                        
                    headers = self._get_download_headers()
                    response = _session.get(url, headers=headers, stream=True, timeout=(10, 120))
                    response.raise_for_status()
                    response_size = self._get_response_size(response)
                    
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
                        timestamp = int(time.time())
                        filename_with_index = f"{filename_with_index}_{timestamp}"
                        filepath = os.path.join(user_path, f"{filename_with_index}.{extension}")
                        if self.debug_mode:
                            print(f"\033[93m[Downloader] 文件已存在，使用新名称: {filepath}\033[0m")

                    if self.debug_mode:
                        print(f"\033[93m[Downloader] 保存文件路径: {filepath}\033[0m")

                    # 记录已下载的文件路径，用于取消时清理
                    downloaded_files.append(filepath)

                    with open(filepath, "wb") as f:
                        downloaded_size = 0
                        last_emit_time = time.monotonic()
                        last_emit_progress = (i / len(urls)) * 100
                        for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                            # 检查取消信号
                            if cancel_event and cancel_event.is_set():
                                print(f"\033[93m下载被取消，删除部分文件：{filepath}\033[0m")
                                f.close()
                                # 删除未完成的文件
                                if os.path.exists(filepath):
                                    os.remove(filepath)
                                # 清理之前下载的文件
                                for fp in downloaded_files:
                                    if os.path.exists(fp):
                                        os.remove(fp)
                                return False
                            if chunk:
                                f.write(chunk)
                                downloaded_size += len(chunk)
                                now = time.monotonic()
                                elapsed = max(now - file_started_at, 0.001)
                                file_progress = (downloaded_size / response_size * 100) if response_size > 0 else 0
                                file_progress = min(100, max(0, file_progress))
                                progress = ((i + file_progress / 100) / len(urls)) * 100
                                speed_bps = downloaded_size / elapsed
                                eta_seconds = ((response_size - downloaded_size) / speed_bps) if response_size > 0 and speed_bps > 0 else None
                                should_emit = (
                                    now - last_emit_time >= 0.5 or
                                    abs(progress - last_emit_progress) >= 1 or
                                    (response_size > 0 and downloaded_size >= response_size)
                                )
                                if should_emit:
                                    self._emit_download_progress(
                                        socketio, task_id, progress_callback,
                                        progress=progress,
                                        completed=i,
                                        total=len(urls),
                                        status='downloading',
                                        file_index=i + 1,
                                        file_total=len(urls),
                                        file_progress=file_progress,
                                        bytes_downloaded=downloaded_size,
                                        bytes_total=response_size,
                                        speed_bps=speed_bps,
                                        eta_seconds=eta_seconds,
                                        file_type=file_type,
                                        file_type_display=file_type_display
                                    )
                                    last_emit_time = now
                                    last_emit_progress = progress
                                if self.debug_mode and downloaded_size % (Config.CHUNK_SIZE * 10) == 0:
                                    print(f"\033[93m[Downloader] 已下载: {downloaded_size/1024:.2f} KB\033[0m")

                    if self.debug_mode:
                        print(f"\033[92m[Downloader] 文件下载完成: {filepath}, 大小: {os.path.getsize(filepath)/1024:.2f} KB\033[0m")
                    
                    print(f"\033[93m下载{file_type_display} ({i+1}/{len(urls)}) 成功：{user_dir}/{filename_with_index}.{extension}\033[0m")
                    
                    # 发送WebSocket进度更新 - 单个文件完成
                    if socketio and task_id:
                        progress = ((i + 1) / len(urls)) * 100
                        elapsed = max(time.monotonic() - file_started_at, 0.001)
                        final_size = os.path.getsize(filepath) if os.path.exists(filepath) else response_size
                        self._emit_download_progress(
                            socketio, task_id, progress_callback,
                            progress=progress,
                            completed=i + 1,
                            total=len(urls),
                            status='downloading',
                            file_index=i + 1,
                            file_total=len(urls),
                            file_progress=100,
                            bytes_downloaded=final_size,
                            bytes_total=response_size or final_size,
                            speed_bps=final_size / elapsed,
                            eta_seconds=0,
                            file_type=file_type,
                            file_type_display=file_type_display
                        )
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'✅ 第 {i+1}/{len(urls)} 个文件下载成功 ({filename_with_index}.{extension})',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                    elif progress_callback:
                        progress = ((i + 1) / len(urls)) * 100
                        elapsed = max(time.monotonic() - file_started_at, 0.001)
                        final_size = os.path.getsize(filepath) if os.path.exists(filepath) else response_size
                        self._emit_download_progress(
                            socketio, task_id, progress_callback,
                            progress=progress,
                            completed=i + 1,
                            total=len(urls),
                            status='downloading',
                            file_index=i + 1,
                            file_total=len(urls),
                            file_progress=100,
                            bytes_downloaded=final_size,
                            bytes_total=response_size or final_size,
                            speed_bps=final_size / elapsed,
                            eta_seconds=0,
                            file_type=file_type,
                            file_type_display=file_type_display
                        )
                        
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



    def download_video(self, url: str, name: str, aweme_id: str, cancel_event=None, socketio=None, task_id=None, progress_callback=None) -> bool:
        """下载视频
        Args:
            url: 视频URL
            name: 用户名/文件名
            aweme_id: 作品ID
            cancel_event: 可选的取消事件，用于中断下载
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

            # 检查取消信号
            if cancel_event and cancel_event.is_set():
                print(f"\033[93m下载被取消（开始下载前）：{user_dir}/{filename}\033[0m")
                return False

            headers = self._get_download_headers()
            response = _session.get(url, headers=headers, stream=True, timeout=(10, 120))
            response.raise_for_status()
            response_size = self._get_response_size(response)
            file_started_at = time.monotonic()

            user_path = os.path.join(self.download_dir, user_dir)
            os.makedirs(user_path, exist_ok=True)
            filepath = os.path.join(user_path, f"{filename}.mp4")

            if self.debug_mode:
                print(f"\033[93m[Downloader] 开始下载视频: {filepath}\033[0m")

            self._emit_download_progress(
                socketio, task_id, progress_callback,
                progress=0,
                completed=0,
                total=1,
                status='downloading',
                file_index=1,
                file_total=1,
                file_progress=0,
                bytes_downloaded=0,
                bytes_total=response_size,
                speed_bps=0,
                eta_seconds=None,
                file_type='video',
                file_type_display='视频'
            )

            with open(filepath, "wb") as f:
                downloaded_size = 0
                last_emit_time = time.monotonic()
                last_emit_progress = 0
                for chunk in response.iter_content(chunk_size=Config.CHUNK_SIZE):
                    # 检查取消信号
                    if cancel_event and cancel_event.is_set():
                        print(f"\033[93m下载被取消，删除部分文件：{filepath}\033[0m")
                        f.close()
                        # 删除未完成的文件
                        if os.path.exists(filepath):
                            os.remove(filepath)
                        return False
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        now = time.monotonic()
                        elapsed = max(now - file_started_at, 0.001)
                        progress = (downloaded_size / response_size * 100) if response_size > 0 else 0
                        progress = min(100, max(0, progress))
                        speed_bps = downloaded_size / elapsed
                        eta_seconds = ((response_size - downloaded_size) / speed_bps) if response_size > 0 and speed_bps > 0 else None
                        should_emit = (
                            now - last_emit_time >= 0.5 or
                            abs(progress - last_emit_progress) >= 1 or
                            (response_size > 0 and downloaded_size >= response_size)
                        )
                        if should_emit:
                            self._emit_download_progress(
                                socketio, task_id, progress_callback,
                                progress=progress,
                                completed=0,
                                total=1,
                                status='downloading',
                                file_index=1,
                                file_total=1,
                                file_progress=progress,
                                bytes_downloaded=downloaded_size,
                                bytes_total=response_size,
                                speed_bps=speed_bps,
                                eta_seconds=eta_seconds,
                                file_type='video',
                                file_type_display='视频'
                            )
                            last_emit_time = now
                            last_emit_progress = progress
                        if self.debug_mode and downloaded_size % (Config.CHUNK_SIZE * 10) == 0:
                            print(f"\033[93m[Downloader] 已下载: {downloaded_size/1024:.2f} KB\033[0m")
            
            if self.debug_mode:
                file_size = os.path.getsize(filepath)
                print(f"\033[92m[Downloader] 视频下载完成: {filepath}, 大小: {file_size/1024:.2f} KB\033[0m")
                
            print(f"\033[93m下载视频成功：{user_dir}/{filename}.mp4\033[0m")
            elapsed = max(time.monotonic() - file_started_at, 0.001)
            final_size = os.path.getsize(filepath) if os.path.exists(filepath) else response_size
            self._emit_download_progress(
                socketio, task_id, progress_callback,
                progress=100,
                completed=1,
                total=1,
                status='completed',
                file_index=1,
                file_total=1,
                file_progress=100,
                bytes_downloaded=final_size,
                bytes_total=response_size or final_size,
                speed_bps=final_size / elapsed,
                eta_seconds=0,
                file_type='video',
                file_type_display='视频'
            )
            
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
            response = _session.get(url, headers=headers, stream=True, timeout=(10, 120))
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
                
            response = _session.get(url, headers=headers, stream=True, timeout=(10, 120))
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
                
            response = _session.get(url, headers=headers, stream=True, timeout=(10, 120))
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
