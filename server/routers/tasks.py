"""Task/board APIs."""
from fastapi import APIRouter, Query

from ..kanban import (
    archive_board_task,
    board_stats,
    create_board_task,
    delete_board_task,
    get_board_task,
    list_board_tasks,
    update_board_task,
)

router = APIRouter(prefix="/api/board", tags=["tasks"])


@router.get("")
def list_tasks(
    search: str = "",
    assignee: str = "",
    priority: str = "",
    tag: str = "",
    archived: str = "",
    project_id: str = "",
):
    return list_board_tasks({
        "search": search,
        "assignee": assignee,
        "priority": priority,
        "tag": tag,
        "archived": archived,
        "project_id": project_id,
    })


@router.get("/stats")
def stats():
    return board_stats()


@router.post("")
def create_task(payload: dict):
    result = create_board_task(payload)
    return result or {"error": "create failed"}


@router.get("/{task_id}")
def get_task(task_id: str):
    return get_board_task(task_id) or {"error": "not found"}


@router.patch("/{task_id}")
def update_task(task_id: str, payload: dict):
    return update_board_task(task_id, payload) or {"error": "not found"}


@router.patch("/{task_id}/archive")
def archive_task(task_id: str):
    return archive_board_task(task_id) or {"error": "not found"}


@router.delete("/{task_id}")
def delete_task(task_id: str):
    return {"ok": delete_board_task(task_id)}
