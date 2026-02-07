from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.auth import LoginRequest, MeResponse, TokenResponse
from layered_span_studio_backend.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, settings=Depends(get_settings)):
    try:
        return auth_service.login(settings, payload.username, payload.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")


@router.get("/me", response_model=MeResponse)
def me(user=Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"], "meta": user.get("meta")}
