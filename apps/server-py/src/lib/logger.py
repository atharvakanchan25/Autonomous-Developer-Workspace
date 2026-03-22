import logging
import sys
from pathlib import Path
from src.lib.config import config

_LEVEL_MAP = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

_log_dir = Path(__file__).resolve().parents[3] / "logs"
_log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=_LEVEL_MAP.get(config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_log_dir / "combined.log"),
    ],
)

logger = logging.getLogger("adw")
