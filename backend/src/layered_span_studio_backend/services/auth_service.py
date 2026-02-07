from __future__ import annotations

from typing import Any, Dict

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import create_access_token, verify_password
from layered_span_studio_backend.repositories import users as users_repo


def login(settings: Settings, username: str, password: str) -> Dict[str, Any]:
    user = users_repo.get_user_by_username(settings, username)
    if not user:
        raise ValueError("Invalid username or password")
    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid username or password")
    token = create_access_token(user["id"], settings.jwt_secret, settings.jwt_expires_in)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_expires_in}
