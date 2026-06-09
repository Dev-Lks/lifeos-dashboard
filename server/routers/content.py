"""Knowledge/content APIs."""
from fastapi import APIRouter

from ..content import get_content, list_content, save_content

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("")
def content_list():
    return list_content()


@router.get("/get")
def content_get(path: str):
    return get_content(path) or {"error": "not found or access denied"}


@router.post("/save")
def content_save(payload: dict):
    result = save_content(payload.get("path", ""), payload.get("content", ""))
    return result or {"error": "save failed or access denied"}
