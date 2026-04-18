#!/usr/bin/env python3
"""Playwright 检测和安装工具

支持：
- Windows / macOS / Linux 三平台适配
- 国内镜像加速（清华、阿里云）
- PyInstaller 打包环境检测
- 浏览器驱动国内CDN加速
"""
import sys
import subprocess
import os
import platform
import locale


def get_platform_info():
    """获取平台信息"""
    system = platform.system()
    is_china = _detect_china_env()
    return {
        'system': system,
        'is_windows': system == 'Windows',
        'is_macos': system == 'Darwin',
        'is_linux': system == 'Linux',
        'is_china': is_china,
        'python_exe': sys.executable,
    }


def _detect_china_env() -> bool:
    """检测是否在中国大陆环境（用于选择镜像源）"""
    # 1. 环境变量强制指定
    if os.environ.get('USE_CHINA_MIRROR', '').lower() in ('1', 'true', 'yes'):
        return True
    if os.environ.get('USE_GLOBAL_MIRROR', '').lower() in ('1', 'true', 'yes'):
        return False

    # 2. 语言/区域检测
    try:
        lang = locale.getdefaultlocale()[0] or ''
        if 'zh_CN' in lang or 'zh_Hans' in lang:
            return True
    except Exception:
        pass

    try:
        sys_lang = locale.getlocale()[0] or ''
        if 'zh_CN' in sys_lang or 'zh_Hans' in sys_lang:
            return True
    except Exception:
        pass

    # 3. 时区检测
    try:
        import time
        tz = time.tzname[0] if time.tzname else ''
        if 'Shanghai' in tz or 'Chongqing' in tz or 'Hong_Kong' in tz:
            return True
    except Exception:
        pass

    return False


def _get_pip_mirror() -> list:
    """获取 pip 镜像源参数"""
    info = get_platform_info()
    if info['is_china']:
        # 清华镜像（最稳定）
        return ['-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
                '--trusted-host', 'pypi.tuna.tsinghua.edu.cn']
    return []


def _get_creation_flags() -> int:
    """Windows 下隐藏子进程窗口"""
    if platform.system() == 'Windows':
        try:
            return subprocess.CREATE_NO_WINDOW
        except AttributeError:
            return 0
    return 0


def check_playwright_installed():
    """检测 Playwright 是否正确安装

    Returns:
        tuple: (is_installed: bool, message: str)
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        missing = str(e).split("'")[-2] if "'" in str(e) else "playwright"
        return False, f"缺少依赖: {missing}"

    try:
        from playwright_stealth import Stealth
    except ImportError:
        return False, "缺少 playwright-stealth 模块"

    # 检查浏览器驱动
    try:
        python_exe = sys.executable
        result = subprocess.run(
            [python_exe, '-m', 'playwright', 'install', '--dry-run', 'chromium'],
            capture_output=True, text=True, timeout=10,
            creationflags=_get_creation_flags()
        )
        output = (result.stdout + result.stderr).lower()
        if 'already installed' in output or result.returncode == 0:
            return True, "Playwright 已正确安装"
        return False, "浏览器驱动未安装"
    except subprocess.TimeoutExpired:
        return False, "检测超时"
    except FileNotFoundError:
        return False, "playwright 命令不可用"
    except Exception:
        # --dry-run 不支持时，尝试检查浏览器路径
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                path = p.chromium.executable_path
                if path and os.path.exists(path):
                    return True, "Playwright 已正确安装"
                return False, "浏览器驱动未安装"
        except Exception as e:
            return False, f"验证失败: {str(e)}"


def install_playwright_dependencies(use_mirror=None):
    """安装 Playwright 依赖

    Args:
        use_mirror: 是否使用国内镜像，None=自动检测

    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        info = get_platform_info()
        use_china = use_mirror if use_mirror is not None else info['is_china']

        print("=" * 60)
        print("安装 Playwright 依赖")
        print(f"平台: {info['system']}")
        print(f"镜像: {'清华源 (国内加速)' if use_china else '官方源'}")
        print("=" * 60)

        python_exe = info['python_exe']
        flags = _get_creation_flags()

        # 步骤 1: 安装 Python 包
        print("\n[1/2] 安装 Python 包...")
        pip_cmd = [python_exe, '-m', 'pip', 'install']
        if use_china:
            pip_cmd += _get_pip_mirror()
        pip_cmd += ['playwright', 'playwright-stealth']

        print(f"  命令: {' '.join(pip_cmd[:6])}...")

        result = subprocess.run(
            pip_cmd, capture_output=True, text=True,
            timeout=300, creationflags=flags
        )

        if result.returncode != 0:
            err = result.stderr or result.stdout
            # 如果镜像失败，尝试官方源
            if use_china and ('error' in err.lower() or 'failed' in err.lower()):
                print("  清华源失败，尝试官方源...")
                result = subprocess.run(
                    [python_exe, '-m', 'pip', 'install', 'playwright', 'playwright-stealth'],
                    capture_output=True, text=True, timeout=300,
                    creationflags=flags
                )
                if result.returncode != 0:
                    return False, f"安装失败:\n{result.stderr or result.stdout}"

            if result.returncode != 0:
                return False, f"安装失败:\n{err}"

        print("  ✓ Python 包安装成功")

        # 步骤 2: 安装浏览器驱动
        print("\n[2/2] 安装浏览器驱动 (~280MB)...")
        if use_china:
            print("  提示: 国内下载可能较慢，请耐心等待")

        # 设置国内CDN环境变量加速浏览器驱动下载
        env = os.environ.copy()
        if use_china:
            # Playwright 浏览器驱动国内CDN（淘宝镜像）
            env['PLAYWRIGHT_DOWNLOAD_HOST'] = 'https://cdn.npmmirror.com/binaries/playwright'

        result = subprocess.run(
            [python_exe, '-m', 'playwright', 'install', 'chromium'],
            capture_output=True, text=True, timeout=600,
            creationflags=flags, env=env
        )

        if result.returncode != 0:
            err = result.stderr or result.stdout
            # 如果CDN失败，去掉CDN重试
            if use_china:
                print("  CDN加速失败，尝试官方源...")
                result = subprocess.run(
                    [python_exe, '-m', 'playwright', 'install', 'chromium'],
                    capture_output=True, text=True, timeout=600,
                    creationflags=flags
                )
            if result.returncode != 0:
                return False, f"浏览器驱动安装失败:\n{result.stderr or result.stdout}"

        print("  ✓ 浏览器驱动安装成功")

        # 步骤 3: Linux 系统依赖
        if info['is_linux']:
            print("\n[3/3] 安装 Linux 系统依赖...")
            try:
                result = subprocess.run(
                    [python_exe, '-m', 'playwright', 'install-deps', 'chromium'],
                    capture_output=True, text=True, timeout=600,
                )
                if result.returncode == 0:
                    print("  ✓ 系统依赖安装成功")
                else:
                    print("  ⚠ 需要 sudo 权限")
                    print("  请手动运行: sudo python -m playwright install-deps chromium")
            except Exception as e:
                print(f"  ⚠ 跳过: {e}")

        print("\n" + "=" * 60)
        print("✅ Playwright 安装完成！")
        print("=" * 60)
        return True, "Playwright 安装成功"

    except subprocess.TimeoutExpired:
        return False, "安装超时，请重试"
    except Exception as e:
        return False, f"安装失败: {str(e)}"


def get_installation_guide():
    """获取安装指南"""
    info = get_platform_info()
    s = info['system']

    guide = f"""Playwright 安装指南
==================

平台: {s}
镜像: {'清华源 (国内加速)' if info['is_china'] else '官方源'}

方法 1: 自动安装（推荐）
----------------------
在应用中点击"安装 Playwright"按钮。

方法 2: 手动安装
----------------
"""

    if info['is_china']:
        guide += """# 使用清华镜像加速
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple playwright playwright-stealth

# 设置浏览器驱动CDN加速
set PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright  (Windows)
export PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright  (macOS/Linux)

# 安装浏览器驱动
python -m playwright install chromium
"""
    else:
        guide += """pip install playwright playwright-stealth
python -m playwright install chromium
"""

    if info['is_linux']:
        guide += "\n# Linux 系统依赖\nsudo python -m playwright install-deps chromium\n"

    guide += """
方法 3: 阿里云镜像
------------------
pip install -i https://mirrors.aliyun.com/pypi/simple/ playwright playwright-stealth

注意事项
--------
1. 浏览器驱动约 280MB，首次下载较慢
2. 国内建议使用镜像源加速
3. macOS/Windows 通常无需额外依赖
4. Linux 可能需要 sudo 安装系统依赖

验证安装
--------
python -c "from playwright.sync_api import sync_playwright; print('OK')"
"""
    return guide


def check_and_prompt_install():
    """检测并在需要时提示安装"""
    is_installed, message = check_playwright_installed()
    if not is_installed:
        info = get_platform_info()
        print(f"\n⚠️  Playwright 未安装: {message}")
        print(f"平台: {info['system']}")
        print(get_installation_guide())
        try:
            resp = input("\n是否安装? (y/n): ").strip().lower()
            if resp == 'y':
                success, msg = install_playwright_dependencies()
                print(f"\n{'✅' if success else '❌'} {msg}")
                return success
            print("已取消。部分功能不可用。")
        except KeyboardInterrupt:
            print("\n已取消。")
        return False
    return True


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Playwright 检测和安装工具')
    parser.add_argument('--check', action='store_true', help='检测安装状态')
    parser.add_argument('--install', action='store_true', help='安装')
    parser.add_argument('--install-mirror', action='store_true', help='使用国内镜像安装')
    parser.add_argument('--install-global', action='store_true', help='使用官方源安装')
    parser.add_argument('--guide', action='store_true', help='显示安装指南')
    args = parser.parse_args()

    if args.check:
        ok, msg = check_playwright_installed()
        print(f"{'✅' if ok else '❌'} {msg}")
        sys.exit(0 if ok else 1)
    elif args.install:
        ok, msg = install_playwright_dependencies()
        print(f"{'✅' if ok else '❌'} {msg}")
        sys.exit(0 if ok else 1)
    elif args.install_mirror:
        ok, msg = install_playwright_dependencies(use_mirror=True)
        print(f"{'✅' if ok else '❌'} {msg}")
        sys.exit(0 if ok else 1)
    elif args.install_global:
        ok, msg = install_playwright_dependencies(use_mirror=False)
        print(f"{'✅' if ok else '❌'} {msg}")
        sys.exit(0 if ok else 1)
    elif args.guide:
        print(get_installation_guide())
    else:
        check_and_prompt_install()
