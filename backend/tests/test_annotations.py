from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


JSONDict = dict[str, Any]


def _setup(client: TestClient, auth_headers: dict[str, str]) -> tuple[JSONDict, JSONDict, JSONDict]:
    project = client.post(
        "/projects", json={"name": "Project A", "description": "desc"}, headers=auth_headers
    ).json()
    label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()
    return project, label, doc


def test_annotation_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)

    response = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    annotation_id = response.json()["id"]

    response = client.get(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/{annotation_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.patch(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/{annotation_id}",
        json={"comment": "updated", "status": "verified"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    response = client.delete(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/{annotation_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204


def test_annotation_span_text_validation(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)

    response = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 5,
            "span_text": "Nope",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_bulk_missing_status_returns_400(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)

    response = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/bulk",
        json={
            "annotations": [
                {
                    "label_id": label["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "",
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
