"""Basic smoke tests for LifeOS v4 backend."""

import pytest
import sys
from pathlib import Path

# Ensure the server package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_config_loads():
    """config.py loads without crashing even without env vars."""
    from server.config import PASSWORD, SESSION_SECRET, DATA_DIR, PORT
    assert isinstance(PASSWORD, str) and len(PASSWORD) > 0
    assert isinstance(SESSION_SECRET, str) and len(SESSION_SECRET) > 0
    assert isinstance(PORT, int)
    assert DATA_DIR.exists()


def test_db_migrations_idempotent():
    """migrate_all() runs cleanly (twice = idempotent)."""
    from server.db import migrate_all
    migrate_all()
    migrate_all()  # second run should not crash


def test_data_snapshot():
    """build_snapshot() returns a dict with expected keys."""
    from server.data import build_snapshot
    snap = build_snapshot()
    assert isinstance(snap, dict)
    assert "system" in snap
    assert "agents" in snap
