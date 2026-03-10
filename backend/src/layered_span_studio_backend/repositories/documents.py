from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Select, select

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


def _project_name(engine) -> Optional[str]:
    with engine.connect() as conn:
        row = conn.execute(select(project_table.c.name)).first()
    return row[0] if row else None


def list_documents(
    settings: Settings,
    project_id: str,
    offset: int,
    limit: int,
    search: str = "",
    sort: str = "created",
) -> Tuple[List[Dict[str, Any]], int]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(engine)
    with engine.connect() as conn:
        query: Select = select(documents_table).where(documents_table.c.project_id == project_id)
        rows = conn.execute(query).mappings().all()
    documents = [
        {
            "id": row["id"],
            "project_id": row["project_id"],
            "project_name": project_name,
            "document_name": row["document_name"],
            "text": row["text"],
            "meta": decode_meta(row["meta"]),
        }
        for row in rows
    ]
    pending_total = sum(1 for document in documents if (document.get("meta") or {}).get("status") != "verified")

    simple_search = search.strip().lower()
    if simple_search:
        documents = [
            document
            for document in documents
            if simple_search in document["text"].lower()
        ]

    original_index_by_id = {document["id"]: index for index, document in enumerate(documents)}

    def _parse_timestamp(value: Any) -> Optional[float]:
        if not isinstance(value, str):
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None

    def _document_status(document: Dict[str, Any]) -> str:
        status = (document.get("meta") or {}).get("status")
        return "verified" if status == "verified" else "pending"

    def _created_at(document: Dict[str, Any]) -> Optional[float]:
        return _parse_timestamp((document.get("meta") or {}).get("created_at"))

    def _updated_at(document: Dict[str, Any]) -> Optional[float]:
        meta = document.get("meta") or {}
        return _parse_timestamp(meta.get("updated_at")) or _parse_timestamp(meta.get("created_at"))

    if sort == "name":
        documents.sort(key=lambda item: item["document_name"])
    elif sort == "pending":
        documents.sort(
            key=lambda item: (
                0 if _document_status(item) == "pending" else 1,
                item["document_name"],
            )
        )
    elif sort == "updated":
        documents.sort(
            key=lambda item: (
                _updated_at(item) is None,
                -(_updated_at(item) or 0),
                original_index_by_id[item["id"]],
            )
        )
    else:
        documents.sort(
            key=lambda item: (
                _created_at(item) is None,
                _created_at(item) or 0,
                original_index_by_id[item["id"]],
            )
        )

    total = len(documents)
    return documents[offset : offset + limit], total, pending_total


def get_document(settings: Settings, project_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(engine)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(documents_table).where(
                    documents_table.c.project_id == project_id,
                    documents_table.c.id == document_id,
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
        "document_name": row["document_name"],
        "text": row["text"],
        "meta": decode_meta(row["meta"]),
    }


def create_document(
    settings: Settings,
    project_id: str,
    document_name: str,
    text: str,
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    document_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            documents_table.insert().values(
                id=document_id,
                project_id=project_id,
                document_name=document_name,
                text=text,
                meta=encode_meta(meta),
            )
        )
    project_name = _project_name(engine)
    return {
        "id": document_id,
        "project_id": project_id,
        "project_name": project_name,
        "document_name": document_name,
        "text": text,
        "meta": meta or {},
    }


def update_document(
    settings: Settings,
    project_id: str,
    document_id: str,
    document_name: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    document = get_document(settings, project_id, document_id)
    if not document:
        return None
    new_name = document_name if document_name is not None else document["document_name"]
    new_meta = meta if meta is not None else document.get("meta")

    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.execute(
            documents_table.update().where(documents_table.c.id == document_id).values(
                document_name=new_name,
                meta=encode_meta(new_meta),
            )
        )
    return {
        "id": document_id,
        "project_id": project_id,
        "project_name": document["project_name"],
        "document_name": new_name,
        "text": document["text"],
        "meta": new_meta or {},
    }


def delete_document(settings: Settings, project_id: str, document_id: str) -> bool:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        result = conn.execute(
            documents_table.delete().where(
                documents_table.c.project_id == project_id,
                documents_table.c.id == document_id,
            )
        )
    return result.rowcount > 0


def get_document_text(settings: Settings, project_id: str, document_id: str) -> Optional[str]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(documents_table.c.text).where(
                    documents_table.c.project_id == project_id,
                    documents_table.c.id == document_id,
                )
            )
            .first()
        )
    return row[0] if row else None


def list_document_annotations(settings: Settings, project_id: str, document_id: str) -> List[Dict[str, Any]]:
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
                    annotations_table.c.document_id == document_id,
                    documents_table.c.project_id == project_id,
                )
                .order_by(annotations_table.c.start)
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
