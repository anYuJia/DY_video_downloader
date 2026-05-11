#!/usr/bin/env python3
"""
完全自动化生成dtrait - 无需任何手动操作

特点：
- 自动安装Node.js依赖
- 自动运行Puppeteer生成dtrait
- 一条命令完成所有操作

使用方法：
    python3 scripts/auto_generate_dtrait.py
"""
import sys
import subprocess
from pathlib import Path


def check_node():
    """检查Node.js"""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        print(f"✓ Node.js版本: {result.stdout.strip()}")
        return True
    except FileNotFoundError:
        print("✗ 未安装Node.js")
        print("\n安装方法:")
        print("  macOS: brew install node")
        print("  Ubuntu: sudo apt install nodejs npm")
        print("  Windows: https://nodejs.org/")
        return False


def install_dependencies():
    """安装依赖"""
    print("\n=== 安装依赖 ===\n")

    scripts_dir = Path(__file__).parent
    package_json = scripts_dir / "package.json"

    if not package_json.exists():
        print(f"✗ 未找到: {package_json}")
        return False

    print("安装npm依赖...")
    print("（首次运行会下载Chromium，约300MB，请耐心等待）\n")

    result = subprocess.run(
        ['npm', 'install'],
        cwd=str(scripts_dir),
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("✓ 依赖安装成功")
        return True
    else:
        print(f"✗ 安装失败: {result.stderr}")
        return False


def generate_dtrait():
    """运行生成脚本"""
    print("\n=== 生成dtrait ===\n")

    scripts_dir = Path(__file__).parent
    generate_script = scripts_dir / "generate_dtrait_auto.js"

    if not generate_script.exists():
        print(f"✗ 未找到: {generate_script}")
        return False

    result = subprocess.run(
        ['node', str(generate_script)],
        cwd=str(scripts_dir),
        capture_output=True,
        text=True
    )

    print(result.stdout)

    if result.returncode == 0:
        return True
    else:
        print("错误:", result.stderr)
        return False


def main():
    print("="*60)
    print("全自动生成 x-tt-session-dtrait")
    print("="*60)
    print()

    # 步骤1: 检查Node.js
    if not check_node():
        sys.exit(1)

    # 步骤2: 安装依赖
    if not install_dependencies():
        sys.exit(1)

    # 步骤3: 生成dtrait
    if not generate_dtrait():
        sys.exit(1)

    print("\n" + "="*60)
    print("✓ 成功！")
    print("="*60)
    print("\n现在可以使用纯Python登录了:")
    print("  python3 scripts/douyin_full_login.py --login")


if __name__ == '__main__':
    main()
