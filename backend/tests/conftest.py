from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

os.environ.setdefault("JWT_SECRET", "test-secret")

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import hash_password
from layered_span_studio_backend.main import create_app
from layered_span_studio_backend.repositories import users as users_repo


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    data_dir = tmp_path / "data"
    return Settings(
        data_dir=data_dir,
        jwt_secret="test-secret",
        jwt_expires_in=3600,
        session_expires_in=3600,
        cookie_secure=False,
        cors_allow_origins=["http://127.0.0.1:3000"],
    )


@pytest.fixture()
def client(settings: Settings) -> TestClient:
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture()
def auth_headers(settings: Settings, client: TestClient) -> dict[str, str]:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})
    response = client.post("/auth/token", json={"username": "user1", "password": "password"})
    payload: dict[str, Any] = response.json()
    token = payload["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def session_auth(client: TestClient, settings: Settings) -> dict[str, str]:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})
    response = client.post("/auth/session", json={"username": "user1", "password": "password"})
    assert response.status_code == 200
    csrf_token = client.cookies.get("lss_csrf")
    assert csrf_token is not None
    return {"X-CSRF-Token": csrf_token}
