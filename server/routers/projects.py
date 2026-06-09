"""Projects, links, agent actions, and reviews APIs."""
from fastapi import APIRouter

from ..kanban import list_board_tasks
from ..lifeos import (
    create_agent_action,
    create_link,
    create_project,
    delete_project,
    get_project,
    list_agent_actions,
    list_daily_reviews,
    list_links,
    list_projects,
    upsert_daily_review,
    update_project,
)

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/projects")
def projects():
    return list_projects()


@router.post("/projects")
def project_create(payload: dict):
    return create_project(payload)


@router.get("/projects/{project_id}")
def project_get(project_id: str):
    return get_project(project_id) or {"error": "not found"}


@router.patch("/projects/{project_id}")
def project_update(project_id: str, payload: dict):
    return update_project(project_id, payload)


@router.delete("/projects/{project_id}")
def project_delete(project_id: str):
    return {"ok": delete_project(project_id)}


@router.get("/projects/{project_id}/tasks")
def project_tasks(project_id: str):
    return list_board_tasks({"project_id": project_id})


@router.get("/agent-actions")
def agent_actions(agent: str | None = None):
    return list_agent_actions(agent)


@router.post("/agent-actions")
def agent_action_create(payload: dict):
    return create_agent_action(payload)


@router.get("/daily-reviews")
def daily_reviews():
    return list_daily_reviews()


@router.post("/daily-reviews")
def daily_review_upsert(payload: dict):
    return upsert_daily_review(payload)


@router.get("/entity-links")
def entity_links(source_type: str | None = None, source_id: str | None = None):
    return list_links(source_type, source_id)


@router.post("/entity-links")
def entity_link_create(payload: dict):
    return create_link(payload)
