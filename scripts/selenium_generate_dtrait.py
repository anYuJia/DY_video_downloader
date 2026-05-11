#!/usr/bin/env python3
"""
使用Selenium自动生成x-tt-session-dtrait

相比Playwright的优势：
- 更轻量级
- 不需要额外运行时
- 安装简单

使用方法：
1. pip install selenium
2. brew install chromedriver (macOS) 或下载对应版本
3. python3 scripts/selenium_generate_dtrait.py
"""
import sys
import json
import time
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
except ImportError:
    print("请安装Selenium: pip install selenium")
    sys.exit(1)


class SeleniumDtraitGenerator:
    """Selenium dtrait生成器"""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.config_file = self.project_root / "data" / "sign_config.json"
        self.config_file.parent.mkdir(parents=True, exist_ok=True)

    def generate(self, headless=True):
        """
        生成dtrait

        Args:
            headless: 是否无头模式
        """
        print("=== 使用Selenium生成dtrait ===\n")

        # 配置Chrome
        options = Options()
        if headless:
            options.add_argument('--headless')  # 无头模式
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option('excludeSwitches', ['enable-automation'])
        options.add_experimental_option('useAutomationExtension', False)

        # 设置User-Agent
        options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36')

        print("启动Chrome浏览器...")
        driver = None

        try:
            # 尝试创建driver
            driver = webdriver.Chrome(options=options)

            print("访问抖音...")
            driver.get('https://www.douyin.com/')

            # 等待页面加载
            time.sleep(3)

            print("等待SDK初始化...")
            time.sleep(2)

            # 尝试从performance日志中获取dtrait
            print("\n提取dtrait...")

            # 方法1: 从performance日志
            dtrait = self._extract_from_performance(driver)

            # 方法2: 如果方法1失败，从localStorage
            if not dtrait:
                dtrait = self._extract_from_localStorage(driver)

            # 方法3: 触发一次请求
            if not dtrait:
                dtrait = self._extract_from_request(driver)

            if dtrait:
                print(f"\n✓ 成功获取dtrait!")
                print(f"  长度: {len(dtrait)}")
                print(f"  预览: {dtrait[:50]}...")

                # 保存
                self._save_dtrait(dtrait)

                return dtrait
            else:
                print("\n✗ 未能获取dtrait")
                print("\n可能的原因:")
                print("  1. 页面未完全加载")
                print("  2. SDK未初始化")
                print("  3. 需要更多等待时间")

                # 如果是无头模式失败，建议使用有头模式
                if headless:
                    print("\n建议: 使用有头模式重试")
                    print("  python3 scripts/selenium_generate_dtrait.py --visible")

                return None

        except Exception as e:
            print(f"\n错误: {e}")

            if "chromedriver" in str(e).lower():
                print("\nChromeDriver问题:")
                print("  macOS: brew install chromedriver")
                print("  其他: 下载对应版本的ChromeDriver")
                print("  https://chromedriver.chromium.org/downloads")

            return None

        finally:
            if driver:
                driver.quit()
                print("\n浏览器已关闭")

    def _extract_from_performance(self, driver):
        """从performance日志提取"""
        try:
            logs = driver.get_log('performance')

            for entry in logs:
                message = json.loads(entry['message'])
                method = message.get('message', {}).get('method', '')

                # 查找网络请求
                if 'Network.requestWillBeSent' in method:
                    headers = message['message']['params']['request'].get('headers', {})

                    if 'x-tt-session-dtrait' in headers:
                        return headers['x-tt-session-dtrait']

        except Exception as e:
            print(f"  Performance日志提取失败: {e}")

        return None

    def _extract_from_localStorage(self, driver):
        """从localStorage提取"""
        try:
            dtrait = driver.execute_script("""
                // 尝试从localStorage获取
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    if (value && value.startsWith('d0_') && value.length > 100) {
                        return value;
                    }
                }
                return null;
            """)

            return dtrait

        except Exception as e:
            print(f"  localStorage提取失败: {e}")

        return None

    def _extract_from_request(self, driver):
        """触发请求并提取"""
        try:
            # 注入脚本监听请求
            driver.execute_script("""
                window.__dtrait__ = null;
                const originalXHR = window.XMLHttpRequest.prototype.open;
                window.XMLHttpRequest.prototype.open = function(method, url) {
                    this.addEventListener('readystatechange', function() {
                        if (this.readyState === 1) {
                            const dtrait = this.setRequestHeader.toString();
                            if (dtrait.includes('x-tt-session-dtrait')) {
                                // 提取dtrait
                            }
                        }
                    });
                    return originalXHR.apply(this, arguments);
                };
            """)

            # 刷新页面触发请求
            driver.refresh()
            time.sleep(3)

            # 获取结果
            dtrait = driver.execute_script("return window.__dtrait__;")

            return dtrait

        except Exception as e:
            print(f"  请求拦截失败: {e}")

        return None

    def _save_dtrait(self, dtrait):
        """保存dtrait到配置文件"""
        config = {}
        if self.config_file.exists():
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

        config['x_tt_session_dtrait'] = dtrait
        config['dtrait_generated_at'] = time.time()

        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        print(f"\n✓ 已保存到: {self.config_file}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Selenium生成dtrait')
    parser.add_argument('--visible', action='store_true', help='显示浏览器窗口')
    args = parser.parse_args()

    generator = SeleniumDtraitGenerator()
    dtrait = generator.generate(headless=not args.visible)

    if dtrait:
        print("\n" + "="*60)
        print("✓ 生成成功！")
        print("="*60)
        print("\n现在可以使用纯Python登录了:")
        print("  python3 scripts/douyin_full_login.py --login")
    else:
        print("\n" + "="*60)
        print("✗ 生成失败")
        print("="*60)
        sys.exit(1)


if __name__ == '__main__':
    main()
