import os

from src.config.config import Config
from src.downloader.downloader import DouyinDownloader, build_download_name
from src.user.user_manager import DouyinUserManager


def _user_manager():
    manager = DouyinUserManager.__new__(DouyinUserManager)
    manager.debug_mode = False
    return manager


def test_dedupe_extracts_only_protected_aweme_suffix(tmp_path):
    original_dir = Config.DOWNLOAD_DIR
    Config.DOWNLOAD_DIR = str(tmp_path)
    try:
        downloader = DouyinDownloader(api=None)
        assert (
            downloader._extract_downloaded_aweme_id("标题123456789012_7380011223344556677.mp4")
            == "7380011223344556677"
        )
        assert (
            downloader._extract_downloaded_aweme_id("标题_7380011223344556677_02.jpg")
            == "7380011223344556677"
        )
        assert downloader._extract_downloaded_aweme_id("标题123456789012.mp4") == ""
    finally:
        Config.DOWNLOAD_DIR = original_dir


def test_dedupe_ignores_partial_and_tiny_files(tmp_path):
    original_dir = Config.DOWNLOAD_DIR
    Config.DOWNLOAD_DIR = str(tmp_path)
    try:
        downloader = DouyinDownloader(api=None)
        partial = tmp_path / "标题_7380011223344556677.mp4.tmp"
        partial.write_bytes(b"x" * 8192)
        tiny = tmp_path / "标题_7380011223344556677.mp4"
        tiny.write_bytes(b"x")
        complete = tmp_path / "标题_7380011223344556678.mp4"
        complete.write_bytes(os.urandom(8192))

        assert not downloader._is_complete_download_file(str(tmp_path), partial.name)
        assert not downloader._is_complete_download_file(str(tmp_path), tiny.name)
        assert downloader._is_complete_download_file(str(tmp_path), complete.name)
    finally:
        Config.DOWNLOAD_DIR = original_dir


def test_author_name_with_asterisk_is_sanitized_before_download(tmp_path):
    original_dir = Config.DOWNLOAD_DIR
    Config.DOWNLOAD_DIR = str(tmp_path)
    try:
        download_name = build_download_name("作者*星号", "标题", "7380011223344556677")
        assert "*" not in download_name
        assert download_name.startswith("作者_星号/")

        downloader = DouyinDownloader(api=None)
        user_dir, filename = downloader._split_download_name("作者*星号/标题*正文_7380011223344556677")
        assert user_dir == "作者_星号"
        assert filename == "标题_正文_7380011223344556677"
    finally:
        Config.DOWNLOAD_DIR = original_dir


def test_video_selection_skips_watermarked_play_addr_for_list_items():
    manager = _user_manager()
    previous_quality = Config.DOWNLOAD_QUALITY
    Config.DOWNLOAD_QUALITY = "auto"
    try:
        post = {
            "aweme_id": "1234567890123456789",
            "desc": "liked video",
            "video": {
                "play_addr": {"url_list": ["https://example.com/aweme/v1/playwm/?watermark=1"]},
                "download_addr": {"url_list": ["https://example.com/clean.mp4"]},
                "duration": 1000,
            },
            "statistics": {},
            "author": {},
        }

        result = manager._build_collection_video_item(post)

        assert result["media_urls"] == [{"type": "video", "url": "https://example.com/clean.mp4"}]
        assert result["video"]["play_addr"] == "https://example.com/clean.mp4"
    finally:
        Config.DOWNLOAD_QUALITY = previous_quality


def test_video_selection_honors_smallest_quality_for_list_items():
    manager = _user_manager()
    previous_quality = Config.DOWNLOAD_QUALITY
    Config.DOWNLOAD_QUALITY = "smallest"
    try:
        video_data = {
            "play_addr": {"url_list": ["https://example.com/default.mp4"]},
            "play_addr_lowbr": {"url_list": ["https://example.com/low.mp4"]},
            "bit_rate": [
                {
                    "data_size": 500,
                    "play_addr": {"url_list": ["https://example.com/high.mp4"]},
                    "play_addr_h264": {"url_list": ["https://example.com/high-h264.mp4"]},
                }
            ],
        }

        assert manager._select_video_url(video_data) == "https://example.com/low.mp4"
        assert manager._build_video_media_urls(video_data) == [
            {"type": "video", "url": "https://example.com/low.mp4"}
        ]
    finally:
        Config.DOWNLOAD_QUALITY = previous_quality
