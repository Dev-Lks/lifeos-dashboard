"""Auth API."""
from fastapi import APIRouter, Request, Response

from ..auth import clear_session_cookie, is_authenticated, set_session_cookie, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/session")
def session(request: Request):
    return {"authenticated": is_authenticated(request)}


@router.post("/login")
def login(payload: dict, response: Response):
    if not verify_password(str(payload.get("password", ""))):
        return Response(status_code=401)
    set_session_cookie(response)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}
