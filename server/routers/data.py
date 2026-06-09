"""Snapshot and SSE APIs."""
import queue

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..data import _recent_activity, build_snapshot
from ..sse import sse_manager
from .health import normalized_health

router = APIRouter(tags=["data"])


@router.get("/api/data")
def data_snapshot():
    snap = build_snapshot()
    health = normalized_health()
    snap["health"] = health["health"]
    return snap


@router.get("/api/data/agent_logs")
def agent_logs():
    return _recent_activity(50)


@router.get("/events")
def events():
    q = sse_manager.register()

    def stream():
        try:
            while True:
                try:
                    yield q.get(timeout=20)
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            sse_manager.unregister(q)

    return StreamingResponse(stream(), media_type="text/event-stream")
