import os
   
class Config:
    """配置类"""
    # Cookie设置
    COOKIE = " "
    # 替换为你的抖音cookie
    
    # 文件保存路径
    BASE_DIR = os.path.expanduser("~/Movies/myvideos/douyin/")  # 使用用户主目录
    DOWNLOAD_DIR = os.path.join(BASE_DIR, "file")
    
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
    MAX_RETRY = 3  # 下载重试次数
    CHUNK_SIZE = 8192  # 下载块大小
    TIMEOUT = 30  # 请求超时时间(秒)
    
    # 文件命名设置
    MAX_FILENAME_LENGTH = 50  # 文件名最大长度
    
    @classmethod
    def init(cls):
        """初始化配置"""
        # 确保下载目录存在
        os.makedirs(cls.DOWNLOAD_DIR, exist_ok=True)
        
        # 验证cookie是否已设置
        if cls.COOKIE == "your_cookie_here":
            raise ValueError("请在 config.py 中设置你的抖音cookie") 