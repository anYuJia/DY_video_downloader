import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.config import Config
from src.downloader.downloader import build_download_title


def check_long_download_title_preserves_aweme_id_suffix():
    aweme_id = "7380011223344556677"
    title = build_download_title("很长标题" * 80, aweme_id)

    assert title.endswith(aweme_id)
    assert len(title.encode("utf-8")) <= Config.MAX_FILENAME_BYTES


def check_long_download_title_keeps_more_safe_text():
    aweme_id = "7380011223344556677"
    desc = "abcdefghijklmnopqrstuvwxyz" * 8
    title = build_download_title(desc, aweme_id)

    assert title.startswith("abcdefghijklmnopqrstuvwxyz" * 6)
    assert title.endswith(aweme_id)
    assert len(title.encode("utf-8")) <= Config.MAX_FILENAME_BYTES


if __name__ == "__main__":
    check_long_download_title_preserves_aweme_id_suffix()
    check_long_download_title_keeps_more_safe_text()
