"""LifeOS configuration — loaded from environment variables.

Required env vars:
    LIFEOS_PASSWORD      — master password for authentication
    LIFEOS_SESSION_SECRET — long random secret for cookie signing

Optional env vars (with defaults):
    LIFEOS_DATA_DIR      — persistence directory (default: ./data)
    LIFEOS_ENABLE_SHELL  — allow shell actions (1=yes, 0=no; default: 0)
    PORT                 — server port (default: 8700)
"""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent.resolve()

# ── Required ──────────────────────────────────────────────────
PASSWORD = os.environ.get("LIFEOS_PASSWORD")
SESSION_SECRET = os.environ.get("LIFEOS_SESSION_SECRET")

if not PASSWORD:
    # In development, generate a random one so the server starts
    PASSWORD = secrets.token_urlsafe(16)
    print(f"[WARNING] LIFEOS_PASSWORD not set — using random token: {PASSWORD}")

if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_urlsafe(32)
    print(f"[WARNING] LIFEOS_SESSION_SECRET not set — using random key")

# ── Optional ──────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("LIFEOS_DATA_DIR", str(BASE_DIR / "data")))
ENABLE_SHELL = os.environ.get("LIFEOS_ENABLE_SHELL", "0") == "1"
PORT = int(os.environ.get("PORT", "8700"))

# ── Paths ─────────────────────────────────────────────────────
DATA_DIR.mkdir(parents=True, exist_ok=True)

LIFE_DB = DATA_DIR / "life.db"
BOARD_DB = DATA_DIR / "board.db"
ATLAS_DB = DATA_DIR / "atlas.db"
CRON_JOBS_JSON = DATA_DIR / "cron_jobs.json"
CONTENT_DIR = DATA_DIR / "content"

# Legacy paths (kept for compatibility)
LOG_DB = Path.home() / ".hermes/agent-logs.db"
STATE_DB = Path.home() / ".hermes/state.db"
KANBAN_DB = Path.home() / ".hermes/kanban.db"
CRON_DIR = Path.home() / ".hermes/cron"
CRON_JOBS_JSON_LEGACY = CRON_DIR / "jobs.json"

CONTENT_DIR.mkdir(parents=True, exist_ok=True)

# ── Optional deps ─────────────────────────────────────────────
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
