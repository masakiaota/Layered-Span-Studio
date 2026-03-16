from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient

from layered_span_studio_backend.repositories.projects import _parse_timestamp


def test_project_crud(client: TestClient, auth_headers: dict[str, str]) -> None:
    # create
    response = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    project = response.json()
    project_id = project["id"]

    # list
    response = client.get("/projects", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()["projects"]) == 1
    assert response.json()["projects"][0]["summary"] == {
        "labels_count": 0,
        "documents_count": 0,
        "pending_documents_count": 0,
        "updated_at": None,
    }

    # get
    response = client.get(f"/projects/{project_id}", headers=auth_headers)
    assert response.status_code == 200

    # update
    response = client.patch(
        f"/projects/{project_id}",
        json={"name": "Project A2"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Project A2"

    # delete
    response = client.delete(f"/projects/{project_id}", headers=auth_headers)
    assert response.status_code == 204

    # get after delete
    response = client.get(f"/projects/{project_id}", headers=auth_headers)
    assert response.status_code == 404


def test_project_settings_put_overwrites_full_form(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {"guideline": "old"}},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project['id']}/settings",
        json={
            "name": "Project A2",
            "description": "updated",
            "meta": {"guideline": "new"},
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Project A2"
    assert payload["description"] == "updated"
    assert payload["meta"] == {"guideline": "new"}


def test_project_settings_put_requires_full_form(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {"guideline": "old"}},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project['id']}/settings",
        json={"name": "Project A2"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_project_settings_atomic_put_saves_project_and_labels(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {"guideline": "old"}},
        headers=auth_headers,
    ).json()
    first_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc", "shortcut": "a", "meta": {}},
        headers=auth_headers,
    ).json()
    second_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc", "shortcut": "b", "meta": {}},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project['id']}/settings/atomic",
        json={
            "name": "Project Renamed",
            "description": "updated",
            "meta": {"guideline": "new"},
            "labels": [
                {
                    "id": first_label["id"],
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
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["project"] == {
        "id": project["id"],
        "name": "Project Renamed",
        "description": "updated",
        "meta": {"guideline": "new"},
    }
    assert {label["name"] for label in payload["labels"]} == {"Label1Updated", "Label3"}
    assert all(label["project_name"] == "Project Renamed" for label in payload["labels"])
    assert all(label["id"] != second_label["id"] for label in payload["labels"])


def test_project_settings_atomic_put_rolls_back_project_on_label_error(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {"guideline": "old"}},
        headers=auth_headers,
    ).json()
    label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc", "shortcut": "a", "meta": {}},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project['id']}/settings/atomic",
        json={
            "name": "Project Renamed",
            "description": "updated",
            "meta": {"guideline": "new"},
            "labels": [
                {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "name": "Ghost",
                    "color": "#1133AA",
                    "description": "new",
                    "shortcut": None,
                    "meta": {},
                }
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 404

    project_response = client.get(f"/projects/{project['id']}", headers=auth_headers)
    assert project_response.status_code == 200
    assert project_response.json()["name"] == "Project A"
    assert project_response.json()["description"] == "desc"
    assert project_response.json()["meta"] == {"guideline": "old"}

    labels_response = client.get(f"/projects/{project['id']}/labels", headers=auth_headers)
    assert labels_response.status_code == 200
    assert labels_response.json()["labels"] == [label]


def test_project_settings_atomic_put_uses_same_label_order_as_labels_api(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {"guideline": "old"}},
        headers=auth_headers,
    ).json()
    first_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Zulu", "color": "#FF5733", "description": "desc", "shortcut": "a", "meta": {}},
        headers=auth_headers,
    ).json()
    second_label = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Alpha", "color": "#33AA44", "description": "desc", "shortcut": "b", "meta": {}},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/projects/{project['id']}/settings/atomic",
        json={
            "name": "Project A",
            "description": "desc",
            "meta": {"guideline": "old"},
            "labels": [
                {
                    "id": first_label["id"],
                    "name": first_label["name"],
                    "color": first_label["color"],
                    "description": first_label["description"],
                    "shortcut": first_label["shortcut"],
                    "meta": first_label["meta"],
                },
                {
                    "id": second_label["id"],
                    "name": second_label["name"],
                    "color": second_label["color"],
                    "description": second_label["description"],
                    "shortcut": second_label["shortcut"],
                    "meta": second_label["meta"],
                },
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200

    labels_response = client.get(f"/projects/{project['id']}/labels", headers=auth_headers)
    assert labels_response.status_code == 200
    assert [label["id"] for label in response.json()["labels"]] == [
        label["id"] for label in labels_response.json()["labels"]
    ]


def test_project_settings_atomic_put_missing_project_returns_404_before_label_validation(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = client.put(
        "/projects/does-not-exist/settings/atomic",
        json={
            "name": "Project A",
            "description": "desc",
            "meta": {"guideline": "old"},
            "labels": [
                {
                    "id": None,
                    "name": "Duplicate",
                    "color": "#FF5733",
                    "description": "desc",
                    "shortcut": None,
                    "meta": {},
                },
                {
                    "id": None,
                    "name": "Duplicate",
                    "color": "#33AA44",
                    "description": "desc2",
                    "shortcut": None,
                    "meta": {},
                },
            ],
        },
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_projects_list_returns_summary_counts_and_updated_at(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label1", "color": "#FF5733", "description": "desc"},
        headers=auth_headers,
    )
    label2 = client.post(
        f"/projects/{project['id']}/labels",
        json={"name": "Label2", "color": "#33AA44", "description": "desc"},
        headers=auth_headers,
    ).json()

    verified_document = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc1", "text": "Hello world"},
        headers=auth_headers,
    ).json()
    pending_document = client.post(
        f"/projects/{project['id']}/documents",
        json={"document_name": "Doc2", "text": "Good bye"},
        headers=auth_headers,
    ).json()

    verified_annotation = client.post(
        f"/projects/{project['id']}/documents/{verified_document['id']}/annotations",
        json={
            "label_id": label2["id"],
            "start": 0,
            "end": 5,
            "span_text": "Hello",
            "comment": "",
            "status": "pending",
            "meta": {},
        },
        headers=auth_headers,
    ).json()

    client.put(
        f"/projects/{project['id']}/documents/{verified_document['id']}/bundle",
        json={
            "annotations": [
                {
                    "id": verified_annotation["id"],
                    "label_id": label2["id"],
                    "start": 0,
                    "end": 5,
                    "span_text": "Hello",
                    "comment": "done",
                    "status": "verified",
                    "meta": {},
                }
            ]
        },
        headers=auth_headers,
    )

    response = client.get("/projects", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()["projects"][0]
    assert payload["id"] == project["id"]
    assert payload["summary"]["labels_count"] == 2
    assert payload["summary"]["documents_count"] == 2
    assert payload["summary"]["pending_documents_count"] == 1
    assert isinstance(payload["summary"]["updated_at"], str)


def test_projects_list_summary_is_not_limited_to_first_100_documents(client: TestClient, auth_headers: dict[str, str]) -> None:
    project = client.post(
        "/projects",
        json={"name": "Project A", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    for index in range(101):
        client.post(
            f"/projects/{project['id']}/documents",
            json={"document_name": f"Doc{index}", "text": f"Text {index}"},
            headers=auth_headers,
        )

    response = client.get("/projects", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()["projects"][0]
    assert payload["summary"]["documents_count"] == 101
    assert payload["summary"]["pending_documents_count"] == 101


def test_projects_list_is_sorted_by_pending_then_updated_then_name(client: TestClient, auth_headers: dict[str, str]) -> None:
    project_alpha = client.post(
        "/projects",
        json={"name": "Alpha", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    project_beta = client.post(
        "/projects",
        json={"name": "Beta", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()
    project_gamma = client.post(
        "/projects",
        json={"name": "Gamma", "description": "desc", "meta": {}},
        headers=auth_headers,
    ).json()

    client.post(
        f"/projects/{project_alpha['id']}/documents",
        json={"document_name": "DocA", "text": "Alpha text"},
        headers=auth_headers,
    )
    client.post(
        f"/projects/{project_beta['id']}/documents",
        json={"document_name": "DocB", "text": "Beta text"},
        headers=auth_headers,
    )

    response = client.get("/projects", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()["projects"]
    assert [item["name"] for item in payload] == ["Beta", "Alpha", "Gamma"]
    assert datetime.fromisoformat(payload[0]["summary"]["updated_at"].replace("Z", "+00:00")) >= datetime.fromisoformat(
        payload[1]["summary"]["updated_at"].replace("Z", "+00:00")
    )


def test_project_timestamp_parser_rejects_naive_datetime() -> None:
    assert _parse_timestamp("2026-03-01T00:00:00") is None
    assert _parse_timestamp("2026-03-01T00:00:00Z") is not None
