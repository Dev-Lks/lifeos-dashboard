"""Finance APIs."""
from fastapi import APIRouter

from ..finance import (
    _create_goal,
    _create_recurring,
    _create_transaction,
    _delete_goal,
    _delete_recurring,
    _delete_transaction,
    _list_goals,
    _list_recurring,
    _list_transactions,
    _month_comparison,
    _month_summary,
    _monthly_trends,
    _update_goal,
    _update_transaction,
    _upsert_budget,
)

router = APIRouter(prefix="/api/finance", tags=["finance"])


@router.get("/transactions")
def transactions(month: str | None = None):
    return _list_transactions(month)


@router.post("/transactions")
def transaction_create(payload: dict):
    return _create_transaction(payload)


@router.patch("/transactions/{transaction_id}")
def transaction_update(transaction_id: str, payload: dict):
    return _update_transaction(transaction_id, payload)


@router.delete("/transactions/{transaction_id}")
def transaction_delete(transaction_id: str):
    return {"ok": _delete_transaction(transaction_id)}


@router.get("/summary")
def summary(month: str):
    return _month_summary(month)


@router.post("/budgets")
def budget_upsert(payload: dict):
    return {"ok": _upsert_budget(payload)}


@router.get("/trends")
def trends(months: int = 12):
    return _monthly_trends(months)


@router.get("/compare")
def compare(month: str):
    return _month_comparison(month)


@router.get("/recurring")
def recurring():
    return _list_recurring()


@router.post("/recurring")
def recurring_create(payload: dict):
    return _create_recurring(payload)


@router.delete("/recurring/{recurring_id}")
def recurring_delete(recurring_id: str):
    return {"ok": _delete_recurring(recurring_id)}


@router.get("/goals")
def goals():
    return _list_goals()


@router.post("/goals")
def goal_create(payload: dict):
    return _create_goal(payload)


@router.patch("/goals/{goal_id}")
def goal_update(goal_id: str, payload: dict):
    return _update_goal(goal_id, payload)


@router.delete("/goals/{goal_id}")
def goal_delete(goal_id: str):
    return {"ok": _delete_goal(goal_id)}
