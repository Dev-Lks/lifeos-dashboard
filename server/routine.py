"""Routine module — habits, daily logs, streaks, history."""
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from .config import LIFE_DB


def _life_conn():
    db = sqlite3.connect(str(LIFE_DB))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def _list_habits():
    try:
        db = _life_conn()
        cur = db.execute("SELECT * FROM habits ORDER BY created_at")
        rows = [dict(r) for r in cur.fetchall()]
        db.close()
        return rows
    except Exception:
        return []


def _create_habit(data):
    try:
        hid = str(uuid.uuid4())[:8]
        db = _life_conn()
        db.execute(
            "INSERT INTO habits (id, name, description, frequency, color, icon) VALUES (?,?,?,?,?,?)",
            (hid, data['name'], data.get('description', ''), data.get('frequency', 'daily'), data.get('color', '#8b5cf6'), data.get('icon', '✅'))
        )
        db.commit()
        cur = db.execute("SELECT * FROM habits WHERE id = ?", (hid,))
        row = dict(cur.fetchone())
        db.close()
        return row
    except Exception as e:
        return {"error": str(e)}


def _delete_habit(hid):
    try:
        db = _life_conn()
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("DELETE FROM habits WHERE id = ?", (hid,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False


def _log_habit(hid, date=None, completed=True):
    try:
        if date is None:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        db = _life_conn()
        cur = db.execute("SELECT id, completed FROM habit_logs WHERE habit_id = ? AND date = ?", (hid, date))
        existing = cur.fetchone()
        if existing:
            new_val = 0 if existing['completed'] else 1
            db.execute("UPDATE habit_logs SET completed = ? WHERE id = ?", (new_val, existing['id']))
        else:
            lid = str(uuid.uuid4())[:8]
            db.execute("INSERT INTO habit_logs (id, habit_id, date, completed) VALUES (?,?,?,?)",
                       (lid, hid, date, 1 if completed else 0))
        db.commit()
        db.close()
        return {"ok": True, "date": date}
    except Exception as e:
        return {"error": str(e)}


def _today_status():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        db = _life_conn()
        habits = [dict(r) for r in db.execute("SELECT * FROM habits ORDER BY created_at").fetchall()]
        for h in habits:
            cur = db.execute("SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?", (h['id'], today))
            log = cur.fetchone()
            h['done_today'] = bool(log and log['completed'])
        cur = db.execute("SELECT * FROM daily_logs WHERE date = ?", (today,))
        row = cur.fetchone()
        daily = dict(row) if row else None
        db.close()
        return {"date": today, "habits": habits, "daily_log": daily}
    except Exception as e:
        return {"error": str(e)}


def _save_daily_log(data):
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        db = _life_conn()
        db.execute(
            "INSERT INTO daily_logs (id, date, mood, focus, summary) VALUES (?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET mood=?, focus=?, summary=?",
            (str(uuid.uuid4())[:8], today,
             data.get('mood'), data.get('focus', ''), data.get('summary', ''),
             data.get('mood'), data.get('focus', ''), data.get('summary', ''))
        )
        db.commit()
        db.close()
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}


def _habit_streaks():
    try:
        db = _life_conn()
        habits = [dict(r) for r in db.execute("SELECT id, name, icon FROM habits").fetchall()]
        today = datetime.now(timezone.utc).date()
        result = []
        for h in habits:
            streak = 0
            check = today
            while True:
                cur = db.execute(
                    "SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?",
                    (h['id'], check.isoformat())
                )
                row = cur.fetchone()
                if row and row['completed']:
                    streak += 1
                    check -= timedelta(days=1)
                else:
                    break
            result.append({"id": h['id'], "name": h['name'], "icon": h['icon'], "streak": streak})
        db.close()
        return result
    except Exception:
        return []


def _habit_history(days=7):
    try:
        db = _life_conn()
        today = datetime.now(timezone.utc).date()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
        habits = [dict(r) for r in db.execute("SELECT id, name, icon, color FROM habits ORDER BY created_at").fetchall()]
        for h in habits:
            h['days'] = {}
            for d in dates:
                cur = db.execute("SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?", (h['id'], d))
                row = cur.fetchone()
                h['days'][d] = bool(row and row['completed'])
        db.close()
        return {"dates": dates, "habits": habits}
    except Exception:
        return {"dates": [], "habits": []}
