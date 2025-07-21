#!/usr/bin/env python
# -*- coding: utf-8 -*-

from setuptools import setup, find_packages

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

with open('requirements.txt', 'r', encoding='utf-8') as f:
    requirements = f.read().splitlines()

setup(
    name="douyin-downloader",
    version="1.0.0",
    author="anYuJia",
    author_email="",
    description="抖音视频下载器",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/anYuJia/DY_video_downloader",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.7",
    install_requires=requirements,
    entry_points={
        'console_scripts': [
            'douyin-downloader=launcher:main',
        ],
    },
)