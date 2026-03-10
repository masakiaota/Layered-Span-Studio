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


def test_document_list_supports_search_and_sort(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Beta",
            "text": "contains target",
            "meta": {"status": "verified", "created_at": "2026-03-09T00:00:00Z"},
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Alpha",
            "text": "another TARGET sample",
            "meta": {"status": "pending", "created_at": "2026-03-08T00:00:00Z"},
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Gamma",
            "text": "no match here",
            "meta": {"status": "pending", "created_at": "2026-03-10T00:00:00Z"},
        },
        headers=auth_headers,
    )

    response = client.get(
        f"/projects/{project_id}/documents?search=target&sort=pending",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert [item["document_name"] for item in payload["documents"]] == ["Alpha", "Beta"]


def test_document_create_sets_server_managed_meta(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Doc1",
            "text": "Hello world",
            "meta": {
                "status": "verified",
                "created_at": "1999-01-01T00:00:00Z",
                "note": "keep me",
            },
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["meta"]["status"] == "pending"
    assert payload["meta"]["note"] == "keep me"
    assert payload["meta"]["created_at"] != "1999-01-01T00:00:00Z"
    assert payload["meta"]["updated_at"] == payload["meta"]["created_at"]


def test_document_bundle_save_syncs_annotations(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    label1 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    label2 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    first = client.post(
        f"/projects/{project_id}/documents/{document['id']}/annotations",
        json={
            "label_id": label1["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()
    second = client.post(
        f"/projects/{project_id}/documents/{document['id']}/annotations",
        json={
            "label_id": label1["id"],
            "start": 6,
            "end": 11,
            "span_text": "world",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": first["id"],
                    "label_id": label1["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "updated",
                    "status": "verified",
                    "meta": {"source": "bundle"},
                },
                {
                    "id": None,
                    "label_id": label2["id"],
                    "start": 6,
                    "end": 11,
                    "span_text": "world",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["status"] == "pending"
    assert {annotation["id"] for annotation in payload["annotations"]} != {first["id"], second["id"]}
    assert len(payload["annotations"]) == 2
    assert payload["annotations"][0]["comment"] == "updated"
    assert payload["annotations"][0]["status"] == "verified"
    assert payload["annotations"][0]["meta"] == {"source": "bundle"}
    assert all(annotation["id"] != second["id"] for annotation in payload["annotations"])


def test_document_bundle_rejects_existing_immutable_change(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    label1 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    label2 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()
    annotation = client.post(
        f"/projects/{project_id}/documents/{document['id']}/annotations",
        json={
            "label_id": label1["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": annotation["id"],
                    "label_id": label2["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_document_bundle_marks_document_verified_when_all_annotations_are_verified(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    label1 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    label2 = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    existing = client.post(
        f"/projects/{project_id}/documents/{document['id']}/annotations",
        json={
            "label_id": label1["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": existing["id"],
                    "label_id": label1["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "done",
                    "status": "verified",
                    "meta": {},
                },
                {
                    "id": None,
                    "label_id": label2["id"],
                    "start": 6,
                    "end": 11,
                    "span_text": "world",
                    "comment": "",
                    "status": "verified",
                    "meta": {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["status"] == "verified"
    assert all(annotation["status"] == "verified" for annotation in payload["annotations"])
