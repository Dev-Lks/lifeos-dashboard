"""Atlas / right-hand agent APIs."""
from fastapi import APIRouter

from ..auth import shell_enabled
from ..right_hand import (
    ask_right_hand,
    create_atlas_session,
    delete_atlas_session,
    execute_atlas_action,
    get_atlas_session,
    list_atlas_approvals,
    list_atlas_sessions,
    reject_atlas_action,
    right_hand_context,
)

router = APIRouter(prefix="/api/right-hand", tags=["atlas"])


@router.get("/context")
def context():
    data = right_hand_context()
    data["shell_enabled"] = shell_enabled()
    return data


@router.get("/sessions")
def sessions():
    return list_atlas_sessions()


@router.post("/sessions")
def session_create(payload: dict):
    return create_atlas_session(payload.get("title"))


@router.get("/sessions/{session_id}")
def session_get(session_id: str):
    return get_atlas_session(session_id) or {"error": "not found"}


@router.delete("/sessions/{session_id}")
def session_delete(session_id: str):
    return {"ok": delete_atlas_session(session_id)}


@router.post("/ask")
def ask(payload: dict):
    return ask_right_hand(payload.get("message", ""), payload.get("session_id"))


@router.get("/approvals")
def approvals(status: str | None = None):
    return list_atlas_approvals(status)


@router.post("/approvals/{approval_id}/execute")
def approval_execute(approval_id: str):
    return execute_atlas_action(approval_id)


@router.post("/approvals/{approval_id}/reject")
def approval_reject(approval_id: str):
    return reject_atlas_action(approval_id)
