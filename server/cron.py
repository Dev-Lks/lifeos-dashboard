"""Cron module — parse cron expressions, list jobs."""
import json
from datetime import datetime, timezone
from pathlib import Path
from .config import CRON_DIR, CRON_JOBS_JSON


def _cron_description(expr: str) -> str:
    parts = expr.strip().split()
    if len(parts) != 5:
        return expr
    minute, hour, dom, month, dow = parts
    DOW = {"0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
           "4": "Thursday", "5": "Friday", "6": "Saturday", "7": "Sunday"}
    MONTH = {"1": "January", "2": "February", "3": "March", "4": "April",
             "5": "May", "6": "June", "7": "July", "8": "August",
             "9": "September", "10": "October", "11": "November", "12": "December"}

    def _describe_time(minute, hour):
        if minute == "0" and hour != "*":
            h = int(hour)
            ap = "AM" if h < 12 else "PM"
            h12 = h if 1 <= h <= 12 else (12 if h == 0 else h - 12)
            return f"{h12}:00 {ap}"
        elif minute != "*" and hour != "*":
            h = int(hour)
            m = int(minute)
            ap = "AM" if h < 12 else "PM"
            h12 = h if 1 <= h <= 12 else (12 if h == 0 else h - 12)
            return f"{h12}:{m:02d} {ap}"
        elif minute.startswith("*/"):
            return f"every {minute[2:]} minutes"
        return None

    if minute.startswith("*/") and hour == "*" and dom == "*" and month == "*" and dow == "*":
        interval = minute[2:]
        return f"Every {interval} minute{'s' if interval != '1' else ''}"
    if minute == "0" and hour == "*" and dom == "*" and month == "*" and dow == "*":
        return "Every hour"

    time_str = _describe_time(minute, hour)
    if dom == "*" and month == "*" and dow == "*" and time_str:
        return f"Every day at {time_str}"
    if dom != "*" and month == "*" and dow == "*" and time_str:
        return f"Day {dom} at {time_str}"
    if dom == "*" and month == "*" and dow != "*" and time_str:
        day_name = DOW.get(dow, dow)
        if "," in dow:
            days = ", ".join(DOW.get(d.strip(), d.strip()) for d in dow.split(","))
            return f"Every {days} at {time_str}"
        return f"Every {day_name} at {time_str}"
    if dom == "*" and month != "*" and dow == "*" and time_str:
        return f"Every {MONTH.get(month, month)} at {time_str}"
    if hour == "*" and minute != "*":
        return f"Minute {minute} of every hour"
    return f"cron({expr})"


def _next_run_relative(expr: str) -> str:
    if not expr or len(expr.strip().split()) != 5:
        return ""
    try:
        import croniter
        now = datetime.now(timezone.utc)
        cron = croniter.croniter(expr, now)
        next_dt = cron.get_next(datetime)
        diff = next_dt - now
        total_secs = int(diff.total_seconds())
        if total_secs < 0:
            return "now"
        if total_secs < 60:
            return f"in {total_secs}s"
        if total_secs < 3600:
            return f"in {total_secs // 60}m"
        if total_secs < 86400:
            h = total_secs // 3600
            m = (total_secs % 3600) // 60
            return f"in {h}h {m}m" if m > 0 else f"in {h}h"
        now_date = now.date()
        next_date = next_dt.date()
        days_diff = (next_date - now_date).days
        time_str = next_dt.strftime("%H:%M")
        if days_diff == 1:
            return f"tomorrow {time_str}"
        return f"in {days_diff}d ({next_dt.strftime('%a %H:%M')})"
    except Exception:
        return ""


def cron_jobs():
    jobs = []
    # Hermes cron from jobs.json
    try:
        if CRON_JOBS_JSON.exists():
            data = json.loads(CRON_JOBS_JSON.read_text())
            for j in data.get("jobs", []):
                if not j.get("enabled", True):
                    continue
                expr = j.get("schedule_display", j.get("schedule", {}).get("expr", ""))
                name = j.get("name", "")
                command = j.get("script") or j.get("prompt", "")[:80] or "(no-op)"
                next_run_raw = j.get("next_run_at", "")
                next_run = ""
                if next_run_raw:
                    try:
                        nr_dt = datetime.fromisoformat(next_run_raw.replace("Z", "+00:00"))
                        now = datetime.now(timezone.utc)
                        diff = (nr_dt - now).total_seconds()
                        if diff < 60:
                            next_run = "imminent"
                        elif diff < 3600:
                            next_run = f"in {int(diff // 60)}m"
                        elif diff < 86400:
                            h = int(diff // 3600)
                            m = int((diff % 3600) // 60)
                            next_run = f"in {h}h {m}m" if m > 0 else f"in {h}h"
                        else:
                            days = int(diff // 86400)
                            if days == 1:
                                next_run = f"tomorrow {nr_dt.strftime('%H:%M')}"
                            else:
                                next_run = f"in {days}d ({nr_dt.strftime('%a %H:%M')})"
                    except Exception:
                        next_run = _next_run_relative(expr)
                else:
                    next_run = _next_run_relative(expr)
                jobs.append({
                    "source": "hermes", "owner": "hermes", "name": name,
                    "command": command, "schedule": expr,
                    "description": _cron_description(expr),
                    "next_run": next_run, "id": j.get("id", ""),
                })
    except Exception:
        pass

    # System crontabs
    try:
        spooldir = Path("/var/spool/cron/crontabs")
        if spooldir.exists():
            for cf in spooldir.iterdir():
                if cf.is_file() and cf.name != ".placeholder":
                    lines = cf.read_text().splitlines()
                    for line in lines:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split(None, 5)
                        if len(parts) >= 6:
                            expr = " ".join(parts[:5])
                            command = parts[5]
                            if len(command) > 120:
                                command = command[:117] + "..."
                            jobs.append({
                                "source": str(cf), "owner": "system", "name": "",
                                "command": command, "schedule": expr,
                                "description": _cron_description(expr),
                                "next_run": _next_run_relative(expr), "id": "",
                            })
    except Exception:
        pass

    # /etc/crontab
    try:
        etcfile = Path("/etc/crontab")
        if etcfile.exists():
            lines = etcfile.read_text().splitlines()
            for line in lines:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(None, 6)
                if len(parts) >= 7:
                    expr = " ".join(parts[:5])
                    user = parts[5]
                    command = parts[6]
                    if len(command) > 120:
                        command = command[:117] + "..."
                    jobs.append({
                        "source": str(etcfile), "owner": "system", "name": "",
                        "command": command, "schedule": expr,
                        "description": f"As {user}: {_cron_description(expr)}",
                        "next_run": _next_run_relative(expr), "id": "",
                    })
    except Exception:
        pass

    # /etc/cron.d/
    try:
        crond_dir = Path("/etc/cron.d")
        if crond_dir.exists():
            for cf in sorted(crond_dir.iterdir()):
                if cf.is_file() and not cf.name.startswith(".") and cf.name != "README":
                    lines = cf.read_text().splitlines()
                    for line in lines:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split(None, 6)
                        if len(parts) >= 7:
                            expr = " ".join(parts[:5])
                            user = parts[5]
                            command = parts[6]
                            if len(command) > 120:
                                command = command[:117] + "..."
                            jobs.append({
                                "source": str(cf), "owner": "system", "name": "",
                                "command": command, "schedule": expr,
                                "description": f"As {user}: {_cron_description(expr)}",
                                "next_run": _next_run_relative(expr), "id": "",
                            })
    except Exception:
        pass

    jobs.sort(key=lambda j: (0 if j["owner"] == "hermes" else 1, j.get("name", "") or j["command"]))
    return jobs


def cron_summary():
    """Aggregate stats from all cron jobs."""
    jobs = cron_jobs()
    now = datetime.now(timezone.utc)
    today = now.date()

    by_freq = {"one_shot": 0, "daily": 0, "weekly": 0, "monthly": 0, "other": 0}
    running_today = 0
    next_job = None

    def _classify_freq(expr):
        if not expr or "once at" in expr.lower():
            return "one_shot"
        parts = expr.strip().split()
        if len(parts) != 5:
            return "other"
        minute, hour, dom, month, dow = parts
        if dow != "*":
            return "weekly"
        if dom != "*":
            return "monthly"
        if minute.startswith("*/") or (minute == "*" and hour == "*"):
            return "daily"
        if minute == "0" and hour != "*":
            return "daily"
        return "other"

    for j in jobs:
        freq = _classify_freq(j.get("schedule", ""))
        by_freq[freq] = by_freq.get(freq, 0) + 1

        nr = j.get("next_run", "")
        if nr and ("in " in nr or "tomorrow" in nr or "imminent" in nr):
            # Count as running today if within 24h
            running_today += 1
            # Track the soonest next job
            if next_job is None:
                next_job = {
                    "name": j.get("name", "") or j.get("command", "")[:40],
                    "in": nr,
                }

    return {
        "total": len(jobs),
        "by_frequency": by_freq,
        "next_job": next_job,
        "running_today": running_today,
        "by_owner": {
            "hermes": sum(1 for j in jobs if j.get("owner") == "hermes"),
            "system": sum(1 for j in jobs if j.get("owner") != "hermes"),
        },
    }
