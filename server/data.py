"""Data module — agent stats, VPS stats, activity, build_snapshot."""
import sqlite3
from datetime import datetime, timezone
from .config import LOG_DB, STATE_DB, KANBAN_DB, LIFE_DB, HAS_PSUTIL

if HAS_PSUTIL:
    import psutil


def _life_conn():
    db = sqlite3.connect(str(LIFE_DB))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def _life_init():
    db = _life_conn()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income','expense')),
            category TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS budgets (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            monthly_limit REAL NOT NULL CHECK(monthly_limit > 0),
            month TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(category, month)
        );
        CREATE TABLE IF NOT EXISTS habits (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            frequency TEXT NOT NULL DEFAULT 'daily' CHECK(frequency IN ('daily','weekly')),
            color TEXT DEFAULT '#8b5cf6',
            icon TEXT DEFAULT '✅',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS habit_logs (
            id TEXT PRIMARY KEY,
            habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(habit_id, date)
        );
        CREATE TABLE IF NOT EXISTS daily_logs (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL UNIQUE,
            mood INTEGER CHECK(mood BETWEEN 1 AND 5),
            focus TEXT DEFAULT '',
            summary TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS recurring (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('income','expense')),
            category TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            description TEXT DEFAULT '',
            frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('weekly','monthly','yearly')),
            day INTEGER NOT NULL DEFAULT 1,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            target REAL NOT NULL CHECK(target > 0),
            current REAL NOT NULL DEFAULT 0,
            deadline TEXT,
            icon TEXT DEFAULT '🎯',
            color TEXT DEFAULT '#8b5cf6',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
        CREATE INDEX IF NOT EXISTS idx_hl_date ON habit_logs(date);
        CREATE INDEX IF NOT EXISTS idx_hl_habit ON habit_logs(habit_id);
    """)
    db.commit()
    db.close()


def _agent_responses():
    """Count total responses per agent from log DB."""
    if not LOG_DB.exists():
        return {}
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute(
            "SELECT agent_name, COUNT(*) as cnt FROM agent_logs GROUP BY agent_name"
        )
        out = {}
        for r in cur.fetchall():
            name = r["agent_name"].lower() if r["agent_name"] else ""
            out[name] = r["cnt"]
        db.close()
        return out
    except Exception:
        return {}


def _recent_activity(limit=20):
    if not LOG_DB.exists():
        return []
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute(
            "SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        rows = []
        for r in cur.fetchall():
            rows.append({
                "agent": (r["agent_name"] or "").lower(),
                "task": r.get("task_description", "") or r.get("prompt", "") or "",
                "status": r.get("status", ""),
                "time": r["created_at"],
                "relative": _relative_time(r["created_at"]),
            })
        db.close()
        return rows
    except Exception:
        return []


def _relative_time(iso_str):
    try:
        d = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        s = (datetime.now(timezone.utc) - d).total_seconds()
        if s < 60:
            return f"{int(s)}s ago" if s >= 5 else "now"
        if s < 3600:
            return f"{int(s//60)}m ago"
        if s < 86400:
            return f"{int(s//3600)}h ago"
        return f"{int(s//86400)}d ago"
    except Exception:
        return ""


def _agent_stats():
    AGENT_CONFIG = [
        {"code": "orchestrator", "name": "Orchestrator", "accent": "#8b5cf6", "platform": "openai", "role": "Top-level coordinator"},
        {"code": "scout", "name": "Scout", "accent": "#3b82f6", "platform": "openai", "role": "Research & intelligence"},
        {"code": "scribe", "name": "Scribe", "accent": "#10b981", "platform": "anthropic", "role": "Writing & content"},
        {"code": "reach", "name": "Reach", "accent": "#f59e0b", "platform": "openai", "role": "Marketing & growth"},
        {"code": "dev", "name": "Dev", "accent": "#ef4444", "platform": "openai", "role": "Development & automation"},
    ]
    responses = _agent_responses()
    activity = _recent_activity(50)
    per_day = _agent_activity_by_day()
    success = _agent_success_rate()
    models = _agent_model()
    last_ts = _agent_last_activity()

    out = []
    for ac in AGENT_CONFIG:
        name = ac["code"]
        resp = responses.get(name, 0)
        now_ts = datetime.now(timezone.utc)
        status = "dormant"
        if name in last_ts:
            try:
                lt = datetime.fromisoformat(last_ts[name].replace("Z", "+00:00"))
                diff = (now_ts - lt).total_seconds()
                if diff < 300:
                    status = "active"
                elif diff < 3600:
                    status = "idle"
            except Exception:
                pass

        recent = [a for a in activity if a["agent"] == name]
        last_task = recent[0]["task"] if recent else ""
        last_relative = recent[0]["relative"] if recent else ""

        daily = per_day.get(name, {d: 0 for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]})

        out.append({
            "name": ac["name"],
            "code": ac["code"],
            "accent": ac["accent"],
            "platform": ac["platform"],
            "role": ac["role"],
            "responses": resp,
            "status": status,
            "last_task": last_task,
            "last_relative": last_relative,
            "daily": {d: daily[d] for d in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},
            "success_pct": success.get(name, 100),
            "model": models.get(name, "—"),
        })
    return out


def _vps_stats():
    out = {
        "cpu_pct": 0.0, "mem_pct": 0.0, "mem_used_mb": 0, "mem_total_mb": 0,
        "disk_pct": 0.0, "disk_used_gb": 0.0, "disk_total_gb": 0.0, "db_size_mb": 0.0,
    }
    if HAS_PSUTIL:
        out["cpu_pct"] = round(psutil.cpu_percent(interval=0.1), 1)
        mem = psutil.virtual_memory()
        out["mem_pct"] = round(mem.percent, 1)
        out["mem_used_mb"] = round(mem.used / (1024 * 1024))
        out["mem_total_mb"] = round(mem.total / (1024 * 1024))
        disk = psutil.disk_usage("/")
        out["disk_pct"] = round(disk.percent, 1)
        out["disk_used_gb"] = round(disk.used / (1024**3), 1)
        out["disk_total_gb"] = round(disk.total / (1024**3), 1)

    db_size = 0
    for dbp in [LOG_DB, STATE_DB, KANBAN_DB]:
        if dbp.exists():
            db_size += dbp.stat().st_size
    out["db_size_mb"] = round(db_size / (1024 * 1024), 1)
    return out


def _kanban_count():
    if not KANBAN_DB.exists():
        return 0
    try:
        db = sqlite3.connect(str(KANBAN_DB))
        cur = db.execute("SELECT COUNT(*) FROM tasks")
        n = cur.fetchone()[0]
        db.close()
        return n
    except Exception:
        return 0


def _session_stats():
    out = {"count": 0, "totals": {"messages": 0, "input_tokens": 0, "cache_read_tokens": 0}}
    if not STATE_DB.exists():
        return out
    try:
        db = sqlite3.connect(str(STATE_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute("SELECT COUNT(*) as cnt FROM sessions")
        out["count"] = cur.fetchone()["cnt"]
        cur = db.execute("SELECT COUNT(*) as cnt FROM messages")
        out["totals"]["messages"] = cur.fetchone()["cnt"]
        db.close()
    except Exception:
        pass
    return out


def _stats_summary():
    if not LOG_DB.exists():
        return {"total": 0, "completed": 0, "failed": 0}
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute("SELECT COUNT(*) as total FROM agent_logs")
        total = cur.fetchone()["total"]
        cur = db.execute("SELECT COUNT(*) as cnt FROM agent_logs WHERE status='completed'")
        completed = cur.fetchone()["cnt"]
        cur = db.execute("SELECT COUNT(*) as cnt FROM agent_logs WHERE status='failed'")
        failed = cur.fetchone()["cnt"]
        db.close()
        return {"total": total, "completed": completed, "failed": failed}
    except Exception:
        return {"total": 0, "completed": 0, "failed": 0}


def _uptime_seconds():
    try:
        with open("/proc/uptime") as f:
            return int(float(f.read().split()[0]))
    except Exception:
        return 0


def _activity_by_day():
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out = {d: 0 for d in days}
    if not LOG_DB.exists():
        return [{"day": d, "total": out[d]} for d in days]
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute("SELECT created_at FROM agent_logs ORDER BY created_at")
        for r in cur.fetchall():
            try:
                ts = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                dow = ts.strftime("%a")
                if dow in out:
                    out[dow] += 1
            except Exception:
                pass
        db.close()
    except Exception:
        pass
    return [{"day": d, "total": out[d]} for d in days]


def _agent_activity_by_day():
    agent_names = ["orchestrator", "scout", "scribe", "reach", "dev"]
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out = {a: {d: 0 for d in days} for a in agent_names}
    if not LOG_DB.exists():
        return out
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute("SELECT agent_name, created_at FROM agent_logs ORDER BY created_at")
        for r in cur.fetchall():
            name = r["agent_name"].lower() if r["agent_name"] else ""
            if name not in out:
                continue
            try:
                ts = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                dow = ts.strftime("%a")
                out[name][dow] += 1
            except Exception:
                pass
        db.close()
    except Exception:
        pass
    return out


def _agent_model():
    if not LOG_DB.exists():
        return {}
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute(
            "SELECT agent_name, model_used, COUNT(*) as cnt FROM agent_logs "
            "WHERE model_used IS NOT NULL AND model_used != '' "
            "GROUP BY agent_name, model_used ORDER BY cnt DESC"
        )
        out = {}
        for r in cur.fetchall():
            name = r["agent_name"].lower() if r["agent_name"] else ""
            if name not in out:
                out[name] = r["model_used"]
        db.close()
        return out
    except Exception:
        return {}


def _agent_success_rate():
    if not LOG_DB.exists():
        return {}
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute(
            "SELECT agent_name, status, COUNT(*) as cnt FROM agent_logs GROUP BY agent_name, status"
        )
        totals = {}
        completed = {}
        for r in cur.fetchall():
            name = r["agent_name"].lower() if r["agent_name"] else ""
            totals[name] = totals.get(name, 0) + r["cnt"]
            if r["status"] == "completed":
                completed[name] = completed.get(name, 0) + r["cnt"]
        db.close()
        out = {}
        for name in totals:
            out[name] = round((completed.get(name, 0) / totals[name] * 100), 1) if totals[name] > 0 else 100
        return out
    except Exception:
        return {}


def _agent_last_activity():
    if not LOG_DB.exists():
        return {}
    try:
        db = sqlite3.connect(str(LOG_DB))
        db.row_factory = sqlite3.Row
        cur = db.execute("SELECT agent_name, MAX(created_at) as last_ts FROM agent_logs GROUP BY agent_name")
        out = {}
        for r in cur.fetchall():
            name = r["agent_name"].lower() if r["agent_name"] else ""
            out[name] = r["last_ts"]
        db.close()
        return out
    except Exception:
        return {}


def build_snapshot():
    """Full data snapshot for the dashboard."""
    from .db import migrate_all
    from .lifeos import lifeos_summary
    migrate_all()
    agents = _agent_stats()
    stats = _stats_summary()
    sessions = _session_stats()
    max_resp = max((a["responses"] for a in agents), default=1)

    from .cron import cron_jobs  # lazy import to avoid circular

    return {
        "agents": agents,
        "activity": _recent_activity(20),
        "vps": _vps_stats(),
        "kanban": {"total": _kanban_count()},
        "sessions": sessions,
        "stats": stats,
        "gateway": {"uptime_seconds": _uptime_seconds()},
        "activity_by_day": _activity_by_day(),
        "max_responses": max_resp,
        "integrity_pct": round(
            (stats["completed"] / stats["total"] * 100) if stats["total"] > 0 else 100, 2
        ),
        "integrity_responsive": 5,
        "crons": cron_jobs(),
        "lifeos": lifeos_summary(),
    }
