import os

from src.config.config import Config
from src.downloader.downloader import DouyinDownloader, build_download_name


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
