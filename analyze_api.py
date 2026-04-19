#!/usr/bin/env python3
"""分析捕获的推荐 API 请求参数"""
import urllib.parse

# 从测试输出中提取的成功 API URL
url = "https://www.douyin.com/aweme/v2/web/module/feed/?device_platform=webapp&aid=6383&channel=channel_pc_web&module_id=3003101&count=20&filterGids=&presented_ids=&refresh_index=1&refer_id=&refer_type=10&pull_type=0&awemePcRecRawData=%7B%22is_xigua_user%22%3A0%2C%22danmaku_switch_status%22%3A0%2C%22is_client%22%3Afalse%7D&Seo-Flag=0&install_time=1776533241&tag_id=&use_lite_type=2&pre_log_id=&pre_item_ids=7618917735157806321%2C7619367826326900014%2C7611611279710539049%2C7628511976510983478%2C7629959914869314555%2C7627471650006502696%2C7628535890368826660%2C7624872389221944602%2C7596601047364203685%2C7599250079001677082&pre_room_ids=&pre_item_from=sati&xigua_user=0&pc_client_type=1&pc_libra_divert=Mac&update_version_code=170400&support_h265=1&support_dash=0&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1680&screen_height=1050&browser_language=zh-CN&browser_platform=MacIntel&browser_name=Chrome&browser_version=145.0.0.0&browser_online=true&engine_name=Blink&engine_version=145.0.0.0&os_name=Mac+OS&os_version=10.15.7&cpu_core_num=10&device_memory=16&platform=PC&downlink=10&effective_type=4g&round_trip_time=0&webid=7630152107014407680&uifid=749b770aa6a177ba6fbed42b6fcf8269d6ef3c63265bceaf64e3282dcaa6c732d8126894fd5080b090cc54e2ed02fc7f27e005f47fc9129a4311107826c473f8f4c53cca7d7799ffdb6ba1ad7e1904f1&msToken=b5V55ecf5MC5O8TAHOV4wk1x1zpjTEWNT0Kj4_8O14uG95CqI__phl3rIiTsQSQK--f8tegjxn9iBFPTJrnxVzt9_1ifxFkI8O6NsDLY1Cgd-OtH6BqGkJ2uAPpy_hPw57fL3V-jkYgMjqIXsuV6Gwb0uSW3CozXyLM%3D&a_bogus=dv0VDe7wxq5nFd%2Ft8cYWtXNU7LEArP8jvUi2RcITexT6aH0GlmN0YcckcouDDRSAnSphho3HkDB%2FYVxc8UXTZKHkqmpDu2T6fSxC9XfohqiZazJsDqfsCwWiyJeaW5TFmKKRJ1XX1UDO2VV-ZqrhUB-77AGnsOzpQpBbdBUaT9zD6zTH0ZZNPzXWnDSFUaNkFmWoCj%3D%3D&verifyFp=verify_mo4m0uzw_uXexsAUf_teQ4_4jKZ_9oh7_dBlfpynigwjT&fp=verify_mo4m0uzw_uXexsAUf_teQ4_4jKZ_9oh7_dBlfpynigwjT"

# 解析 URL
parsed = urllib.parse.urlparse(url)
params = urllib.parse.parse_qs(parsed.query)

print("="*80)
print("推荐视频 API 请求参数分析")
print("="*80)
print(f"\nAPI 路径: {parsed.path}")
print(f"\n关键参数:")

# 按类别显示参数
categories = {
    '基础参数': ['device_platform', 'aid', 'channel', 'pc_client_type', 'version_code', 'version_name'],
    '推荐参数': ['module_id', 'count', 'pull_type', 'refresh_index', 'refer_type'],
    '设备参数': ['screen_width', 'screen_height', 'browser_language', 'browser_platform', 'browser_name', 'browser_version', 'os_name', 'os_version', 'cpu_core_num', 'device_memory'],
    '签名参数': ['webid', 'uifid', 'msToken', 'a_bogus', 'verifyFp', 'fp'],
    '其他参数': ['install_time', 'support_h265', 'support_dash', 'cookie_enabled', 'platform', 'downlink', 'effective_type', 'round_trip_time', 'pc_libra_divert', 'update_version_code'],
}

for category, keys in categories.items():
    print(f"\n{category}:")
    for key in keys:
        if key in params:
            value = params[key][0]
            if len(value) > 80:
                value = value[:80] + "..."
            print(f"  {key}: {value}")

print(f"\n{'='*80}")
print("重要发现:")
print("="*80)
print("""
1. API 路径: /aweme/v2/web/module/feed/
   - 这是推荐视频的正确 API 路径
   - 不是 /aweme/v1/web/tab/feed/

2. 关键参数:
   - module_id: 3003101 (推荐模块ID)
   - count: 20 (每页数量)
   - pull_type: 0 (刷新类型)
   - refresh_index: 1 (刷新索引)
   - refer_type: 10 (引用类型)

3. 需要签名的参数:
   - a_bogus: 签名参数
   - msToken: Token
   - webid: 浏览器ID
   - verifyFp: 指纹验证

4. 这是一个 POST 请求，不是 GET 请求！
""")

# 提取必要的参数模板
print(f"\n{'='*80}")
print("建议的 API 调用参数:")
print("="*80)

essential_params = {
    'module_id': '3003101',
    'count': '20',
    'pull_type': '0',
    'refresh_index': '1',
    'refer_type': '10',
    'filterGids': '',
    'presented_ids': '',
    'refer_id': '',
    'tag_id': '',
    'use_lite_type': '2',
    'Seo-Flag': '0',
}

print("essential_params = {")
for key, value in essential_params.items():
    print(f"    '{key}': '{value}',")
print("}")
