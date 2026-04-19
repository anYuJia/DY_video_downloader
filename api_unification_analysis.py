#!/usr/bin/env python3
"""分析代码中需要统一 API 接口的地方"""

print("="*80)
print("代码统一性分析报告")
print("="*80)

analysis = """
## 1. 已统一的 API 接口 ✅

### DouyinAPI (src/api/api.py)
- ✅ common_request() - 支持 GET 和 POST，自动回退到浏览器
- ✅ browser_request() - 浏览器回退方案
- ✅ get_recommended_feed() - 推荐视频流（新添加）

### DouyinUserManager (src/user/user_manager.py)
- ✅ search_user() - 搜索用户
- ✅ get_user_videos() - 获取用户作品
- ✅ get_user_detail() - 获取用户详情
- ✅ get_video_detail() - 获取视频详情
- ✅ get_liked_videos() - 获取喜欢视频

所有方法都已使用 api.common_request() 统一接口

## 2. 需要统一的地方 ⚠️

### web_app.py 中的直接 subprocess 调用

#### A. 获取临时 Cookie (line 1925-1975)
```python
# 当前：直接调用 browser_worker
subprocess.run([sys.executable, worker_path], input=json.dumps({"action": "get_temp_cookie"}))

# 建议：迁移到 DouyinAPI 类
async def get_temp_cookie(self) -> dict:
    '''获取临时 Cookie（无需登录）'''
    # 使用 Playwright 获取临时 cookie
    # 返回 cookie 字符串
```

#### B. 获取视频详情下载 (line 2145-2228)
```python
# 当前：直接调用 browser_worker
subprocess.run([sys.executable, worker_path], input=json.dumps({
    "action": "get_video_detail",
    "aweme_id": aweme_id
}))

# 建议：使用 user_manager.get_video_detail()
# 已经存在！可以直接使用
```

### browser_worker.py 中的独立函数

#### 可以删除的函数：
- ❌ get_video_detail() - user_manager 已有相同功能

#### 需要保留但迁移的函数：
- ⚠️ get_temp_cookie() - 迁移到 DouyinAPI
- ⚠️ browser_fetch() - 保留作为底层工具
- ⚠️ browser_fetch_via_navigation() - 保留作为底层工具

## 3. 统一方案建议

### 方案 A：完全迁移（推荐）

1. 在 DouyinAPI 添加 get_temp_cookie() 方法
2. 删除 web_app.py 中所有 subprocess 调用
3. web_app.py 只调用 user_manager 的方法
4. browser_worker.py 只作为内部工具（被 DouyinAPI.browser_request 调用）

优点：
- 完全统一，代码清晰
- 易于维护
- 符合单一职责原则

缺点：
- 需要修改较多代码

### 方案 B：部分统一（当前状态）

1. 保留 browser_worker.py 作为独立工具
2. web_app.py 可以选择性调用
3. 核心 API 都通过 DouyinAPI

优点：
- 改动较小
- 灵活性高

缺点：
- 代码不够统一
- 有重复实现

## 4. 推荐实施步骤

### 第一步：统一视频详情获取
web_app.py 中的下载视频功能应该使用 user_manager.get_video_detail()
而不是直接调用 browser_worker

### 第二步：迁移 get_temp_cookie
将 browser_worker.get_temp_cookie() 迁移到 DouyinAPI 类中

### 第三步：清理重复代码
删除 browser_worker 中不再需要的 get_video_detail()

### 第四步：文档化
确保所有 API 调用都有清晰的使用说明
"""

print(analysis)

print("\n" + "="*80)
print("建议优先级")
print("="*80)
print("""
高优先级：
1. 统一视频详情获取 - 使用 user_manager.get_video_detail()
2. 迁移 get_temp_cookie 到 DouyinAPI

中优先级：
3. 删除 browser_worker 中的重复函数

低优先级：
4. 重构和优化
""")
