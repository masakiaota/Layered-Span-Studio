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
)
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


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
    return get_annotation(settings, project_id, document_id, annotation_id)


def bulk_create_annotations(
    settings: Settings,
    project_id: str,
    document_id: str,
    items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    created_ids: List[str] = []
    with engine.begin() as conn:
        for item in items:
            annotation_id = str(uuid.uuid4())
            conn.execute(
                annotations_table.insert().values(
                    id=annotation_id,
                    document_id=document_id,
                    label_id=item["label_id"],
                    start=item["start"],
                    end=item["end"],
                    span_text=item["span_text"],
                    comment=item["comment"],
                    status=item["status"],
                    meta=encode_meta(item.get("meta")),
                )
            )
            created_ids.append(annotation_id)
    return [get_annotation(settings, project_id, document_id, annotation_id) for annotation_id in created_ids]


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
    return result.rowcount > 0

