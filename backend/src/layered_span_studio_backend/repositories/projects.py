from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.storage.project_db import documents_table, get_project_engine, init_project_db, labels_table, project_table
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
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc).timestamp()


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
            documents_count = conn.execute(select(func.count()).select_from(documents_table)).scalar_one()
            pending_documents_count = conn.execute(
                select(func.count()).select_from(documents_table).where(documents_table.c.status != "verified")
            ).scalar_one()
            updated_at = conn.execute(select(func.max(documents_table.c.updated_at))).scalar_one()

        projects.append(
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "meta": decode_meta(row["meta"]),
                "summary": {
                    "labels_count": labels_count,
                    "documents_count": documents_count,
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


def replace_project_and_labels(
    settings: Settings,
    project_id: str,
    name: str,
    description: str,
    meta: Dict[str, Any],
    labels: List[Dict[str, Any]],
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

        rows = conn.execute(select(labels_table).where(labels_table.c.project_id == project_id)).mappings().all()
        existing_ids = {row["id"] for row in rows}
        requested_ids = {item["id"] for item in labels if item.get("id")}
        unknown_ids = requested_ids - existing_ids
        if unknown_ids:
            raise ValueError("Label not found")

        omitted_ids = existing_ids - requested_ids
        if omitted_ids:
            conn.execute(
                labels_table.delete().where(
                    labels_table.c.project_id == project_id,
                    labels_table.c.id.in_(sorted(omitted_ids)),
                )
            )

        for item in labels:
            label_id = item.get("id")
            if label_id:
                conn.execute(
                    labels_table.update()
                    .where(
                        labels_table.c.project_id == project_id,
                        labels_table.c.id == label_id,
                    )
                    .values(
                        name=item["name"],
                        color=item["color"],
                        description=item["description"],
                        shortcut=item.get("shortcut"),
                        meta=encode_meta(item.get("meta")),
                    )
                )
                continue

            conn.execute(
                labels_table.insert().values(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    name=item["name"],
                    color=item["color"],
                    description=item["description"],
                    shortcut=item.get("shortcut"),
                    meta=encode_meta(item.get("meta")),
                )
            )

        updated_rows = (
            conn.execute(
                select(labels_table)
                .where(labels_table.c.project_id == project_id)
                .order_by(labels_table.c.name.asc(), labels_table.c.id.asc())
            )
            .mappings()
            .all()
        )

    return {
        "project": {"id": project_id, "name": name, "description": description, "meta": meta},
        "labels": [
            {
                "id": row["id"],
                "project_id": row["project_id"],
                "project_name": name,
                "name": row["name"],
                "color": row["color"],
                "description": row["description"],
                "shortcut": row["shortcut"],
                "meta": decode_meta(row["meta"]),
            }
            for row in updated_rows
        ],
    }


def delete_project(settings: Settings, project_id: str) -> bool:
    project_dir = _project_dir(settings, project_id)
    if not project_dir.exists():
        return False
    shutil.rmtree(project_dir)
    return True


def project_db_path(settings: Settings, project_id: str) -> Path:
    return _project_db_path(settings, project_id)
