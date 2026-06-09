"""Shared constants for Hermes Dashboard backend modules."""
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent.resolve()
LOG_DB = Path.home() / ".hermes/agent-logs.db"
STATE_DB = Path.home() / ".hermes/state.db"
KANBAN_DB = Path.home() / ".hermes/kanban.db"
LIFE_DB = BASE_DIR / "db/life.db"
BOARD_DB = BASE_DIR / "db/board.db"
CONTENT_DIR = Path.home() / ".hermes/content"
CRON_DIR = Path.home() / ".hermes/cron"
CRON_JOBS_JSON = CRON_DIR / "jobs.json"

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
