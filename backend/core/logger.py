import logging
import sys
from pathlib import Path
from backend.core.config import config

_LEVEL_MAP = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

_log_dir = Path(__file__).resolve().parents[3] / "logs"
_log_dir.mkdir(exist_ok=True)

_fmt = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
_level = _LEVEL_MAP.get(config.LOG_LEVEL, logging.INFO)

# Force UTF-8 on stdout so unicode chars don't crash on Windows cp1252 consoles
_stream_handler = logging.StreamHandler(
    stream=open(sys.stdout.fileno(), mode="w", encoding="utf-8", closefd=False)
)
_stream_handler.setFormatter(logging.Formatter(_fmt))

_file_handler = logging.FileHandler(_log_dir / "combined.log", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter(_fmt))

logging.root.setLevel(_level)
logging.root.handlers = [_stream_handler, _file_handler]

logger = logging.getLogger("adw")
