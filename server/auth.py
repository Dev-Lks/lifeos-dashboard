"""Cookie-based auth helpers for the LifeOS FastAPI app."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from fastapi import HTTPException, Request, Response, status

SESSION_COOKIE = "lifeos_session"
SESSION_TTL_SECONDS = int(os.getenv("LIFEOS_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 14)))


def auth_password() -> str:
    return os.getenv("LIFEOS_PASSWORD", "lifeos")


def session_secret() -> str:
    return os.getenv("LIFEOS_SESSION_SECRET", "lifeos-dev-secret-change-me")


def shell_enabled() -> bool:
    return os.getenv("LIFEOS_ENABLE_SHELL", "0").strip().lower() in {"1", "true", "yes", "on"}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload: str) -> str:
    digest = hmac.new(session_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64(digest)


def create_session_token() -> str:
    payload = {
        "sub": "lucas",
        "iat": int(time.time()),
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(12),
    }
    raw = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{raw}.{_sign(raw)}"


def read_session_token(token: str | None) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(raw)):
        return None
    try:
        payload = json.loads(_unb64(raw))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def set_session_cookie(response: Response) -> None:
    secure = os.getenv("LIFEOS_COOKIE_SECURE", "0").strip().lower() in {"1", "true", "yes", "on"}
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(),
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def is_authenticated(request: Request) -> bool:
    return read_session_token(request.cookies.get(SESSION_COOKIE)) is not None


def require_auth(request: Request) -> dict[str, Any]:
    session = read_session_token(request.cookies.get(SESSION_COOKIE))
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return session


def verify_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate or "", auth_password())
