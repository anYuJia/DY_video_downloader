# Cookie 获取方案文档

## 概述

本项目支持多种方式获取抖音 Cookie，从轻量级到重量级依次为：

1. **从浏览器读取**（推荐）- 最轻量，无需 Playwright
2. **手动输入** - 传统方式
3. **生成临时 Cookie** - HTTP 方式优先，失败时使用 Playwright

## 方案对比

| 方案 | 是否需要Playwright | 性能 | 登录态 | 适用场景 |
|------|-------------------|------|--------|----------|
| 从浏览器读取 | ❌ 不需要 | ⚡⚡⚡ 最快 | ✅ 已登录 | 最推荐 |
| 手动输入 | ❌ 不需要 | ⚡⚡⚡ 最快 | ✅ 已登录 | 熟练用户 |
| HTTP生成临时Cookie | ❌ 不需要 | ⚡⚡⚡ 很快 | ❌ 未登录 | 临时使用 |
| Playwright生成临时Cookie | ✅ 需要 | ⚡ 较慢 | ❌ 未登录 | 备用方案 |

## 详细说明

### 方案1：从浏览器读取 Cookie（推荐）✨

**优势**：
- ✅ 不需要 Playwright
- ✅ 速度最快
- ✅ 自动读取已登录账号
- ✅ 支持 Chrome, Edge, Firefox, Safari

**使用方法**：
1. 在浏览器中登录抖音账号
2. 点击"从浏览器读取"按钮
3. 系统自动读取 Cookie

**实现原理**：
- 直接读取浏览器本地存储的 Cookie 数据库
- 支持 macOS, Windows, Linux 三大平台
- 无需启动浏览器，无需 Playwright

**API 端点**：
```
POST /api/cookie/from_browser
```

**代码示例**：
```python
from src.api.api import DouyinAPI

result = DouyinAPI.get_browser_cookies()
if result['success']:
    cookie = result['cookie']
    print(f"从 {result['browser']} 读取到 {result['count']} 个 Cookie")
```

### 方案2：手动输入 Cookie

**优势**：
- ✅ 不需要额外依赖
- ✅ 用户完全控制
- ✅ 最稳定

**使用方法**：
1. 在浏览器中登录抖音
2. 打开开发者工具（F12）
3. 切换到 Network 标签
4. 刷新页面
5. 找到任意请求，查看 Request Headers
6. 复制 Cookie 值
7. 粘贴到输入框

**注意**：
- Cookie 应包含 `sessionid` 才表示已登录
- 推荐参数：`ttwid`, `s_v_web_id`

### 方案3：生成临时 Cookie

**HTTP 方式（优先）**：
- ✅ 不需要 Playwright
- ✅ 访问抖音主页自动获取
- ✅ 速度快，资源占用少

**Playwright 方式（回退）**：
- ⚠️ 需要 Playwright
- ⚠️ 需要浏览器驱动（~280MB）
- ✅ 模拟真实浏览器
- ✅ 可处理 JavaScript 设置的 Cookie

**使用方法**：
点击"生成临时 Cookie"按钮

**API 端点**：
```
POST /api/cookie/generate_temp
```

**实现逻辑**：
```python
async def get_temp_cookie():
    # 1. 尝试 HTTP 方式（不需要 Playwright）
    cookie = await _get_temp_cookie_http()
    if cookie:
        return cookie

    # 2. 回退到 Playwright 方式
    return await _get_temp_cookie_playwright()
```

## 依赖安装

### 必需依赖
```bash
pip install requests
```

### 可选依赖（用于从浏览器读取Cookie）
```bash
pip install browser-cookie3
```

### 可选依赖（用于Playwright方式）
```bash
pip install playwright playwright-stealth
python -m playwright install chromium
```

## 推荐方案

### 对于普通用户
**推荐使用方案1：从浏览器读取**
1. 在 Chrome/Edge/Firefox 中登录抖音
2. 点击"从浏览器读取"按钮
3. 完成配置

### 对于开发者
推荐使用方案2：手动输入
- 完全控制
- 无需额外依赖
- 稳定可靠

### 对于临时使用
推荐使用方案3：生成临时 Cookie
- HTTP 方式优先，无需 Playwright
- 自动回退到 Playwright

## 性能对比

### 从浏览器读取
- 时间：< 1 秒
- 内存：< 10 MB
- 磁盘：无需额外空间

### HTTP 生成临时 Cookie
- 时间：1-2 秒
- 内存：< 50 MB
- 磁盘：无需额外空间

### Playwright 生成临时 Cookie
- 时间：5-10 秒
- 内存：200-300 MB
- 磁盘：~280 MB（浏览器驱动）

## 平台支持

| 平台 | 从浏览器读取 | HTTP临时 | Playwright临时 |
|------|-------------|----------|---------------|
| macOS | ✅ Chrome, Edge, Firefox, Safari | ✅ | ✅ |
| Windows | ✅ Chrome, Edge, Firefox | ✅ | ✅ |
| Linux | ✅ Chrome, Firefox | ✅ | ✅ |

## 故障排除

### 从浏览器读取失败

**问题1：提示"缺少 browser-cookie3 模块"**
```bash
pip install browser-cookie3
```

**问题2：提示"未能从任何浏览器读取到抖音 Cookie"**
- 确保已在浏览器中登录抖音
- 尝试关闭浏览器后重试
- 检查浏览器权限设置

**问题3：macOS Safari 读取失败**
- Safari 需要完全磁盘访问权限
- 系统偏好设置 → 安全性与隐私 → 隐私 → 完全磁盘访问权限
- 添加 Terminal 或 Python

### 生成临时 Cookie 失败

**问题1：HTTP 方式失败**
- 检查网络连接
- 系统会自动回退到 Playwright 方式

**问题2：Playwright 方式失败**
```bash
# 安装 Playwright
pip install playwright playwright-stealth

# 安装浏览器驱动
python -m playwright install chromium
```

## 最佳实践

1. **优先级**：从浏览器读取 > 手动输入 > 生成临时
2. **安全性**：定期更新 Cookie（推荐每周）
3. **隐私**：不要分享包含登录态的 Cookie
4. **备份**：保存有效的 Cookie 到安全位置

## 总结

- 🚀 **推荐方案**：从浏览器读取 - 快速、简单、无需Playwright
- 🎯 **熟练用户**：手动输入 - 完全控制
- 🔄 **临时使用**：生成临时 Cookie - HTTP优先，自动回退

通过多种方案的组合，确保用户可以在任何情况下都能方便地获取 Cookie！
