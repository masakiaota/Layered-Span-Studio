from __future__ import annotations

import threading
from typing import Any

from fastapi.testclient import TestClient

from conftest import create_label_via_sync
from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import annotations_table, get_project_engine
from layered_span_studio_backend.utils.json_utils import encode_meta


def _create_project(client: TestClient, auth_headers: dict[str, str]) -> str:
    response = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    )
    return response.json()["id"]


def _get_labels_payload(client: TestClient, auth_headers: dict[str, str], project_id: str) -> dict[str, Any]:
    response = client.get(f"/projects/{project_id}/labels", headers=auth_headers)
    assert response.status_code == 200
    return response.json()


def _insert_annotation_row(
    settings: Settings,
    project_id: str,
    *,
    annotation_id: str,
    document_id: str,
    label_id: str,
    start: int,
    end: int,
    span_text: str,
    status: str = "verified",
) -> None:
    engine = get_project_engine(str(project_db_path(settings, project_id)))
    with engine.begin() as conn:
        conn.execute(
            annotations_table.insert().values(
                id=annotation_id,
                document_id=document_id,
                label_id=label_id,
                start=start,
                end=end,
                span_text=span_text,
                comment="",
                status=status,
                meta=encode_meta({}),
            )
        )


def test_label_color_validation(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": _get_labels_payload(client, auth_headers, project_id)["revision"],
            "labels": [{"id": None, "name": "Bad", "color": "red", "description": "desc", "shortcut": None, "meta": {}}],
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_labels_put_rejects_empty_revision(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": "",
            "labels": [{"id": None, "name": "Bad", "color": "#FF5733", "description": "desc", "shortcut": None, "meta": {}}],
        },
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_labels_put_syncs_create_update_delete(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    first = create_label_via_sync(
        client, auth_headers, project_id, name="Label1", color="#FF5733", description="desc", shortcut="a", meta={}
    )
    second = create_label_via_sync(
        client, auth_headers, project_id, name="Label2", color="#33AA44", description="desc", shortcut="b", meta={}
    )
    current_payload = _get_labels_payload(client, auth_headers, project_id)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": current_payload["revision"],
            "labels": [
                {
                    "id": first["id"],
                    "name": "Label1Updated",
                    "color": "#FF6644",
                    "description": "updated",
                    "shortcut": "x",
                    "meta": {"note": "changed"},
                },
                {
                    "id": None,
                    "name": "Label3",
                    "color": "#1133AA",
                    "description": "new",
                    "shortcut": None,
                    "meta": {},
                },
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()["labels"]
    assert len(payload) == 2
    assert {label["name"] for label in payload} == {"Label1Updated", "Label3"}
    assert all(label["id"] != second["id"] for label in payload)


def test_labels_put_preserves_payload_order_and_updates_revision(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    first = create_label_via_sync(
        client, auth_headers, project_id, name="Zulu", color="#FF5733", description="desc", shortcut="z", meta={}
    )
    second = create_label_via_sync(
        client, auth_headers, project_id, name="Alpha", color="#33AA44", description="desc", shortcut="a", meta={}
    )
    current_payload = _get_labels_payload(client, auth_headers, project_id)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": current_payload["revision"],
            "labels": [
                {
                    "id": second["id"],
                    "name": second["name"],
                    "color": second["color"],
                    "description": second["description"],
                    "shortcut": second["shortcut"],
                    "meta": second["meta"],
                },
                {
                    "id": first["id"],
                    "name": first["name"],
                    "color": first["color"],
                    "description": first["description"],
                    "shortcut": first["shortcut"],
                    "meta": first["meta"],
                },
            ],
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert [label["name"] for label in response.json()["labels"]] == ["Alpha", "Zulu"]
    assert response.json()["revision"] != current_payload["revision"]

    persisted = _get_labels_payload(client, auth_headers, project_id)
    assert [label["name"] for label in persisted["labels"]] == ["Alpha", "Zulu"]


def test_labels_put_rejects_duplicate_name_in_payload(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    current_payload = _get_labels_payload(client, auth_headers, project_id)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": current_payload["revision"],
            "labels": [
                {"id": None, "name": "Label1", "color": "#FF5733", "description": "desc", "shortcut": None, "meta": {}},
                {"id": None, "name": "Label1", "color": "#33AA44", "description": "desc", "shortcut": None, "meta": {}},
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_labels_put_rejects_duplicate_id_in_payload(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    first = create_label_via_sync(
        client, auth_headers, project_id, name="Label1", color="#FF5733", description="desc", shortcut="a", meta={}
    )
    current_payload = _get_labels_payload(client, auth_headers, project_id)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": current_payload["revision"],
            "labels": [
                {"id": first["id"], "name": "Label1", "color": "#FF5733", "description": "desc", "shortcut": "a", "meta": {}},
                {"id": first["id"], "name": "Label2", "color": "#33AA44", "description": "desc", "shortcut": "b", "meta": {}},
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_labels_put_unknown_id_returns_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    current_payload = _get_labels_payload(client, auth_headers, project_id)

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": current_payload["revision"],
            "labels": [
                {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "name": "Label1",
                    "color": "#FF5733",
                    "description": "desc",
                    "shortcut": None,
                    "meta": {},
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_labels_put_delete_cascades_annotations(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    label = create_label_via_sync(
        client, auth_headers, project_id, name="Label1", color="#FF5733", description="desc", shortcut="a", meta={}
    )
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world", "meta": {}},
        headers=auth_headers,
    ).json()
    client.post(
        f"/projects/{project_id}/documents/{document['id']}/annotations",
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

    response = client.put(
        f"/projects/{project_id}/labels",
        json={"base_revision": _get_labels_payload(client, auth_headers, project_id)["revision"], "labels": []},
        headers=auth_headers,
    )
    assert response.status_code == 200

    document_detail = client.get(
        f"/projects/{project_id}/documents/{document['id']}",
        headers=auth_headers,
    )
    assert document_detail.status_code == 200
    assert document_detail.json()["annotations"] == []


def test_labels_put_response_uses_latest_project_name(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    client.put(
        f"/projects/{project_id}/settings",
        json={"name": "Project Renamed", "description": "desc", "meta": {}},
        headers=auth_headers,
    )

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": _get_labels_payload(client, auth_headers, project_id)["revision"],
            "labels": [
                {"id": None, "name": "Label1", "color": "#FF5733", "description": "desc", "shortcut": None, "meta": {}}
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["labels"][0]["project_name"] == "Project Renamed"


def test_labels_put_does_not_delete_other_project_labels(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    first_project_id = _create_project(client, auth_headers)
    second_project_id = client.post(
        "/projects",
        json={"name": "Project B", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()["id"]

    create_label_via_sync(client, auth_headers, first_project_id, name="Label1", color="#FF5733", description="desc")
    create_label_via_sync(client, auth_headers, second_project_id, name="Label2", color="#33AA44", description="desc")

    response = client.put(
        f"/projects/{first_project_id}/labels",
        json={"base_revision": _get_labels_payload(client, auth_headers, first_project_id)["revision"], "labels": []},
        headers=auth_headers,
    )
    assert response.status_code == 200

    remaining = client.get(f"/projects/{second_project_id}/labels", headers=auth_headers)
    assert remaining.status_code == 200
    assert [label["name"] for label in remaining.json()["labels"]] == ["Label2"]


def test_labels_put_rejects_stale_revision(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_id = _create_project(client, auth_headers)
    initial_payload = _get_labels_payload(client, auth_headers, project_id)
    create_label_via_sync(client, auth_headers, project_id, name="Label1", color="#FF5733", description="desc")

    response = client.put(
        f"/projects/{project_id}/labels",
        json={
            "base_revision": initial_payload["revision"],
            "labels": [
                {"id": None, "name": "Label2", "color": "#33AA44", "description": "desc", "shortcut": None, "meta": {}}
            ],
        },
        headers=auth_headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Label revision mismatch"


def test_labels_save_state_rejects_concurrent_stale_revision(settings: Settings) -> None:
    project = projects_repo.create_project(settings, "Project A", "desc", {})
    initial_state = labels_repo.list_labels_state(settings, project["id"])
    base_revision = initial_state["revision"]
    barrier = threading.Barrier(2)
    revisions: list[str] = []
    errors: list[str] = []

    def worker(name: str, color: str) -> None:
        try:
            barrier.wait()
            result = labels_repo.save_labels_state(
                settings,
                project["id"],
                [
                    {
                        "id": None,
                        "name": name,
                        "color": color,
                        "description": "desc",
                        "shortcut": None,
                        "meta": {},
                    }
                ],
                base_revision,
            )
            revisions.append(result["revision"])
        except ValueError as exc:
            errors.append(str(exc))

    threads = [
        threading.Thread(target=worker, args=("Label1", "#FF5733")),
        threading.Thread(target=worker, args=("Label2", "#33AA44")),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(revisions) == 1
    assert errors == ["Label revision mismatch"]
    final_state = labels_repo.list_labels_state(settings, project["id"])
    assert len(final_state["labels"]) == 1


def _setup_examples_fixture(client: TestClient, auth_headers: dict[str, str]) -> dict[str, Any]:
    project = client.post(
        "/projects",
        json={"name": "Project Examples", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    target_label = create_label_via_sync(
        client, auth_headers, project["id"], name="TargetLabel", color="#AA1122", description="desc", meta={}
    )
    other_label = create_label_via_sync(
        client, auth_headers, project["id"], name="OtherLabel", color="#11AA22", description="desc", meta={}
    )

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
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="LabelContext", color="#1122AA", description="desc", meta={}
    )
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


def test_label_surface_groups_are_grouped_and_paginated(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        (
            f"/projects/{data['project_id']}/labels/{data['target_label_id']}/surface-groups"
            "?status=all&limit=1"
        ),
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["limit"] == 1
    assert payload["items"][0]["surface_text"] == "alpha"
    assert payload["items"][0]["duplicate_count"] == 1

    second_page = client.get(
        (
            f"/projects/{data['project_id']}/labels/{data['target_label_id']}/surface-groups"
            "?status=all&offset=1&limit=1"
        ),
        headers=auth_headers,
    )
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["items"][0]["surface_text"] == "bravo"
    assert second_payload["items"][0]["duplicate_count"] == 2


def test_label_surface_groups_exclude_annotation_id(client: TestClient, auth_headers: dict[str, str]) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        (
            f"/projects/{data['project_id']}/labels/{data['target_label_id']}/surface-groups"
            f"?status=all&exclude_annotation_id={data['target_annotation_ids_in_sequential_order'][0]}"
        ),
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    surfaces = {item["surface_text"] for item in payload["items"]}
    assert surfaces == {"bravo"}


def test_label_surface_groups_choose_verified_representative(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    data = _setup_examples_fixture(client, auth_headers)
    response = client.get(
        f"/projects/{data['project_id']}/labels/{data['target_label_id']}/surface-groups?status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    by_surface = {item["surface_text"]: item for item in payload["items"]}
    assert by_surface["bravo"]["duplicate_count"] == 2
    assert by_surface["bravo"]["representative"]["status"] == "verified"
    assert by_surface["bravo"]["representative"]["annotation_id"] == data["target_annotation_ids_in_sequential_order"][2]


def test_label_surface_groups_tie_break_by_document_name_start_and_annotation_id(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Surface Tie Project", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="Disease", color="#AA1122", description="desc", meta={}
    )
    alpha_doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "AlphaDoc", "text": "alpha alpha", "meta": {}},
        headers=auth_headers,
    ).json()
    omega_doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "OmegaDoc", "text": "alpha alpha", "meta": {}},
        headers=auth_headers,
    ).json()

    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-z",
        document_id=omega_doc["id"],
        label_id=label["id"],
        start=0,
        end=5,
        span_text="alpha",
    )
    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-b",
        document_id=alpha_doc["id"],
        label_id=label["id"],
        start=6,
        end=11,
        span_text="alpha",
    )
    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-a",
        document_id=alpha_doc["id"],
        label_id=label["id"],
        start=6,
        end=11,
        span_text="alpha",
    )

    response = client.get(
        f"/projects/{project['id']}/labels/{label['id']}/surface-groups?status=verified",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    representative = payload["items"][0]["representative"]
    assert representative["annotation_id"] == "ann-a"
    assert representative["document_name"] == "AlphaDoc"
    assert representative["start"] == 6


def test_label_surface_groups_ignore_empty_surface_text(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Surface Empty Project", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="Disease", color="#AA3322", description="desc", meta={}
    )
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "DocA", "text": "alpha", "meta": {}},
        headers=auth_headers,
    ).json()

    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-empty",
        document_id=doc["id"],
        label_id=label["id"],
        start=0,
        end=1,
        span_text="",
    )
    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-alpha",
        document_id=doc["id"],
        label_id=label["id"],
        start=0,
        end=5,
        span_text="alpha",
    )

    response = client.get(
        f"/projects/{project['id']}/labels/{label['id']}/surface-groups?status=verified",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert [item["surface_text"] for item in payload["items"]] == ["alpha"]


def test_label_surface_groups_query_plan_uses_label_surface_index(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Surface Plan Project", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="Disease", color="#AA3322", description="desc", meta={}
    )
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "DocA", "text": "alpha", "meta": {}},
        headers=auth_headers,
    ).json()
    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-alpha",
        document_id=doc["id"],
        label_id=label["id"],
        start=0,
        end=5,
        span_text="alpha",
    )
    engine = get_project_engine(str(project_db_path(settings, project["id"])))

    with engine.connect() as conn:
        plan_rows = conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            SELECT count(distinct annotations.span_text)
            FROM annotations
            JOIN documents ON annotations.document_id = documents.id
            WHERE documents.project_id = ?
              AND annotations.label_id = ?
              AND annotations.status IN ('pending', 'verified')
              AND annotations.span_text != ''
            """,
            (project["id"], label["id"]),
        ).mappings().all()

    assert any("idx_annotations_label_surface_groups" in row["detail"] for row in plan_rows)


def test_label_surface_groups_representative_query_plan_uses_label_surface_index(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Surface Representative Plan Project", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="Disease", color="#AA3322", description="desc", meta={}
    )
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "DocA", "text": "alpha", "meta": {}},
        headers=auth_headers,
    ).json()
    _insert_annotation_row(
        settings,
        project["id"],
        annotation_id="ann-alpha",
        document_id=doc["id"],
        label_id=label["id"],
        start=0,
        end=5,
        span_text="alpha",
    )
    engine = get_project_engine(str(project_db_path(settings, project["id"])))

    with engine.connect() as conn:
        plan_rows = conn.exec_driver_sql(
            """
            EXPLAIN QUERY PLAN
            WITH surface_group_candidates AS (
                SELECT
                    annotations.id AS annotation_id,
                    annotations.document_id,
                    documents.document_name,
                    documents.text AS document_text,
                    annotations.span_text AS surface_text,
                    annotations.start,
                    annotations.end,
                    annotations.status,
                    CASE WHEN annotations.status = 'verified' THEN 0 ELSE 1 END AS representative_rank,
                    count(*) OVER (PARTITION BY annotations.span_text) AS duplicate_count,
                    row_number() OVER (
                        PARTITION BY annotations.span_text
                        ORDER BY
                            CASE WHEN annotations.status = 'verified' THEN 0 ELSE 1 END ASC,
                            documents.document_name ASC,
                            annotations.start ASC,
                            annotations.id ASC
                    ) AS surface_rank
                FROM annotations
                JOIN documents ON annotations.document_id = documents.id
                WHERE documents.project_id = ?
                  AND annotations.label_id = ?
                  AND annotations.status IN ('pending', 'verified')
                  AND annotations.span_text != ''
            )
            SELECT surface_text, duplicate_count, annotation_id
            FROM surface_group_candidates
            WHERE surface_rank = 1
            ORDER BY representative_rank ASC, document_name ASC, start ASC, annotation_id ASC
            LIMIT 20 OFFSET 0
            """,
            (project["id"], label["id"]),
        ).mappings().all()

    assert any("idx_annotations_label_surface_groups" in row["detail"] for row in plan_rows)
    assert not any(row["detail"] == "SCAN annotations" for row in plan_rows)


def test_label_surface_groups_do_not_normalize_surface_text(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Surface Group Project", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    label = create_label_via_sync(
        client, auth_headers, project["id"], name="Disease", color="#AA1122", description="desc", meta={}
    )
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc1", "text": "COVID-19 / COVID 19", "meta": {}},
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
            "meta": {},
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
            "meta": {},
        },
        headers=auth_headers,
    )

    response = client.get(
        f"/projects/{project['id']}/labels/{label['id']}/surface-groups?status=all",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert [item["surface_text"] for item in payload["items"]] == ["COVID-19", "COVID 19"]
