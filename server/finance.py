"""Finance module — transactions, budgets, monthly summaries."""
import sqlite3
import uuid
from .config import LIFE_DB


def _life_conn():
    db = sqlite3.connect(str(LIFE_DB))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def _list_transactions(month=None):
    try:
        db = _life_conn()
        if month:
            cur = db.execute(
                "SELECT * FROM transactions WHERE strftime('%Y-%m', date) = ? ORDER BY date DESC, created_at DESC",
                (month,)
            )
        else:
            cur = db.execute("SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT 50")
        rows = [dict(r) for r in cur.fetchall()]
        db.close()
        return rows
    except Exception:
        return []


def _create_transaction(data):
    try:
        tid = str(uuid.uuid4())[:8]
        db = _life_conn()
        db.execute(
            "INSERT INTO transactions (id, date, type, category, amount, description) VALUES (?,?,?,?,?,?)",
            (tid, data['date'], data['type'], data['category'], float(data['amount']), data.get('description', ''))
        )
        db.commit()
        cur = db.execute("SELECT * FROM transactions WHERE id = ?", (tid,))
        row = dict(cur.fetchone())
        db.close()
        return row
    except Exception as e:
        return {"error": str(e)}


def _delete_transaction(tid):
    try:
        db = _life_conn()
        db.execute("DELETE FROM transactions WHERE id = ?", (tid,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False


def _month_summary(month):
    try:
        db = _life_conn()
        cur = db.execute(
            "SELECT type, COALESCE(SUM(amount),0) as total FROM transactions WHERE strftime('%Y-%m', date) = ? GROUP BY type",
            (month,)
        )
        totals = {r['type']: r['total'] for r in cur.fetchall()}
        income = float(totals.get('income', 0))
        expense = float(totals.get('expense', 0))

        cur = db.execute(
            "SELECT category, COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' AND strftime('%Y-%m', date) = ? GROUP BY category ORDER BY total DESC",
            (month,)
        )
        by_category = [dict(r) for r in cur.fetchall()]

        cur = db.execute("SELECT category, monthly_limit FROM budgets WHERE month = ?", (month,))
        budgets = {r['category']: float(r['monthly_limit']) for r in cur.fetchall()}

        for cat in by_category:
            cat['total'] = float(cat['total'])
            cat['budget'] = budgets.get(cat['category'], 0)
            cat['budget_pct'] = round(cat['total'] / cat['budget'] * 100, 1) if cat['budget'] > 0 else 0

        db.close()
        return {
            "month": month,
            "income": income,
            "expense": expense,
            "balance": income - expense,
            "by_category": by_category,
        }
    except Exception as e:
        return {"error": str(e)}


def _upsert_budget(data):
    try:
        db = _life_conn()
        db.execute(
            "INSERT INTO budgets (id, category, monthly_limit, month) VALUES (?,?,?,?) ON CONFLICT(category, month) DO UPDATE SET monthly_limit = ?",
            (str(uuid.uuid4())[:8], data['category'], float(data['monthly_limit']), data['month'], float(data['monthly_limit']))
        )
        db.commit()
        db.close()
        return True
    except Exception:
        return False


# ════════════════════════════════════════════
# Task 1: Update transaction (PATCH)
# ════════════════════════════════════════════
def _update_transaction(tid, data):
    try:
        db = _life_conn()
        sets = []
        params = []
        for key in ("date", "type", "category", "amount", "description"):
            if key in data:
                sets.append(f"{key} = ?")
                params.append(data[key])
        if not sets:
            db.close()
            return {"error": "no fields to update"}
        params.append(tid)
        db.execute(f"UPDATE transactions SET {', '.join(sets)} WHERE id = ?", params)
        db.commit()
        cur = db.execute("SELECT * FROM transactions WHERE id = ?", (tid,))
        row = cur.fetchone()
        db.close()
        if row:
            return dict(row)
        return {"error": "not found"}
    except Exception as e:
        return {"error": str(e)}


# ════════════════════════════════════════════
# Task 2: Monthly trends
# ════════════════════════════════════════════
def _monthly_trends(months=12):
    """Returns {months: [{month, income, expense, balance}, ...]}"""
    try:
        db = _life_conn()
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc)
        results = []
        for i in range(months - 1, -1, -1):
            first = today.replace(day=1) - timedelta(days=i * 30)
            month_str = first.strftime("%Y-%m")
            cur = db.execute(
                "SELECT type, COALESCE(SUM(amount),0) as total FROM transactions WHERE strftime('%Y-%m', date) = ? GROUP BY type",
                (month_str,)
            )
            totals = {r['type']: float(r['total']) for r in cur.fetchall()}
            income = totals.get('income', 0)
            expense = totals.get('expense', 0)
            results.append({
                "month": month_str,
                "income": income,
                "expense": expense,
                "balance": income - expense,
            })
        db.close()
        return results
    except Exception as e:
        return {"error": str(e)}


# ════════════════════════════════════════════
# Task 3: Recurring transactions
# ════════════════════════════════════════════
def _list_recurring():
    try:
        db = _life_conn()
        cur = db.execute("SELECT * FROM recurring WHERE active=1 ORDER BY day, category")
        rows = [dict(r) for r in cur.fetchall()]
        db.close()
        return rows
    except Exception as e:
        return {"error": str(e)}


def _create_recurring(data):
    try:
        rid = str(uuid.uuid4())[:8]
        db = _life_conn()
        db.execute(
            "INSERT INTO recurring (id, type, category, amount, description, frequency, day) VALUES (?,?,?,?,?,?,?)",
            (rid, data['type'], data['category'], float(data['amount']), data.get('description',''), data.get('frequency','monthly'), int(data.get('day', 1)))
        )
        db.commit()
        cur = db.execute("SELECT * FROM recurring WHERE id = ?", (rid,))
        row = dict(cur.fetchone())
        db.close()
        return row
    except Exception as e:
        return {"error": str(e)}


def _delete_recurring(rid):
    # Soft delete — marks as inactive
    try:
        db = _life_conn()
        db.execute("UPDATE recurring SET active=0 WHERE id=?", (rid,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False


# ════════════════════════════════════════════
# Task 4: Savings Goals
# ════════════════════════════════════════════
def _list_goals():
    try:
        db = _life_conn()
        cur = db.execute("SELECT * FROM goals ORDER BY created_at DESC")
        rows = [dict(r) for r in cur.fetchall()]
        db.close()
        return rows
    except Exception as e:
        return {"error": str(e)}


def _create_goal(data):
    try:
        gid = str(uuid.uuid4())[:8]
        db = _life_conn()
        db.execute(
            "INSERT INTO goals (id, name, target, current, deadline, icon, color) VALUES (?,?,?,?,?,?,?)",
            (gid, data['name'], float(data['target']), float(data.get('current', 0)), data.get('deadline'), data.get('icon', '🎯'), data.get('color', '#8b5cf6'))
        )
        db.commit()
        cur = db.execute("SELECT * FROM goals WHERE id = ?", (gid,))
        row = dict(cur.fetchone())
        db.close()
        return row
    except Exception as e:
        return {"error": str(e)}


def _update_goal(gid, data):
    try:
        db = _life_conn()
        sets = []
        params = []
        for key in ("name", "target", "current", "deadline", "icon", "color"):
            if key in data:
                sets.append(f"{key} = ?")
                params.append(data[key])
        if not sets:
            db.close()
            return {"error": "no fields to update"}
        params.append(gid)
        db.execute(f"UPDATE goals SET {', '.join(sets)} WHERE id = ?", params)
        db.commit()
        cur = db.execute("SELECT * FROM goals WHERE id = ?", (gid,))
        row = cur.fetchone()
        db.close()
        if row:
            return dict(row)
        return {"error": "not found"}
    except Exception as e:
        return {"error": str(e)}


def _delete_goal(gid):
    try:
        db = _life_conn()
        db.execute("DELETE FROM goals WHERE id=?", (gid,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False


# ════════════════════════════════════════════
# Task 5: Month-over-month comparison
# ════════════════════════════════════════════
def _month_comparison(current_month):
    """Returns {expense_change_pct, income_change_pct} vs previous month."""
    from datetime import datetime
    try:
        y, m = current_month.split('-')
        ym = int(y); mm = int(m)
        if mm == 1:
            prev_month = f"{ym-1}-12"
        else:
            prev_month = f"{ym}-{mm-1:02d}"

        current = _month_summary(current_month)
        previous = _month_summary(prev_month)

        def pct_change(curr, prev):
            if prev == 0: return 0 if curr == 0 else 100
            return round((curr - prev) / prev * 100, 1)

        return {
            "current_month": current_month,
            "previous_month": prev_month,
            "expense_change_pct": pct_change(current.get('expense',0), previous.get('expense',0)),
            "income_change_pct": pct_change(current.get('income',0), previous.get('income',0)),
            "current_expense": current.get('expense',0),
            "previous_expense": previous.get('expense',0),
        }
    except Exception as e:
        return {"error": str(e)}
