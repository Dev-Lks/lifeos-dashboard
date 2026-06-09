"""Health API."""
from datetime import datetime, timezone

from fastapi import APIRouter

from ..config import DATA_DIR
from ..data import _vps_stats
from ..db import table_names

router = APIRouter(prefix="/api", tags=["health"])


def normalized_health():
    vps = _vps_stats()
    return {
        "ok": True,
        "time": datetime.now(timezone.utc).isoformat(),
        "data_dir": str(DATA_DIR),
        "database": {
            "life_tables": table_names("life"),
            "board_tables": table_names("board"),
        },
        "vps": vps,
        "health": {
            "cpu_percent": vps.get("cpu_pct", 0),
            "memory": {
                "percent_used": vps.get("mem_pct", 0),
                "used_mb": vps.get("mem_used_mb", 0),
                "total_mb": vps.get("mem_total_mb", 0),
            },
            "disk": {
                "percent_used": vps.get("disk_pct", 0),
                "used_gb": vps.get("disk_used_gb", 0),
                "total_gb": vps.get("disk_total_gb", 0),
            },
        },
    }


@router.get("/health")
def health():
    return normalized_health()
