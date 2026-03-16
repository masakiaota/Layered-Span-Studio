from __future__ import annotations

from typing import Any, Dict, List, Optional

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import projects as projects_repo


def list_projects(settings: Settings) -> List[Dict[str, Any]]:
    return projects_repo.list_projects(settings)


def get_project(settings: Settings, project_id: str) -> Optional[Dict[str, Any]]:
    return projects_repo.get_project(settings, project_id)


def create_project(
    settings: Settings,
    name: str,
    description: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return projects_repo.create_project(settings, name, description, meta)


def update_project(
    settings: Settings,
    project_id: str,
    name: Optional[str],
    description: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    return projects_repo.update_project(settings, project_id, name, description, meta)


def replace_project_settings(
    settings: Settings,
    project_id: str,
    name: str,
    description: str,
    meta: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    return projects_repo.replace_project(settings, project_id, name, description, meta)


def replace_project_settings_atomic(
    settings: Settings,
    project_id: str,
    name: str,
    description: str,
    meta: Dict[str, Any],
    labels: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for item in labels:
        label_id = item.get("id")
        if label_id:
            if label_id in seen_ids:
                raise ValueError("Duplicate label id in payload")
            seen_ids.add(label_id)
        label_name = item["name"]
        if label_name in seen_names:
            raise ValueError("Duplicate label name in payload")
        seen_names.add(label_name)

    return projects_repo.replace_project_and_labels(
        settings,
        project_id,
        name,
        description,
        meta,
        labels,
    )


def delete_project(settings: Settings, project_id: str) -> bool:
    return projects_repo.delete_project(settings, project_id)
