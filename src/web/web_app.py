import platform
import os

IS_WINDOWS = platform.system().lower() == 'windows'
IS_MACOS = platform.system().lower() == 'darwin'

# macOS + pywebview 时跳过 gevent patch，避免与 Cocoa 运行循环冲突
if not IS_WINDOWS and not (IS_MACOS and os.environ.get('USE_PYWEBVIEW') == '1'):
    from gevent import monkey
    monkey.patch_all()

from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit
import asyncio
import threading
import sys
import json
import uuid
import logging
import subprocess
import shutil
import requests as http_requests
from datetime import datetime
from pathlib import Path

# 配置日志
logging.basicConfig(level=logging.DEBUG if os.environ.get('DEBUG_MODE', '').lower() in ('true', '1') else logging.INFO,
                    format='[%(levelname)s] %(message)s')
logger = logging.getLogger('web_app')
socketio_debug = os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes')

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config.config import Config, get_resource_path
from src.api.api import DouyinAPI
from src.downloader.downloader import DouyinDownloader
from src.user.user_manager import DouyinUserManager

# 移除增强下载器支持
ENHANCED_DOWNLOADER_AVAILABLE = False
EnhancedDouyinDownloader = None

app = Flask(__name__, template_folder=get_resource_path('src/web/templates'), static_folder=get_resource_path('src/web/static'))
app.config['SECRET_KEY'] = 'douyin_downloader_secret_key'
socketio_async_mode = 'threading' if IS_WINDOWS else 'gevent'
# 修改SocketIO初始化，添加更多选项
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode=socketio_async_mode,
    logger=socketio_debug,
    engineio_logger=socketio_debug,
    ping_timeout=60,  # 增加ping超时时间
    ping_interval=25  # 增加ping间隔
)

# 全局变量
api = None
downloader = None
user_manager = None
download_tasks = {} # 用于存储任务状态和元数据（同步Dict）
active_tasks = {} # 用于存储活跃的 asyncio.Future 和 asyncio.Event

# 全局 Loop 处理
_global_loop = None
_loop_thread = None


def get_download_root() -> Path:
    """返回实际下载根目录。"""
    return Path(Config.DOWNLOAD_DIR).resolve()


def get_all_download_roots() -> list[Path]:
    """返回当前及历史下载目录列表。"""
    roots = []
    seen = set()

    for raw_path in [Config.DOWNLOAD_DIR, *getattr(Config, 'HISTORY_DIRS', [])]:
        if not raw_path:
            continue
        path = Path(raw_path).resolve()
        key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        roots.append(path)

    return roots


def get_root_for_path(candidate: Path) -> Path | None:
    """返回某个下载文件所属的根目录。"""
    for root in get_all_download_roots():
        if _is_subpath(candidate, root):
            return root
    return None


def _is_subpath(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _safe_history_path(raw_path: str) -> Path:
    if not raw_path:
        raise ValueError('路径不能为空')

    candidate = Path(raw_path).expanduser().resolve()
    roots = get_all_download_roots()
    if not any(_is_subpath(candidate, root) for root in roots):
        raise ValueError('目标路径不在下载目录范围内')
    return candidate


def build_download_history() -> list[dict]:
    items = []
    for root in get_all_download_roots():
        if not root.exists():
            continue

        for path in root.rglob('*'):
            if not path.is_file():
                continue
            if path.name == 'download_record.json':
                continue

            stat = path.stat()
            rel_path = path.relative_to(root)
            parts = rel_path.parts
            author = parts[0] if len(parts) > 1 else ''

            items.append({
                'name': path.name,
                'path': str(path),
                'relative_path': str(rel_path),
                'root_path': str(root),
                'author': author,
                'size': stat.st_size,
                'modified_at': int(stat.st_mtime),
                'extension': path.suffix.lower(),
            })

    items.sort(key=lambda item: item['modified_at'], reverse=True)
    return items


def move_directory_contents(source_dir: Path, target_dir: Path) -> int:
    """将源目录中的内容合并移动到目标目录。"""
    moved_count = 0
    if not source_dir.exists() or not source_dir.is_dir():
        return moved_count

    target_dir.mkdir(parents=True, exist_ok=True)

    for child in source_dir.iterdir():
        destination = target_dir / child.name
        if destination.exists():
            if child.is_dir() and destination.is_dir():
                moved_count += move_directory_contents(child, destination)
                try:
                    child.rmdir()
                except OSError:
                    pass
                continue

            stem = destination.stem
            suffix = destination.suffix
            counter = 1
            while destination.exists():
                destination = target_dir / f"{stem}_{counter}{suffix}"
                counter += 1

        shutil.move(str(child), str(destination))
        moved_count += 1

    return moved_count


def _unique_destination_path(destination: Path) -> Path:
    if not destination.exists():
        return destination

    stem = destination.stem
    suffix = destination.suffix
    counter = 1
    candidate = destination
    while candidate.exists():
        candidate = destination.parent / f"{stem}_{counter}{suffix}"
        counter += 1
    return candidate

def safe_get_url(obj, default=''):
    """安全地从 obj['url_list'] 中获取 URL，避免索引越界"""
    if not obj:
        return default
    url_list = obj.get('url_list', [])
    if not url_list:
        return default
    return url_list[0] if url_list else default


def infer_media_type_from_url(url, fallback_type='video'):
    """根据 URL 粗略推断媒体类型，用于兼容旧前端传入的字符串数组。"""
    normalized_fallback = fallback_type if fallback_type in ('video', 'image', 'live_photo') else 'video'
    if not isinstance(url, str) or not url:
        return normalized_fallback

    clean_url = url.split('?', 1)[0].lower()
    if clean_url.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif')):
        return 'image'
    if clean_url.endswith(('.mp4', '.mov', '.m4v', '.webm')):
        return 'video'
    return normalized_fallback


def normalize_media_urls(media_urls, raw_media_type='video'):
    """统一媒体数据结构为 [{'url': str, 'type': str}]。"""
    if not isinstance(media_urls, list):
        raise ValueError(f"媒体URL格式错误: {type(media_urls)}")

    fallback_type = raw_media_type if raw_media_type in ('video', 'image', 'live_photo') else 'video'
    normalized_urls = []

    for item in media_urls:
        if isinstance(item, dict):
            url = str(item.get('url', '')).strip()
            if not url:
                continue
            normalized_urls.append({
                'url': url,
                'type': item.get('type') or infer_media_type_from_url(url, fallback_type)
            })
            continue

        if isinstance(item, str):
            url = item.strip()
            if not url:
                continue
            normalized_urls.append({
                'url': url,
                'type': infer_media_type_from_url(url, fallback_type)
            })
            continue

        logger.warning(f"跳过不支持的媒体URL项: {item}")

    return normalized_urls


def get_or_create_loop():
    global _global_loop, _loop_thread
    if _global_loop is None:
        _global_loop = asyncio.new_event_loop()
        _loop_thread = threading.Thread(target=_global_loop.run_forever, daemon=True)
        _loop_thread.start()
        logger.info("Global asyncio loop started in background thread")
    return _global_loop

def run_async(coro):
    """在全局循环中运行异步任务并等待结果"""
    import sys
    sys.stderr.write(f'[run_async] 开始执行 coro={coro}\n')
    sys.stderr.flush()
    loop = get_or_create_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    result = future.result()
    return result

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
        
        # 启动全局 Loop
        get_or_create_loop()
        
        logger.info("Web应用初始化完成")
    except Exception as e:
        logger.error(f"Web应用初始化失败: {str(e)}")

@app.route('/')
def index():
    """主页"""
    return render_template('index.html', socketio_async_mode=socketio.async_mode)


@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置信息"""
    # 注意：Cookie只在localhost环境下返回给前端回显，不应在公网暴露
    return jsonify({
        'cookie_set': bool(Config.COOKIE),
        'download_dir': Config.BASE_DIR,
        'download_root': str(get_download_root()),
        'download_roots': [str(root) for root in get_all_download_roots()],
        'cookie': Config.COOKIE if Config.COOKIE else ''
    })

@app.route('/api/config', methods=['POST'])
def set_config():
    """设置配置"""
    global api, downloader, user_manager
    try:
        data = request.json
        previous_download_dir = str(get_download_root())
        previous_all_roots = [str(root) for root in get_all_download_roots()]
        
        if 'cookie' in data:
            Config.COOKIE = data['cookie'].replace('\n', '').replace('\r', '').strip()
        if 'download_dir' in data:
            Config.BASE_DIR = data['download_dir']
            Config.DOWNLOAD_DIR = Config.BASE_DIR

        move_existing_files = bool(data.get('move_existing_files'))
        history_dirs = list(getattr(Config, 'HISTORY_DIRS', []))
        new_download_dir = str(get_download_root())

        if previous_download_dir.lower() != new_download_dir.lower():
            if move_existing_files:
                moved_count = 0
                for old_root in previous_all_roots:
                    if os.path.abspath(old_root).lower() == os.path.abspath(new_download_dir).lower():
                        continue
                    moved_count += move_directory_contents(Path(old_root), Path(new_download_dir))

                history_dirs = [
                    path for path in history_dirs
                    if os.path.abspath(path).lower() not in {
                        os.path.abspath(root).lower() for root in previous_all_roots
                    }
                ]
            else:
                moved_count = 0
                history_dirs.extend(previous_all_roots)
        else:
            moved_count = 0

        Config.HISTORY_DIRS = Config.normalize_history_dirs(history_dirs)
        Config.save_config(Config.COOKIE, Config.BASE_DIR, Config.HISTORY_DIRS)
        
        # 重新初始化API和下载器
        init_app()
        
        return jsonify({
            'success': True,
            'message': '配置保存成功',
            'moved_count': moved_count,
            'download_root': str(get_download_root()),
            'download_roots': [str(root) for root in get_all_download_roots()]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'配置保存失败: {str(e)}'}), 500


@app.route('/api/select_directory', methods=['POST'])
def select_directory():
    """打开系统文件夹选择器，返回用户选择的路径"""
    try:
        initial_dir = Config.BASE_DIR or os.path.expanduser('~')

        if IS_WINDOWS:
            from tkinter import Tk, filedialog

            root = Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            directory = filedialog.askdirectory(
                initialdir=initial_dir,
                title='选择下载目录'
            )
            root.destroy()

            if directory:
                return jsonify({'success': True, 'path': directory})
            return jsonify({'success': False, 'message': '用户取消选择'})

        import subprocess

        script = f'''
        tell application "System Events"
            activate
            set selected_folder to choose folder with prompt "选择下载目录:" default location POSIX file "{initial_dir}"
            return POSIX path of selected_folder
        end tell
        '''

        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode == 0 and result.stdout.strip():
            directory = result.stdout.strip()
            return jsonify({'success': True, 'path': directory})
        return jsonify({'success': False, 'message': '用户取消选择'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'选择失败：{str(e)}'}), 500


@app.route('/api/download_history', methods=['GET'])
def get_download_history():
    """获取下载历史文件列表。"""
    try:
        root = get_download_root()
        return jsonify({
            'success': True,
            'download_root': str(root),
            'download_roots': [str(item) for item in get_all_download_roots()],
            'base_dir': Config.BASE_DIR,
            'items': build_download_history()
        })
    except Exception as e:
        logger.error(f"获取下载历史失败: {str(e)}")
        return jsonify({'success': False, 'message': f'获取下载历史失败: {str(e)}'}), 500


@app.route('/api/download_history/open', methods=['POST'])
def open_download_history_file():
    """打开下载文件。"""
    try:
        data = request.json or {}
        file_path = _safe_history_path(data.get('path', ''))
        if not file_path.exists() or not file_path.is_file():
            return jsonify({'success': False, 'message': '文件不存在'}), 404

        if IS_WINDOWS:
            os.startfile(str(file_path))
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', str(file_path)])
        else:
            subprocess.Popen(['xdg-open', str(file_path)])

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"打开下载文件失败: {str(e)}")
        return jsonify({'success': False, 'message': f'打开下载文件失败: {str(e)}'}), 500


@app.route('/api/download_history/open_location', methods=['POST'])
def open_download_history_location():
    """打开文件所在目录。"""
    try:
        data = request.json or {}
        file_path = _safe_history_path(data.get('path', ''))
        if not file_path.exists():
            return jsonify({'success': False, 'message': '文件不存在'}), 404

        open_dir = file_path if file_path.is_dir() else file_path.parent

        if IS_WINDOWS:
            if file_path.is_dir():
                subprocess.Popen(['explorer.exe', os.path.normpath(str(open_dir))])
            else:
                normalized_path = os.path.normpath(str(file_path))
                subprocess.Popen(['explorer.exe', '/select,', normalized_path])
        elif sys.platform == 'darwin':
            if file_path.is_dir():
                subprocess.Popen(['open', str(open_dir)])
            else:
                subprocess.Popen(['open', '-R', str(file_path)])
        else:
            subprocess.Popen(['xdg-open', str(open_dir)])

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"打开文件位置失败: {str(e)}")
        return jsonify({'success': False, 'message': f'打开文件位置失败: {str(e)}'}), 500


@app.route('/api/download_history/delete', methods=['POST'])
def delete_download_history_files():
    """删除下载文件，支持批量。"""
    try:
        data = request.json or {}
        raw_paths = data.get('paths') or []
        if not isinstance(raw_paths, list) or not raw_paths:
            return jsonify({'success': False, 'message': '请选择至少一个文件'}), 400

        deleted = []
        missing = []

        for raw_path in raw_paths:
            try:
                file_path = _safe_history_path(str(raw_path))
            except ValueError:
                missing.append(str(raw_path))
                continue

            if not file_path.exists() or not file_path.is_file():
                missing.append(str(file_path))
                continue

            file_path.unlink()
            deleted.append(str(file_path))

            parent = file_path.parent
            root = get_download_root()
            while parent != root and parent.exists():
                try:
                    next(parent.iterdir())
                    break
                except StopIteration:
                    parent.rmdir()
                    parent = parent.parent

        return jsonify({
            'success': True,
            'deleted_count': len(deleted),
            'missing_count': len(missing),
            'deleted': deleted,
            'missing': missing
        })
    except Exception as e:
        logger.error(f"删除下载文件失败: {str(e)}")
        return jsonify({'success': False, 'message': f'删除下载文件失败: {str(e)}'}), 500


@app.route('/api/download_history/move_selected', methods=['POST'])
def move_selected_download_history_files():
    """将选中的下载文件迁移到新的下载目录。"""
    try:
        data = request.json or {}
        raw_paths = data.get('paths') or []
        target_dir_raw = (data.get('target_dir') or '').strip()

        if not isinstance(raw_paths, list) or not raw_paths:
            return jsonify({'success': False, 'message': '请选择至少一个文件'}), 400
        if not target_dir_raw:
            return jsonify({'success': False, 'message': '目标目录不能为空'}), 400

        target_dir = Path(target_dir_raw).expanduser().resolve()
        target_dir.mkdir(parents=True, exist_ok=True)

        moved = []
        missing = []

        for raw_path in raw_paths:
            try:
                file_path = _safe_history_path(str(raw_path))
            except ValueError:
                missing.append(str(raw_path))
                continue

            if not file_path.exists() or not file_path.is_file():
                missing.append(str(file_path))
                continue

            root = get_root_for_path(file_path)
            if root is None:
                missing.append(str(file_path))
                continue

            relative_path = file_path.relative_to(root)
            destination = _unique_destination_path(target_dir / relative_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(file_path), str(destination))
            moved.append(str(destination))

            parent = file_path.parent
            while parent != root and parent.exists():
                try:
                    next(parent.iterdir())
                    break
                except StopIteration:
                    parent.rmdir()
                    parent = parent.parent

        Config.HISTORY_DIRS = Config.normalize_history_dirs([
            *getattr(Config, 'HISTORY_DIRS', []),
            *(str(root) for root in get_all_download_roots() if str(root).lower() != str(target_dir).lower())
        ])
        Config.BASE_DIR = str(target_dir)
        Config.DOWNLOAD_DIR = Config.BASE_DIR
        Config.save_config(Config.COOKIE, Config.BASE_DIR, Config.HISTORY_DIRS)
        init_app()

        return jsonify({
            'success': True,
            'moved_count': len(moved),
            'missing_count': len(missing),
            'moved': moved,
            'missing': missing,
            'download_root': str(get_download_root())
        })
    except Exception as e:
        logger.error(f"迁移选中文件失败: {str(e)}")
        return jsonify({'success': False, 'message': f'迁移选中文件失败: {str(e)}'}), 500
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

@app.route('/api/open_verify_browser', methods=['POST'])
def open_verify_browser():
    """使用系统默认浏览器直接打开抖音，让用户完成验证"""
    import webbrowser

    try:
        # 直接打开抖音官网
        webbrowser.open('https://www.douyin.com/')
        return jsonify({'success': True, 'message': '已打开抖音官网，请完成验证'})

    except Exception as e:
        logger.error(f"打开验证浏览器失败：{str(e)}")
        return jsonify({'success': False, 'message': f'无法打开浏览器：{str(e)}'}), 500

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
        
        # 使用全局 run_async 运行异步任务
        users = run_async(user_manager.search_user(keyword))

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
        
        # 使用全局 run_async 运行异步任务
        user_detail = run_async(user_manager.get_user_detail(sec_uid))
        
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
        videos = run_async(user_manager.get_liked_videos(count))
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

        authors = run_async(user_manager.get_liked_authors(count))

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
            return run_async(
                user_manager.api.common_request('/aweme/v1/web/aweme/post/', params, {}, skip_sign=True)
            )

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
                cover_url = safe_get_url(video['video']['cover'])
            elif video.get('images'):
                cover_url = safe_get_url(video['images'][0])
            media_type, media_urls = user_manager.get_media_info(video)

            # 提取 BGM 信息
            bgm_url = None
            if video.get('music'):
                music_data = video['music']
                # 尝试多个可能的字段
                bgm_url = safe_get_url(music_data.get('play_url', {}))
                if not bgm_url:
                    # 尝试 play_url 的直接 URL 字段
                    bgm_url = music_data.get('play_url', '') if isinstance(music_data.get('play_url'), str) else None
                if not bgm_url:
                    # 尝试 music_file 字段
                    bgm_url = safe_get_url(music_data.get('music_file', {}))
                if not bgm_url:
                    # 尝试 h5_url 或 web_url
                    bgm_url = music_data.get('h5_url', '') or music_data.get('web_url', '')

                # 调试模式输出 music 数据结构
                if os.environ.get('DEBUG_MODE', '').lower() in ('true', '1', 'yes'):
                    logger.debug(f"Music 数据结构：{json.dumps(music_data, ensure_ascii=False)[:500]}")
            elif video.get('video') and video['video'].get('play_addr'):
                # 如果没有独立音乐，使用视频的播放地址作为 BGM
                bgm_url = safe_get_url(video['video']['play_addr'])

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
                'bgm_url': bgm_url,
                'author': {
                    'nickname': video.get('author', {}).get('nickname', ''),
                    'avatar_thumb': safe_get_url(video.get('author', {}).get('avatar_thumb', {}))
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

        media_urls = normalize_media_urls(media_urls, raw_media_type)
        if not media_urls:
            return jsonify({'success': False, 'message': '没有有效的媒体URL'}), 400

        task_id = str(uuid.uuid4())

        # 在全局 Loop 中运行下载任务
        async def do_single_download():
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
                    })
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
                urls = media_urls
                
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
                pass

        loop = get_or_create_loop()
        asyncio.run_coroutine_threadsafe(do_single_download(), loop)

        return jsonify({'success': True, 'task_id': task_id, 'message': '下载任务已启动'})

    except Exception as e:
        return jsonify({'success': False, 'message': f'下载启动失败: {str(e)}'}), 500



@app.route('/api/download_user_video', methods=['POST'])
def download_user_video():
    """通过sec_uid下载用户所有视频，支持WebSocket进度反馈"""
    logger.debug("Received download_user_video request")
    try:
        data = request.json
        sec_uid = data.get('sec_uid')
        nickname = data.get('nickname', '')  # 前端传来，跳过详情接口
        aweme_count = int(data.get('aweme_count', 0)) # 获取作品总数

        if not sec_uid:
            return jsonify({'success': False, 'message': 'sec_uid参数不能为空'}), 400
        
        if not user_manager:
            return jsonify({'success': False, 'message': '请先设置Cookie'}), 400
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        cancel_event = asyncio.Event()
        pause_event = asyncio.Event()  # 暂停事件，默认不暂停
        
        # 在全局 Loop 中运行异步下载协程
        async def do_download_task():
            try:
                # 使用前端传来的nickname，不再调用get_user_detail

                _nickname = nickname if nickname else 'unknown'
                
                # 发送开始信号
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'user': _nickname,
                    'sec_uid': sec_uid
                })
                
                # 获取已下载记录
                downloaded = user_manager.downloader._load_download_record(_nickname)
                
                # 增量下载队列
                download_queue = asyncio.Queue()
                fetching_done = asyncio.Event()
                total_discovered = [0]
                total_processed = [0] # 包含已跳过的
                total_videos = aweme_count # 初始总量
                
                # 发送初始总量信息
                if total_videos > 0:
                    socketio.emit('download_info', {
                        'task_id': task_id,
                        'total_videos': total_videos,
                        'current_downloaded': 0,
                        'remaining': total_videos,
                        'message': f'准备开始下载，共发现 {total_videos} 个作品'
                    })

                def on_batch(batch):
                    if cancel_event.is_set():
                        return
                    for post in batch:
                        if post['aweme_id'] in downloaded:
                            total_processed[0] += 1
                            # 发送跳过进度更新
                            overall_progress = int((total_processed[0] / max(total_videos, total_processed[0], 1)) * 100)
                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'total_videos': max(total_videos, total_processed[0]),
                                'current_downloaded': total_processed[0],
                                'remaining': max(total_videos - total_processed[0], 0),
                                'overall_progress': overall_progress,
                                'message': f'跳过已下载: {post.get("desc", post["aweme_id"])[:10]}...',
                                'type': 'progress'
                            })
                        else:
                            download_queue.put_nowait(post)
                            total_discovered[0] += 1
                    
                    # 更新总量感
                    current_total = max(total_videos, total_processed[0] + download_queue.qsize())
                    socketio.emit('download_info', {
                        'task_id': task_id,
                        'total_videos': current_total,
                        'current_downloaded': total_processed[0],
                        'remaining': current_total - total_processed[0],
                        'message': f'正在抓取作品列表... 已发现 {total_discovered[0]} 个新作品'
                    })

                async def downloader_consumer():
                    while not (fetching_done.is_set() and download_queue.empty()):
                        # 检查取消
                        if cancel_event.is_set():
                            logger.info(f"Task {task_id} consumer cancelled")
                            # 清空队列
                            while not download_queue.empty():
                                try:
                                    download_queue.get_nowait()
                                except:
                                    break
                            break

                        # 检查暂停 - 如果暂停事件被设置，则等待恢复
                        if pause_event.is_set():
                            # 发送暂停状态
                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'message': '已暂停',
                                'type': 'info'
                            })
                            # 等待 pause_event 被清除（恢复）
                            while pause_event.is_set() and not cancel_event.is_set():
                                await asyncio.sleep(0.5)

                        try:
                            # 等待队列中的新作品
                            post = await asyncio.wait_for(download_queue.get(), timeout=1.0)
                        except asyncio.TimeoutError:
                            continue

                        # 检查取消信号（开始下载前）
                        if cancel_event.is_set():
                            logger.info(f"Task {task_id} cancelled before download")
                            break

                        total_processed[0] += 1
                        idx = total_processed[0]
                        
                        media_type, urls = user_manager._get_media_info(post)
                        desc = post.get('desc', '').strip()
                        if not desc:
                            desc = f"无标题_{post['aweme_id']}"
                        else:
                            desc = desc.split()[0][:15]
                        
                        name = f"{_nickname}/{desc}"
                        aweme_id = post['aweme_id']

                        def current_total_count():
                            return max(total_videos, total_processed[0] + download_queue.qsize(), idx)

                        def emit_current_video_progress(current_progress=0, status='downloading', message=None, current_downloaded=None,
                                                        completed_files=0, total_files=1, speed_bps=None, eta_seconds=None,
                                                        file_index=1, file_total=1, bytes_downloaded=0, bytes_total=0):
                            processed_count = idx - 1 if current_downloaded is None else current_downloaded
                            current_total = current_total_count()
                            progress_ratio = max(0, min(current_progress, 100)) / 100
                            overall_progress = int(((processed_count + progress_ratio) / max(current_total, 1)) * 100)

                            socketio.emit('user_video_download_progress', {
                                'task_id': task_id,
                                'total_videos': current_total,
                                'current_downloaded': processed_count,
                                'remaining': max(current_total - processed_count, 0),
                                'overall_progress': min(100, max(0, overall_progress)),
                                'current_progress': max(0, min(current_progress, 100)),
                                'message': message or f'正在下载: {desc}',
                                'type': 'progress',
                                'current_video': {
                                    'aweme_id': aweme_id,
                                    'desc': desc,
                                    'status': status,
                                    'progress': max(0, min(current_progress, 100)),
                                    'completed_files': completed_files,
                                    'total_files': total_files,
                                    'file_index': file_index,
                                    'file_total': file_total,
                                    'speed_bps': speed_bps,
                                    'eta_seconds': eta_seconds,
                                    'bytes_downloaded': bytes_downloaded,
                                    'bytes_total': bytes_total
                                }
                            })
                        
                        # 发送进度预览
                        emit_current_video_progress(
                            current_progress=0,
                            status='starting',
                            message=f'正在下载: {desc}',
                            current_downloaded=idx - 1,
                            completed_files=0,
                            total_files=1,
                            file_index=1,
                            file_total=1
                        )
                        
                        # 执行下载
                        try:
                            if not urls:
                                continue

                            success = False
                            def progress_callback(progress_data):
                                emit_current_video_progress(
                                    current_progress=progress_data.get('progress', 0),
                                    status=progress_data.get('status', 'downloading'),
                                    message=f'正在下载: {desc}',
                                    current_downloaded=idx - 1,
                                    completed_files=progress_data.get('completed', 0),
                                    total_files=progress_data.get('total', len(urls) if urls else 1),
                                    speed_bps=progress_data.get('speed_bps'),
                                    eta_seconds=progress_data.get('eta_seconds'),
                                    file_index=progress_data.get('file_index', 1),
                                    file_total=progress_data.get('file_total', len(urls) if urls else 1),
                                    bytes_downloaded=progress_data.get('bytes_downloaded', 0),
                                    bytes_total=progress_data.get('bytes_total', 0)
                                )

                            if media_type == 'video':
                                success = user_manager.downloader.download_video(
                                    urls[0], name, aweme_id, cancel_event,
                                    socketio=socketio, task_id=task_id, progress_callback=progress_callback
                                )
                            else:
                                formatted_urls = [{'url': url, 'type': media_type if media_type != 'mixed' else t} for t, url in (urls if isinstance(urls[0], tuple) else [(media_type, u) for u in urls])]
                                success = user_manager.downloader.download_media_group(
                                    formatted_urls, name, aweme_id, socketio, task_id, cancel_event, progress_callback
                                )

                            if success:
                                socketio.emit('download_success', {'task_id': task_id, 'message': f'作品 {desc} 下载完成'})
                                emit_current_video_progress(
                                    current_progress=100,
                                    status='completed',
                                    message=f'完成处理: {desc}',
                                    current_downloaded=idx,
                                    completed_files=len(urls),
                                    total_files=len(urls),
                                    file_index=len(urls),
                                    file_total=len(urls),
                                    eta_seconds=0
                                )

                            # 检查取消状态
                            if cancel_event.is_set():
                                logger.info(f"下载被用户取消: {task_id}")
                                break
                        except Exception as e:
                            logger.error(f"Download error for {aweme_id}: {e}")
                            
                        # 更新总进度
                        overall_progress = int((idx / max(total_videos, total_processed[0], 1)) * 100)
                        socketio.emit('user_video_download_progress', {
                            'task_id': task_id,
                            'total_videos': max(total_videos, total_processed[0] + download_queue.qsize()),
                            'current_downloaded': idx,
                            'remaining': max(total_videos, total_processed[0] + download_queue.qsize()) - idx,
                            'overall_progress': overall_progress,
                            'message': f'完成处理: {desc}',
                            'type': 'progress'
                        })

                # 获取视频抓取任务（需要能响应取消）
                fetch_coro = user_manager.get_user_videos(sec_uid, limit=1000, on_batch=on_batch)
                fetch_task = asyncio.create_task(fetch_coro)
                consume_task = asyncio.create_task(downloader_consumer())
                
                # 循环检查取消
                while not fetch_task.done():
                    if cancel_event.is_set():
                        fetch_task.cancel()
                        break
                    await asyncio.sleep(0.5)
                
                fetching_done.set()
                await consume_task
                
                if cancel_event.is_set():
                    download_tasks[task_id]['status'] = 'cancelled'
                    socketio.emit('download_cancelled', {'task_id': task_id, 'message': '下载任务已取消'})
                else:
                    download_tasks[task_id]['status'] = 'completed'
                    download_tasks[task_id]['end_time'] = datetime.now()
                    socketio.emit('download_completed', {
                        'task_id': task_id,
                        'message': f'用户 {_nickname} 的作品全部处理完成',
                        'total_videos': max(total_videos, total_processed[0]),
                        'current_downloaded': total_processed[0],
                        'remaining': 0
                    })
            except asyncio.CancelledError:
                download_tasks[task_id]['status'] = 'cancelled'
                socketio.emit('download_cancelled', {'task_id': task_id, 'message': '下载任务已取消'})
            except Exception as e:
                logger.error(f"Task {task_id} error: {e}")
                download_tasks[task_id]['status'] = 'failed'
                socketio.emit('download_failed', {'task_id': task_id, 'message': f'任务出错: {str(e)}'})
            finally:
                if task_id in active_tasks:
                    del active_tasks[task_id]

        # 启动任务
        loop = get_or_create_loop()
        future = asyncio.run_coroutine_threadsafe(do_download_task(), loop)
        
        # 记录任务
        download_tasks[task_id] = {
            'status': 'running',
            'sec_uid': sec_uid,
            'start_time': datetime.now()
        }
        active_tasks[task_id] = {
            "future": future,
            "event": cancel_event,
            "pause_event": pause_event
        }
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '用户视频下载任务已开始'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/cancel_download', methods=['POST'])
def cancel_download():
    """按任务ID取消下载"""
    data = request.json
    task_id = data.get('task_id')
    logger.info(f"Request to cancel task: {task_id}")
    
    if task_id in active_tasks:
        info = active_tasks[task_id]
        # 设置取消事件
        info["event"].set()
        # 取消 Future (这会尝试在循环中抛出 CancelledError)
        info["future"].cancel()
        return jsonify({'success': True, 'message': '正在取消任务...'})
    
    if task_id in download_tasks:
        download_tasks[task_id]['status'] = 'cancelled'
        return jsonify({'success': True, 'message': '任务已标记为取消'})
        
    return jsonify({'success': False, 'message': '未找到活跃任务'})

@app.route('/api/pause_download', methods=['POST'])
def pause_download():
    """按任务ID暂停下载"""
    data = request.json
    task_id = data.get('task_id')
    logger.info(f"Request to pause task: {task_id}")

    if task_id in active_tasks:
        info = active_tasks[task_id]
        if 'pause_event' in info:
            info['pause_event'].set()  # 设置暂停事件
            return jsonify({'success': True, 'message': '任务已暂停'})
        else:
            return jsonify({'success': False, 'message': '该任务不支持暂停'})

    return jsonify({'success': False, 'message': '未找到活跃任务'})

@app.route('/api/resume_download', methods=['POST'])
def resume_download():
    """按任务ID恢复下载"""
    data = request.json
    task_id = data.get('task_id')
    logger.info(f"Request to resume task: {task_id}")

    if task_id in active_tasks:
        info = active_tasks[task_id]
        if 'pause_event' in info:
            info['pause_event'].clear()  # 清除暂停事件
            return jsonify({'success': True, 'message': '任务已恢复'})
        else:
            return jsonify({'success': False, 'message': '该任务不支持恢复'})

    return jsonify({'success': False, 'message': '未找到活跃任务'})

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
        
        # 在全局 Loop 中运行异步下载协程
        async def do_download_liked():
            try:
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'type': 'liked_videos'
                })
                
                await user_manager.download_liked_videos()
                
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'message': '点赞视频下载完成'
                })
            except Exception as e:
                logger.error(f"Download liked error: {e}")
                download_tasks[task_id]['status'] = 'failed'
                socketio.emit('download_failed', {'task_id': task_id, 'message': f'任务出错: {str(e)}'})

        loop = get_or_create_loop()
        asyncio.run_coroutine_threadsafe(do_download_liked(), loop)
        
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

        video_detail = run_async(user_manager.get_video_detail(aweme_id))

        if not video_detail:
            logger.warning(f"视频详情为空，可能是视频不存在或 API 限流：aweme_id={aweme_id}")
            return jsonify({
                'success': False,
                'message': '获取视频详情失败，可能是视频不存在或抖音 API 限流，请尝试其他视频或重新登录'
            }), 404

        return jsonify({
            'success': True,
            'video': video_detail
        })
    except Exception as e:
        logger.error(f'获取视频详情异常: {str(e)}', exc_info=True)
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
            # 解析链接获取视频信息
            video_info = run_async(user_manager.parse_share_link(link))
            if not video_info:
                return None, None
            
            # 获取作者的详细信息
            author_sec_uid = video_info.get('author', {}).get('sec_uid', '')
            user_detail = None
            if author_sec_uid:
                user_detail = run_async(user_manager.get_user_detail(author_sec_uid))
                if user_detail:
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
        
        # 在全局 Loop 中运行异步下载协程
        async def do_download_liked_authors():
            try:
                socketio.emit('download_started', {
                    'task_id': task_id,
                    'type': 'liked_authors'
                })
                
                await user_manager.download_liked_authors()
                
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['end_time'] = datetime.now()
                
                socketio.emit('download_completed', {
                    'task_id': task_id,
                    'message': '点赞作者作品下载完成'
                })
            except Exception as e:
                logger.error(f"Download liked authors error: {e}")
                download_tasks[task_id]['status'] = 'failed'
                socketio.emit('download_failed', {'task_id': task_id, 'message': f'任务出错: {str(e)}'})

        loop = get_or_create_loop()
        asyncio.run_coroutine_threadsafe(do_download_liked_authors(), loop)
        
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

# ═══════════════════════════════════════════════
# COOKIE 浏览器登录
# ═══════════════════════════════════════════════
_cookie_login_proc = None  # 当前正在运行的 cookie 登录子进程

@app.route('/api/cookie/browser_login', methods=['POST'])
def cookie_browser_login():
    """启动 Playwright 浏览器让用户登录抖音，自动提取 Cookie"""
    global _cookie_login_proc
    
    if _cookie_login_proc and _cookie_login_proc.poll() is None:
        return jsonify({'success': False, 'message': '浏览器登录已在进行中'}), 409
    
    data = request.json or {}
    timeout = data.get('timeout', 300)
    browser_type = data.get('browser', 'chrome')
    
    def run_cookie_grab():
        global _cookie_login_proc, api, downloader, user_manager
        import subprocess
        
        from src.config.config import IS_FROZEN
        
        env = os.environ.copy()
        env['RUN_WORKER'] = 'cookie_grabber'
        env['PYTHONIOENCODING'] = 'utf-8'
        
        if IS_FROZEN:
            cmd = [sys.executable]  # 执行打包后的文件自身，通过环境变量进入分发器
        else:
            worker_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'api', 'cookie_grabber.py')
            cmd = [sys.executable, worker_path]
        
        req_data = json.dumps({"timeout": timeout, "browser": browser_type})
        cookie_saved = False

        def finalize_cookie_success(cookie: str):
            nonlocal cookie_saved
            if not cookie or cookie_saved:
                return

            cookie_saved = True
            Config.COOKIE = cookie
            Config.save_config(Config.COOKIE, Config.BASE_DIR)
            init_app()

            socketio.emit('cookie_login_status', {
                'event': 'success',
                'message': 'Cookie 获取成功！已自动保存。',
                'cookie': cookie,
            })
            logger.info("通过浏览器登录成功获取 Cookie")
        
        try:
            _cookie_login_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
            )
            
            # 写入参数并关闭 stdin
            _cookie_login_proc.stdin.write(req_data)
            _cookie_login_proc.stdin.close()
            
            # 实时读取 stderr 获取状态更新
            for line in _cookie_login_proc.stderr:
                line = line.strip()
                if '[cookie_grabber]' in line:
                    try:
                        json_str = line.split('[cookie_grabber] ', 1)[1]
                        status_data = json.loads(json_str)
                        if status_data.get('event') == 'cookie_extracted' and status_data.get('cookie'):
                            finalize_cookie_success(status_data.get('cookie'))
                            continue

                        socketio.emit('cookie_login_status', {
                            'event': status_data.get('event', ''),
                            'message': status_data.get('message', ''),
                            'cookie': status_data.get('cookie', ''),
                        })
                    except (json.JSONDecodeError, IndexError):
                        pass
            
            # 等待进程结束获取结果
            _cookie_login_proc.wait()
            stdout = _cookie_login_proc.stdout.read()
            
            try:
                result = json.loads(stdout)
            except json.JSONDecodeError:
                result = {"success": False, "error": "无法解析返回结果"}
            
            if result.get("success") and result.get("cookie"):
                finalize_cookie_success(result["cookie"])
            else:
                error_msg = result.get("error", "未知错误")
                socketio.emit('cookie_login_status', {
                    'event': 'failed',
                    'message': f'获取 Cookie 失败: {error_msg}',
                })
                logger.warning(f"浏览器登录获取 Cookie 失败: {error_msg}")
                
        except Exception as e:
            logger.error(f"Cookie 浏览器登录异常: {str(e)}")
            socketio.emit('cookie_login_status', {
                'event': 'error',
                'message': f'发生错误: {str(e)}',
            })
        finally:
            _cookie_login_proc = None
    
    thread = threading.Thread(target=run_cookie_grab, daemon=True)
    thread.start()
    
    return jsonify({'success': True, 'message': '浏览器登录已启动，请在弹出的浏览器中登录抖音'})

@app.route('/api/cookie/browser_login/cancel', methods=['POST'])
def cookie_browser_login_cancel():
    """取消正在进行的浏览器登录"""
    global _cookie_login_proc
    
    if _cookie_login_proc and _cookie_login_proc.poll() is None:
        try:
            _cookie_login_proc.terminate()
            _cookie_login_proc.wait(timeout=5)
        except Exception:
            try:
                _cookie_login_proc.kill()
            except Exception:
                pass
        _cookie_login_proc = None
        
        socketio.emit('cookie_login_status', {
            'event': 'cancelled',
            'message': '浏览器登录已取消',
        })
        return jsonify({'success': True, 'message': '已取消浏览器登录'})
    
    return jsonify({'success': False, 'message': '没有正在进行的浏览器登录'})


@app.route('/api/cookie/generate_temp', methods=['POST'])
def cookie_generate_temp():
    """生成临时 Cookie（未登录状态）"""
    try:
        import subprocess
        import json

        # 调用 browser_worker.py 获取临时 cookie
        worker_path = os.path.join(os.path.dirname(__file__), '..', 'api', 'browser_worker.py')

        # 使用子进程运行 browser_worker
        proc = subprocess.run(
            [sys.executable, worker_path],
            input=json.dumps({
                "action": "get_temp_cookie"
            }),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=30,
        )

        if proc.returncode != 0:
            logger.error(f"生成临时 cookie 失败: {proc.stderr}")
            return jsonify({
                'success': False,
                'message': '生成临时 Cookie 失败: ' + proc.stderr[:200]
            })

        result = json.loads(proc.stdout)
        if result.get('success'):
            return jsonify({
                'success': True,
                'cookie': result.get('cookie', ''),
                'message': '临时 Cookie 生成成功'
            })
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', '生成失败')
            })

    except subprocess.TimeoutExpired:
        logger.error("生成临时 cookie 超时")
        return jsonify({
            'success': False,
            'message': '生成临时 Cookie 超时，请重试'
        })
    except Exception as e:
        logger.exception(f"生成临时 cookie 异常: {e}")
        return jsonify({
            'success': False,
            'message': f'生成失败: {str(e)}'
        })


@app.route('/api/recommended_feed', methods=['POST'])
def get_recommended_feed():
    """获取推荐视频流"""
    try:
        import subprocess
        import json

        data = request.json or {}
        count = data.get('count', 20)
        cursor = data.get('cursor', 0)

        # 获取当前配置的 cookie
        cookie = Config.COOKIE if Config.COOKIE else ''

        if not cookie:
            return jsonify({
                'success': False,
                'message': '请先登录抖音账号'
            })

        # 调用 browser_worker 获取推荐视频
        worker_path = os.path.join(os.path.dirname(__file__), '..', 'api', 'browser_worker.py')

        proc = subprocess.run(
            [sys.executable, worker_path],
            input=json.dumps({
                "action": "get_recommended_feed",
                "cookie": cookie,
                "count": count,
                "cursor": cursor
            }),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=60,
        )

        if proc.returncode != 0:
            logger.error(f"获取推荐视频失败: {proc.stderr}")
            return jsonify({
                'success': False,
                'message': '获取推荐视频失败: ' + proc.stderr[:200]
            })

        result = json.loads(proc.stdout)

        if result.get('success'):
            aweme_list = result.get('aweme_list', [])

            # 格式化视频信息
            videos = []
            for aweme in aweme_list:
                try:
                    # 提取视频播放地址
                    video_data = aweme.get('video', {})
                    play_addr_data = video_data.get('play_addr', {})
                    if isinstance(play_addr_data, dict):
                        play_addr = play_addr_data.get('url_list', [''])[0]
                    else:
                        play_addr = play_addr_data if play_addr_data else ''

                    # 提取封面
                    cover_data = video_data.get('cover', {})
                    if isinstance(cover_data, dict):
                        cover = cover_data.get('url_list', [''])[0]
                    else:
                        cover = cover_data if cover_data else ''

                    # 提取动态封面
                    dynamic_cover_data = video_data.get('dynamic_cover', {})
                    if isinstance(dynamic_cover_data, dict):
                        dynamic_cover = dynamic_cover_data.get('url_list', [''])[0]
                    else:
                        dynamic_cover = dynamic_cover_data if dynamic_cover_data else ''

                    # 提取作者头像
                    author_data = aweme.get('author', {})
                    avatar_data = author_data.get('avatar_thumb', {})
                    if isinstance(avatar_data, dict):
                        avatar_thumb = avatar_data.get('url_list', [''])[0]
                    else:
                        avatar_thumb = avatar_data if avatar_data else ''

                    video_info = {
                        'aweme_id': aweme.get('aweme_id', ''),
                        'desc': aweme.get('desc', ''),
                        'create_time': aweme.get('create_time', 0),
                        'author': {
                            'uid': author_data.get('uid', ''),
                            'nickname': author_data.get('nickname', ''),
                            'avatar_thumb': avatar_thumb,
                            'sec_uid': author_data.get('sec_uid', ''),
                        },
                        'statistics': {
                            'digg_count': aweme.get('statistics', {}).get('digg_count', 0),
                            'comment_count': aweme.get('statistics', {}).get('comment_count', 0),
                            'share_count': aweme.get('statistics', {}).get('share_count', 0),
                            'play_count': aweme.get('statistics', {}).get('play_count', 0),
                        },
                        'video': {
                            'cover': cover,
                            'dynamic_cover': dynamic_cover,
                            'play_addr': play_addr,
                            'width': video_data.get('width', 0),
                            'height': video_data.get('height', 0),
                            'duration': video_data.get('duration', 0),
                        },
                        'music': {
                            'title': aweme.get('music', {}).get('title', ''),
                            'author': aweme.get('music', {}).get('author', ''),
                            'cover': aweme.get('music', {}).get('cover_large', {}).get('url_list', [''])[0] if isinstance(aweme.get('music', {}).get('cover_large', {}), dict) else '',
                        }
                    }

                    # 调试日志
                    if not play_addr:
                        logger.warning(f"视频 {aweme.get('aweme_id')} 没有播放地址")
                    elif len(videos) == 0:
                        logger.info(f"第一个视频播放地址: {play_addr[:100]}...")

                    videos.append(video_info)
                except Exception as e:
                    logger.error(f"解析视频信息失败: {e}")
                    continue

            return jsonify({
                'success': True,
                'videos': videos,
                'cursor': result.get('cursor', 0),
                'has_more': result.get('has_more', False),
                'count': len(videos)
            })
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', '获取失败')
            })

    except subprocess.TimeoutExpired:
        logger.error("获取推荐视频超时")
        return jsonify({
            'success': False,
            'message': '获取推荐视频超时，请重试'
        })
    except Exception as e:
        logger.exception(f"获取推荐视频异常: {e}")
        return jsonify({
            'success': False,
            'message': f'获取失败: {str(e)}'
        })


@app.route('/api/download_video', methods=['POST'])
def download_video_by_aweme_id():
    """通过 aweme_id 下载视频"""
    try:
        data = request.json
        aweme_id = data.get('aweme_id', '').strip()

        if not aweme_id:
            return jsonify({'success': False, 'message': 'aweme_id 参数不能为空'}), 400

        if not user_manager:
            return jsonify({'success': False, 'message': '请先初始化'}), 400

        # 获取视频详情
        cookie = Config.COOKIE if Config.COOKIE else ''
        if not cookie:
            return jsonify({'success': False, 'message': '请先登录抖音账号'}), 400

        # 调用 browser_worker 获取视频详情
        import subprocess
        worker_path = os.path.join(os.path.dirname(__file__), '..', 'api', 'browser_worker.py')

        proc = subprocess.run(
            [sys.executable, worker_path],
            input=json.dumps({
                "action": "get_video_detail",
                "cookie": cookie,
                "aweme_id": aweme_id
            }),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=30,
        )

        if proc.returncode != 0:
            return jsonify({'success': False, 'message': '获取视频详情失败'}), 500

        result = json.loads(proc.stdout)

        if not result.get('success'):
            return jsonify({'success': False, 'message': result.get('message', '获取视频详情失败')}), 500

        aweme_detail = result.get('aweme_detail', {})
        author = aweme_detail.get('author', {})
        video = aweme_detail.get('video', {})

        # 获取视频 URL
        play_addr = video.get('play_addr', {}).get('url_list', [''])
        if not play_addr or not play_addr[0]:
            return jsonify({'success': False, 'message': '无法获取视频下载地址'}), 500

        # 生成文件名
        author_name = author.get('nickname', '未知作者')
        desc = aweme_detail.get('desc', '未知作品')[:50]
        name = f"{author_name}_{desc}_{aweme_id}"

        # 添加到下载队列
        task_id = str(uuid.uuid4())

        async def do_download():
            try:
                success = user_manager.downloader.download_video(
                    play_addr[0], name, aweme_id,
                    cancel_event=asyncio.Event(),
                    socketio=socketio, task_id=task_id
                )

                if success:
                    socketio.emit('download_complete', {
                        'task_id': task_id,
                        'aweme_id': aweme_id,
                        'message': f'{name} 下载完成'
                    })
                else:
                    socketio.emit('download_error', {
                        'task_id': task_id,
                        'aweme_id': aweme_id,
                        'message': f'{name} 下载失败'
                    })
            except Exception as e:
                logger.error(f"下载视频失败: {e}")
                socketio.emit('download_error', {
                    'task_id': task_id,
                    'aweme_id': aweme_id,
                    'message': f'下载失败: {str(e)}'
                })

        # 在后台线程执行下载
        loop = get_or_create_event_loop()
        asyncio.run_coroutine_threadsafe(do_download(), loop)

        return jsonify({'success': True, 'task_id': task_id, 'message': '已添加到下载队列'})

    except Exception as e:
        logger.exception(f"下载视频异常: {e}")
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500


# 添加一个定时发送心跳的函数
def send_heartbeat():
    """定时发送心跳消息"""
    logger.debug("发送WebSocket心跳消息")
    socketio.emit('heartbeat', {'timestamp': datetime.now().strftime('%H:%M:%S')})
    


def start_server(port=None):
    """启动Flask/SocketIO服务（在后台线程中调用）"""
    import os

    logger.info("启动抖音下载器Web服务...")
    logger.info(f"SocketIO async_mode: {socketio.async_mode}")

    if port is None:
        port = int(os.environ.get('PORT', 5001))

    # 初始化应用
    init_app()

    run_kwargs = {
        'app': app,
        'host': '0.0.0.0',
        'port': port,
        'debug': False
    }
    if IS_WINDOWS and socketio.async_mode == 'threading':
        run_kwargs['allow_unsafe_werkzeug'] = True

    logger.info(f"Web服务开始监听: 0.0.0.0:{port}")
    socketio.run(**run_kwargs)


def main():
    """启动Web服务（兼容旧版命令行启动方式）"""
    import os
    import webbrowser
    import threading
    import time

    port = int(os.environ.get('PORT', 5001))
    url = f"http://localhost:{port}"

    # 在后台线程启动服务
    server_thread = threading.Thread(target=start_server, kwargs={'port': port}, daemon=True)
    server_thread.start()

    # 等待服务就绪
    time.sleep(1.5)
    try:
        webbrowser.open(url)
        logger.info(f"已自动打开浏览器: {url}")
    except Exception as e:
        logger.warning(f"自动打开浏览器失败: {str(e)}")

    # 阻塞主线程，等待服务线程结束
    server_thread.join()

if __name__ == '__main__':
    main()
