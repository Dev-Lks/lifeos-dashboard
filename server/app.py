"""FastAPI application factory for Hermes LifeOS."""
from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import is_authenticated
from .config import BASE_DIR, DATA_DIR
from .db import migrate_all
from .kanban import init_board_db
from .right_hand import init_atlas_db
from .routers import (
    atlas,
    auth,
    automations,
    content,
    data,
    finance,
    health,
    projects,
    routine,
    schedule,
    tasks,
)
from .sse import broadcaster_thread

FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
LEGACY_INDEX = BASE_DIR / "index.html"


def _allowed_origins() -> list[str]:
    raw = os.getenv("LIFEOS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [item.strip() for item in raw.split(",") if item.strip()]


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        migrate_all()
        init_board_db()
        init_atlas_db()
        if not getattr(app.state, "sse_started", False):
            t = threading.Thread(target=broadcaster_thread, daemon=True)
            t.start()
            app.state.sse_started = True
        yield

    app = FastAPI(title="Hermes LifeOS", version="4.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def auth_and_security(request: Request, call_next):
        path = request.url.path
        public_api = path.startswith("/api/auth") or path == "/api/health"
        protected = path.startswith("/api") or path == "/events"
        if protected and not public_api and not is_authenticated(request):
            return JSONResponse({"error": "not authenticated"}, status_code=401)

        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
        return response

    app.include_router(auth.router)
    app.include_router(health.router)
    app.include_router(data.router)
    app.include_router(tasks.router)
    app.include_router(projects.router)
    app.include_router(finance.router)
    app.include_router(routine.router)
    app.include_router(automations.router)
    app.include_router(atlas.router)
    app.include_router(content.router)
    app.include_router(schedule.router)

    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest():
        path = FRONTEND_DIST / "manifest.webmanifest"
        return FileResponse(path if path.exists() else BASE_DIR / "frontend" / "public" / "manifest.webmanifest")

    @app.get("/sw.js", include_in_schema=False)
    def service_worker():
        path = FRONTEND_DIST / "sw.js"
        return FileResponse(path if path.exists() else BASE_DIR / "frontend" / "public" / "sw.js", media_type="application/javascript")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"error": "not found"}, status_code=404)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        return FileResponse(LEGACY_INDEX)

    return app


app = create_app()
