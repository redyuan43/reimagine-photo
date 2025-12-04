import os
import logging
from pathlib import Path

# 环境与日志配置，以及数据目录统一入口

def _load_local_env() -> None:
    """从本地环境文件加载变量，支持 .local.env 与 .env.local。"""
    paths = [Path('.local.env'), Path('.env.local')]
    for p in paths:
        if p.exists():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    for line in f:
                        s = line.strip()
                        if not s or s.startswith('#'):
                            continue
                        if '=' not in s:
                            continue
                        k, v = s.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")
            except Exception:
                pass

_load_local_env()

DATA_DIR = Path(os.getenv("DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR = DATA_DIR / "images"
LOGS_DIR = DATA_DIR / "logs"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"
LOG_PATH = DATA_DIR / "server.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
    ],
)
logger = logging.getLogger("reimagine")

__all__ = [
    "logger",
    "DATA_DIR",
    "IMAGES_DIR",
    "LOGS_DIR",
    "DB_PATH",
    "LOG_PATH",
    "_load_local_env",
]

