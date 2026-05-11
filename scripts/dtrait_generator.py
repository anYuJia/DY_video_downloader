#!/usr/bin/env python3
"""生成或复用 x-tt-session-dtrait

方案：
1. 尝试从已有数据复用
2. 尝试用Node.js生成
3. 提示用户从浏览器获取
"""
import sys
import json
import subprocess
from pathlib import Path

class DtraitGenerator:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.config_file = self.project_root / "data" / "sign_config.json"

    def try_reuse(self):
        """尝试复用已有的dtrait"""
        if self.config_file.exists():
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

            if config.get("x_tt_session_dtrait"):
                print("✓ 找到已保存的 x-tt-session-dtrait")
                print(f"  长度: {len(config['x_tt_session_dtrait'])} 字符")
                print(f"  预览: {config['x_tt_session_dtrait'][:50]}...")
                return config["x_tt_session_dtrait"]

        return None

    def try_generate_with_node(self):
        """尝试用Node.js生成"""
        print("\n尝试用Node.js生成...")

        # 检查Node.js
        try:
            result = subprocess.run(['node', '--version'], capture_output=True, text=True)
            print(f"Node.js版本: {result.stdout.strip()}")
        except FileNotFoundError:
            print("✗ 未安装Node.js")
            return None

        # 尝试运行SDK
        print("\n分析SDK...")
        print("SDK需要完整的浏览器环境，纯Node.js运行会失败")
        print("建议：从浏览器获取一次，然后长期复用")

        return None

    def suggest_manual_extraction(self):
        """提示用户手动提取"""
        print("\n" + "="*60)
        print("推荐方案：从浏览器提取")
        print("="*60)
        print("""
方法1: 使用提取工具（推荐）

  1. 打开浏览器开发者工具 (F12)
  2. 访问 https://www.douyin.com
  3. 扫码登录
  4. 在Network中找到 get_qrcode 请求
  5. 右键 -> Copy -> Copy as cURL
  6. 运行:
     python3 scripts/extract_headers.py --curl '复制的命令' --save

方法2: 手动查看Headers

  在请求详情中找到:
  - x-tt-session-dtrait
  - x-tt-passport-csrf-token

  手动添加到 data/sign_config.json:
  {
    "x_tt_session_dtrait": "d0_znGndEa...",
    "csrf_token": "..."
  }

方法3: 使用已有模板

  如果之前成功登录过，可以从这里复用:
  data/login_exploration/captured_api_params.json
""")

    def check_captured_data(self):
        """检查是否有已捕获的dtrait"""
        captured_file = self.project_root / "data" / "login_exploration" / "captured_api_params.json"

        if captured_file.exists():
            print("\n检查已捕获的请求数据...")
            with open(captured_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for request_type in ["get_qrcode", "check_qrcode"]:
                if request_type in data and data[request_type]:
                    headers = data[request_type][0].get("headers", {})
                    if "x-tt-session-dtrait" in headers:
                        dtrait = headers["x-tt-session-dtrait"]
                        print(f"✓ 从 {request_type} 请求中找到")
                        print(f"  长度: {len(dtrait)} 字符")

                        # 保存到配置
                        self.save_dtrait(dtrait, headers.get("x-tt-passport-csrf-token", ""))
                        return dtrait

        return None

    def save_dtrait(self, dtrait, csrf_token=""):
        """保存dtrait到配置"""
        config = {}
        if self.config_file.exists():
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

        config["x_tt_session_dtrait"] = dtrait
        if csrf_token:
            config["csrf_token"] = csrf_token

        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        print(f"\n✓ 已保存到 {self.config_file}")

    def generate(self):
        """主流程"""
        print("=== x-tt-session-dtrait 生成器 ===\n")

        # 方案1: 复用已有
        dtrait = self.try_reuse()
        if dtrait:
            return dtrait

        # 方案2: 从捕获数据提取
        dtrait = self.check_captured_data()
        if dtrait:
            return dtrait

        # 方案3: Node.js生成
        dtrait = self.try_generate_with_node()
        if dtrait:
            return dtrait

        # 方案4: 提示手动
        self.suggest_manual_extraction()

        return None


if __name__ == '__main__':
    generator = DtraitGenerator()
    dtrait = generator.generate()

    if dtrait:
        print("\n" + "="*60)
        print("✓ 成功获取 x-tt-session-dtrait")
        print("="*60)
    else:
        print("\n" + "="*60)
        print("需要手动获取")
        print("="*60)
