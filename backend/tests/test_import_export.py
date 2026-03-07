from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient


JSONDict = dict[str, Any]


def _setup_project_with_data(
    client: TestClient,
    auth_headers: dict[str, str],
    name: str,
) -> JSONDict:
    project = client.post(
        "/projects", json={"name": name, "description": "desc"}, headers=auth_headers
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
    return project


def _export_project_payload(
    client: TestClient,
    auth_headers: dict[str, str],
    project_id: str,
) -> JSONDict:
    response = client.post(f"/projects/{project_id}/export", headers=auth_headers)
    assert response.status_code == 200
    return response.json()


def test_import_creates_new_project_from_export(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = _setup_project_with_data(client, auth_headers, "Project A")
    payload = _export_project_payload(client, auth_headers, project["id"])
    payload["project"]["name"] = "Project A Imported"

    response = client.post("/projects/import", json=payload, headers=auth_headers)
    assert response.status_code == 201

    body = response.json()
    created_project = body["project"]
    assert body["imported"] == {"labels": 1, "documents": 1, "annotations": 1}
    assert body["errors"] == []
    assert created_project["id"] != project["id"]
    assert created_project["name"] == "Project A Imported"
    assert created_project["description"] == payload["project"]["description"]
    assert created_project["meta"] == payload["project"]["meta"]

    projects_response = client.get("/projects", headers=auth_headers)
    assert projects_response.status_code == 200
    assert len(projects_response.json()["projects"]) == 2

    labels_response = client.get(
        f"/projects/{created_project['id']}/labels", headers=auth_headers
    )
    documents_response = client.get(
        f"/projects/{created_project['id']}/documents", headers=auth_headers
    )
    assert labels_response.status_code == 200
    assert documents_response.status_code == 200

    created_label = labels_response.json()["labels"][0]
    created_document = documents_response.json()["documents"][0]
    detail_response = client.get(
        f"/projects/{created_project['id']}/documents/{created_document['id']}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200

    assert created_label["id"] != payload["labels"][0]["id"]
    assert created_document["id"] != payload["documents"][0]["id"]
    assert (
        detail_response.json()["annotations"][0]["id"]
        != payload["documents"][0]["annotations"][0]["id"]
    )


def test_import_creates_new_project_with_auto_renamed_name(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = _setup_project_with_data(client, auth_headers, "Project Rename")
    payload = _export_project_payload(client, auth_headers, project["id"])

    first_response = client.post("/projects/import", json=payload, headers=auth_headers)
    second_response = client.post("/projects/import", json=payload, headers=auth_headers)

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["project"]["name"] == "Project Rename (imported)"
    assert second_response.json()["project"]["name"] == "Project Rename (imported 2)"


def test_new_import_rejects_incomplete_label_without_creating_project(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    source_project = _setup_project_with_data(client, auth_headers, "Project Invalid Import")
    payload = _export_project_payload(client, auth_headers, source_project["id"])
    del payload["labels"][0]["description"]

    before_projects = client.get("/projects", headers=auth_headers)
    assert before_projects.status_code == 200

    with TestClient(client.app, raise_server_exceptions=False) as unsafe_client:
        response = unsafe_client.post("/projects/import", json=payload, headers=auth_headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "Label description is required"

    after_projects = client.get("/projects", headers=auth_headers)
    assert after_projects.status_code == 200
    assert len(after_projects.json()["projects"]) == len(before_projects.json()["projects"])


def test_existing_import_rejects_conflicting_label_names(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = _setup_project_with_data(client, auth_headers, "Project A")
    payload = _export_project_payload(client, auth_headers, project["id"])

    conflict_project = client.post(
        "/projects", json={"name": "Project B", "description": "desc"}, headers=auth_headers
    ).json()
    client.post(
        f"/projects/{conflict_project['id']}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    )

    conflict_resp = client.post(
        f"/projects/{conflict_project['id']}/import", json=payload, headers=auth_headers
    )
    assert conflict_resp.status_code == 400


def test_existing_import_appends_without_updating_project_metadata(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = _setup_project_with_data(client, auth_headers, "Project Source")
    payload = _export_project_payload(client, auth_headers, project["id"])
    target_project = client.post(
        "/projects",
        json={
            "name": "Project C",
            "description": "target desc",
            "meta": {"keep": "yes"},
        },
        headers=auth_headers,
    ).json()

    success_payload = copy.deepcopy(payload)
    success_payload["project"]["name"] = "Project A Imported"
    success_payload["project"]["description"] = "changed by import"
    success_payload["project"]["meta"] = {"changed": True}

    success_resp = client.post(
        f"/projects/{target_project['id']}/import", json=success_payload, headers=auth_headers
    )
    assert success_resp.status_code == 200
    assert success_resp.json()["imported"]["labels"] == 1
    assert success_resp.json()["imported"]["documents"] == 1
    assert success_resp.json()["imported"]["annotations"] == 1

    target_detail = client.get(f"/projects/{target_project['id']}", headers=auth_headers)
    assert target_detail.status_code == 200
    assert target_detail.json()["name"] == "Project C"
    assert target_detail.json()["description"] == "target desc"
    assert target_detail.json()["meta"] == {"keep": "yes"}


def test_export_filters_by_status(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects", json={"name": "Project Export Filter", "description": "desc"}, headers=auth_headers
    ).json()
    label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "LabelFilter", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    ).json()
    doc = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "DocFilter", "text": "Hello world"},
        headers=auth_headers,
    ).json()

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
    client.post(
        f"/projects/{project['id']}/documents/{doc['id']}/annotations",
        json={
            "label_id": label["id"],
            "start": 6,
            "end": 11,
            "span_text": "world",
            "comment": "",
            "status": "pending",
        },
        headers=auth_headers,
    )

    verified_only = client.post(
        f"/projects/{project['id']}/export",
        json={"include_pending": False, "include_verified": True},
        headers=auth_headers,
    )
    assert verified_only.status_code == 200
    verified_annotations = verified_only.json()["documents"][0]["annotations"]
    assert len(verified_annotations) == 1
    assert verified_annotations[0]["status"] == "verified"

    pending_only = client.post(
        f"/projects/{project['id']}/export",
        json={"include_pending": True, "include_verified": False},
        headers=auth_headers,
    )
    assert pending_only.status_code == 200
    pending_annotations = pending_only.json()["documents"][0]["annotations"]
    assert len(pending_annotations) == 1
    assert pending_annotations[0]["status"] == "pending"

    none_selected = client.post(
        f"/projects/{project['id']}/export",
        json={"include_pending": False, "include_verified": False},
        headers=auth_headers,
    )
    assert none_selected.status_code == 200
    assert none_selected.json()["documents"][0]["annotations"] == []


def test_import_allows_existing_label_reference(client: TestClient, auth_headers: dict[str, str]) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project D", "description": "desc"}, headers=auth_headers
    ).json()
    existing_label = client.post(
        f"/projects/{target_project['id']}/labels",
        json={"name": "ExistingLabel", "color": "#11AA22", "description": "desc"},
        headers=auth_headers,
    ).json()

    payload = {
        "project": {"name": "Project D", "description": "desc", "meta": {}},
        "labels": [],
        "documents": [
            {
                "document_name": "DocFromImport",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "ExistingLabel",
                        "start": 0,
                        "end": 5,
                        "span_text": "Hello",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    }
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["imported"] == {"labels": 0, "documents": 1, "annotations": 1}

    docs_response = client.get(
        f"/projects/{target_project['id']}/documents", headers=auth_headers
    )
    assert docs_response.status_code == 200
    created_document = docs_response.json()["documents"][0]

    detail_response = client.get(
        f"/projects/{target_project['id']}/documents/{created_document['id']}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["annotations"][0]["label_id"] == existing_label["id"]


@pytest.mark.parametrize(
    ("meta", "expected_detail"),
    [
        (
            {"format": "unexpected/export", "version": "1.0"},
            "Invalid import format",
        ),
        (
            {"format": "layered-span-studio/export", "version": "2.0"},
            "Unsupported import version",
        ),
    ],
)
def test_import_rejects_invalid_export_metadata(
    client: TestClient,
    auth_headers: dict[str, str],
    meta: dict[str, str],
    expected_detail: str,
) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Invalid Meta", "description": "desc"}, headers=auth_headers
    ).json()
    payload = {
        "project": {"name": "Project Invalid Meta", "description": "desc", "meta": {}},
        "labels": [],
        "documents": [],
        "meta": meta,
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == expected_detail

    new_project_response = client.post(
        "/projects/import", json=payload, headers=auth_headers
    )
    assert new_project_response.status_code == 400
    assert new_project_response.json()["detail"] == expected_detail


@pytest.mark.parametrize(("field", "value"), [("start", True), ("start", False), ("end", True), ("end", False)])
def test_import_rejects_boolean_annotation_offsets(
    client: TestClient,
    auth_headers: dict[str, str],
    field: str,
    value: bool,
) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Bool Offset", "description": "desc"}, headers=auth_headers
    ).json()
    payload = {
        "project": {"name": "Project Bool Offset", "description": "desc", "meta": {}},
        "labels": [
            {
                "name": "LabelBool",
                "color": "#AA1122",
                "description": "desc",
                "shortcut": None,
                "meta": {},
            }
        ],
        "documents": [
            {
                "document_name": "DocBool",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "LabelBool",
                        "start": 0,
                        "end": 5,
                        "span_text": "Hello",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    }
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }
    payload["documents"][0]["annotations"][0][field] = value
    expected_detail = f"Annotation {field} must be an integer"

    with TestClient(client.app, raise_server_exceptions=False) as unsafe_client:
        response = unsafe_client.post(
            f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
        )
        assert response.status_code == 400
        assert response.json()["detail"] == expected_detail

        new_project_response = unsafe_client.post(
            "/projects/import", json=payload, headers=auth_headers
        )
        assert new_project_response.status_code == 400
        assert new_project_response.json()["detail"] == expected_detail


def test_import_rejects_unknown_label_reference(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Unknown Label", "description": "desc"}, headers=auth_headers
    ).json()
    payload = {
        "project": {"name": "Project Unknown Label", "description": "desc", "meta": {}},
        "labels": [],
        "documents": [
            {
                "document_name": "DocUnknownLabel",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "MissingLabel",
                        "start": 0,
                        "end": 5,
                        "span_text": "Hello",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    }
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Annotation refers to unknown label_name"


def test_import_rejects_mismatched_span_text(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Span Mismatch", "description": "desc"}, headers=auth_headers
    ).json()
    payload = {
        "project": {"name": "Project Span Mismatch", "description": "desc", "meta": {}},
        "labels": [
            {
                "name": "LabelMismatch",
                "color": "#AA1122",
                "description": "desc",
                "shortcut": None,
                "meta": {},
            }
        ],
        "documents": [
            {
                "document_name": "DocMismatch",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "LabelMismatch",
                        "start": 0,
                        "end": 5,
                        "span_text": "World",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    }
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "span_text does not match the specified range"


def test_import_rejects_same_label_overlap(client: TestClient, auth_headers: dict[str, str]) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Overlap Reject", "description": "desc"}, headers=auth_headers
    ).json()

    payload = {
        "project": {"name": "Project Overlap Reject", "description": "desc", "meta": {}},
        "labels": [
            {
                "name": "LabelOverlap",
                "color": "#AA1122",
                "description": "desc",
                "shortcut": None,
                "meta": {},
            }
        ],
        "documents": [
            {
                "document_name": "DocOverlapReject",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "LabelOverlap",
                        "start": 0,
                        "end": 5,
                        "span_text": "Hello",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    },
                    {
                        "label_name": "LabelOverlap",
                        "start": 3,
                        "end": 8,
                        "span_text": "lo wo",
                        "comment": "",
                        "status": "pending",
                        "meta": {},
                    },
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 400


def test_import_allows_different_label_overlap(client: TestClient, auth_headers: dict[str, str]) -> None:
    target_project = client.post(
        "/projects", json={"name": "Project Overlap Allow", "description": "desc"}, headers=auth_headers
    ).json()

    payload = {
        "project": {"name": "Project Overlap Allow", "description": "desc", "meta": {}},
        "labels": [
            {
                "name": "LabelA",
                "color": "#AA1122",
                "description": "desc",
                "shortcut": None,
                "meta": {},
            },
            {
                "name": "LabelB",
                "color": "#22AA11",
                "description": "desc",
                "shortcut": None,
                "meta": {},
            },
        ],
        "documents": [
            {
                "document_name": "DocOverlapAllow",
                "text": "Hello world",
                "annotations": [
                    {
                        "label_name": "LabelA",
                        "start": 0,
                        "end": 5,
                        "span_text": "Hello",
                        "comment": "",
                        "status": "verified",
                        "meta": {},
                    },
                    {
                        "label_name": "LabelB",
                        "start": 3,
                        "end": 8,
                        "span_text": "lo wo",
                        "comment": "",
                        "status": "pending",
                        "meta": {},
                    },
                ],
                "meta": {},
            }
        ],
        "meta": {"format": "layered-span-studio/export", "version": "1.0"},
    }

    response = client.post(
        f"/projects/{target_project['id']}/import", json=payload, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["imported"] == {"labels": 2, "documents": 1, "annotations": 2}
