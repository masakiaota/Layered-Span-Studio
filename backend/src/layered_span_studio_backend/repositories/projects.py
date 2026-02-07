from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.storage.project_db import (
    get_project_engine,
    init_project_db,
    project_table,
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


PROJECT_DB_FILENAME = "database.db"


def _project_dir(settings: Settings, project_id: str) -> Path:
    return settings.projects_dir / project_id


def _project_db_path(settings: Settings, project_id: str) -> Path:
    return _project_dir(settings, project_id) / PROJECT_DB_FILENAME


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
        if row:
            projects.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "description": row["description"],
                    "meta": decode_meta(row["meta"]),
                }
            )
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


def delete_project(settings: Settings, project_id: str) -> bool:
    project_dir = _project_dir(settings, project_id)
    if not project_dir.exists():
        return False
    shutil.rmtree(project_dir)
    return True


def project_db_path(settings: Settings, project_id: str) -> Path:
    return _project_db_path(settings, project_id)
