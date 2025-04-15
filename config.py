import os
   
class Config:
    """配置类"""
    # Cookie设置
    COOKIE = "UIFID_TEMP=da38ce2aa038ba67741bc435556e3f9ac56068592278f6eb82b7cf2f89ea15f7f18e991c71da53929ab9f3e3013b3d8ad5273272cda82febaf4dbedf5eece3e04106bcce78abcb082899586c546dcc67; fpk1=U2FsdGVkX180sgAtYJbaJdOhhQsgYWJcg/LzOBYg9/EVRklQPhmx01QgAlVIl+XID0R7ihzfXW7iUKS/Lqy4JA==; fpk2=ed285fe9d5917b708ee490143a1aec49; bd_ticket_guard_client_web_domain=2; UIFID=da38ce2aa038ba67741bc435556e3f9ac56068592278f6eb82b7cf2f89ea15f7f18e991c71da53929ab9f3e3013b3d8acfef28d80b039022fdf4b77dc8d9eff277f8f374b3b15a31f6988006a9fc95bca90857ae6accdb526b9ef8ee581f0e6006d39a353abd9bded961cb59dabda0ddc5cbfb69b17af36bcad69e25947a2862544b23c81ec969bfcbf252d1b3a688bb755d628a988cacf529a8a1ee4eefb1ff; store-region=cn-cq; store-region-src=uid; SEARCH_RESULT_LIST_TYPE=%22single%22; xgplayer_device_id=79162013959; xgplayer_user_id=180379426533; hevc_supported=true; live_use_vvc=%22false%22; my_rd=2; SelfTabRedDotControl=%5B%7B%22id%22%3A%227267807140604020747%22%2C%22u%22%3A114%2C%22c%22%3A0%7D%5D; ttwid=1%7C6JWssGGkiMKBs19lVpTHL_3bNqUDcaOSdqOdOOjI3Ww%7C1732858386%7Ca891cbbfc36b4b9357404623d38b99b11f654989871187f720dccdfd2a433531; volume_info=%7B%22isUserMute%22%3Afalse%2C%22isMute%22%3Afalse%2C%22volume%22%3A0.929%7D; __security_mc_1_s_sdk_crypt_sdk=6651a1ac-408d-aba2; __security_mc_1_s_sdk_cert_key=f41e684b-4b8d-adff; __security_mc_1_s_sdk_sign_data_key_login=1c1217d7-4071-8827; passport_mfa_token=CjYENlhelFzrRSHpI3xR8QTPMsfFNI%2BMVi7Cn93p2szJwhfImud5OCnTZScCnxPvhYYYHh5sCaIaSgo8l2vye2Jht3pCWnZ4zDIGkryP28Pk0g%2BN6QIenmxbunx2eAf%2FWh52bPhFq4hPD5SwIdTZwMrVz%2BNaDqNSEOeq5g0Y9rHRbCACIgEDBdRj4A%3D%3D; d_ticket=cf6c8e01f6587ad970993dc6d628c18e81760; passport_assist_user=CkCEDKd0vHWuLmeWGH1ZMyAAwJN005ntzZ2DVrrElO8YtOGnnYMlySjjrHZonDAyVvbu0rQ5zq6qNdM21gFajyKmGkoKPHa8QRD8IO4WODgMlhQ7B3OIGQdBdnNnCK_EgKkDF6e3yIVQE1Wbcmmkkz5kFWUZB4VsBKFVecJPcMHhaxDzq-YNGImv1lQgASIBA0Oc5tg%3D; n_mh=oj9hc1MUPJTqD81Oo9VH1-Nqu5y5iAntDZxmejxq4sE; sso_uid_tt=b4fbf4bf4bb18df119092e0cc25c9eca; sso_uid_tt_ss=b4fbf4bf4bb18df119092e0cc25c9eca; toutiao_sso_user=5ca9f167ce78463c5b1263abd54c9e17; toutiao_sso_user_ss=5ca9f167ce78463c5b1263abd54c9e17; sid_ucp_sso_v1=1.0.0-KGVjNmQ4YmQ4YTUxNDg2OWI4MDI1NmM4NmM0ZTFjMDEzNzU4NWI0MjYKIAjU76Cmi41fENPl_LsGGO8xIAwwrJutnAY4BUD7B0gGGgJscSIgNWNhOWYxNjdjZTc4NDYzYzViMTI2M2FiZDU0YzllMTc; ssid_ucp_sso_v1=1.0.0-KGVjNmQ4YmQ4YTUxNDg2OWI4MDI1NmM4NmM0ZTFjMDEzNzU4NWI0MjYKIAjU76Cmi41fENPl_LsGGO8xIAwwrJutnAY4BUD7B0gGGgJscSIgNWNhOWYxNjdjZTc4NDYzYzViMTI2M2FiZDU0YzllMTc; __security_mc_1_s_sdk_sign_data_key_sso=dc7364cd-4493-8e93; login_time=1736389331155; uid_tt=217098d4e6fe5dd110054cc4f585779d; uid_tt_ss=217098d4e6fe5dd110054cc4f585779d; sid_tt=2038328d27348162ac8b3869ca3d0a21; sessionid=2038328d27348162ac8b3869ca3d0a21; sessionid_ss=2038328d27348162ac8b3869ca3d0a21; is_staff_user=false; _bd_ticket_crypt_doamin=2; _bd_ticket_crypt_cookie=64674a4d21b48fdf50576915a489acbd; __security_mc_1_s_sdk_sign_data_key_web_protect=bf3a649f-4b55-beaa; __security_server_data_status=1; sid_guard=2038328d27348162ac8b3869ca3d0a21%7C1736389340%7C5183994%7CMon%2C+10-Mar-2025+02%3A22%3A14+GMT; sid_ucp_v1=1.0.0-KDVmMGZkNmY5YTFkMzZiOGIyYTkxYjc4ZDZkODEwYWFlMTk4MmUxNDcKGgjU76Cmi41fENzl_LsGGO8xIAw4BUD7B0gEGgJscSIgMjAzODMyOGQyNzM0ODE2MmFjOGIzODY5Y2EzZDBhMjE; ssid_ucp_v1=1.0.0-KDVmMGZkNmY5YTFkMzZiOGIyYTkxYjc4ZDZkODEwYWFlMTk4MmUxNDcKGgjU76Cmi41fENzl_LsGGO8xIAw4BUD7B0gEGgJscSIgMjAzODMyOGQyNzM0ODE2MmFjOGIzODY5Y2EzZDBhMjE; dy_swidth=1680; dy_sheight=1050; is_dash_user=1; publish_badge_show_info=%221%2C0%2C0%2C1737709166851%22; FOLLOW_NUMBER_YELLOW_POINT_INFO=%22MS4wLjABAAAAp_DamTrtTEi_F3A9kvHLFEd7mSYSMJtRZv48GSakOsA%2F1737734400000%2F0%2F1737709236621%2F0%22; __ac_nonce=067997197002c0e8dfe5c; __ac_signature=_02B4Z6wo00f01ykuhmgAAIDAe9GmcpWofpMpDoLAAK3dce; douyin.com; device_web_cpu_core=8; device_web_memory_size=8; IsDouyinActive=true; stream_recommend_feed_params=%22%7B%5C%22cookie_enabled%5C%22%3Atrue%2C%5C%22screen_width%5C%22%3A1680%2C%5C%22screen_height%5C%22%3A1050%2C%5C%22browser_online%5C%22%3Atrue%2C%5C%22cpu_core_num%5C%22%3A8%2C%5C%22device_memory%5C%22%3A8%2C%5C%22downlink%5C%22%3A2.75%2C%5C%22effective_type%5C%22%3A%5C%224g%5C%22%2C%5C%22round_trip_time%5C%22%3A150%7D%22; FOLLOW_LIVE_POINT_INFO=%22MS4wLjABAAAAp_DamTrtTEi_F3A9kvHLFEd7mSYSMJtRZv48GSakOsA%2F1738166400000%2F0%2F1738109336930%2F0%22; s_v_web_id=verify_m6h5f7ot_eiTmXMsE_7HVx_4qLC_BPaD_mi6mtlVaMWD0; strategyABtestKey=%221738109337.503%22; bd_ticket_guard_client_data=eyJiZC10aWNrZXQtZ3VhcmQtdmVyc2lvbiI6MiwiYmQtdGlja2V0LWd1YXJkLWl0ZXJhdGlvbi12ZXJzaW9uIjoxLCJiZC10aWNrZXQtZ3VhcmQtcmVlLXB1YmxpYy1rZXkiOiJCQnFFekFlN2xNa3Y2RVFaSEV5eFA3RGRhOUpsVDdhaWFoUDJiR1VOUzRKTFA0NUJ1cm01Y08rSU9pYmZYVjVTVC9aQ3psMGdabUMybTdCM05ocUp1OFE9IiwiYmQtdGlja2V0LWd1YXJkLXdlYi12ZXJzaW9uIjoyfQ%3D%3D; biz_trace_id=e03d8a0a; csrf_session_id=9a239ac34e5e8cac348776bbe213a0ca; passport_csrf_token=ec3bbf93b0adf606e4827601fdc87c0f; passport_csrf_token_default=ec3bbf93b0adf606e4827601fdc87c0f; home_can_add_dy_2_desktop=%221%22; stream_player_status_params=%22%7B%5C%22is_auto_play%5C%22%3A1%2C%5C%22is_full_screen%5C%22%3A0%2C%5C%22is_full_webscreen%5C%22%3A0%2C%5C%22is_mute%5C%22%3A0%2C%5C%22is_speed%5C%22%3A1%2C%5C%22is_visible%5C%22%3A1%7D%22; odin_tt=e0be21d8c80526eef134cb78ced59ca6342cd0fa7ed65de93fe97666f743514083c8866d4ddb68c3220f9c1623a217198430c15d6430783f2675831ef1b0887a; passport_fe_beating_status=true; xg_device_score=7.128823529411765"
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