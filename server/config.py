"""Shared constants for Hermes Dashboard backend modules."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = Path(os.getenv("LIFEOS_DATA_DIR", BASE_DIR / "db")).expanduser().resolve()
HERMES_DIR = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes")).expanduser().resolve()

LOG_DB = Path(os.getenv("LIFEOS_LOG_DB", HERMES_DIR / "agent-logs.db")).expanduser().resolve()
STATE_DB = Path(os.getenv("LIFEOS_STATE_DB", HERMES_DIR / "state.db")).expanduser().resolve()
KANBAN_DB = Path(os.getenv("LIFEOS_LEGACY_KANBAN_DB", HERMES_DIR / "kanban.db")).expanduser().resolve()
LIFE_DB = Path(os.getenv("LIFEOS_LIFE_DB", DATA_DIR / "life.db")).expanduser().resolve()
BOARD_DB = Path(os.getenv("LIFEOS_BOARD_DB", DATA_DIR / "board.db")).expanduser().resolve()
ATLAS_DB = Path(os.getenv("LIFEOS_ATLAS_DB", DATA_DIR / "atlas.db")).expanduser().resolve()
CONTENT_DIR = Path(os.getenv("LIFEOS_CONTENT_DIR", HERMES_DIR / "content")).expanduser().resolve()
CRON_DIR = Path(os.getenv("LIFEOS_CRON_DIR", HERMES_DIR / "cron")).expanduser().resolve()
CRON_JOBS_JSON = CRON_DIR / "jobs.json"

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
