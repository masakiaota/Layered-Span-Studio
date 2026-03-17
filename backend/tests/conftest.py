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


def create_label_via_sync(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: str,
    *,
    name: str,
    color: str,
    description: str,
    shortcut: str | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    existing_response = client.get(f"/projects/{project_id}/labels", headers=auth_headers)
    assert existing_response.status_code == 200
    existing_labels: list[dict[str, Any]] = existing_response.json()["labels"]
    existing_ids = {label["id"] for label in existing_labels}

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "labels": [
                *[
                    {
                        "id": label["id"],
                        "name": label["name"],
                        "color": label["color"],
                        "description": label["description"],
                        "shortcut": label.get("shortcut"),
                        "meta": label.get("meta") or {},
                    }
                    for label in existing_labels
                ],
                {
                    "id": None,
                    "name": name,
                    "color": color,
                    "description": description,
                    "shortcut": shortcut,
                    "meta": meta or {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    labels: list[dict[str, Any]] = response.json()["labels"]
    created = next((label for label in labels if label["id"] not in existing_ids and label["name"] == name), None)
    if created is None:
        raise AssertionError(f"Unable to find created label: {name}")
    return created
