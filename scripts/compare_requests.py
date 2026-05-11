#!/usr/bin/env python3
"""对比成功请求和当前请求的差异"""
import json
from pathlib import Path

# 读取成功的请求
captured_file = Path("data/login_exploration/captured_api_params.json")
with open(captured_file, 'r') as f:
    captured = json.load(f)

# 读取当前配置
config_file = Path("data/sign_config.json")
with open(config_file, 'r') as f:
    config = json.load(f)

print("=== 对比成功请求 vs 当前配置 ===\n")

# 对比headers
success_headers = captured["get_qrcode"][0]["headers"]
print("成功的请求 Headers:")
for key in sorted(success_headers.keys()):
    value = success_headers[key]
    if len(value) > 50:
        print(f"  {key}: {value[:50]}...")
    else:
        print(f"  {key}: {value}")

print("\n" + "="*60)
print("\n当前配置中的参数:")
for key, value in config.items():
    if len(str(value)) > 50:
        print(f"  {key}: {str(value)[:50]}...")
    else:
        print(f"  {key}: {value}")

print("\n" + "="*60)
print("\n缺失的关键参数:")

required_headers = [
    "x-tt-session-dtrait",
    "x-tt-passport-csrf-token",
    "x-tt-passport-aid-sign",
    "x-tt-passport-trace-id",
    "x-tt-passport-verify-portrait",
]

for header in required_headers:
    if header in success_headers:
        if header.replace("-", "_") in config or header in config:
            print(f"  ✓ {header}: 已配置")
        else:
            value = success_headers[header]
            print(f"  ✗ {header}: 未配置")
            print(f"      值: {value[:50]}...")
