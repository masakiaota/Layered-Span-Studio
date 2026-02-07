from __future__ import annotations

from fastapi.testclient import TestClient


def _create_project(client: TestClient, auth_headers: dict[str, str]) -> str:
    response = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    )
    return response.json()["id"]


def test_label_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.post(
        f"/projects/{project_id}/labels",
        json={
            "name": "Label1",
            "color": "#FF5733",
            "description": "desc",
            "shortcut": "a",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    created_label = response.json()
    label_id = created_label["id"]
    assert created_label["project_name"] == "Project A"

    response = client.get(f"/projects/{project_id}/labels", headers=auth_headers)
    assert response.status_code == 200
    labels = response.json()["labels"]
    assert len(labels) == 1
    assert labels[0]["project_name"] == "Project A"

    response = client.get(f"/projects/{project_id}/labels/{label_id}", headers=auth_headers)
    assert response.status_code == 200

    response = client.patch(
        f"/projects/{project_id}/labels/{label_id}",
        json={"description": "updated", "color": "#FF6644"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/projects/{project_id}/labels/{label_id}", headers=auth_headers)
    assert response.status_code == 204


def test_label_color_validation(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Bad", "color": "red", "description": "desc"},
        headers=auth_headers,
    )
    assert response.status_code == 422
