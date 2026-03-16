from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from layered_span_studio_backend.core.dependencies import get_current_session_auth, get_settings
from layered_span_studio_backend.models.auth import LoginRequest, MeResponse, TokenResponse
from layered_span_studio_backend.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookies(response: Response, session_id: str, csrf_token: str, *, secure: bool, max_age: int) -> None:
    response.set_cookie(
        key=auth_service.SESSION_COOKIE_NAME,
        value=session_id,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    response.set_cookie(
        key=auth_service.CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _clear_session_cookies(response: Response, *, secure: bool) -> None:
    response.delete_cookie(auth_service.SESSION_COOKIE_NAME, path="/", secure=secure, samesite="lax", httponly=True)
    response.delete_cookie(auth_service.CSRF_COOKIE_NAME, path="/", secure=secure, samesite="lax")


@router.post("/session", response_model=MeResponse)
def create_session(payload: LoginRequest, response: Response, settings=Depends(get_settings)):
    try:
        session = auth_service.create_session(settings, payload.username, payload.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    _set_session_cookies(
        response,
        session_id=session["session_id"],
        csrf_token=session["csrf_token"],
        secure=settings.cookie_secure,
        max_age=settings.session_expires_in,
    )
    return session["user"]


@router.get("/session", response_model=MeResponse)
def get_session(response: Response, auth=Depends(get_current_session_auth), settings=Depends(get_settings)):
    csrf_token = auth_service.generate_csrf_token()
    response.set_cookie(
        key=auth_service.CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=settings.session_expires_in,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    user = auth["user"]
    return {"id": user["id"], "username": user["username"], "meta": user.get("meta")}


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(response: Response, auth=Depends(get_current_session_auth), settings=Depends(get_settings)):
    auth_service.delete_session(settings, auth["session_id"])
    _clear_session_cookies(response, secure=settings.cookie_secure)
    return None


@router.post("/token", response_model=TokenResponse)
def create_token(payload: LoginRequest, settings=Depends(get_settings)):
    try:
        return auth_service.issue_access_token(settings, payload.username, payload.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
