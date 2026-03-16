from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import create_access_token, verify_password
from layered_span_studio_backend.repositories import sessions as sessions_repo
from layered_span_studio_backend.repositories import users as users_repo

SESSION_COOKIE_NAME = "lss_session"
CSRF_COOKIE_NAME = "lss_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"


def authenticate_user(settings: Settings, username: str, password: str) -> Dict[str, Any]:
    user = users_repo.get_user_by_username(settings, username)
    if not user:
        raise ValueError("Invalid username or password")
    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid username or password")
    return user


def issue_access_token(settings: Settings, username: str, password: str) -> Dict[str, Any]:
    user = authenticate_user(settings, username, password)
    token = create_access_token(user["id"], settings.jwt_secret, settings.jwt_expires_in)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_expires_in}


def create_session(settings: Settings, username: str, password: str) -> Dict[str, Any]:
    user = authenticate_user(settings, username, password)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.session_expires_in)
    session_id = secrets.token_urlsafe(32)
    sessions_repo.create_session(
        settings,
        session_id=session_id,
        user_id=user["id"],
        created_at=now.isoformat(),
        expires_at=expires_at.isoformat(),
    )
    return {
        "session_id": session_id,
        "csrf_token": generate_csrf_token(),
        "user": {"id": user["id"], "username": user["username"], "meta": user.get("meta")},
    }


def get_session_user(settings: Settings, session_id: str) -> Dict[str, Any] | None:
    session = sessions_repo.get_session_by_id(settings, session_id)
    if not session:
        return None

    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at <= datetime.now(timezone.utc):
        sessions_repo.delete_session(settings, session_id)
        return None

    user = users_repo.get_user_by_id(settings, session["user_id"])
    if not user:
        sessions_repo.delete_session(settings, session_id)
        return None
    return user


def delete_session(settings: Settings, session_id: str) -> bool:
    return sessions_repo.delete_session(settings, session_id)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)
