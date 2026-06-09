"""Atlas — Right-Hand Agent for Hermes Life OS.

Dashboard copilot with persistent sessions, explicit approval-gated system actions,
and a visible execution trace. Atlas can propose and execute Life OS operations, but
mutating actions are never applied until Lucas approves them in the UI.
"""
import json
import os
import shlex
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .kanban import (
    archive_board_task,
    create_board_task,
    delete_board_task,
    get_board_task,
    list_board_tasks,
    board_stats,
    update_board_task,
)
from .lifeos import (
    create_automation,
    create_project,
    delete_automation,
    delete_project,
    get_automation,
    get_project,
    lifeos_command_center,
    list_agent_actions,
    list_automations,
    list_projects,
    run_automation,
    update_automation,
    update_project,
)
from .routine import _habit_streaks, _today_status
from .finance import _month_summary

ATLAS_DB = Path(__file__).parent.parent / "db/atlas.db"

RIGHT_HAND_SYSTEM = """You are Atlas, Lucas's Right-Hand Agent inside Hermes Life OS.
You are Lucas's #1 operational tool. You can see dashboard context and you can propose actions across tasks, projects, automations, and system commands.
Critical rules:
- Do not claim an action was done unless the approved action endpoint executed it.
- If action is needed, describe exactly what should be approved.
- For potentially destructive operations, be explicit about risk and target IDs.
- Answer in the user's language. Lucas often uses Portuguese; keep it direct.
- Use clean Markdown: headings, bullets, bold labels, and code only for commands.
- Provide a short visible "thinking summary" style rationale if useful, but do not expose hidden chain-of-thought.
"""

ACTION_SCHEMAS = {
    "task_create": "Create task: {title, priority?, notes?, assignee?, due_date?, tags?, project_id?}",
    "task_update": "Update task: {id, title?, status?, priority?, notes?, assignee?, due_date?, tags?, project_id?}",
    "task_archive": "Archive task: {id}",
    "task_delete": "Hard-delete task: {id}",
    "project_create": "Create project: {name|title, description?, status?, priority?}",
    "project_update": "Update project: {id, ...fields}",
    "project_delete": "Delete project: {id}",
    "automation_run": "Run automation: {id}",
    "shell_command": "Run shell command after approval: {command, cwd?, timeout?}",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe_call(fn, fallback):
    try:
        return fn()
    except Exception as exc:
        return {"error": str(exc), "fallback": fallback}


def _atlas_conn():
    ATLAS_DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(ATLAS_DB))
    db.row_factory = sqlite3.Row
    return db


def init_atlas_db():
    db = _atlas_conn()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS atlas_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            hermes_session_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            message_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS atlas_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT DEFAULT '',
            actions_json TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES atlas_sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS atlas_approvals (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            message_id TEXT,
            action_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result_json TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            decided_at TEXT DEFAULT '',
            risk TEXT DEFAULT 'medium',
            summary TEXT DEFAULT ''
        );
    """)
    db.commit()
    db.close()


def create_atlas_session(title=None):
    init_atlas_db()
    sid = str(uuid.uuid4())[:12]
    now = _now()
    db = _atlas_conn()
    db.execute(
        "INSERT INTO atlas_sessions (id,title,created_at,updated_at,message_count) VALUES (?,?,?,?,0)",
        (sid, title or "New Atlas chat", now, now),
    )
    db.commit(); db.close()
    return get_atlas_session(sid, include_messages=False)


def list_atlas_sessions(limit=50):
    init_atlas_db()
    db = _atlas_conn()
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM atlas_sessions ORDER BY updated_at DESC LIMIT ?", (int(limit),)
    ).fetchall()]
    db.close()
    return rows


def get_atlas_session(session_id, include_messages=True):
    init_atlas_db()
    db = _atlas_conn()
    row = db.execute("SELECT * FROM atlas_sessions WHERE id=?", (session_id,)).fetchone()
    if not row:
        db.close(); return None
    data = dict(row)
    if include_messages:
        msgs = []
        for m in db.execute("SELECT * FROM atlas_messages WHERE session_id=? ORDER BY created_at ASC", (session_id,)).fetchall():
            item = dict(m)
            try:
                item["actions"] = json.loads(item.get("actions_json") or "[]")
            except Exception:
                item["actions"] = []
            item.pop("actions_json", None)
            msgs.append(item)
        data["messages"] = msgs
    db.close()
    return data


def delete_atlas_session(session_id):
    init_atlas_db()
    db = _atlas_conn()
    db.execute("DELETE FROM atlas_messages WHERE session_id=?", (session_id,))
    cur = db.execute("DELETE FROM atlas_sessions WHERE id=?", (session_id,))
    db.commit(); ok = cur.rowcount > 0; db.close()
    return ok


def _add_message(session_id, role, content, thinking="", actions=None):
    mid = str(uuid.uuid4())[:12]
    now = _now()
    db = _atlas_conn()
    db.execute(
        "INSERT INTO atlas_messages (id,session_id,role,content,thinking,actions_json,created_at) VALUES (?,?,?,?,?,?,?)",
        (mid, session_id, role, content, thinking, json.dumps(actions or [], ensure_ascii=False), now),
    )
    db.execute(
        "UPDATE atlas_sessions SET updated_at=?, message_count=message_count+1 WHERE id=?",
        (now, session_id),
    )
    if role == "user":
        title = (content.strip().split("\n")[0][:64] or "Atlas chat")
        db.execute("UPDATE atlas_sessions SET title=CASE WHEN title='New Atlas chat' THEN ? ELSE title END WHERE id=?", (title, session_id))
    db.commit(); db.close()
    return mid


def right_hand_context():
    """Return the state bundle Atlas can see."""
    now = datetime.now(timezone.utc)
    month = now.strftime('%Y-%m')
    tasks = _safe_call(lambda: list_board_tasks({}), [])
    projects = _safe_call(list_projects, [])
    automations = _safe_call(list_automations, [])
    actions = _safe_call(lambda: list_agent_actions(limit=25), [])
    return {
        "agent": {
            "id": "atlas",
            "name": "Atlas",
            "role": "Right-Hand Agent / System Operator",
            "owner": "Lucas",
            "capabilities": [
                "persistent chat history",
                "daily prioritization",
                "project and task CRUD via approval queue",
                "automation execution via approval queue",
                "approved shell commands",
                "routine/finance awareness",
                "visible execution trace",
            ],
            "approval_required_for": ["create/update/delete tasks", "projects", "automations", "shell commands"],
        },
        "generated_at": now.isoformat(),
        "command_center": _safe_call(lifeos_command_center, {}),
        "tasks": {"stats": _safe_call(board_stats, {}), "items": tasks[:40] if isinstance(tasks, list) else []},
        "projects": projects[:30] if isinstance(projects, list) else [],
        "automations": automations[:30] if isinstance(automations, list) else [],
        "agent_actions": actions[:25] if isinstance(actions, list) else [],
        "routine": {"today": _safe_call(_today_status, {}), "streaks": _safe_call(_habit_streaks, [])},
        "finance": {"month": month, "summary": _safe_call(lambda: _month_summary(month), {})},
        "actions_available": ACTION_SCHEMAS,
    }


def _detect_action_proposals(message):
    """Deterministic proposals for common Atlas commands. All require approval."""
    msg = (message or "").strip()
    low = msg.lower()
    proposals = []

    def add(action_type, payload, summary, risk="medium"):
        proposals.append({"action_type": action_type, "payload": payload, "summary": summary, "risk": risk})

    if low.startswith(("/task add ", "task add ", "criar task ", "cria task ")):
        title = msg.split(" ", 2)[-1].strip()
        add("task_create", {"title": title, "priority": "medium", "notes": "Created via Atlas approval."}, f"Create task: {title}", "low")
    elif low.startswith(("/task delete ", "task delete ", "deletar task ", "delete task ")):
        tid = msg.split()[-1].strip()
        add("task_delete", {"id": tid}, f"Hard-delete task {tid}", "high")
    elif low.startswith(("/task archive ", "task archive ", "arquivar task ")):
        tid = msg.split()[-1].strip()
        add("task_archive", {"id": tid}, f"Archive task {tid}", "medium")
    elif low.startswith(("/task done ", "task done ", "concluir task ")):
        tid = msg.split()[-1].strip()
        add("task_update", {"id": tid, "status": "completed"}, f"Mark task {tid} completed", "low")
    elif low.startswith(("/project add ", "project add ", "criar projeto ", "cria projeto ")):
        name = msg.split(" ", 2)[-1].strip()
        add("project_create", {"name": name, "description": "Created via Atlas approval.", "status": "active"}, f"Create project: {name}", "low")
    elif low.startswith(("/run ", "run command ", "rodar comando ")):
        command = msg.split(" ", 1)[1].strip()
        add("shell_command", {"command": command, "cwd": "/root", "timeout": 120}, f"Run shell command: {command}", "high")

    return proposals[:5]


def _store_approvals(session_id, message_id, proposals):
    init_atlas_db()
    stored = []
    db = _atlas_conn()
    now = _now()
    for p in proposals or []:
        aid = str(uuid.uuid4())[:12]
        db.execute(
            """INSERT INTO atlas_approvals
               (id,session_id,message_id,action_type,payload_json,status,created_at,risk,summary)
               VALUES (?,?,?,?,?,'pending',?,?,?)""",
            (aid, session_id, message_id, p["action_type"], json.dumps(p.get("payload", {}), ensure_ascii=False), now, p.get("risk", "medium"), p.get("summary", p["action_type"])),
        )
        stored.append({**p, "id": aid, "status": "pending"})
    db.commit(); db.close()
    return stored


def list_atlas_approvals(status=None, limit=50):
    init_atlas_db()
    db = _atlas_conn()
    if status:
        rows = db.execute("SELECT * FROM atlas_approvals WHERE status=? ORDER BY created_at DESC LIMIT ?", (status, int(limit))).fetchall()
    else:
        rows = db.execute("SELECT * FROM atlas_approvals ORDER BY created_at DESC LIMIT ?", (int(limit),)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d.pop("payload_json") or "{}")
        d["result"] = json.loads(d["result_json"] or "{}") if d.get("result_json") else None
        out.append(d)
    db.close()
    return out


def _response_text(result):
    output = (result.stdout or '').strip()
    lines = [line.strip() for line in output.splitlines() if line.strip() and not line.startswith(('╭', '╰', '│'))]
    return "\n".join(lines[-18:]).strip() or output


def _parse_session_id(stderr):
    for line in (stderr or "").splitlines():
        if line.startswith("session_id:"):
            return line.split("session_id:", 1)[1].strip()
    return None


def ask_right_hand(message, session_id=None, max_chars=20000):
    """Ask Atlas via Hermes CLI, persist chat history, and queue proposed actions."""
    init_atlas_db()
    message = (message or '').strip()
    if not session_id or not get_atlas_session(session_id, include_messages=False):
        session = create_atlas_session()
        session_id = session["id"]
    ctx = right_hand_context()
    if not message:
        return {"agent": ctx["agent"], "session_id": session_id, "context": ctx, "response": "Atlas online.", "thinking": "Context loaded. Waiting for instruction.", "actions": []}

    user_mid = _add_message(session_id, "user", message)
    proposals = _detect_action_proposals(message)
    history = get_atlas_session(session_id, include_messages=True).get("messages", [])[-10:]
    context_json = json.dumps(ctx, ensure_ascii=False, default=str)
    if len(context_json) > max_chars:
        context_json = context_json[:max_chars] + "\n...TRUNCATED..."
    history_text = "\n".join(f"{m['role'].upper()}: {m['content'][:1200]}" for m in history)
    proposed_text = json.dumps(proposals, ensure_ascii=False, indent=2)
    prompt = f"""{RIGHT_HAND_SYSTEM}

DASHBOARD_CONTEXT_JSON:
{context_json}

RECENT_SESSION_HISTORY:
{history_text}

DETERMINISTIC_ACTION_PROPOSALS_ALREADY_QUEUED_IF_APPROVED:
{proposed_text}

USER_MESSAGE:
{message}

Respond as Atlas. If proposals exist, tell Lucas they are waiting for approval. If the request needs a new action not listed, describe the exact action payload Lucas should approve.
"""
    thinking = "Loaded Life OS context → reviewed recent chat history → checked for action intent → prepared approval-gated response."
    try:
        db = _atlas_conn()
        sess = db.execute("SELECT hermes_session_id FROM atlas_sessions WHERE id=?", (session_id,)).fetchone()
        hermes_sid = sess["hermes_session_id"] if sess else None
        db.close()
        cmd = ["hermes", "chat", "-q", prompt, "-Q"]
        if hermes_sid:
            cmd += ["--resume", hermes_sid]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=160)
        response = _response_text(result)
        new_hid = _parse_session_id(result.stderr)
        if new_hid:
            db = _atlas_conn(); db.execute("UPDATE atlas_sessions SET hermes_session_id=? WHERE id=?", (new_hid, session_id)); db.commit(); db.close()
        assistant_mid = _add_message(session_id, "assistant", response, thinking=thinking, actions=proposals)
        approvals = _store_approvals(session_id, assistant_mid, proposals)
        return {
            "agent": ctx["agent"],
            "session_id": session_id,
            "user_message_id": user_mid,
            "assistant_message_id": assistant_mid,
            "response": response,
            "thinking": thinking,
            "actions": approvals,
            "exit_code": result.returncode,
            "stderr": (result.stderr or '').strip()[-1200:],
            "context_generated_at": ctx["generated_at"],
        }
    except subprocess.TimeoutExpired:
        response = "Atlas timed out while thinking. Try a narrower request."
        mid = _add_message(session_id, "assistant", response, thinking=thinking, actions=proposals)
        approvals = _store_approvals(session_id, mid, proposals)
        return {"agent": ctx["agent"], "session_id": session_id, "response": response, "thinking": thinking, "actions": approvals, "exit_code": -1}
    except Exception as exc:
        response = f"Atlas error: {exc}"
        mid = _add_message(session_id, "assistant", response, thinking=thinking, actions=proposals)
        approvals = _store_approvals(session_id, mid, proposals)
        return {"agent": ctx["agent"], "session_id": session_id, "response": response, "thinking": thinking, "actions": approvals, "exit_code": -1}


def execute_atlas_action(approval_id):
    init_atlas_db()
    db = _atlas_conn()
    row = db.execute("SELECT * FROM atlas_approvals WHERE id=?", (approval_id,)).fetchone()
    if not row:
        db.close(); return {"error": "approval not found"}
    item = dict(row)
    if item["status"] != "pending":
        db.close(); return {"error": f"approval is {item['status']}", "status": item["status"]}
    payload = json.loads(item["payload_json"] or "{}")
    action = item["action_type"]
    result = {}
    try:
        if action == "task_create":
            result = create_board_task(payload) or {"error": "task create failed"}
        elif action == "task_update":
            tid = payload.pop("id")
            result = update_board_task(tid, payload) or {"error": "task update failed"}
        elif action == "task_archive":
            result = archive_board_task(payload["id"]) or {"error": "task archive failed"}
        elif action == "task_delete":
            ok = delete_board_task(payload["id"])
            result = {"ok": ok, "id": payload["id"]} if ok else {"error": "task delete failed"}
        elif action == "project_create":
            result = create_project(payload) or {"error": "project create failed"}
        elif action == "project_update":
            pid = payload.pop("id")
            result = update_project(pid, payload)
        elif action == "project_delete":
            ok = delete_project(payload["id"])
            result = {"ok": ok, "id": payload["id"]} if ok else {"error": "project delete failed"}
        elif action == "automation_run":
            result = run_automation(payload["id"])
        elif action == "shell_command":
            command = payload.get("command", "")
            if not command.strip():
                result = {"error": "empty command"}
            else:
                cwd = payload.get("cwd") or "/root"
                timeout = int(payload.get("timeout") or 120)
                completed = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True, timeout=min(timeout, 300))
                result = {"exit_code": completed.returncode, "stdout": completed.stdout[-8000:], "stderr": completed.stderr[-4000:], "command": command, "cwd": cwd}
        else:
            result = {"error": f"unsupported action {action}"}
    except Exception as exc:
        result = {"error": str(exc), "action_type": action}
    status = "executed" if "error" not in result else "failed"
    db.execute("UPDATE atlas_approvals SET status=?, result_json=?, decided_at=? WHERE id=?", (status, json.dumps(result, ensure_ascii=False, default=str), _now(), approval_id))
    db.commit(); db.close()
    return {"id": approval_id, "status": status, "result": result}


def reject_atlas_action(approval_id):
    init_atlas_db()
    db = _atlas_conn()
    cur = db.execute("UPDATE atlas_approvals SET status='rejected', decided_at=? WHERE id=? AND status='pending'", (_now(), approval_id))
    db.commit(); ok = cur.rowcount > 0; db.close()
    return {"ok": ok, "id": approval_id, "status": "rejected" if ok else "not_pending"}
