#!/usr/bin/env python3
"""
完全模拟x-tt-session-dtrait的尝试

提供多种方案：
1. Node.js环境模拟（推荐）
2. 轻量级浏览器自动化
3. 半自动化提取
"""
import sys
import json
import subprocess
from pathlib import Path


class DtraitCompleteSimulation:
    """dtrait完全模拟"""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.config_file = self.project_root / "data" / "sign_config.json"

    def method1_nodejs_simulation(self):
        """方法1: Node.js环境模拟"""
        print("\n=== 方法1: Node.js环境模拟 ===\n")

        # 检查Node.js
        try:
            result = subprocess.run(['node', '--version'], capture_output=True, text=True)
            print(f"✓ Node.js版本: {result.stdout.strip()}")
        except FileNotFoundError:
            print("✗ 未安装Node.js")
            return None

        # 尝试运行生成脚本
        print("\n尝试生成dtrait...")

        generate_script = self.project_root / "scripts" / "generate_dtrait.js"

        if generate_script.exists():
            result = subprocess.run(
                ['node', str(generate_script)],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=str(self.project_root)
            )

            if result.returncode == 0 and 'x-tt-session-dtrait' in result.stdout:
                # 提取dtrait
                lines = result.stdout.split('\n')
                for line in lines:
                    if line.startswith('d0_') and len(line) > 100:
                        print(f"\n✓ 生成成功!")
                        print(f"dtrait: {line[:50]}...")
                        return line

            print("\nNode.js生成失败")
            print(f"错误: {result.stderr[:200]}")

        return None

    def method2_puppeteer_minimal(self):
        """方法2: 使用Puppeteer最小化脚本（仅生成dtrait）"""
        print("\n=== 方法2: Puppeteer轻量级方案 ===\n")

        puppeteer_script = """
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://www.douyin.com/', { waitUntil: 'networkidle0' });

    // 等待SDK加载
    await page.waitForTimeout(2000);

    // 提取dtrait
    const dtrait = await page.evaluate(() => {
        // 从请求头中提取
        return window.__INITIAL_DTRAIT__ || null;
    });

    await browser.close();

    if (dtrait) {
        console.log(dtrait);
    }
})();
"""

        print("这个方案需要:")
        print("  1. 安装puppeteer: npm install puppeteer")
        print("  2. 运行脚本生成dtrait")
        print("\n优点: 完全自动化")
        print("缺点: 需要下载浏览器 (~300MB)")

        return None

    def method3_selenium(self):
        """方法3: 使用Selenium（比Playwright轻量）"""
        print("\n=== 方法3: Selenium方案 ===\n")

        print("创建Selenium脚本...")

        selenium_script = '''
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import json

# 配置
options = Options()
options.add_argument('--headless')  # 无头模式
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')

# 创建浏览器
driver = webdriver.Chrome(options=options)
driver.get('https://www.douyin.com/')

# 等待SDK加载
time.sleep(3)

# 从performance API获取请求头
logs = driver.get_log('performance')

for entry in logs:
    message = json.loads(entry['message'])
    if 'Network.requestWillBeSent' in message['message']['method']:
        headers = message['message']['params']['request']['headers']
        if 'x-tt-session-dtrait' in headers:
            print(headers['x-tt-session-dtrait'])
            break

driver.quit()
'''

        script_file = self.project_root / "scripts" / "selenium_generate_dtrait.py"
        with open(script_file, 'w') as f:
            f.write(selenium_script)

        print(f"✓ 已创建: {script_file}")
        print("\n使用方法:")
        print("  1. pip install selenium")
        print("  2. 下载ChromeDriver")
        print(f"  3. python3 {script_file}")

        return None

    def method4_manual_automation(self):
        """方法4: 半自动化（最可靠）"""
        print("\n=== 方法4: 半自动化提取（推荐） ===\n")

        print("步骤:")
        print("  1. 打开浏览器 -> F12 (开发者工具)")
        print("  2. 访问 https://www.douyin.com")
        print("  3. 扫码登录")
        print("  4. 在Network中找到任意请求")
        print("  5. 查看Request Headers")
        print("  6. 找到 x-tt-session-dtrait")
        print("  7. 复制值")

        print("\n或使用自动化工具:")
        print("  python3 scripts/extract_headers.py --curl '...' --save")

        return None

    def run(self):
        """运行所有方法"""
        print("="*60)
        print("完全模拟 x-tt-session-dtrait")
        print("="*60)

        # 尝试方法1
        dtrait = self.method1_nodejs_simulation()
        if dtrait:
            self._save_dtrait(dtrait)
            return dtrait

        # 其他方法需要手动操作
        print("\n" + "="*60)
        print("自动生成失败，提供以下方案:")
        print("="*60)

        print("\n方案A: Selenium (轻量级浏览器自动化)")
        print("  - 需要安装ChromeDriver")
        print("  - 脚本自动生成dtrait")
        print("  - 比Playwright轻量")

        print("\n方案B: Puppeteer (最完整)")
        print("  - 自动化程度最高")
        print("  - 需要下载浏览器")
        print("  - 完全自动化")

        print("\n方案C: 手动提取 (最简单)")
        print("  - 从浏览器复制一次")
        print("  - 可复用一段时间")
        print("  - 无需额外安装")

        print("\n选择哪个方案？（A/B/C）: ", end='')

        choice = input().strip().upper()

        if choice == 'A':
            self.method3_selenium()
        elif choice == 'B':
            self.method2_puppeteer_minimal()
        elif choice == 'C':
            self.method4_manual_automation()
        else:
            print("\n已取消")

        return None

    def _save_dtrait(self, dtrait):
        """保存dtrait"""
        config = {}
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                config = json.load(f)

        config['x_tt_session_dtrait'] = dtrait

        with open(self.config_file, 'w') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        print(f"\n✓ 已保存到: {self.config_file}")


if __name__ == '__main__':
    simulator = DtraitCompleteSimulation()
    simulator.run()
