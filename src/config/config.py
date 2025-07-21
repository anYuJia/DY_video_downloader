import os
import json
import getpass

class Config:
    """配置类"""
    # 配置文件路径
    CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config.json")
    
    # Cookie设置
    COOKIE = ""
    
    # 文件保存路径
    BASE_DIR = os.path.expanduser("data/")
    DOWNLOAD_DIR = os.path.join(BASE_DIR, "douyin_download")
    
    # 请求参数
    HOST = 'https://www.douyin.com'
    COMMON_PARAMS = {
        'device_platform': 'webapp',
        'aid': '6383',
        'channel': 'channel_pc_web',
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
    
    # 请求头
    COMMON_HEADERS = {
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
    
    # 下载设置
    CHUNK_SIZE = 8192  # 下载块大小
    
    
    # 文件命名设置
    MAX_FILENAME_LENGTH = 50  # 文件名最大长度
    
    @classmethod
    def load_config(cls):
        """从配置文件或环境变量加载配置"""
        # 首先尝试从环境变量加载
        cls.COOKIE = os.environ.get("DOUYIN_COOKIE", cls.COOKIE)
        cls.BASE_DIR = os.environ.get("DOUYIN_BASE_DIR", cls.BASE_DIR)
        cls.DOWNLOAD_DIR = os.path.join(cls.BASE_DIR, "douyin_download")
        
        # 然后尝试从配置文件加载
        if os.path.exists(cls.CONFIG_FILE):
            try:
                with open(cls.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                    cls.COOKIE = config_data.get("cookie", cls.COOKIE)
                    cls.BASE_DIR = config_data.get("base_dir", cls.BASE_DIR)
                    cls.DOWNLOAD_DIR = os.path.join(cls.BASE_DIR, "douyin_download")
                    print("\033[92m配置已从配置文件加载\033[0m")
                    return True
            except Exception as e:
                print(f"\033[91m加载配置文件失败: {str(e)}\033[0m")
        return False
    
    @classmethod
    def save_config(cls, cookie, base_dir):
        """保存配置到配置文件"""
        config_data = {
            "cookie": cookie,
            "base_dir": base_dir
        }
        try:
            with open(cls.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)
            print("\033[92m配置已保存到配置文件\033[0m")
            return True
        except Exception as e:
            print(f"\033[91m保存配置文件失败: {str(e)}\033[0m")
            return False
    
    
    @classmethod
    def init(cls):
        """初始化配置"""
        # 尝试加载配置
        cls.load_config()
        
        # 如果配置不完整，启动配置向导
        if not cls.BASE_DIR:
            
        
        # 确保下载目录存在
            os.makedirs(cls.DOWNLOAD_DIR, exist_ok=True)
        
        # 如果cookie未设置，提示用户但不阻止程序运行
        if not cls.COOKIE:
            print("\033[93m警告: 未设置抖音cookie，部分功能将受限\033[0m")
            print("\033[93m受限功能: 下载点赞视频、下载点赞作者作品\033[0m")
        
        return True