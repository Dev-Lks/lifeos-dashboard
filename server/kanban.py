"""Kanban module — board tasks CRUD with due_date, assignee, tags, archived."""
import sqlite3
import uuid
import json
from datetime import datetime, timezone
from urllib.parse import unquote
from .config import BOARD_DB


def _board_conn():
    db = sqlite3.connect(str(BOARD_DB))
    db.row_factory = sqlite3.Row
    return db


def init_board_db():
    """Create table + migrate existing DB with new columns."""
    db = _board_conn()
    # Base table
    db.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    """)
    # Migration: add new columns if they don't exist
    existing = {row[1] for row in db.execute("PRAGMA table_info(tasks)").fetchall()}
    for col, typ, default in [
        ("due_date", "TEXT", "''"),
        ("assignee", "TEXT", "''"),
        ("tags", "TEXT", "'[]'"),
        ("archived", "INTEGER", "0"),
        ("project_id", "TEXT", "''"),
    ]:
        if col not in existing:
            db.execute(f"ALTER TABLE tasks ADD COLUMN {col} {typ} DEFAULT {default}")
    db.commit()
    db.close()


def _build_task(row):
    """Convert a sqlite3.Row to a dict."""
    if row is None:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "status": row["status"],
        "priority": row["priority"],
        "notes": row["notes"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "due_date": row["due_date"] or "",
        "assignee": row["assignee"] or "",
        "tags": row["tags"] or "[]",
        "archived": bool(row["archived"]),
        "project_id": row["project_id"] if "project_id" in row.keys() else "",
    }


def list_board_tasks(params=None):
    """List tasks with optional filters. params: dict with search, assignee, priority, tag, archived."""
    if not BOARD_DB.exists():
        return []
    init_board_db()

    params = params or {}
    search = params.get("search", "").strip()
    assignee = params.get("assignee", "").strip()
    priority = params.get("priority", "").strip()
    tag_filter = params.get("tag", "").strip()
    project_filter = params.get("project_id", "").strip()
    show_archived = params.get("archived", "").strip() in ("1", "true", "yes")

    try:
        db = _board_conn()
        where = []
        vals = []

        if not show_archived:
            where.append("archived = 0")
        elif show_archived and params.get("archived"):
            where.append("archived = 1")

        if search:
            where.append("(title LIKE ? OR notes LIKE ?)")
            vals.extend([f"%{search}%", f"%{search}%"])

        if assignee:
            where.append("assignee = ?")
            vals.append(assignee)

        if priority:
            where.append("priority = ?")
            vals.append(priority)

        if tag_filter:
            where.append("tags LIKE ?")
            vals.append(f"%{tag_filter}%")

        if project_filter:
            where.append("project_id = ?")
            vals.append(project_filter)

        sql = "SELECT * FROM tasks"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_at DESC"

        rows = [_build_task(r) for r in db.execute(sql, vals).fetchall()]
        db.close()
        return rows
    except Exception:
        return []


def get_board_task(task_id):
    """Fetch a single task by id."""
    if not BOARD_DB.exists():
        return None
    init_board_db()
    try:
        db = _board_conn()
        row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        db.close()
        return _build_task(row)
    except Exception:
        return None


def create_board_task(data):
    """Create a new task with all fields."""
    task_id = str(uuid.uuid4())[:8]
    title = data.get("title", "Untitled")
    priority = data.get("priority", "medium")
    notes = data.get("notes", "")
    due_date = data.get("due_date", "")
    assignee = data.get("assignee", "")
    tags = data.get("tags", "[]")
    project_id = data.get("project_id", "")
    now = datetime.now(timezone.utc).isoformat()
    try:
        db = _board_conn()
        db.execute(
            """INSERT INTO tasks
               (id, title, status, priority, notes, created_at, updated_at, due_date, assignee, tags, archived, project_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,0,?)""",
            (task_id, title, "pending", priority, notes, now, now, due_date, assignee, tags, project_id),
        )
        db.commit()
        db.close()
        return _build_task(
            sqlite3.Row(**{
                "id": task_id, "title": title, "status": "pending",
                "priority": priority, "notes": notes,
                "created_at": now, "updated_at": now,
                "due_date": due_date, "assignee": assignee, "tags": tags, "archived": 0, "project_id": project_id,
            }) if False else _build_task_from_local(task_id, title, priority, notes, due_date, assignee, tags, now, project_id)
        )

    except Exception:
        return None


def _build_task_from_local(task_id, title, priority, notes, due_date, assignee, tags, now, project_id=""):
    """Fallback task builder when sqlite3.Row(**...) not available."""
    return {
        "id": task_id,
        "title": title,
        "status": "pending",
        "priority": priority,
        "notes": notes,
        "created_at": now,
        "updated_at": now,
        "due_date": due_date,
        "assignee": assignee,
        "tags": tags,
        "archived": False,
        "project_id": project_id,
    }


def update_board_task(task_id, data):
    """Update a task — handles all fields including archived."""
    if not BOARD_DB.exists():
        return None
    try:
        db = _board_conn()
        sets = []
        params = []
        for key in ("status", "priority", "title", "notes", "due_date", "assignee", "tags", "project_id"):
            if key in data:
                sets.append(f"{key} = ?")
                params.append(data[key])
        if "archived" in data:
            sets.append("archived = ?")
            params.append(1 if data["archived"] else 0)
        if not sets:
            db.close()
            return None
        sets.append("updated_at = ?")
        params.append(datetime.now(timezone.utc).isoformat())
        params.append(task_id)
        db.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", params)
        db.commit()
        row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        db.close()
        return _build_task(row)
    except Exception:
        return None


def archive_board_task(task_id):
    """Soft-delete: set archived=1."""
    return update_board_task(task_id, {"archived": True})


def delete_board_task(task_id):
    """Hard delete — use archive instead when possible."""
    if not BOARD_DB.exists():
        return False
    try:
        db = _board_conn()
        db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False


def board_stats():
    """Return task metrics."""
    if not BOARD_DB.exists():
        return _empty_stats()
    init_board_db()
    try:
        db = _board_conn()
        # Counts by status (non-archived)
        total = db.execute("SELECT COUNT(*) FROM tasks WHERE archived=0").fetchone()[0]
        pending = db.execute("SELECT COUNT(*) FROM tasks WHERE status='pending' AND archived=0").fetchone()[0]
        in_progress = db.execute("SELECT COUNT(*) FROM tasks WHERE status='in_progress' AND archived=0").fetchone()[0]
        completed = db.execute("SELECT COUNT(*) FROM tasks WHERE status='completed' AND archived=0").fetchone()[0]
        archived = db.execute("SELECT COUNT(*) FROM tasks WHERE archived=1").fetchone()[0]

        # Overdue (due_date < today AND status != completed)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        overdue = db.execute(
            "SELECT COUNT(*) FROM tasks WHERE due_date != '' AND due_date < ? AND status != 'completed' AND archived=0",
            (today,)
        ).fetchone()[0]

        # Due today
        due_today = db.execute(
            "SELECT COUNT(*) FROM tasks WHERE due_date = ? AND archived=0",
            (today,)
        ).fetchone()[0]

        # By assignee
        assignee_rows = db.execute(
            "SELECT assignee, COUNT(*) as cnt FROM tasks WHERE archived=0 AND assignee != '' GROUP BY assignee"
        ).fetchall()
        by_assignee = {r["assignee"]: r["cnt"] for r in assignee_rows}

        # By tag (parse JSON in Python)
        tag_rows = db.execute(
            "SELECT tags FROM tasks WHERE archived=0 AND tags != '[]' AND tags != ''"
        ).fetchall()
        by_tag = {}
        for r in tag_rows:
            try:
                for t in json.loads(r["tags"]):
                    by_tag[t] = by_tag.get(t, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass

        db.close()
        return {
            "total": total, "pending": pending, "in_progress": in_progress,
            "completed": completed, "archived": archived,
            "overdue": overdue, "due_today": due_today,
            "by_assignee": by_assignee, "by_tag": by_tag,
        }
    except Exception:
        return _empty_stats()


def _empty_stats():
    return {
        "total": 0, "pending": 0, "in_progress": 0,
        "completed": 0, "archived": 0, "overdue": 0, "due_today": 0,
        "by_assignee": {}, "by_tag": {},
    }
