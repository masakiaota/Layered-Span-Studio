from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import (
    get_project_engine,
    labels_table,
    project_table,
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


def _project_name(settings: Settings, project_id: str) -> str:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = (
            conn.execute(select(project_table.c.name).where(project_table.c.id == project_id))
            .first()
        )
    return row[0] if row else ""


def list_labels(settings: Settings, project_id: str) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    with engine.connect() as conn:
        rows = conn.execute(select(labels_table).where(labels_table.c.project_id == project_id)).mappings().all()
    return [
        {
            "id": row["id"],
            "project_id": row["project_id"],
            "project_name": project_name,
            "name": row["name"],
            "color": row["color"],
            "description": row["description"],
            "shortcut": row["shortcut"],
            "meta": decode_meta(row["meta"]),
        }
        for row in rows
    ]


def get_label(settings: Settings, project_id: str, label_id: str) -> Optional[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(labels_table).where(
                    labels_table.c.project_id == project_id,
                    labels_table.c.id == label_id,
                )
            )
            .mappings()
            .first()
        )
    if not row:
        return None
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "project_name": project_name,
        "name": row["name"],
        "color": row["color"],
        "description": row["description"],
        "shortcut": row["shortcut"],
        "meta": decode_meta(row["meta"]),
    }


def get_label_by_name(settings: Settings, project_id: str, name: str) -> Optional[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(labels_table).where(
                    labels_table.c.project_id == project_id,
                    labels_table.c.name == name,
                )
            )
            .mappings()
            .first()
        )
    if not row:
        return None
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "project_name": project_name,
        "name": row["name"],
        "color": row["color"],
        "description": row["description"],
        "shortcut": row["shortcut"],
        "meta": decode_meta(row["meta"]),
    }


def create_label(
    settings: Settings,
    project_id: str,
    name: str,
    color: str,
    description: str,
    shortcut: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    label_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            labels_table.insert().values(
                id=label_id,
                project_id=project_id,
                name=name,
                color=color,
                description=description,
                shortcut=shortcut,
                meta=encode_meta(meta),
            )
        )
    return {
        "id": label_id,
        "project_id": project_id,
        "project_name": project_name,
        "name": name,
        "color": color,
        "description": description,
        "shortcut": shortcut,
        "meta": meta or {},
    }


def update_label(
    settings: Settings,
    project_id: str,
    label_id: str,
    name: Optional[str],
    color: Optional[str],
    description: Optional[str],
    shortcut: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    label = get_label(settings, project_id, label_id)
    if not label:
        return None
    new_name = name if name is not None else label["name"]
    new_color = color if color is not None else label["color"]
    new_description = description if description is not None else label["description"]
    new_shortcut = shortcut if shortcut is not None else label.get("shortcut")
    new_meta = meta if meta is not None else label.get("meta")

    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            labels_table.update().where(labels_table.c.id == label_id).values(
                name=new_name,
                color=new_color,
                description=new_description,
                shortcut=new_shortcut,
                meta=encode_meta(new_meta),
            )
        )
    return {
        "id": label_id,
        "project_id": project_id,
        "project_name": label["project_name"],
        "name": new_name,
        "color": new_color,
        "description": new_description,
        "shortcut": new_shortcut,
        "meta": new_meta or {},
    }


def delete_label(settings: Settings, project_id: str, label_id: str) -> bool:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        result = conn.execute(
            labels_table.delete().where(
                labels_table.c.project_id == project_id,
                labels_table.c.id == label_id,
            )
        )
    return result.rowcount > 0
