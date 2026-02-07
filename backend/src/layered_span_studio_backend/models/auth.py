from __future__ import annotations

from layered_span_studio_backend.models.common import APIModel, Meta


class LoginRequest(APIModel):
    username: str
    password: str


class TokenResponse(APIModel):
    access_token: str
    token_type: str
    expires_in: int


class MeResponse(APIModel):
    id: str
    username: str
    meta: Meta = None
