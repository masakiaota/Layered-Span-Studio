from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func, select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.label_sync import (
    load_label_rows,
    next_label_display_order,
    sync_labels,
)
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import (
    annotations_table,
    documents_table,
    get_project_engine,
    labels_table,
    project_table,
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


def _serialize_label_row(row: Dict[str, Any] | Any, project_name: str) -> Dict[str, Any]:
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


def _labels_revision_from_rows(rows: List[Dict[str, Any]] | Any) -> str:
    payload = [
        {
            "id": row["id"],
            "project_id": row["project_id"],
            "name": row["name"],
            "color": row["color"],
            "description": row["description"],
            "shortcut": row["shortcut"],
            "meta": decode_meta(row["meta"]),
            "display_order": row["display_order"],
        }
        for row in rows
    ]
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


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
    return list_labels_state(settings, project_id)["labels"]


def list_labels_state(settings: Settings, project_id: str) -> Dict[str, Any]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    with engine.begin() as conn:
        rows = load_label_rows(conn, project_id)
    rows_list = list(rows)
    return {
        "labels": [_serialize_label_row(row, project_name) for row in rows_list],
        "revision": _labels_revision_from_rows(rows_list),
    }


def get_label(settings: Settings, project_id: str, label_id: str) -> Optional[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)
    with engine.begin() as conn:
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
    with engine.begin() as conn:
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
        display_order = next_label_display_order(conn, project_id)
        conn.execute(
            labels_table.insert().values(
                id=label_id,
                project_id=project_id,
                name=name,
                color=color,
                description=description,
                shortcut=shortcut,
                meta=encode_meta(meta),
                display_order=display_order,
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


def save_labels(
    settings: Settings,
    project_id: str,
    items: List[Dict[str, Any]],
    base_revision: str,
) -> List[Dict[str, Any]]:
    return save_labels_state(settings, project_id, items, base_revision)["labels"]


def save_labels_state(
    settings: Settings,
    project_id: str,
    items: List[Dict[str, Any]],
    base_revision: str,
) -> Dict[str, Any]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(settings, project_id)

    with engine.connect() as conn:
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            current_rows = list(load_label_rows(conn, project_id))
            current_revision = _labels_revision_from_rows(current_rows)
            if base_revision != current_revision:
                raise ValueError("Label revision mismatch")
            sync_labels(conn, project_id, items, existing_rows=current_rows)
            next_rows = list(load_label_rows(conn, project_id))
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "labels": [_serialize_label_row(row, project_name) for row in next_rows],
        "revision": _labels_revision_from_rows(next_rows),
    }


def list_label_examples(
    settings: Settings, project_id: str, annotation_ids: List[str]
) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    if not annotation_ids:
        return []

    order_map = {annotation_id: index for index, annotation_id in enumerate(annotation_ids)}
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
                    annotations_table.c.id.in_(annotation_ids),
                )
            )
            .mappings()
            .all()
        )

    items = [
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
    items.sort(key=lambda row: order_map[row["annotation_id"]])
    return items


def list_label_example_ids(
    settings: Settings, project_id: str, label_id: str, statuses: List[str]
) -> List[str]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(annotations_table.c.id.label("annotation_id"))
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
    return [row["annotation_id"] for row in rows]


def list_label_examples_page(
    settings: Settings,
    project_id: str,
    label_id: str,
    statuses: List[str],
    offset: int,
    limit: int,
) -> tuple[List[Dict[str, Any]], int]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    join_from = annotations_table.join(
        documents_table, annotations_table.c.document_id == documents_table.c.id
    )
    conditions = [
        documents_table.c.project_id == project_id,
        annotations_table.c.label_id == label_id,
        annotations_table.c.status.in_(statuses),
    ]
    with engine.connect() as conn:
        total = conn.execute(
            select(func.count())
            .select_from(join_from)
            .where(*conditions)
        ).scalar_one()
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
                .select_from(join_from)
                .where(*conditions)
                .order_by(
                    documents_table.c.document_name.asc(),
                    annotations_table.c.start.asc(),
                    annotations_table.c.id.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows], total


def list_label_surface_groups_page(
    settings: Settings,
    project_id: str,
    label_id: str,
    statuses: List[str],
    exclude_annotation_id: Optional[str],
    offset: int,
    limit: int,
) -> tuple[List[Dict[str, Any]], int]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    join_from = annotations_table.join(
        documents_table, annotations_table.c.document_id == documents_table.c.id
    )
    conditions = [
        documents_table.c.project_id == project_id,
        annotations_table.c.label_id == label_id,
        annotations_table.c.status.in_(statuses),
        annotations_table.c.span_text != "",
    ]
    if exclude_annotation_id:
        conditions.append(annotations_table.c.id != exclude_annotation_id)

    representative_rank = case((annotations_table.c.status == "verified", 0), else_=1)
    candidates = (
        select(
            annotations_table.c.id.label("annotation_id"),
            annotations_table.c.document_id,
            documents_table.c.document_name,
            documents_table.c.text.label("document_text"),
            annotations_table.c.span_text.label("surface_text"),
            annotations_table.c.start,
            annotations_table.c.end,
            annotations_table.c.status,
            representative_rank.label("representative_rank"),
            func.count().over(partition_by=annotations_table.c.span_text).label("duplicate_count"),
            func.row_number()
            .over(
                partition_by=annotations_table.c.span_text,
                order_by=(
                    representative_rank.asc(),
                    documents_table.c.document_name.asc(),
                    annotations_table.c.start.asc(),
                    annotations_table.c.id.asc(),
                ),
            )
            .label("surface_rank"),
        )
        .select_from(join_from)
        .where(*conditions)
        .cte("surface_group_candidates")
    )

    # Keep grouping, representative selection, and paging in SQL so the service
    # only needs to build response context for the selected representative rows.
    with engine.connect() as conn:
        total = conn.execute(
            select(func.count(func.distinct(annotations_table.c.span_text)))
            .select_from(join_from)
            .where(*conditions)
        ).scalar_one()
        rows = (
            conn.execute(
                select(
                    candidates.c.surface_text,
                    candidates.c.duplicate_count,
                    candidates.c.annotation_id,
                    candidates.c.document_id,
                    candidates.c.document_name,
                    candidates.c.document_text,
                    candidates.c.start,
                    candidates.c.end,
                    candidates.c.status,
                )
                .where(candidates.c.surface_rank == 1)
                .order_by(
                    candidates.c.representative_rank.asc(),
                    candidates.c.document_name.asc(),
                    candidates.c.start.asc(),
                    candidates.c.annotation_id.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows], total
