import tempfile
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config.config import Config
from src.utils import download_history_index


def _with_temp_download_root(callback):
    original_download_dir = Config.DOWNLOAD_DIR
    original_history_dirs = Config.HISTORY_DIRS
    original_config_file = Config.CONFIG_FILE

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        Config.DOWNLOAD_DIR = str(root)
        Config.HISTORY_DIRS = []
        Config.CONFIG_FILE = str(root / "config.json")
        download_history_index.invalidate_download_history_cache(drop_disk=True)
        try:
            callback(root)
        finally:
            download_history_index.invalidate_download_history_cache(drop_disk=True)
            Config.DOWNLOAD_DIR = original_download_dir
            Config.HISTORY_DIRS = original_history_dirs
            Config.CONFIG_FILE = original_config_file


def check_rebuild_download_history_index_keeps_only_media_files():
    def run(root: Path):
        author_dir = root / "作者"
        author_dir.mkdir()
        media_files = [
            author_dir / "video.mp4",
            author_dir / "image.webp",
            author_dir / "audio.m4a",
        ]
        ignored_files = [
            author_dir / "download_record.json",
            author_dir / "notes.txt",
            author_dir / "archive.zip",
            author_dir / "no_extension",
        ]

        for file_path in [*media_files, *ignored_files]:
            file_path.write_bytes(b"test")

        items = download_history_index.rebuild_download_history_index()
        names = {item["name"] for item in items}

        assert names == {file_path.name for file_path in media_files}

    _with_temp_download_root(run)


def check_upsert_download_history_entries_ignores_non_media_files():
    def run(root: Path):
        media_file = root / "clip.mov"
        text_file = root / "readme.md"
        media_file.write_bytes(b"test")
        text_file.write_text("ignore me", encoding="utf-8")

        download_history_index.upsert_download_history_entries([media_file, text_file])
        items = download_history_index.get_download_history_items()

        assert [item["name"] for item in items] == ["clip.mov"]

    _with_temp_download_root(run)


if __name__ == "__main__":
    check_rebuild_download_history_index_keeps_only_media_files()
    check_upsert_download_history_entries_ignores_non_media_files()
