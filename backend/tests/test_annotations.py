from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from conftest import create_label_via_sync

JSONDict = dict[str, Any]


def _setup(client: TestClient, auth_headers: dict[str, str]) -> tuple[JSONDict, JSONDict, JSONDict]:
    project = client.post(
        "/projects", json={"name": "Project A", "description": "desc"}, headers=auth_headers
    ).json()
    label = create_label_via_sync(client, auth_headers, project["id"], name="Label1", color="#FF5733", description="desc")
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


def test_annotation_mutations_touch_document_updated_at(client: TestClient, auth_headers: dict[str, str]) -> None:
    project, label, doc = _setup(client, auth_headers)
    initial_document = client.get(
        f"/projects/{project['id']}/documents/{doc['id']}",
        headers=auth_headers,
    ).json()
    initial_updated_at = initial_document["updated_at"]

    created = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    after_create = client.get(
        f"/projects/{project['id']}/documents/{doc['id']}",
        headers=auth_headers,
    ).json()["updated_at"]
    assert after_create >= initial_updated_at

    updated = client.patch(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/{created.json()['id']}",
        json={"comment": "updated"},
        headers=auth_headers,
    )
    assert updated.status_code == 200
    after_update = client.get(
        f"/projects/{project['id']}/documents/{doc['id']}",
        headers=auth_headers,
    ).json()["updated_at"]
    assert after_update >= after_create

    deleted = client.delete(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations/{created.json()['id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 204
    after_delete = client.get(
        f"/projects/{project['id']}/documents/{doc['id']}",
        headers=auth_headers,
    ).json()["updated_at"]
    assert after_delete >= after_update


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
    label2 = create_label_via_sync(client, auth_headers, project["id"], name="Label2", color="#33AA44", description="desc")

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


def test_search_annotations_by_surface(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects", json={"name": "Search Project", "description": "desc"}, headers=auth_headers
    ).json()
    disease = create_label_via_sync(client, auth_headers, project["id"], name="Disease", color="#FF5733", description="desc")
    finding = create_label_via_sync(client, auth_headers, project["id"], name="Finding", color="#33AA44", description="desc")
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
        f"/projects/{project['id']}/annotations/search?text=hello&status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_search_annotations_does_not_normalize_surface_text(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/projects", json={"name": "Exact Search Project", "description": "desc"}, headers=auth_headers
    ).json()
    label = create_label_via_sync(client, auth_headers, project["id"], name="Disease", color="#FF5733", description="desc")
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc1", "text": "COVID-19 / COVID 19"},
        headers=auth_headers,
    ).json()

    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 8,
            "span_text": "COVID-19",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 11,
            "end": 19,
            "span_text": "COVID 19",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )

    response = client.get(
        f"/projects/{project['id']}/annotations/search?text=COVID-19&status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["span_text"] == "COVID-19"


def test_search_annotations_pages_and_sorts_in_sql(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/projects", json={"name": "Paged Search Project", "description": "desc"}, headers=auth_headers
    ).json()
    label_a = create_label_via_sync(client, auth_headers, project["id"], name="LabelA", color="#FF5733", description="desc")
    label_b = create_label_via_sync(client, auth_headers, project["id"], name="LabelB", color="#33AA44", description="desc")
    doc_b = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "B_doc", "text": "alpha delta alpha"},
        headers=auth_headers,
    ).json()
    doc_a = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "A_doc", "text": "alpha beta alpha gamma alpha"},
        headers=auth_headers,
    ).json()

    client.post(
        f"/projects/{project['id']}/documents/{doc_b['id']}/annotations",
        json={
            "label_id": label_a["id"],
            "start": 0,
            "end": 5,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc_a['id']}/annotations",
        json={
            "label_id": label_a["id"],
            "start": 11,
            "end": 16,
            "span_text": "alpha",
            "comment": "",
            "status": "pending",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc_a['id']}/annotations",
        json={
            "label_id": label_b["id"],
            "start": 0,
            "end": 5,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc_a['id']}/annotations",
        json={
            "label_id": label_a["id"],
            "start": 23,
            "end": 28,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
        },
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project['id']}/documents/{doc_b['id']}/annotations",
        json={
            "label_id": label_b["id"],
            "start": 12,
            "end": 17,
            "span_text": "alpha",
            "comment": "",
            "status": "pending",
        },
        headers=auth_headers,
    )

    first_page = client.get(
        f"/projects/{project['id']}/annotations/search?text=alpha&status=all&offset=0&limit=2&context_window=3",
        headers=auth_headers,
    )
    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["total"] == 5
    assert [(item["document_name"], item["start"], item["status"]) for item in first_payload["items"]] == [
        ("A_doc", 0, "verified"),
        ("A_doc", 23, "verified"),
    ]
    assert first_payload["items"][0]["context_before"] == ""
    assert first_payload["items"][0]["context_after"] == " be"

    second_page = client.get(
        f"/projects/{project['id']}/annotations/search?text=alpha&status=all&offset=2&limit=2",
        headers=auth_headers,
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert [(item["document_name"], item["start"], item["status"]) for item in second_payload["items"]] == [
        ("B_doc", 0, "verified"),
        ("A_doc", 11, "pending"),
    ]

    pending_only = client.get(
        f"/projects/{project['id']}/annotations/search?text=alpha&status=pending&offset=0&limit=10",
        headers=auth_headers,
    )
    assert pending_only.status_code == 200
    pending_payload = pending_only.json()
    assert pending_payload["total"] == 2
    assert [(item["document_name"], item["start"]) for item in pending_payload["items"]] == [
        ("A_doc", 11),
        ("B_doc", 12),
    ]
