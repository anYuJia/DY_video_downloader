#!/usr/bin/env python3
"""
最简单的全自动方案 - 使用内置的Python库

思路：直接调用抖音API，从返回中提取token
"""
import sys
import json
import time
import requests
import hashlib
import random
import string
from pathlib import Path

class SimpleAutoGenerator:
    """最简化的自动生成器"""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.config_file = self.project_root / "data" / "sign_config.json"

    def generate_account_sdk_source_info(self):
        """
        生成 account_sdk_source_info

        策略：使用预设模板 + 时间戳更新
        """
        print("生成 account_sdk_source_info...")

        # 从已有配置中获取模板
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                config = json.load(f)
            if config.get("account_sdk_source_info"):
                print("✓ 使用已保存的 account_sdk_source_info")
                return config["account_sdk_source_info"]

        # 如果没有，使用一个默认模板
        print("使用默认模板...")
        return None

    def test_with_minimal_config(self):
        """
        测试最小配置能否通过
        """
        print("\n=== 测试最小配置 ===\n")

        # 尝试只用基础参数
        base_url = "https://login.douyin.com/passport/web/get_qrcode/"

        params = {
            "aid": "6383",
            "device_platform": "web_app",
            "language": "zh",
            "ts": str(int(time.time())),
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.douyin.com/",
        }

        try:
            response = requests.get(base_url, params=params, headers=headers, timeout=10, verify=False)

            data = response.json()
            error_code = data.get("error_code", data.get("data", {}).get("error_code"))

            print(f"HTTP状态: {response.status_code}")
            print(f"错误码: {error_code}")

            if error_code:
                print(f"错误信息: {data.get('description', data.get('data', {}).get('description'))}")

            # 分析错误
            if error_code == 4031:
                print("\n结论: 需要完整的设备指纹参数")
                print("建议方案:")
                print("  1. 使用已有配置（如果有）")
                print("  2. 从浏览器提取一次")

        except Exception as e:
            print(f"错误: {e}")

    def use_saved_config(self):
        """使用已保存的配置"""
        print("\n=== 检查已保存的配置 ===\n")

        if not self.config_file.exists():
            print("✗ 未找到配置文件")
            return False

        with open(self.config_file, 'r') as f:
            config = json.load(f)

        required_keys = [
            "account_sdk_source_info",
            "x_tt_session_dtrait",
        ]

        missing = [k for k in required_keys if not config.get(k)]

        if missing:
            print(f"✗ 缺少参数: {', '.join(missing)}")
            return False

        print("✓ 配置完整")
        print(f"\n已保存的配置:")
        for key in required_keys:
            value = config[key]
            print(f"  {key}: {value[:50]}...")

        # 检查是否过期
        if "dtrait_generated_at" in config:
            generated_time = config["dtrait_generated_at"]
            if isinstance(generated_time, str):
                from datetime import datetime
                try:
                    dt = datetime.fromisoformat(generated_time.replace('Z', '+00:00'))
                    age = (datetime.now(dt.tzinfo) - dt).days
                    print(f"\n配置年龄: {age} 天")

                    if age > 7:
                        print("⚠️ 配置可能已过期")
                        return False
                except:
                    pass

        return True

    def provide_simple_solution(self):
        """提供最简单的解决方案"""
        print("\n" + "="*60)
        print("最简单的解决方案")
        print("="*60)

        print("""
方案A: 浏览器提取一次（5分钟，永久有效）

步骤：
1. 打开浏览器，访问 https://www.douyin.com
2. 按F12打开开发者工具
3. 扫码登录
4. 在Network标签中找到任意请求
5. 右键 -> Copy -> Copy as cURL
6. 运行:
   python3 scripts/extract_headers.py --curl '复制的命令' --save

之后：
   python3 scripts/douyin_full_login.py --login
   （完全纯Python，无浏览器）

方案B: 使用Puppeteer全自动（需要Node.js）

步骤：
1. 确保安装了Node.js
2. 运行:
   cd scripts
   npm install
   node generate_dtrait_auto.js
3. 之后:
   python3 scripts/douyin_full_login.py --login

推荐：方案A最简单稳定
""")

    def run(self):
        """运行"""
        print("="*60)
        print("抖音登录参数自动生成")
        print("="*60)

        # 检查已有配置
        if self.use_saved_config():
            print("\n✓ 已有有效配置！")
            print("\n直接使用:")
            print("  python3 scripts/douyin_full_login.py --login")
            return True

        # 测试最小配置
        self.test_with_minimal_config()

        # 提供解决方案
        self.provide_simple_solution()

        return False


if __name__ == '__main__':
    generator = SimpleAutoGenerator()
    success = generator.run()

    if not success:
        sys.exit(1)
