"""Routine APIs."""
from fastapi import APIRouter

from ..routine import (
    _create_habit,
    _delete_habit,
    _habit_history,
    _habit_streaks,
    _list_habits,
    _log_habit,
    _save_daily_log,
    _today_status,
)

router = APIRouter(prefix="/api/routine", tags=["routine"])


@router.get("/habits")
def habits():
    return _list_habits()


@router.post("/habits")
def habit_create(payload: dict):
    return _create_habit(payload)


@router.delete("/habits/{habit_id}")
def habit_delete(habit_id: str):
    return {"ok": _delete_habit(habit_id)}


@router.post("/habits/{habit_id}/log")
def habit_log(habit_id: str, payload: dict):
    return _log_habit(habit_id, payload.get("date"), payload.get("completed", True))


@router.get("/today")
def today():
    return _today_status()


@router.post("/daily-log")
def daily_log(payload: dict):
    return _save_daily_log(payload)


@router.get("/streaks")
def streaks():
    return _habit_streaks()


@router.get("/history")
def history(days: int = 7):
    return _habit_history(days)
