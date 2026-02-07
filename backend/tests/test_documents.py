from __future__ import annotations

from fastapi.testclient import TestClient


def _create_project(client: TestClient, auth_headers: dict[str, str]) -> str:
    response = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    )
    return response.json()["id"]


def test_document_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world", "meta": {}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    document_id = response.json()["id"]

    response = client.get(f"/projects/{project_id}/documents", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["documents"][0]["text"] == "Hello world"

    response = client.get(f"/projects/{project_id}/documents/{document_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["annotations"] == []

    response = client.patch(
        f"/projects/{project_id}/documents/{document_id}",
        json={"document_name": "Doc1Updated"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/projects/{project_id}/documents/{document_id}", headers=auth_headers)
    assert response.status_code == 204


def test_document_text_update_forbidden(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    response = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world", "meta": {}},
        headers=auth_headers,
    )
    document_id = response.json()["id"]

    response = client.patch(
        f"/projects/{project_id}/documents/{document_id}",
        json={"text": "New text"},
        headers=auth_headers,
    )
    assert response.status_code == 422
