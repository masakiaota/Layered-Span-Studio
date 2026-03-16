from __future__ import annotations

from fastapi.testclient import TestClient

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import documents_table, get_project_engine
from layered_span_studio_backend.utils.json_utils import encode_meta


def _create_project(client: TestClient, auth_headers: dict[str, str]) -> str:
    response = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    )
    return response.json()["id"]


def _set_document_fields(
    settings: Settings,
    project_id: str,
    document_id: str,
    *,
    status: str = "pending",
    created_at: str = "2026-03-01T00:00:00Z",
    updated_at: str | None = None,
    meta: dict[str, object] | None = None,
) -> None:
    engine = get_project_engine(str(project_db_path(settings, project_id)))
    with engine.begin() as conn:
        conn.execute(
            documents_table.update()
            .where(
                documents_table.c.project_id == project_id,
                documents_table.c.id == document_id,
            )
            .values(
                status=status,
                created_at=created_at,
                updated_at=updated_at or created_at,
                meta=encode_meta(meta),
            )
        )


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


def test_document_list_supports_search_sort_and_pending_total(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project_id = _create_project(client, auth_headers)
    beta = client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Beta",
            "text": "contains target",
        },
        headers=auth_headers,
    ).json()
    alpha = client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Alpha",
            "text": "another TARGET sample",
        },
        headers=auth_headers,
    ).json()
    gamma = client.post(
        f"/projects/{project_id}/documents",
        json={
            "document_name": "Gamma",
            "text": "no match here",
        },
        headers=auth_headers,
    ).json()

    _set_document_fields(settings, project_id, beta["id"], status="verified", created_at="2026-03-09T00:00:00Z")
    _set_document_fields(
        settings,
        project_id,
        alpha["id"],
        status="pending",
        created_at="2026-03-08T00:00:00Z",
        updated_at="2026-03-10T00:00:00Z",
    )
    _set_document_fields(settings, project_id, gamma["id"], status="pending", created_at="2026-03-11T00:00:00Z")

    response = client.get(
        f"/projects/{project_id}/documents?search=target&sort=pending",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["pending_total"] == 1
    assert [item["document_name"] for item in payload["documents"]] == ["Alpha", "Beta"]


def test_document_list_pages_and_sorts_in_sql(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project_id = _create_project(client, auth_headers)

    zeta = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Zeta", "text": "target alpha"},
        headers=auth_headers,
    ).json()
    alpha = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Alpha", "text": "TARGET beta"},
        headers=auth_headers,
    ).json()
    mu = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Mu", "text": "target gamma"},
        headers=auth_headers,
    ).json()
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Omega", "text": "outside search"},
        headers=auth_headers,
    ).json()

    _set_document_fields(settings, project_id, zeta["id"], status="verified", created_at="2026-03-02T00:00:00Z")
    _set_document_fields(
        settings,
        project_id,
        alpha["id"],
        status="pending",
        created_at="2026-03-01T00:00:00Z",
        updated_at="2026-03-03T00:00:00Z",
    )
    _set_document_fields(
        settings,
        project_id,
        mu["id"],
        status="pending",
        created_at="2026-03-11T00:00:00Z",
        updated_at="2026-03-01T00:00:00Z",
        meta={},
    )

    name_sorted = client.get(
        f"/projects/{project_id}/documents?search=target&sort=name&offset=1&limit=1",
        headers=auth_headers,
    )
    assert name_sorted.status_code == 200
    payload = name_sorted.json()
    assert payload["total"] == 3
    assert payload["pending_total"] == 2
    assert payload["offset"] == 1
    assert payload["limit"] == 1
    assert [item["document_name"] for item in payload["documents"]] == ["Mu"]

    created_sorted = client.get(
        f"/projects/{project_id}/documents?search=target&sort=created",
        headers=auth_headers,
    )
    assert created_sorted.status_code == 200
    assert [item["document_name"] for item in created_sorted.json()["documents"]] == ["Alpha", "Zeta", "Mu"]

    updated_sorted = client.get(
        f"/projects/{project_id}/documents?search=target&sort=updated",
        headers=auth_headers,
    )
    assert updated_sorted.status_code == 200
    assert [item["document_name"] for item in updated_sorted.json()["documents"]] == ["Alpha", "Zeta", "Mu"]

    pending_sorted = client.get(
        f"/projects/{project_id}/documents?search=target&sort=pending",
        headers=auth_headers,
    )
    assert pending_sorted.status_code == 200
    assert [item["document_name"] for item in pending_sorted.json()["documents"]] == ["Alpha", "Mu", "Zeta"]


def test_document_list_search_treats_percent_and_underscore_as_literals(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)

    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "PercentMatch", "text": "completion is 100% done"},
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "PercentWildcardCandidate", "text": "completion is 100 percent done"},
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "UnderscoreMatch", "text": "token value_a appears here"},
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "UnderscoreWildcardCandidate", "text": "token valueXa appears here"},
        headers=auth_headers,
    )

    percent_response = client.get(
        f"/projects/{project_id}/documents?search=100%25",
        headers=auth_headers,
    )
    assert percent_response.status_code == 200
    assert [item["document_name"] for item in percent_response.json()["documents"]] == ["PercentMatch"]

    underscore_response = client.get(
        f"/projects/{project_id}/documents?search=value_a",
        headers=auth_headers,
    )
    assert underscore_response.status_code == 200
    assert [item["document_name"] for item in underscore_response.json()["documents"]] == ["UnderscoreMatch"]


def test_document_navigation_resolves_prev_next_and_next_pending(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project_id = _create_project(client, auth_headers)
    alpha = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Alpha", "text": "contains target one"},
        headers=auth_headers,
    ).json()
    mu = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Mu", "text": "contains target two"},
        headers=auth_headers,
    ).json()
    zeta = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Zeta", "text": "contains target three"},
        headers=auth_headers,
    ).json()
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Outside", "text": "no hit"},
        headers=auth_headers,
    ).json()

    _set_document_fields(
        settings,
        project_id,
        alpha["id"],
        status="pending",
        created_at="2026-03-01T00:00:00Z",
    )
    _set_document_fields(
        settings,
        project_id,
        mu["id"],
        status="pending",
        created_at="2026-03-02T00:00:00Z",
    )
    _set_document_fields(
        settings,
        project_id,
        zeta["id"],
        status="pending",
        created_at="2026-03-03T00:00:00Z",
    )

    response = client.get(
        f"/projects/{project_id}/documents/{mu['id']}/navigation?search=target&sort=name",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["current_document_id"] == mu["id"]
    assert payload["prev_document_id"] == alpha["id"]
    assert payload["next_document_id"] == zeta["id"]
    assert payload["next_pending_document_id"] == zeta["id"]
    assert payload["search"] == "target"
    assert payload["sort"] == "name"


def test_document_navigation_does_not_wrap_next_pending_to_previous_documents(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project_id = _create_project(client, auth_headers)
    alpha = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Alpha", "text": "target alpha"},
        headers=auth_headers,
    ).json()
    beta = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Beta", "text": "target beta"},
        headers=auth_headers,
    ).json()

    _set_document_fields(
        settings,
        project_id,
        alpha["id"],
        status="pending",
        created_at="2026-03-01T00:00:00Z",
    )
    _set_document_fields(
        settings,
        project_id,
        beta["id"],
        status="verified",
        created_at="2026-03-02T00:00:00Z",
    )

    response = client.get(
        f"/projects/{project_id}/documents/{beta['id']}/navigation?search=target&sort=created",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["prev_document_id"] == alpha["id"]
    assert payload["next_document_id"] is None
    assert payload["next_pending_document_id"] is None


def test_document_navigation_returns_404_when_current_document_is_not_in_filtered_list(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    current = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Current", "text": "no keyword here"},
        headers=auth_headers,
    ).json()
    client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Matched", "text": "contains target"},
        headers=auth_headers,
    ).json()

    response = client.get(
        f"/projects/{project_id}/documents/{current['id']}/navigation?search=target&sort=created",
        headers=auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found in current filtered documents"


def test_document_create_and_update_reject_duplicate_name(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    first = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    )
    assert first.status_code == 201

    duplicate_create = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Another body"},
        headers=auth_headers,
    )
    assert duplicate_create.status_code == 400

    second = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc2", "text": "Second body"},
        headers=auth_headers,
    )
    assert second.status_code == 201

    duplicate_update = client.patch(
        f"/projects/{project_id}/documents/{second.json()['id']}",
        json={"document_name": "Doc1"},
        headers=auth_headers,
    )
    assert duplicate_update.status_code == 400


def test_document_create_sets_server_managed_fields(client: TestClient, auth_headers: dict[str, str]) -> None:
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
    assert payload["status"] == "pending"
    assert payload["meta"]["note"] == "keep me"
    assert payload["created_at"] != "1999-01-01T00:00:00Z"
    assert payload["updated_at"] == payload["created_at"]
    assert "status" not in payload["meta"]
    assert "created_at" not in payload["meta"]
    assert "updated_at" not in payload["meta"]


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
    assert payload["status"] == "pending"
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
    assert payload["status"] == "verified"
    assert all(annotation["status"] == "verified" for annotation in payload["annotations"])


def test_document_bundle_keeps_empty_pending_document_pending_on_save(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "DocEmptyPending", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={"annotations": [], "submit": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["annotations"] == []
    assert payload["status"] == "pending"


def test_document_bundle_marks_empty_document_verified_on_submit(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "DocEmptySubmit", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={"annotations": [], "submit": True},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["annotations"] == []
    assert payload["status"] == "verified"


def test_document_bundle_keeps_empty_verified_document_verified_on_save(
    client: TestClient, auth_headers: dict[str, str], settings: Settings
) -> None:
    project_id = _create_project(client, auth_headers)
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "DocEmptyVerified", "text": "Hello world"},
        headers=auth_headers,
    ).json()
    _set_document_fields(settings, project_id, document["id"], status="verified")

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={"annotations": [], "submit": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["annotations"] == []
    assert payload["status"] == "verified"


def test_document_bundle_rejects_out_of_bounds_range(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    label = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": None,
                    "label_id": label["id"],
                    "start": 0,
                    "end": 999999,
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
    assert response.json()["detail"] == "Annotation range is out of bounds"


def test_document_bundle_rejects_non_positive_range(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project_id = _create_project(client, auth_headers)
    label = client.post(
        f"/projects/{project_id}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    document = client.post(
        f"/projects/{project_id}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project_id}/documents/{document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": None,
                    "label_id": label["id"],
                    "start": 5,
                    "end": 5,
                    "span_text": "",
                    "comment": "",
                    "status": "pending",
                    "meta": {},
                }
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Annotation range is out of bounds"
