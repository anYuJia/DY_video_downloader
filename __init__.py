#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DY Video Downloader
一个功能强大的抖音视频下载器
"""

__version__ = "1.0.0"
__author__ = "anYuJia"
__description__ = "抖音视频下载器 - 支持批量下载用户作品、点赞视频等功能"

# 导出主要模块
from src.api.api import DouyinAPI
from src.config.config import Config
from src.downloader.downloader import DouyinDownloader
from src.user.user_manager import DouyinUserManager

__all__ = [
    'DouyinAPI',
    'Config', 
    'DouyinDownloader',
    'DouyinUserManager'
]