from __future__ import annotations

from fastapi.testclient import TestClient


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
