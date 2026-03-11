from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.storage.project_db import (
    documents_table,
    get_project_engine,
    init_project_db,
    labels_table,
    project_table,
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


PROJECT_DB_FILENAME = "database.db"


def _project_dir(settings: Settings, project_id: str) -> Path:
    return settings.projects_dir / project_id


def _project_db_path(settings: Settings, project_id: str) -> Path:
    return _project_dir(settings, project_id) / PROJECT_DB_FILENAME


def _parse_timestamp(value: Any) -> Optional[float]:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _project_sort_key(project: Dict[str, Any]) -> tuple[Any, ...]:
    summary = project["summary"]
    updated_at_timestamp = _parse_timestamp(summary["updated_at"])
    return (
        -summary["pending_documents_count"],
        updated_at_timestamp is None,
        -(updated_at_timestamp or 0),
        project["name"],
    )


def list_projects(settings: Settings) -> List[Dict[str, Any]]:
    projects: List[Dict[str, Any]] = []
    if not settings.projects_dir.exists():
        return projects
    for entry in settings.projects_dir.iterdir():
        if not entry.is_dir():
            continue
        db_path = entry / PROJECT_DB_FILENAME
        if not db_path.exists():
            continue
        engine = get_project_engine(str(db_path))
        with engine.connect() as conn:
            row = conn.execute(select(project_table)).mappings().first()
            if not row:
                continue

            labels_count = conn.execute(select(func.count()).select_from(labels_table)).scalar_one()
            document_rows = conn.execute(select(documents_table.c.meta)).mappings().all()

        pending_documents_count = 0
        updated_at: Optional[str] = None
        updated_at_timestamp: Optional[float] = None
        for document_row in document_rows:
            meta = decode_meta(document_row["meta"])
            if meta.get("status") != "verified":
                pending_documents_count += 1
            candidate = meta.get("updated_at") or meta.get("created_at")
            candidate_timestamp = _parse_timestamp(candidate)
            if candidate_timestamp is None:
                continue
            if updated_at_timestamp is None or candidate_timestamp > updated_at_timestamp:
                updated_at_timestamp = candidate_timestamp
                updated_at = candidate

        projects.append(
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "meta": decode_meta(row["meta"]),
                "summary": {
                    "labels_count": labels_count,
                    "documents_count": len(document_rows),
                    "pending_documents_count": pending_documents_count,
                    "updated_at": updated_at,
                },
            }
        )
    projects.sort(key=_project_sort_key)
    return projects


def get_project(settings: Settings, project_id: str) -> Optional[Dict[str, Any]]:
    db_path = _project_db_path(settings, project_id)
    if not db_path.exists():
        return None
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = conn.execute(select(project_table)).mappings().first()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "meta": decode_meta(row["meta"]),
    }


def create_project(settings: Settings, name: str, description: Optional[str], meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    existing_names = {project["name"] for project in list_projects(settings)}
    if name in existing_names:
        raise ValueError("Project name already exists")
    project_id = str(uuid.uuid4())
    db_path = _project_db_path(settings, project_id)
    init_project_db(db_path)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            project_table.insert().values(
                id=project_id,
                name=name,
                description=description,
                meta=encode_meta(meta),
            )
        )
    return {"id": project_id, "name": name, "description": description, "meta": meta or {}}


def update_project(
    settings: Settings,
    project_id: str,
    name: Optional[str],
    description: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    project = get_project(settings, project_id)
    if not project:
        return None
    if name is not None and name != project["name"]:
        existing_names = {p["name"] for p in list_projects(settings) if p["id"] != project_id}
        if name in existing_names:
            raise ValueError("Project name already exists")
    new_name = name if name is not None else project["name"]
    new_description = description if description is not None else project.get("description")
    new_meta = meta if meta is not None else project.get("meta")

    db_path = _project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            project_table.update().where(project_table.c.id == project_id).values(
                name=new_name,
                description=new_description,
                meta=encode_meta(new_meta),
            )
        )
    return {"id": project_id, "name": new_name, "description": new_description, "meta": new_meta or {}}


def replace_project(
    settings: Settings,
    project_id: str,
    name: str,
    description: str,
    meta: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    project = get_project(settings, project_id)
    if not project:
        return None
    if name != project["name"]:
        existing_names = {p["name"] for p in list_projects(settings) if p["id"] != project_id}
        if name in existing_names:
            raise ValueError("Project name already exists")

    db_path = _project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            project_table.update().where(project_table.c.id == project_id).values(
                name=name,
                description=description,
                meta=encode_meta(meta),
            )
        )
    return {"id": project_id, "name": name, "description": description, "meta": meta}


def delete_project(settings: Settings, project_id: str) -> bool:
    project_dir = _project_dir(settings, project_id)
    if not project_dir.exists():
        return False
    shutil.rmtree(project_dir)
    return True


def project_db_path(settings: Settings, project_id: str) -> Path:
    return _project_db_path(settings, project_id)
