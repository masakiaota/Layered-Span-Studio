from __future__ import annotations

from fastapi.testclient import TestClient

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.core.security import hash_password
from layered_span_studio_backend.repositories import users as users_repo


def test_create_session_success_sets_cookies(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    response = client.post("/auth/session", json={"username": "user1", "password": "password"})

    assert response.status_code == 200
    assert response.json()["username"] == "user1"
    assert client.cookies.get("lss_session")
    assert client.cookies.get("lss_csrf")


def test_create_session_failure(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    response = client.post("/auth/session", json={"username": "user1", "password": "wrong"})

    assert response.status_code == 401


def test_get_session_requires_auth(client: TestClient) -> None:
    response = client.get("/auth/session")
    assert response.status_code == 401


def test_get_session_success_with_cookie(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.get("/auth/session")
    assert response.status_code == 200
    assert response.json()["username"] == "user1"
    assert client.cookies.get("lss_csrf")


def test_delete_session_requires_csrf(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.delete("/auth/session")
    assert response.status_code == 403


def test_delete_session_success(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.delete("/auth/session", headers=session_auth)

    assert response.status_code == 204
    assert client.get("/auth/session").status_code == 401


def test_token_success(client: TestClient, settings: Settings) -> None:
    users_repo.ensure_users_db(settings)
    users_repo.create_user(settings, "user1", hash_password("password"), meta={})

    response = client.post("/auth/token", json={"username": "user1", "password": "password"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_protected_route_accepts_session_auth(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.get("/projects")
    assert response.status_code == 200

    create = client.post(
        "/projects",
        json={"name": "Session Project", "description": "desc"},
        headers=session_auth,
    )
    assert create.status_code == 201


def test_protected_route_rejects_session_write_without_csrf(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.post("/projects", json={"name": "Session Project", "description": "desc"})
    assert response.status_code == 403


def test_invalid_bearer_does_not_fallback_to_session(client: TestClient, session_auth: dict[str, str]) -> None:
    response = client.get("/projects", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 401
