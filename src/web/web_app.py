from gevent import monkey
monkey.patch_all()

from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit
import asyncio
import threading
import os
import sys
import json
import uuid
import logging
import requests as http_requests
from datetime import datetime

# 配置日志
logging.basicConfig(level=logging.DEBUG if os.environ.get('DEBUG_MODE', '').lower() in ('true', '1') else logging.INFO,
                    format='[%(levelname)s] %(message)s')
logger = logging.getLogger('web_app')

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.config import Config
from src.api.api import DouyinAPI
from src.downloader.downloader import DouyinDownloader
from src.user.user_manager import DouyinUserManager

# 移除增强下载器支持
ENHANCED_DOWNLOADER_AVAILABLE = False
EnhancedDouyinDownloader = None

app = Flask(__name__)
app.config['SECRET_KEY'] = 'douyin_downloader_secret_key'
# 修改SocketIO初始化，添加更多选项
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode='gevent',  # 使用gevent模式
    logger=True,  # 启用日志
    engineio_logger=True,  # 启用Engine.IO日志
    ping_timeout=60,  # 增加ping超时时间
    ping_interval=25  # 增加ping间隔
)

# 全局变量
api = None
downloader = None
user_manager = None
download_tasks = {}

class WebDownloadProgress:
    """Web下载进度回调"""
    def __init__(self, task_id, socketio, desc=None):
        self.task_id = task_id
        self.socketio = socketio
        self.total_files = 0
        self.completed_files = 0
        self.desc = desc
        self.display_name = '下载任务'
        if desc and desc.strip():
            self.display_name = desc[:8] + '...' if len(desc) > 8 else desc
    
    def set_total_files(self, total):
        self.total_files = total
        self.emit_progress()
    
    def file_completed(self, filename):
        self.completed_files += 1
        self.emit_progress()
        self.socketio.emit('download_log', {
            'task_id': self.task_id,
            'message': f'下载完成: {filename}',
            'timestamp': datetime.now().strftime('%H:%M:%S')
        })
    
    def emit_progress(self):
        progress = (self.completed_files / self.total_files * 100) if self.total_files > 0 else 0
        self.socketio.emit('download_progress', {
            'task_id': self.task_id,
            'progress': progress,
            'completed': self.completed_files,
            'total': self.total_files,
            'desc': self.desc,
            'display_name': self.display_name
        })

def init_app():
    """初始化应用"""
    global api, downloader, user_manager
    try:
        Config.init()
        cookie = Config.COOKIE if Config.COOKIE else ''
        api = DouyinAPI(cookie)
        
        # 使用标准下载器
        downloader = DouyinDownloader(api, socketio=socketio)
        logger.info("Web服务使用标准下载器")
        
        # 传递socketio对象给用户管理器
        user_manager = DouyinUserManager(api, downloader, socketio=socketio,cookie=cookie)
        logger.info("Web应用初始化完成")
    except Exception as e:
        logger.error(f"Web应用初始化失败: {str(e)}")

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置信息"""
    # 注意：Cookie只在localhost环境下返回给前端回显，不应在公网暴露
    return jsonify({
        'cookie_set': bool(Config.COOKIE),
        'download_dir': Config.BASE_DIR,
        'cookie': Config.COOKIE if Config.COOKIE else ''
    })

@app.route('/api/config', methods=['POST'])
def set_config():
    """设置配置"""
    global api, downloader, user_manager
    try:
        data = request.json
        
        if 'cookie' in data:
            Config.COOKIE = data['cookie'].replace('\n', '').replace('\r', '').strip()
        if 'download_dir' in data:
            Config.BASE_DIR = data['download_dir']
            
        Config.save_config(Config.COOKIE, Config.BASE_DIR)
        
        # 重新初始化API和下载器
        init_app()
        
        return jsonify({'success': True, 'message': '配置保存成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'配置保存失败: {str(e)}'}), 500

@app.route('/api/media/proxy')
def media_proxy():
    """代理抖音媒体资源，添加必要的Referer和Cookie头"""
    url = request.args.get('url', '')
    if not url or not any(d in url for d in ['douyin', 'douyinvod', 'douyinpic', 'byteimg', 'douyinstatic', 'ixigua']):
        return 'Invalid URL', 400

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/',
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
        }

        if api and api.cookie:
            headers['Cookie'] = api.cookie

        # 转发Range请求（支持视频seek）
        range_header = request.headers.get('Range')
        if range_header:
            headers['Range'] = range_header

        resp = http_requests.get(url, headers=headers, stream=True, timeout=15)

        # 构建响应头
        resp_headers = {}
        for key in ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']:
            if key in resp.headers:
                resp_headers[key] = resp.headers[key]

        # 如果没有Content-Type，根据URL推断
        if 'Content-Type' not in resp_headers:
            if '.mp4' in url or 'video' in url:
                resp_headers['Content-Type'] = 'video/mp4'
            elif '.jpg' in url or '.jpeg' in url:
                resp_headers['Content-Type'] = 'image/jpeg'
            elif '.png' in url:
                resp_headers['Content-Type'] = 'image/png'
            elif '.webp' in url:
                resp_headers['Content-Type'] = 'image/webp'

        resp_headers['Access-Control-Allow-Origin'] = '*'
        resp_headers['Cache-Control'] = 'public, max-age=3600'

        def generate():
            for chunk in resp.iter_content(chunk_size=65536):
                yield chunk

        status_code = resp.status_code
        return Response(generate(), status=status_code, headers=resp_headers)

    except Exception as e:
        return f'Proxy error: {str(e)}', 502

@app.route('/api/verify_page')
def verify_page():
    """返回一个验证页面，用iframe嵌入抖音来完成滑块验证"""
    return '''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>抖音验证</title>
<style>
body{margin:0;background:#0a0a0f;color:#fff;font-family:'Outfit',sans-serif;display:flex;flex-direction:column;height:100vh}
.header{padding:16px 24px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between}
.header h3{margin:0;font-size:1.1rem}
.header .hint{color:#8b8b9e;font-size:0.82rem}
iframe{flex:1;border:none;width:100%}
.btn-done{background:#FE2C55;color:#fff;border:none;padding:10px 28px;border-radius:10px;font-size:0.9rem;cursor:pointer;font-weight:500}
.btn-done:hover{background:#ff4d73}
</style></head><body>
<div class="header">
    <div>
        <h3>请完成滑块验证</h3>
        <div class="hint">在下方页面完成验证后点击"验证完成"</div>
    </div>
    <button class="btn-done" onclick="window.close()">验证完成</button>
</div>
<iframe src="https://www.douyin.com/"></iframe>
</body></html>'''

@app.route('/api/search_user', methods=['POST'])
def search_user():
    """搜索用户"""
    try:
        data = request.json
        keyword = data.get('keyword', '').strip()
        
        if not keyword:
            return jsonify({'success': False, 'message': '请输入搜索关键词'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        # 在新线程中运行异步任务
        def run_search():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(user_manager.search_user(keyword))
                return result
            finally:
                loop.close()
        
        users = run_search()

        if users is None:
            return jsonify({'success': False, 'message': '未找到用户'})

        # 检测验证码
        if isinstance(users, dict) and users.get('_need_verify'):
            return jsonify({'success': False, 'need_verify': True, 'message': '需要完成滑块验证'})
        
        if isinstance(users, dict):  # 单个用户
            return jsonify({
                'success': True,
                'type': 'single',
                'user': {
                    'nickname': users.get('nickname', ''),
                    'unique_id': users.get('unique_id', ''),
                    'follower_count': users.get('follower_count', 0),
                    'signature': users.get('signature', ''),
                    'sec_uid': users.get('sec_uid', ''),
                    'avatar_thumb': users.get('avatar_thumb', {}).get('url_list', [''])[0] if users.get('avatar_thumb') else '',
                    'avatar_larger': users.get('avatar_larger', {}).get('url_list', [''])[0] if users.get('avatar_larger') else ''
                }
            })
        else:  # 多个用户
            user_list = []
            for user in users:
                user_info = user['user_info']
                user_list.append({
                    'nickname': user_info.get('nickname', ''),
                    'unique_id': user_info.get('unique_id', ''),
                    'follower_count': user_info.get('follower_count', 0),
                    'following_count': user_info.get('following_count', 0),
                    'total_favorited': user_info.get('total_favorited', 0),
                    'aweme_count': user_info.get('aweme_count', 0),
                    'signature': user_info.get('signature', ''),
                    'sec_uid': user_info.get('sec_uid', ''),
                    'avatar_thumb': user_info.get('avatar_thumb', {}).get('url_list', [''])[0] if user_info.get('avatar_thumb') else '',
                    'avatar_larger': user_info.get('avatar_larger', {}).get('url_list', [''])[0] if user_info.get('avatar_larger') else ''
                })
            
            return jsonify({
                'success': True,
                'type': 'multiple',
                'users': user_list
            })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'搜索失败: {str(e)}'}), 500

@app.route('/api/user_detail', methods=['POST'])
def get_user_detail():
    """获取用户详情"""
    try:
        data = request.json
        sec_uid = data.get('sec_uid', '').strip()
        
        if not sec_uid:
            return jsonify({'success': False, 'message': '用户ID不能为空'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        # 在新线程中运行异步任务
        def run_get_detail():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(user_manager.get_user_detail(sec_uid))
                return result
            finally:
                loop.close()
        
        user_detail = run_get_detail()
        
        if not user_detail:
            return jsonify({'success': False, 'message': '获取用户详情失败'})
        
        return jsonify({
            'success': True,
            'user': {
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
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'获取用户详情失败: {str(e)}'}), 500

@app.route('/api/get_liked_videos', methods=['POST'])
def get_liked_videos_api():
    """获取点赞视频列表"""
    try:
        data = request.json
        count = data.get('count', 20)
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        videos = loop.run_until_complete(user_manager.get_liked_videos(count))
        loop.close()
        if not videos:
            return jsonify({'success': False, 'message': '获取点赞视频失败。该接口需要登录态，请确认Cookie有效且包含完整的登录信息。如果Cookie已过期请重新获取。'})
        return jsonify({
            'success': True,
            'data': videos,
            'count': len(videos)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'获取点赞视频失败: {str(e)}'}), 500

@app.route('/api/get_liked_authors', methods=['POST'])
def get_liked_authors_api():
    """获取点赞作者列表"""
    try:
        data = request.json
        count = data.get('count', 20)

        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        authors = loop.run_until_complete(user_manager.get_liked_authors(count))
        loop.close()

        if not authors:
            return jsonify({'success': False, 'message': '获取点赞作者失败。该接口需要登录态，请确认Cookie有效且包含完整的登录信息。'})
        
        return jsonify({
            'success': True, 
            'data': authors,
            'count': len(authors)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/user_videos', methods=['POST'])
def get_user_videos():
    """获取用户视频列表（支持分页渐进加载）"""
    try:
        data = request.json
        sec_uid = data.get('sec_uid', '').strip()
        cursor = data.get('cursor', 0)  # 分页游标
        count = data.get('count', 18)   # 每页数量

        if not sec_uid:
            return jsonify({'success': False, 'message': '用户ID不能为空'}), 400

        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400

        def run_get_page():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                params = {
                    "publish_video_strategy_type": 2,
                    "max_cursor": cursor,
                    "sec_user_id": sec_uid,
                    "locate_query": False,
                    'show_live_replay_strategy': 1,
                    'need_time_list': 0,
                    'time_list_query': 0,
                    'whale_cut_token': '',
                    'count': count
                }
                resp, succ = loop.run_until_complete(
                    user_manager.api.common_request('/aweme/v1/web/aweme/post/', params, {}, skip_sign=True)
                )
                return resp, succ
            finally:
                loop.close()

        resp, succ = run_get_page()

        # 检测验证码
        if isinstance(resp, dict) and resp.get('_need_verify'):
            return jsonify({'success': False, 'need_verify': True, 'message': '需要完成滑块验证'})

        if not succ or not resp.get('aweme_list'):
            return jsonify({
                'success': True,
                'videos': [],
                'has_more': False,
                'cursor': 0,
                'total_count': 0
            })

        videos = resp.get('aweme_list', [])
        has_more = resp.get('has_more', 0) == 1
        next_cursor = resp.get('max_cursor', 0)

        video_list = []
        for video in videos:
            aweme_id = video.get('aweme_id')
            if not aweme_id:
                continue
            cover_url = ""
            if video.get('video') and video['video'].get('cover'):
                cover_url = video['video']['cover']['url_list'][0]
            elif video.get('images'):
                cover_url = video['images'][0]['url_list'][-1]
            media_type, media_urls = user_manager.get_media_info(video)
            video_list.append({
                'aweme_id': aweme_id,
                'desc': video.get('desc', ''),
                'create_time': video.get('create_time', 0),
                'digg_count': video.get('statistics', {}).get('digg_count', 0),
                'comment_count': video.get('statistics', {}).get('comment_count', 0),
                'share_count': video.get('statistics', {}).get('share_count', 0),
                'cover_url': cover_url,
                'media_type': media_type,
                'media_urls': media_urls,
                'author': {
                    'nickname': video.get('author', {}).get('nickname', ''),
                    'avatar_thumb': video.get('author', {}).get('avatar_thumb', {}).get('url_list', [''])[0] if video.get('author', {}).get('avatar_thumb') else ''
                }
            })

        return jsonify({
            'success': True,
            'videos': video_list,
            'has_more': has_more,
            'cursor': next_cursor,
            'total_count': len(video_list)
        })
    except Exception as e:
        logger.error(f" 获取用户视频列表失败: {str(e)}")
        return jsonify({'success': False, 'message': f'获取用户视频列表失败: {str(e)}'}), 500
                
@app.route('/api/download_single_video', methods=['POST'])
def download_single_video():
    """下载单个作品（视频、图集或Live Photo）"""
    try:
        data = request.json
        aweme_id = data.get('aweme_id', '').strip()
        video_desc = data.get('desc', '未知作品')
        media_urls = data.get('media_urls', [])
        raw_media_type = data.get('raw_media_type', 'video')
        author_name = data.get('author_name', '未知作者')

        if not aweme_id:
            return jsonify({'success': False, 'message': '作品ID不能为空'}), 400

        if not user_manager or not downloader:
            return jsonify({'success': False, 'message': '服务未完全初始化'}), 500

        # 如果前端没有提供媒体URL，则从API获取
        if not media_urls:
            # ... (省略了从API获取媒体详情和URL的逻辑，因为前端现在会提供)
            pass

        if not media_urls:
            return jsonify({'success': False, 'message': '没有可用的媒体URL'}), 400

        task_id = str(uuid.uuid4())

        def run_download():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                logger.debug(f" 开始下载任务: {task_id}")
                logger.debug(f" 作品ID: {aweme_id}")
                logger.debug(f" 媒体类型: {raw_media_type}")
                logger.debug(f" 媒体URL数量: {len(media_urls)}")
                logger.debug(f" 媒体URLs: {media_urls}")
                
                # 发送下载开始事件
                try:
                    logger.debug(f" 发送WebSocket下载开始事件: task_id={task_id}")
                    # 修复变量作用域问题，确保在使用urls前已定义
                    media_count = len(media_urls)
                    socketio.emit('download_started', {
                        'task_id': task_id, 
                        'desc': video_desc,
                        'type': 'single_video',
                        'aweme_id': aweme_id,
                        'media_type': raw_media_type,
                        'media_count': media_count
                    }, broadcast=True)  # 添加broadcast=True确保消息广播到所有客户端
                    logger.debug(f" WebSocket事件已发送")
                except Exception as e:
                    logger.error(f" 发送WebSocket事件失败: {str(e)}")
                
                # 发送进度更新 - 开始
                display_name = video_desc[:8] if video_desc else "下载任务"
                socketio.emit('download_progress', {
                    'task_id': task_id,
                    'progress': 0,
                    'completed': 0,
                    'total': len(media_urls),
                    'status': 'starting',
                    'desc': video_desc,
                    'display_name': display_name
                })
                
                # 提取URL列表，处理不同的数据格式
                urls = []
                if isinstance(media_urls, list):
                    urls = media_urls
                else:
                    logger.error(f" 媒体URL格式错误: {type(media_urls)}")
                    raise ValueError(f"媒体URL格式错误: {type(media_urls)}")
                
                logger.debug(f" 提取的URL列表: {urls}")
                
                if not urls:
                    raise ValueError("没有有效的媒体URL")
                
                # 使用作者名字作为文件夹，作品描述作为文件名
                file_path = f"{author_name}/{video_desc}"
                logger.debug(f" 文件路径: {file_path}")
                
                # 统一下载处理，不再区分媒体类型
                logger.debug(f" 开始统一下载: {len(urls)} 个文件")
                socketio.emit('download_progress', {
                    'task_id': task_id,
                    'progress': 10,
                    'completed': 0,
                    'total': len(urls),
                    'status': 'downloading',
                    'desc': video_desc,
                    'display_name': display_name
                })
                socketio.emit('download_log', {
                    'task_id': task_id,
                    'message': f'正在下载媒体文件: {len(urls)} 个文件',
                    'timestamp': datetime.now().strftime('%H:%M:%S')
                })
                
                success = False
                failed_files = []
                
                try:
                    # 统一下载处理，直接传入urls参数
                    logger.debug(f" 开始下载: {len(urls)} 个文件")
                    success = downloader.download_media_group(urls, file_path, aweme_id, socketio=socketio, task_id=task_id)
                    
                    if success:
                        socketio.emit('download_progress', {
                            'task_id': task_id,
                            'progress': 100,
                            'completed': len(urls),
                            'total': len(urls),
                            'status': 'completed',
                            'desc': video_desc,
                            'display_name': display_name
                        })
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'✅ 下载完成: {len(urls)} 个文件',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                        
                        # 如果全部成功，记录作品ID
                        if aweme_id:
                            downloader._save_download_record(author_name, aweme_id)
                    else:
                        raise Exception('下载失败')
                        
                except Exception as e:
                    success = False
                    logger.error(f" 下载失败: {str(e)}")
                    if 'progress' not in locals() or 'download_progress' not in str(e):
                        socketio.emit('download_progress', {
                            'task_id': task_id,
                            'progress': 0,
                            'completed': 0,
                            'total': len(urls),
                            'status': 'failed',
                            'desc': video_desc,
                            'display_name': display_name
                        })
                        socketio.emit('download_log', {
                            'task_id': task_id,
                            'message': f'❌ 下载失败: {str(e)}',
                            'timestamp': datetime.now().strftime('%H:%M:%S')
                        })
                    raise e

                logger.debug(f" 下载任务完成，结果: {success}")
                
                # 发送最终完成事件（统一处理）
                if success:
                    socketio.emit('download_completed', {
                        'task_id': task_id, 
                        'message': f'下载成功: {video_desc}',
                        'aweme_id': aweme_id,
                        'media_type': raw_media_type,
                        'file_count': len(media_urls)
                    })
                    logger.debug(f" 发送下载完成事件: task_id={task_id}")
                else:
                    raise Exception('下载失败')

            except Exception as e:
                error_msg = f"下载失败: {str(e)}"
                logger.error(f" {error_msg}")
                socketio.emit('download_failed', {'task_id': task_id, 'error': error_msg})
            finally:
                loop.close()

        thread = threading.Thread(target=run_download, daemon=True)
        thread.start()

        return jsonify({'success': True, 'task_id': task_id, 'message': '下载任务已启动'})

    except Exception as e:
        return jsonify({'success': False, 'message': f'下载启动失败: {str(e)}'}), 500

@app.route('/api/download_user', methods=['POST'])
def download_user():
    """下载用户视频"""
    logger.debug("Received download_user request")
    try:
        data = request.json
        user_info = data.get('user_info')
        logger.debug(f"user_info: {user_info}")
        if not user_info:
            return jsonify({'success': False, 'message': '用户信息不完整'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        download_tasks[task_id] = {
            'status': 'running',
            'user': user_info.get('nickname', ''),
            'start_time': datetime.now()
        }
        # 在新线程中运行下载任务
        def run_download():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # 创建进度回调
                progress_callback = WebDownloadProgress(task_id, socketio)
                
                # 发送开始信号
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'user': user_info.get('nickname', '')
                })
                
                # 执行下载
                logger.debug("开始下载")
                loop.run_until_complete(user_manager.download_user_videos(user_info,True,True))
                
                # 更新任务状态
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'message': f'用户 {user_info.get("nickname", "")} 的视频下载完成'
                })
                
            except Exception as e:
                download_tasks[task_id]['status'] = 'failed'
                download_tasks[task_id]['error'] = str(e)
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_failed', {
                    'task_id': task_id,
                    'error': str(e)
                })
            finally:
                loop.close()
        
        thread = threading.Thread(target=run_download, daemon=True)
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '下载任务已开始'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/download_user_video', methods=['POST'])
def download_user_video():
    """通过sec_uid下载用户所有视频，支持WebSocket进度反馈"""
    logger.debug("Received download_user_video request")
    try:
        data = request.json
        sec_uid = data.get('sec_uid')
        nickname = data.get('nickname', '')  # 前端传来，跳过详情接口

        if not sec_uid:
            return jsonify({'success': False, 'message': 'sec_uid参数不能为空'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        download_tasks[task_id] = {
            'status': 'running',
            'sec_uid': sec_uid,
            'start_time': datetime.now()
        }
        
        # 在新线程中运行下载任务
        def run_download():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # 使用前端传来的nickname，不再调用get_user_detail
                _nickname = nickname if nickname else 'unknown'
                
                # 发送开始信号
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'user': _nickname,
                    'sec_uid': sec_uid
                })
                
                # 获取用户视频列表以计算总数
                posts = loop.run_until_complete(user_manager.get_user_videos(sec_uid, limit=1000))
                if not posts:
                    raise Exception(f'未找到用户 {_nickname} 的作品')
                
                # 获取已下载记录
                downloaded = user_manager.downloader._load_download_record(_nickname)
                new_posts = [post for post in posts if post['aweme_id'] not in downloaded]
                
                if not new_posts:
                    socketio.emit('download_completed', {
                        'task_id': task_id,
                        'message': f'用户 {_nickname} 没有新作品需要下载',
                        'total_videos': len(posts),
                        'current_downloaded': 0,
                        'remaining': 0
                    })
                    return
                
                total_videos = len(new_posts)
                
                # 发送总数信息
                socketio.emit('download_info', {
                    'task_id': task_id,
                    'total_videos': total_videos,
                    'current_downloaded': 0,
                    'remaining': total_videos,
                    'message': f'找到 {total_videos} 个新作品，开始下载'
                })
                
                # 逐个下载视频并发送进度
                for i, post in enumerate(new_posts, 1):
                    media_type, urls = user_manager._get_media_info(post)
                    
                    # 处理空描述的情况
                    desc = post.get('desc', '').strip()
                    if not desc:
                        desc = f"无标题_{post['aweme_id']}"
                    else:
                        desc = desc.split()[0]  # 只取第一个词
                    
                    name = f"{_nickname}/{desc}"
                    aweme_id = post['aweme_id']
                    
                    # 发送当前下载进度 - 开始下载
                    overall_progress = int(((i - 1) / total_videos) * 100)
                    socketio.emit('user_video_download_progress', {
                        'task_id': task_id,
                        'total_videos': total_videos,
                        'current_downloaded': i - 1,
                        'remaining': total_videos - i + 1,
                        'overall_progress': overall_progress,
                        'current_video': {
                            'title': desc,
                            'status': 'starting'
                        },
                        'message': f'正在下载第 {i}/{total_videos} 个作品: {desc}',
                        'type': 'progress'
                    })
                    
                    # 下载当前视频
                    try:
                        if not urls:
                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'current_video': {
                                    'title': desc,
                                    'aweme_id': aweme_id,
                                    'progress': 0,
                                    'status': 'error'
                                },
                                'message': f'无法获取媒体URL: {desc}',
                                'type': 'error'
                            })
                            continue
                        
                        # 发送下载中进度 - 简化信息
                        overall_progress = int(((i - 0.5) / total_videos) * 100)
                        socketio.emit('user_video_download_progress', {
                            'task_id': task_id,
                            'total_videos': total_videos,
                            'current_downloaded': i - 1,
                            'remaining': total_videos - i + 1,
                            'overall_progress': overall_progress,
                            'type': 'progress'
                        })
                        
                        success = False
                        if media_type == 'mixed':
                            # 分别下载Live Photo和普通图片
                            live_urls = [{'url': url, 'type': 'live_photo'} for t, url in urls if t == 'live_photo']
                            img_urls = [{'url': url, 'type': 'image'} for t, url in urls if t == 'image']
                            
                            success = True
                            if live_urls:
                                success &= user_manager.downloader.download_media_group(live_urls, name, None)
                            if img_urls:
                                success &= user_manager.downloader.download_media_group(img_urls, name, None)
                        elif media_type in ['live_photo', 'image']:
                            formatted_urls = [{'url': url, 'type': media_type} for url in urls]
                            success = user_manager.downloader.download_media_group(formatted_urls, name, aweme_id)
                        elif media_type == 'video':
                            success = user_manager.downloader.download_video(urls[0], name, aweme_id)
                        
                        if success:
                            user_manager.downloader._save_download_record(nickname, aweme_id)
                            # 发送单个作品下载完成
                            overall_progress = int((i / total_videos) * 100)
                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'total_videos': total_videos,
                                'current_downloaded': i,
                                'remaining': total_videos - i,
                                'overall_progress': overall_progress,
                                'message': f'作品 {desc} 下载完成 ({i}/{total_videos})',
                                'type': 'success'
                            })
                        else:
                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'current_video': {
                                    'title': desc,
                                    'aweme_id': aweme_id,
                                    'progress': 0,
                                    'status': 'failed'
                                },
                                'message': f'作品 {desc} 下载失败',
                                'type': 'error'
                            })
                    
                    except Exception as video_error:
                        socketio.emit('user_video_download_progress', {
                            'task_id': task_id,
                            'current_video': {
                                'title': desc,
                                'aweme_id': aweme_id,
                                'progress': 0,
                                'status': 'error'
                            },
                            'message': f'下载作品 {desc} 时出错: {str(video_error)}',
                            'type': 'error'
                        })
                
                # 更新任务状态
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                # 发送完成信号
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'total_videos': total_videos,
                    'current_downloaded': total_videos,
                    'remaining': 0,
                    'message': f'用户 {nickname} 的所有视频下载完成'
                })
                
            except Exception as e:
                download_tasks[task_id]['status'] = 'failed'
                download_tasks[task_id]['error'] = str(e)
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_failed', {
                    'task_id': task_id,
                    'error': str(e),
                    'message': f'下载失败: {str(e)}'
                })
            finally:
                loop.close()
        
        thread = threading.Thread(target=run_download, daemon=True)
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '用户视频下载任务已开始'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/download_liked', methods=['POST'])
def download_liked():
    """下载点赞视频"""
    try:
        if not Config.COOKIE:
            return jsonify({'success': False, 'message': '下载点赞视频需要设置Cookie'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先初始化'}), 400
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        download_tasks[task_id] = {
            'status': 'running',
            'type': 'liked_videos',
            'start_time': datetime.now()
        }
        
        # 在新线程中运行下载任务
        def run_download():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'type': 'liked_videos'
                })
                
                loop.run_until_complete(user_manager.download_liked_videos())
                
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'message': '点赞视频下载完成'
                })
                
            except Exception as e:
                download_tasks[task_id]['status'] = 'failed'
                download_tasks[task_id]['error'] = str(e)
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_failed', {
                    'task_id': task_id,
                    'error': str(e)
                })
            finally:
                loop.close()
        
        thread = threading.Thread(target=run_download, daemon=True)
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '点赞视频下载任务已开始'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/video_detail', methods=['POST'])
def get_video_detail():
    """获取视频详情"""
    try:
        data = request.json
        aweme_id = data.get('aweme_id', '').strip()
        
        if not aweme_id:
            return jsonify({'success': False, 'message': '视频ID不能为空'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        def run_get_detail():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(user_manager.get_video_detail(aweme_id))
                return result
            except Exception as e:
                logger.error(f" get_video_detail异常: {str(e)}")
                return None
            finally:
                loop.close()
        
        video_detail = run_get_detail()
        
        if video_detail:
            # 使用与get_user_videos相同的逻辑提取媒体信息
            def get_media_info(post):
                """获取媒体信息和URL数组"""
                if post.get("images"):
                    images = post.get("images", [])
                    urls = []
                    has_live = False
                    has_image = False

                    for img in images:
                        # Live Photo特征：包含video字段且有play_addr
                        if img.get("video") and img["video"].get("play_addr"):
                            has_live = True
                            urls.append({
                                'type': 'live_photo',
                                'url': img["video"]["play_addr"]["url_list"][0]
                            })
                        else:
                            has_image = True
                            # 普通图片使用url_list的最后一个URL（通常是最高质量的）
                            urls.append({
                                'type': 'image',
                                'url': img["url_list"][-1]
                            })

                    # 如果同时包含Live Photo和普通图片，返回mixed类型
                    if has_live and has_image:
                        return 'mixed', urls
                    elif has_live:
                        return 'live_photo', urls
                    else:
                        return 'image', urls
                    
                elif post.get("video"):
                    # 视频类型
                    video_url = post.get("video", {}).get("play_addr", {}).get("url_list", [""])[0]
                    if video_url:
                        return 'video', [{'type': 'video', 'url': video_url}]
                    else:
                        return 'unknown', []

                # 默认返回空
                return 'unknown', []
            
            # 提取媒体信息
            media_type, media_urls = get_media_info(video_detail)
            
            # 在视频详情中添加媒体信息
            video_detail['media_type'] = media_type
            video_detail['media_urls'] = media_urls
            video_detail['media_count'] = len(media_urls)
            
            logger.debug(f" 视频详情 {video_detail.get('aweme_id', 'unknown')} 媒体信息:")
            logger.debug(f"   - 媒体类型: {media_type}")
            logger.debug(f"   - 媒体数量: {len(media_urls)}")
            logger.debug(f"   - 原始视频数据结构:")
            logger.debug(f"     - 是否有images字段: {'images' in video_detail}")
            logger.debug(f"     - 是否有video字段: {'video' in video_detail}")
            if 'images' in video_detail:
                logger.debug(f"     - images数量: {len(video_detail.get('images', []))}")
            if 'video' in video_detail:
                video_data = video_detail.get('video', {})
                logger.debug(f"     - video.play_addr存在: {'play_addr' in video_data}")
                if 'play_addr' in video_data:
                    play_addr = video_data.get('play_addr', {})
                    logger.debug(f"     - play_addr.url_list存在: {'url_list' in play_addr}")
                    if 'url_list' in play_addr:
                        url_list = play_addr.get('url_list', [])
                        logger.debug(f"     - url_list长度: {len(url_list)}")
                        if url_list:
                            logger.debug(f"     - 第一个URL: {url_list[0][:100]}...")
            for idx, url_info in enumerate(media_urls):
                logger.debug(f"   - 媒体{idx+1}: {url_info.get('type', 'unknown')}")
                logger.debug(f"     完整URL: {url_info.get('url', 'no_url')[:100]}...")
            
            return jsonify({
                'success': True,
                'video': video_detail
            })
        else:
            return jsonify({'success': False, 'message': '获取视频详情失败'}), 404
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'获取视频详情失败: {str(e)}'}), 500

@app.route('/api/parse_link', methods=['POST'])
def parse_link():
    """解析抖音链接"""
    try:
        data = request.json
        link = data.get('link', '').strip()
        
        if not link:
            return jsonify({'success': False, 'message': '链接不能为空'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        def run_parse_link():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # 解析链接获取视频信息
                video_info = loop.run_until_complete(user_manager.parse_share_link(link))
                if not video_info:
                    return None, None
                
                # 获取作者的详细信息
                author_sec_uid = video_info.get('author', {}).get('sec_uid', '')
                user_detail = None
                if author_sec_uid:
                    user_detail = loop.run_until_complete(user_manager.get_user_detail(author_sec_uid))
                    user_detail = {
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
                return video_info, user_detail
            except Exception as e:
                logger.error(f" parse_link异常: {str(e)}")
                return None, None
            finally:
                loop.close()
        
        video_info, user_detail = run_parse_link()
        
        if video_info:
            # 格式化视频数据
            formatted_video = {
                'author': video_info.get('author', {}),
                'aweme_id': video_info.get('aweme_id', ''),
                'comment_count': video_info.get('comment_count', 0),
                'cover_url': video_info.get('cover_url', ''),
                'create_time': video_info.get('create_time', 0),
                'desc': video_info.get('desc', ''),
                'digg_count': video_info.get('digg_count', 0),
                'media_type': video_info.get('media_type', ''),
                'media_urls': video_info.get('media_urls', []),
                'share_count': video_info.get('share_count', 0)
            }
            
            # 返回包含作者详细信息和作品信息的数据结构
            response_data = {
                'success': True,
                'type': 'link_parse',
                'video': formatted_video,  # 单个视频信息
                'videos': [formatted_video]  # 兼容原有格式
            }
            
            # 如果获取到作者详细信息，添加到响应中
            if user_detail:
                response_data['user'] = user_detail
            
            return jsonify(response_data)
        else:
            return jsonify({'success': False, 'message': '解析链接失败，请检查链接是否有效'}), 404
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'解析链接失败: {str(e)}'}), 500

@app.route('/api/download_liked_authors', methods=['POST'])
def download_liked_authors():
    """下载点赞作者作品"""
    try:
        if not Config.COOKIE:
            return jsonify({'success': False, 'message': '下载点赞作者作品需要设置Cookie'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先初始化'}), 400
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        download_tasks[task_id] = {
            'status': 'running',
            'type': 'liked_authors',
            'start_time': datetime.now()
        }
        
        # 在新线程中运行下载任务
        def run_download():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'type': 'liked_authors'
                })
                
                loop.run_until_complete(user_manager.download_liked_authors())
                
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'message': '点赞作者作品下载完成'
                })
                
            except Exception as e:
                download_tasks[task_id]['status'] = 'failed'
                download_tasks[task_id]['error'] = str(e)
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_failed', {
                    'task_id': task_id,
                    'error': str(e)
                })
            finally:
                loop.close()
        
        thread = threading.Thread(target=run_download, daemon=True)
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '点赞作者作品下载任务已开始'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取下载任务列表"""
    return jsonify({
        'success': True,
        'tasks': download_tasks
    })

@socketio.on('connect')
def handle_connect():
    """客户端连接"""
    logger.debug("客户端已连接")
    emit('connected', {'message': '连接成功'})

@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接"""
    logger.debug("客户端已断开连接")

@socketio.on('test_connection')
def handle_test_connection(data):
    """测试WebSocket连接"""
    logger.debug(f"收到测试连接请求: {data}")
    # 直接向发送请求的客户端回复
    emit('test_response', {'message': '连接测试成功', 'received': data})
    # 同时广播一条消息给所有客户端
    socketio.emit('broadcast_message', {'message': '服务器广播测试消息', 'time': datetime.now().strftime('%H:%M:%S')})

# 添加一个定时发送心跳的函数
def send_heartbeat():
    """定时发送心跳消息"""
    logger.debug("发送WebSocket心跳消息")
    socketio.emit('heartbeat', {'timestamp': datetime.now().strftime('%H:%M:%S')})
    


def main():
    """启动Web服务"""
    import os
    import webbrowser
    import threading
    import time
    
    # 先初始化socketio，然后再初始化应用
    logger.info("启动抖音下载器Web服务...")
    
    # 从环境变量获取端口，默认为5001
    port = int(os.environ.get('PORT', 5001))
    url = f"http://localhost:{port}"
    logger.info(f"访问地址: {url}")
    
    # 初始化应用
    init_app()
    
    # 延迟打开浏览器的函数
    def open_browser():
        time.sleep(1.5)  # 等待服务器启动
        try:
            webbrowser.open(url)
            logger.info(f"已自动打开浏览器: {url}")
        except Exception as e:
            logger.warning(f"自动打开浏览器失败: {str(e)}")
    
    # 在新线程中打开浏览器
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # 启动socketio服务
    socketio.run(app, host='0.0.0.0', port=port, debug=False)

if __name__ == '__main__':
    main()