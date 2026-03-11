from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import (
    annotations_table,
    documents_table,
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


def save_labels(settings: Settings, project_id: str, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))

    with engine.begin() as conn:
        rows = conn.execute(
            select(labels_table).where(labels_table.c.project_id == project_id)
        ).mappings().all()
        existing_by_id = {
            row["id"]: {
                "id": row["id"],
                "name": row["name"],
                "color": row["color"],
                "description": row["description"],
                "shortcut": row["shortcut"],
                "meta": decode_meta(row["meta"]),
            }
            for row in rows
        }

        requested_ids = {item["id"] for item in items if item.get("id")}
        unknown_ids = requested_ids - set(existing_by_id)
        if unknown_ids:
            raise ValueError("Label not found")

        omitted_ids = set(existing_by_id) - requested_ids
        if omitted_ids:
            conn.execute(
                labels_table.delete().where(
                    labels_table.c.project_id == project_id,
                    labels_table.c.id.in_(sorted(omitted_ids)),
                )
            )

        for item in items:
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

    return list_labels(settings, project_id)


def list_label_examples(
    settings: Settings, project_id: str, label_id: str, statuses: List[str]
) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(
                    annotations_table.c.id.label("annotation_id"),
                    annotations_table.c.document_id,
                    documents_table.c.document_name,
                    documents_table.c.text.label("document_text"),
                    annotations_table.c.span_text,
                    annotations_table.c.start,
                    annotations_table.c.end,
                    annotations_table.c.status,
                )
                .select_from(
                    annotations_table.join(
                        documents_table, annotations_table.c.document_id == documents_table.c.id
                    )
                )
                .where(
                    documents_table.c.project_id == project_id,
                    annotations_table.c.label_id == label_id,
                    annotations_table.c.status.in_(statuses),
                )
                .order_by(
                    documents_table.c.document_name.asc(),
                    annotations_table.c.start.asc(),
                    annotations_table.c.id.asc(),
                )
            )
            .mappings()
            .all()
        )

    return [
        {
            "annotation_id": row["annotation_id"],
            "document_id": row["document_id"],
            "document_name": row["document_name"],
            "document_text": row["document_text"],
            "span_text": row["span_text"],
            "start": row["start"],
            "end": row["end"],
            "status": row["status"],
        }
        for row in rows
    ]
