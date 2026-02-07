from __future__ import annotations

from fastapi.testclient import TestClient

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import hash_password
from layered_span_studio_backend.repositories import users as users_repo


def test_login_success(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    response = client.post("/auth/login", json={"username": "user1", "password": "password"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_failure(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    response = client.post("/auth/login", json={"username": "user1", "password": "wrong"})
    assert response.status_code == 401


def test_me_requires_auth(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_success(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    login = client.post("/auth/login", json={"username": "user1", "password": "password"})
    token = login.json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "user1"
