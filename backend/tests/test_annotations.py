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


def test_annotation_same_label_overlap_rejected(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)

    first = client.post(
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
    assert first.status_code == 201

    overlapped = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 3,
            "end": 8,
            "span_text": "lo wo",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert overlapped.status_code == 400


def test_annotation_different_label_overlap_allowed(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label1, doc = _setup(client, auth_headers)
    label2 = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()

    first = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label1["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert first.status_code == 201

    overlapped = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label2["id"],
            "start": 3,
            "end": 8,
            "span_text": "lo wo",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert overlapped.status_code == 201


def test_bulk_same_label_overlap_returns_400(client: TestClient, auth_headers: dict[str, str]) -> None:
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
                    "status": "verified",
                    "meta": {},
                },
                {
                    "label_id": label["id"],
                    "start": 3,
                    "end": 8,
                    "span_text": "lo wo",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_bulk_different_label_overlap_allowed(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label1, doc = _setup(client, auth_headers)
    label2 = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()

    response = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/bulk",
        json={
            "annotations": [
                {
                    "label_id": label1["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "",
                    "status": "verified",
                    "meta": {},
                },
                {
                    "label_id": label2["id"],
                    "start": 3,
                    "end": 8,
                    "span_text": "lo wo",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert len(response.json()["created"]) == 2


def test_search_annotations_by_surface(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects", json={"name": "Search Project", "description": "desc"}, headers=auth_headers
    ).json()
    disease = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Disease", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    finding = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Finding", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc1", "text": "alpha bravo alpha bravo"},
        headers=auth_headers,
    ).json()

    excluded = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": disease["id"],
            "start": 0,
            "end": 5,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    ).json()
    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": finding["id"],
            "start": 12,
            "end": 17,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": disease["id"],
            "start": 6,
            "end": 11,
            "span_text": "bravo",
            "comment": "",
            "status": "pending",
        },
        headers=auth_headers,
    )

    response = client.get(
        (
            f"/projects/{project['id']}/annotations/search"
            f"?text=alpha&status=all&label_id={disease['id']}&exclude_annotation_id={excluded['id']}"
        ),
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["label_id"] == finding["id"]
    assert payload["items"][0]["label_color"] == finding["color"]


def test_search_annotations_exact_match(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)
    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )

    response = client.get(
        f"/projects/{project['id']}/annotations/search?text=hello&match=exact&status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_bulk_same_label_overlap_with_existing_returns_400(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project, label, doc = _setup(client, auth_headers)

    first = client.post(
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
    assert first.status_code == 201

    response = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/bulk",
        json={
            "annotations": [
                {
                    "label_id": label["id"],
                    "start": 3,
                    "end": 8,
                    "span_text": "lo wo",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
