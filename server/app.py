"""LifeOS FastAPI application — cookie-authenticated, SPA-serving backend."""

import hashlib
import hmac
import json
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException, Response, Cookie
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from server.config import (
    PASSWORD, SESSION_SECRET, DATA_DIR, ENABLE_SHELL, PORT,
    BASE_DIR, HAS_PSUTIL,
)
from server.data import build_snapshot, _recent_activity
from server.finance import (
    _list_transactions, _create_transaction, _delete_transaction,
    _month_summary, _upsert_budget, _update_transaction,
    _monthly_trends, _list_recurring, _create_recurring, _delete_recurring,
    _list_goals, _create_goal, _update_goal, _delete_goal, _month_comparison,
)
from server.kanban import (
    list_board_tasks, create_board_task, update_board_task,
    delete_board_task, get_board_task, archive_board_task,
    board_stats, init_board_db,
)
from server.content import list_content, get_content, save_content
from server.cron import cron_jobs
from server.routine import (
    _list_habits, _create_habit, _delete_habit, _log_habit,
    _today_status, _save_daily_log, _habit_streaks, _habit_history,
)
from server.db import migrate_all
from server.sse import start_broadcaster
from server.lifeos import (
    lifeos_summary, lifeos_command_center,
    list_automations, get_automation, create_automation, update_automation,
    delete_automation, run_automation, list_automation_runs,
    list_projects, create_project, update_project, delete_project, get_project,
    list_agent_actions, create_agent_action,
    list_daily_reviews, upsert_daily_review,
    list_links, create_link,
)
from server.right_hand import (
    right_hand_context, ask_right_hand, init_atlas_db,
    list_atlas_sessions, get_atlas_session,
    create_atlas_session, delete_atlas_session,
    list_atlas_approvals, execute_atlas_action, reject_atlas_action,
)


# ── Session helpers ──────────────────────────────────────────────

SESSION_TTL = 60 * 60 * 24 * 7  # 7 days

def _make_session_token() -> str:
    """Create a signed session cookie value: timestamp:hmac."""
    ts = str(int(time.time()))
    sig = hmac.new(
        SESSION_SECRET.encode(), f"lifeos:{ts}".encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{ts}:{sig}"


def _verify_session(token: str | None) -> bool:
    """Check that a session cookie is valid and not expired."""
    if not token:
        return False
    try:
        ts_str, sig = token.split(":", 1)
        ts = int(ts_str)
        expected = hmac.new(
            SESSION_SECRET.encode(), f"lifeos:{ts_str}".encode(), hashlib.sha256
        ).hexdigest()[:32]
        if not hmac.compare_digest(sig, expected):
            return False
        if time.time() - ts > SESSION_TTL:
            return False
        return True
    except (ValueError, AttributeError):
        return False


def _require_auth(request: Request):
    """FastAPI dependency — raises 401 if session is invalid."""
    token = request.cookies.get("lifeos_session")
    if not _verify_session(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Lifespan (startup / shutdown) ────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate_all()
    init_board_db()
    init_atlas_db()
    start_broadcaster()
    yield


# ── App ──────────────────────────────────────────────────────────

app = FastAPI(title="LifeOS", version="4.0.0", lifespan=lifespan)

STATIC_DIR = BASE_DIR / "frontend" / "dist"


# ── Auth routes (no auth required) ──────────────────────────────

@app.post("/api/auth/login")
async def login(request: Request):
    """Validate password and set session cookie."""
    body = await request.json()
    pwd = body.get("password", "")
    if not hmac.compare_digest(pwd, PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password")

    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        key="lifeos_session",
        value=_make_session_token(),
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL,
        secure=False,  # set True behind HTTPS
    )
    return resp


@app.post("/api/auth/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("lifeos_session")
    return resp


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ── Protected routes ─────────────────────────────────────────────

@app.get("/api/data")
async def api_data(request: Request):
    _require_auth(request)
    return build_snapshot()


@app.get("/api/data/agent_logs")
async def api_agent_logs(request: Request):
    _require_auth(request)
    return _recent_activity(50)


# ── Tasks / Kanban ───────────────────────────────────────────────

@app.get("/api/tasks")
async def api_tasks_list(request: Request):
    _require_auth(request)
    return list_board_tasks()


@app.post("/api/tasks")
async def api_tasks_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return create_board_task(body)


@app.patch("/api/tasks/{task_id}")
async def api_tasks_update(task_id: str, request: Request):
    _require_auth(request)
    body = await request.json()
    result = update_board_task(task_id, body)
    if result is None:
        raise HTTPException(404)
    return result


@app.delete("/api/tasks/{task_id}")
async def api_tasks_delete(task_id: str, request: Request):
    _require_auth(request)
    delete_board_task(task_id)
    return {"ok": True}


@app.get("/api/tasks/{task_id}")
async def api_tasks_get(task_id: str, request: Request):
    _require_auth(request)
    result = get_board_task(task_id)
    if result is None:
        raise HTTPException(404)
    return result


@app.post("/api/tasks/{task_id}/archive")
async def api_tasks_archive(task_id: str, request: Request):
    _require_auth(request)
    archive_board_task(task_id)
    return {"ok": True}


@app.get("/api/tasks/stats")
async def api_tasks_stats(request: Request):
    _require_auth(request)
    return board_stats()


# ── Finance ──────────────────────────────────────────────────────

@app.get("/api/finance/summary")
async def api_finance_summary(request: Request):
    _require_auth(request)
    return _month_summary()


@app.get("/api/finance/transactions")
async def api_finance_list(request: Request):
    _require_auth(request)
    return _list_transactions()


@app.post("/api/finance/transactions")
async def api_finance_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return _create_transaction(body)


@app.patch("/api/finance/transactions/{tx_id}")
async def api_finance_update(tx_id: int, request: Request):
    _require_auth(request)
    body = await request.json()
    return _update_transaction(tx_id, body)


@app.delete("/api/finance/transactions/{tx_id}")
async def api_finance_delete(tx_id: int, request: Request):
    _require_auth(request)
    _delete_transaction(tx_id)
    return {"ok": True}


@app.post("/api/finance/budget")
async def api_finance_budget(request: Request):
    _require_auth(request)
    body = await request.json()
    return _upsert_budget(body)


@app.get("/api/finance/trends")
async def api_finance_trends(months: int = 12, request: Request = None):
    _require_auth(request)
    return _monthly_trends(months)


@app.get("/api/finance/recurring")
async def api_finance_recurring_list(request: Request):
    _require_auth(request)
    return _list_recurring()


@app.post("/api/finance/recurring")
async def api_finance_recurring_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return _create_recurring(body)


@app.delete("/api/finance/recurring/{rec_id}")
async def api_finance_recurring_delete(rec_id: int, request: Request):
    _require_auth(request)
    _delete_recurring(rec_id)
    return {"ok": True}


@app.get("/api/finance/goals")
async def api_finance_goals(request: Request):
    _require_auth(request)
    return _list_goals()


@app.post("/api/finance/goals")
async def api_finance_goals_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return _create_goal(body)


@app.patch("/api/finance/goals/{goal_id}")
async def api_finance_goals_update(goal_id: int, request: Request):
    _require_auth(request)
    body = await request.json()
    return _update_goal(goal_id, body)


@app.delete("/api/finance/goals/{goal_id}")
async def api_finance_goals_delete(goal_id: int, request: Request):
    _require_auth(request)
    _delete_goal(goal_id)
    return {"ok": True}


@app.get("/api/finance/compare")
async def api_finance_compare(month: str, request: Request):
    _require_auth(request)
    return _month_comparison(month)


# ── Routine ──────────────────────────────────────────────────────

@app.get("/api/routine/status")
async def api_routine_status(request: Request):
    _require_auth(request)
    return _today_status()


@app.get("/api/routine/habits")
async def api_routine_habits(request: Request):
    _require_auth(request)
    return _list_habits()


@app.post("/api/routine/habits")
async def api_routine_habits_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return _create_habit(body)


@app.delete("/api/routine/habits/{habit_id}")
async def api_routine_habits_delete(habit_id: int, request: Request):
    _require_auth(request)
    _delete_habit(habit_id)
    return {"ok": True}


@app.post("/api/routine/habits/{habit_id}/log")
async def api_routine_habits_log(habit_id: int, request: Request):
    _require_auth(request)
    _log_habit(habit_id)
    return {"ok": True}


@app.post("/api/routine/daily-log")
async def api_routine_daily_log(request: Request):
    _require_auth(request)
    body = await request.json()
    _save_daily_log(body.get("date"), body.get("content", ""))
    return {"ok": True}


@app.get("/api/routine/streaks")
async def api_routine_streaks(request: Request):
    _require_auth(request)
    return _habit_streaks()


@app.get("/api/routine/history")
async def api_routine_history(days: int = 7, request: Request = None):
    _require_auth(request)
    return _habit_history(days)


# ── Content ──────────────────────────────────────────────────────

@app.get("/api/content")
async def api_content_list(request: Request):
    _require_auth(request)
    return list_content()


@app.get("/api/content/{content_id}")
async def api_content_get(content_id: str, request: Request):
    _require_auth(request)
    result = get_content(content_id)
    if result is None:
        raise HTTPException(404)
    return result


@app.post("/api/content")
async def api_content_save(request: Request):
    _require_auth(request)
    body = await request.json()
    return save_content(body)


# ── Schedule / Cron ──────────────────────────────────────────────

@app.get("/api/crons")
async def api_crons(request: Request):
    _require_auth(request)
    return cron_jobs()


@app.get("/api/crons/summary")
async def api_crons_summary(request: Request):
    _require_auth(request)
    from server.cron import cron_summary
    return cron_summary()


# ── LifeOS ───────────────────────────────────────────────────────

@app.get("/api/lifeos/summary")
async def api_lifeos_summary(request: Request):
    _require_auth(request)
    return lifeos_summary()


@app.post("/api/lifeos/command")
async def api_lifeos_command(request: Request):
    _require_auth(request)
    body = await request.json()
    return lifeos_command_center(body.get("command", ""))


@app.get("/api/automations")
async def api_automations(request: Request):
    _require_auth(request)
    return list_automations()


@app.post("/api/automations")
async def api_automations_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return create_automation(body)


@app.patch("/api/automations/{auto_id}")
async def api_automations_update(auto_id: int, request: Request):
    _require_auth(request)
    body = await request.json()
    return update_automation(auto_id, body)


@app.delete("/api/automations/{auto_id}")
async def api_automations_delete(auto_id: int, request: Request):
    _require_auth(request)
    delete_automation(auto_id)
    return {"ok": True}


@app.post("/api/automations/{auto_id}/run")
async def api_automations_run(auto_id: int, request: Request):
    _require_auth(request)
    if not ENABLE_SHELL:
        raise HTTPException(403, "Shell actions disabled")
    return run_automation(auto_id)


@app.get("/api/automations/{auto_id}/runs")
async def api_automations_runs(auto_id: int, request: Request):
    _require_auth(request)
    return list_automation_runs(auto_id)


@app.get("/api/projects")
async def api_projects(request: Request):
    _require_auth(request)
    return list_projects()


@app.post("/api/projects")
async def api_projects_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return create_project(body)


@app.patch("/api/projects/{proj_id}")
async def api_projects_update(proj_id: int, request: Request):
    _require_auth(request)
    body = await request.json()
    return update_project(proj_id, body)


@app.delete("/api/projects/{proj_id}")
async def api_projects_delete(proj_id: int, request: Request):
    _require_auth(request)
    delete_project(proj_id)
    return {"ok": True}


@app.get("/api/projects/{proj_id}")
async def api_projects_get(proj_id: int, request: Request):
    _require_auth(request)
    result = get_project(proj_id)
    if result is None:
        raise HTTPException(404)
    return result


@app.get("/api/daily-reviews")
async def api_daily_reviews(request: Request):
    _require_auth(request)
    return list_daily_reviews()


@app.post("/api/daily-reviews")
async def api_daily_reviews_upsert(request: Request):
    _require_auth(request)
    body = await request.json()
    return upsert_daily_review(body)


@app.get("/api/links")
async def api_links(request: Request):
    _require_auth(request)
    return list_links()


@app.post("/api/links")
async def api_links_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return create_link(body)


# ── Atlas (Right Hand) ───────────────────────────────────────────

@app.get("/api/atlas/context")
async def api_atlas_context(request: Request):
    _require_auth(request)
    return right_hand_context()


@app.post("/api/atlas/ask")
async def api_atlas_ask(request: Request):
    _require_auth(request)
    body = await request.json()
    prompt = body.get("prompt", "")
    session_id = body.get("session_id")
    return ask_right_hand(prompt, session_id)


@app.get("/api/atlas/sessions")
async def api_atlas_sessions(request: Request):
    _require_auth(request)
    return list_atlas_sessions()


@app.get("/api/atlas/sessions/{session_id}")
async def api_atlas_session_get(session_id: str, request: Request):
    _require_auth(request)
    result = get_atlas_session(session_id)
    if result is None:
        raise HTTPException(404)
    return result


@app.post("/api/atlas/sessions")
async def api_atlas_session_create(request: Request):
    _require_auth(request)
    body = await request.json()
    return create_atlas_session(body.get("title", "New Session"))


@app.delete("/api/atlas/sessions/{session_id}")
async def api_atlas_session_delete(session_id: str, request: Request):
    _require_auth(request)
    delete_atlas_session(session_id)
    return {"ok": True}


@app.get("/api/atlas/approvals")
async def api_atlas_approvals(request: Request):
    _require_auth(request)
    return list_atlas_approvals()


@app.post("/api/atlas/approvals/{action_id}/execute")
async def api_atlas_approve(action_id: int, request: Request):
    _require_auth(request)
    if not ENABLE_SHELL:
        raise HTTPException(403, "Shell actions disabled")
    return execute_atlas_action(action_id)


@app.post("/api/atlas/approvals/{action_id}/reject")
async def api_atlas_reject(action_id: int, request: Request):
    _require_auth(request)
    reject_atlas_action(action_id)
    return {"ok": True}


# ── SSE ──────────────────────────────────────────────────────────

@app.get("/events")
async def api_events(request: Request):
    _require_auth(request)
    from server.sse import sse_manager
    from fastapi.responses import StreamingResponse

    async def event_stream():
        q = sse_manager.subscribe()
        try:
            while True:
                try:
                    data = await q.get()
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.CancelledError:
                    break
        finally:
            sse_manager.unsubscribe(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── SPA fallback — serve React app ───────────────────────────────

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve frontend static files; fallback to index.html for SPA routes."""
    if full_path.startswith("api/"):
        raise HTTPException(404)  # shouldn't happen, but safety

    candidate = STATIC_DIR / full_path
    if candidate.exists() and candidate.is_file():
        return FileResponse(candidate)

    # SPA fallback
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return HTMLResponse("<h1>LifeOS — frontend not built yet</h1><p>Run <code>npm run build</code> in frontend/</p>")
