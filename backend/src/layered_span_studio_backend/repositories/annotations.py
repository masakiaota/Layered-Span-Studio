from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func, select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import (
    annotations_table,
    documents_table,
    get_project_engine,
    labels_table,
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _touch_document_updated_at(conn, document_id: str) -> None:
    conn.execute(
        documents_table.update()
        .where(documents_table.c.id == document_id)
        .values(updated_at=_utc_now_iso())
    )


def _has_overlapping_annotation(
    conn,
    document_id: str,
    label_id: str,
    start: int,
    end: int,
) -> bool:
    row = conn.execute(
        select(annotations_table.c.id).where(
            annotations_table.c.document_id == document_id,
            annotations_table.c.label_id == label_id,
            annotations_table.c.start < end,
            annotations_table.c.end > start,
        )
    ).first()
    return row is not None


def get_annotation(settings: Settings, project_id: str, document_id: str, annotation_id: str) -> Optional[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(
                    annotations_table.c.id,
                    annotations_table.c.document_id,
                    annotations_table.c.label_id,
                    annotations_table.c.start,
                    annotations_table.c.end,
                    annotations_table.c.span_text,
                    annotations_table.c.comment,
                    annotations_table.c.status,
                    annotations_table.c.meta,
                    documents_table.c.document_name,
                    labels_table.c.name.label("label_name"),
                )
                .select_from(
                    annotations_table.join(
                        documents_table, annotations_table.c.document_id == documents_table.c.id
                    ).join(labels_table, annotations_table.c.label_id == labels_table.c.id)
                )
                .where(
                    annotations_table.c.id == annotation_id,
                    annotations_table.c.document_id == document_id,
                    documents_table.c.project_id == project_id,
                )
            )
            .mappings()
            .first()
        )
    if not row:
        return None
    return {
        "id": row["id"],
        "document_id": row["document_id"],
        "document_name": row["document_name"],
        "label_id": row["label_id"],
        "label_name": row["label_name"],
        "start": row["start"],
        "end": row["end"],
        "span_text": row["span_text"],
        "comment": row["comment"],
        "status": row["status"],
        "meta": decode_meta(row["meta"]),
    }


def create_annotation(
    settings: Settings,
    project_id: str,
    document_id: str,
    label_id: str,
    start: int,
    end: int,
    span_text: str,
    comment: str,
    status: str,
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    annotation_id = str(uuid.uuid4())
    with engine.begin() as conn:
        if _has_overlapping_annotation(conn, document_id, label_id, start, end):
            raise ValueError("Overlapping annotation span for the same label is not allowed")
        conn.execute(
            annotations_table.insert().values(
                id=annotation_id,
                document_id=document_id,
                label_id=label_id,
                start=start,
                end=end,
                span_text=span_text,
                comment=comment,
                status=status,
                meta=encode_meta(meta),
            )
        )
        _touch_document_updated_at(conn, document_id)
    return get_annotation(settings, project_id, document_id, annotation_id)


def update_annotation(
    settings: Settings,
    project_id: str,
    document_id: str,
    annotation_id: str,
    comment: Optional[str],
    status: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    annotation = get_annotation(settings, project_id, document_id, annotation_id)
    if not annotation:
        return None
    new_comment = comment if comment is not None else annotation["comment"]
    new_status = status if status is not None else annotation["status"]
    new_meta = meta if meta is not None else annotation.get("meta")

    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            annotations_table.update().where(annotations_table.c.id == annotation_id).values(
                comment=new_comment,
                status=new_status,
                meta=encode_meta(new_meta),
            )
        )
        _touch_document_updated_at(conn, document_id)
    return {
        "id": annotation_id,
        "document_id": document_id,
        "document_name": annotation["document_name"],
        "label_id": annotation["label_id"],
        "label_name": annotation["label_name"],
        "start": annotation["start"],
        "end": annotation["end"],
        "span_text": annotation["span_text"],
        "comment": new_comment,
        "status": new_status,
        "meta": new_meta or {},
    }


def delete_annotation(settings: Settings, project_id: str, document_id: str, annotation_id: str) -> bool:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        result = conn.execute(
            annotations_table.delete().where(
                annotations_table.c.id == annotation_id,
                annotations_table.c.document_id == document_id,
            )
        )
        if result.rowcount > 0:
            _touch_document_updated_at(conn, document_id)
    return result.rowcount > 0


def list_project_annotations_for_export(
    settings: Settings, project_id: str, statuses: List[str]
) -> List[Dict[str, Any]]:
    """Bulk-fetch all annotations for a project in a single query.

    Returns the full set of fields needed for export (including comment and meta),
    filtered to the given statuses, ordered by document_id then start position.
    """
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(
                    annotations_table.c.id,
                    annotations_table.c.document_id,
                    annotations_table.c.label_id,
                    annotations_table.c.start,
                    annotations_table.c.end,
                    annotations_table.c.span_text,
                    annotations_table.c.comment,
                    annotations_table.c.status,
                    annotations_table.c.meta,
                    documents_table.c.document_name,
                    labels_table.c.name.label("label_name"),
                )
                .select_from(
                    annotations_table.join(
                        documents_table, annotations_table.c.document_id == documents_table.c.id
                    ).join(labels_table, annotations_table.c.label_id == labels_table.c.id)
                )
                .where(
                    documents_table.c.project_id == project_id,
                    annotations_table.c.status.in_(statuses),
                )
                .order_by(annotations_table.c.document_id, annotations_table.c.start)
            )
            .mappings()
            .all()
        )
    return [
        {
            "id": row["id"],
            "document_id": row["document_id"],
            "document_name": row["document_name"],
            "label_id": row["label_id"],
            "label_name": row["label_name"],
            "start": row["start"],
            "end": row["end"],
            "span_text": row["span_text"],
            "comment": row["comment"],
            "status": row["status"],
            "meta": decode_meta(row["meta"]),
        }
        for row in rows
    ]


def list_project_annotations(settings: Settings, project_id: str, statuses: List[str]) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(
                    annotations_table.c.id.label("annotation_id"),
                    annotations_table.c.document_id,
                    annotations_table.c.label_id,
                    annotations_table.c.start,
                    annotations_table.c.end,
                    annotations_table.c.span_text,
                    annotations_table.c.status,
                    documents_table.c.document_name,
                    documents_table.c.text.label("document_text"),
                    labels_table.c.name.label("label_name"),
                    labels_table.c.color.label("label_color"),
                )
                .select_from(
                    annotations_table.join(
                        documents_table, annotations_table.c.document_id == documents_table.c.id
                    ).join(labels_table, annotations_table.c.label_id == labels_table.c.id)
                )
                .where(
                    documents_table.c.project_id == project_id,
                    annotations_table.c.status.in_(statuses),
                )
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows]


def search_project_annotations_page(
    settings: Settings,
    project_id: str,
    text: str,
    statuses: List[str],
    label_id: Optional[str],
    exclude_annotation_id: Optional[str],
    offset: int,
    limit: int,
) -> tuple[List[Dict[str, Any]], int]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    join_from = annotations_table.join(
        documents_table, annotations_table.c.document_id == documents_table.c.id
    ).join(labels_table, annotations_table.c.label_id == labels_table.c.id)
    conditions = [
        documents_table.c.project_id == project_id,
        annotations_table.c.status.in_(statuses),
        annotations_table.c.span_text == text,
    ]
    if exclude_annotation_id:
        conditions.append(annotations_table.c.id != exclude_annotation_id)

    order_by = []
    if label_id:
        order_by.append(
            case(
                (annotations_table.c.label_id != label_id, 0),
                else_=1,
            ).asc()
        )
    order_by.extend(
        [
            case((annotations_table.c.status == "verified", 0), else_=1).asc(),
            documents_table.c.document_name.asc(),
            annotations_table.c.start.asc(),
            annotations_table.c.id.asc(),
        ]
    )

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
                    annotations_table.c.label_id,
                    annotations_table.c.start,
                    annotations_table.c.end,
                    annotations_table.c.span_text,
                    annotations_table.c.status,
                    documents_table.c.document_name,
                    documents_table.c.text.label("document_text"),
                    labels_table.c.name.label("label_name"),
                    labels_table.c.color.label("label_color"),
                )
                .select_from(join_from)
                .where(*conditions)
                .order_by(*order_by)
                .offset(offset)
                .limit(limit)
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows], total
