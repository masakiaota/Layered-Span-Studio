from __future__ import annotations

from typing import Any

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


def _setup_examples_fixture(client: TestClient, auth_headers: dict[str, str]) -> dict[str, Any]:
    project = client.post(
        "/projects",
        json={"name": "Project Examples", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    target_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "TargetLabel", "color": "#AA1122", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    other_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "OtherLabel", "color": "#11AA22", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    doc_a = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "A_doc", "text": "alpha bravo charlie", "meta": {}},
        headers=auth_headers,
    ).json()
    doc_b = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "B_doc", "text": "bravo delta alpha", "meta": {}},
        headers=auth_headers,
    ).json()

    ann_verified_a = client.post(
        f"/projects/{project['id']}/documents/{doc_a['id']}/annotations",
        json={
            "label_id": target_label["id"],
            "start": 0,
            "end": 5,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    ).json()
    ann_pending_a = client.post(
        f"/projects/{project['id']}/documents/{doc_a['id']}/annotations",
        json={
            "label_id": target_label["id"],
            "start": 6,
            "end": 11,
            "span_text": "bravo",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()
    ann_verified_b = client.post(
        f"/projects/{project['id']}/documents/{doc_b['id']}/annotations",
        json={
            "label_id": target_label["id"],
            "start": 0,
            "end": 5,
            "span_text": "bravo",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    ).json()
    ann_other_label = client.post(
        f"/projects/{project['id']}/documents/{doc_b['id']}/annotations",
        json={
            "label_id": other_label["id"],
            "start": 12,
            "end": 17,
            "span_text": "alpha",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    return {
        "project_id": project["id"],
        "target_label_id": target_label["id"],
        "other_label_annotation_id": ann_other_label["id"],
        "target_annotation_ids_in_sequential_order": [
            ann_verified_a["id"],
            ann_pending_a["id"],
            ann_verified_b["id"],
        ],
    }


def test_label_examples_default_status_verified(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "verified"
    assert payload["total_matched"] == 2
    assert all(item["status"] == "verified" for item in payload["examples"])


def test_label_examples_status_all(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples?status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "all"
    assert payload["total_matched"] == 3
    assert {item["status"] for item in payload["examples"]} == {"pending", "verified"}


def test_label_examples_status_pending(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples?status=pending",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["total_matched"] == 1
    assert len(payload["examples"]) == 1
    assert payload["examples"][0]["status"] == "pending"


def test_label_examples_excludes_other_labels(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples?status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    annotation_ids = {item["annotation_id"] for item in response.json()["examples"]}
    assert data["other_label_annotation_id"] not in annotation_ids


def test_label_examples_sequential_pagination(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples"
        "?status=all&sample=sequential&offset=1&limit=2",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["sample"] == "sequential"
    assert payload["offset_applied"] == 1
    assert payload["limit"] == 2
    assert [item["annotation_id"] for item in payload["examples"]] == data[
        "target_annotation_ids_in_sequential_order"
    ][1:3]


def test_label_examples_random_with_seed_is_reproducible(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    endpoint = (
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples"
        "?status=all&sample=random&limit=3&seed=42"
    )

    first = client.get(endpoint, headers=auth_headers)
    second = client.get(endpoint, headers=auth_headers)
    assert first.status_code == 200
    assert second.status_code == 200

    first_ids = [item["annotation_id"] for item in first.json()["examples"]]
    second_ids = [item["annotation_id"] for item in second.json()["examples"]]
    assert first_ids == second_ids
    assert len(first_ids) == len(set(first_ids))


def test_label_examples_random_ignores_offset(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    base = f"/projects/{data['project_id']}/labels/{data['target_label_id']}/examples"
    with_offset = client.get(
        f"{base}?status=all&sample=random&limit=2&seed=7&offset=1",
        headers=auth_headers,
    )
    without_offset = client.get(
        f"{base}?status=all&sample=random&limit=2&seed=7&offset=0",
        headers=auth_headers,
    )
    assert with_offset.status_code == 200
    assert without_offset.status_code == 200
    assert with_offset.json()["offset_applied"] == 0
    assert without_offset.json()["offset_applied"] == 0
    assert with_offset.json()["examples"] == without_offset.json()["examples"]


def test_label_examples_context_window_boundaries(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project Context", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "LabelContext", "color": "#1122AA", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "ContextDoc", "text": "hello world", "meta": {}},
        headers=auth_headers,
    ).json()

    start_ann = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 0,
            "end": 5,
            "span_text": "hello",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    ).json()
    end_ann = client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 6,
            "end": 11,
            "span_text": "world",
            "comment": "",
            "status": "verified",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    response = client.get(
        f"/projects/{project['id']}/labels/{label['id']}/examples?context_window=3&status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    by_id = {item["annotation_id"]: item for item in response.json()["examples"]}
    assert by_id[start_ann["id"]]["context_before"] == ""
    assert by_id[start_ann["id"]]["context_after"] == " wo"
    assert by_id[end_ann["id"]]["context_before"] == "lo "
    assert by_id[end_ann["id"]]["context_after"] == ""


def test_label_examples_not_found(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get(
        "/projects/not-found/labels/not-found/examples",
        headers=auth_headers,
    )
    assert response.status_code == 404

    project_id = _create_project(client, auth_headers)
    response = client.get(
        f"/projects/{project_id}/labels/not-found/examples",
        headers=auth_headers,
    )
    assert response.status_code == 404
