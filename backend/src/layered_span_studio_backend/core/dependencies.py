from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import decode_access_token
from layered_span_studio_backend.repositories import users as users_repo
from layered_span_studio_backend.services import auth_service

security = HTTPBearer(auto_error=False)
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def _get_user_from_bearer(credentials: HTTPAuthorizationCredentials, settings: Settings):
    if not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_access_token(credentials.credentials, settings.jwt_secret)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = users_repo.get_user_by_id(settings, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def _require_valid_csrf(request: Request) -> None:
    csrf_cookie = request.cookies.get(auth_service.CSRF_COOKIE_NAME)
    csrf_header = request.headers.get(auth_service.CSRF_HEADER_NAME)
    if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
):
    if credentials is not None:
        return _get_user_from_bearer(credentials, settings)

    session_id = request.cookies.get(auth_service.SESSION_COOKIE_NAME)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = auth_service.get_session_user(settings, session_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if request.method.upper() not in SAFE_METHODS:
        _require_valid_csrf(request)

    return user


def get_current_session_auth(
    request: Request,
    settings: Settings = Depends(get_settings),
):
    session_id = request.cookies.get(auth_service.SESSION_COOKIE_NAME)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = auth_service.get_session_user(settings, session_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if request.method.upper() not in SAFE_METHODS:
        _require_valid_csrf(request)

    return {"session_id": session_id, "user": user}
