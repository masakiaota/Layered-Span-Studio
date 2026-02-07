from __future__ import annotations

import copy
from typing import Any

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


def test_export_import_flow(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = _setup_project_with_data(client, auth_headers, "Project A")

    export_resp = client.post(f"/projects/{project['id']}/export", headers=auth_headers)
    assert export_resp.status_code == 200
    payload = export_resp.json()

    # conflict case
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

    # success case
    target_project = client.post(
        "/projects", json={"name": "Project C", "description": "desc"}, headers=auth_headers
    ).json()

    success_payload = copy.deepcopy(payload)
    success_payload["project"]["name"] = "Project A Imported"

    success_resp = client.post(
        f"/projects/{target_project['id']}/import", json=success_payload, headers=auth_headers
    )
    assert success_resp.status_code == 200
    assert success_resp.json()["imported"]["labels"] == 1
    assert success_resp.json()["imported"]["documents"] == 1
    assert success_resp.json()["imported"]["annotations"] == 1


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
