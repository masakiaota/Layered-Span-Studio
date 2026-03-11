from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Select, case, func, or_, select

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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _document_status_expr():
    return func.json_extract(documents_table.c.meta, "$.status")


def _document_created_at_expr():
    return func.json_extract(documents_table.c.meta, "$.created_at")


def _document_updated_at_expr():
    return func.coalesce(
        func.json_extract(documents_table.c.meta, "$.updated_at"),
        func.json_extract(documents_table.c.meta, "$.created_at"),
    )


def _document_filter_conditions(project_id: str, search: str = "") -> List[Any]:
    conditions: List[Any] = [documents_table.c.project_id == project_id]
    normalized_search = search.strip().lower()
    if normalized_search:
        conditions.append(func.lower(documents_table.c.text).contains(normalized_search))
    return conditions


def _document_sort_order(sort: str) -> List[Any]:
    if sort == "name":
        return [documents_table.c.document_name.asc(), documents_table.c.id.asc()]

    if sort == "pending":
        status_expr = _document_status_expr()
        return [
            case((status_expr == "verified", 1), else_=0).asc(),
            documents_table.c.document_name.asc(),
            documents_table.c.id.asc(),
        ]

    if sort == "updated":
        updated_at_expr = _document_updated_at_expr()
        return [
            case((updated_at_expr.is_(None), 1), else_=0).asc(),
            updated_at_expr.desc(),
            documents_table.c.document_name.asc(),
            documents_table.c.id.asc(),
        ]

    created_at_expr = _document_created_at_expr()
    return [
        case((created_at_expr.is_(None), 1), else_=0).asc(),
        created_at_expr.asc(),
        documents_table.c.document_name.asc(),
        documents_table.c.id.asc(),
    ]


def _documents_select(project_id: str, search: str = "", sort: str = "created") -> Select:
    return (
        select(documents_table)
        .where(*_document_filter_conditions(project_id, search))
        .order_by(*_document_sort_order(sort))
    )


def _document_from_row(project_name: Optional[str], row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "project_name": project_name,
        "document_name": row["document_name"],
        "text": row["text"],
        "meta": decode_meta(row["meta"]),
    }


def _document_meta_with_system_fields(
    incoming_meta: Optional[Dict[str, Any]],
    existing_meta: Optional[Dict[str, Any]] = None,
    *,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    now = _utc_now_iso()
    user_meta = {
        key: value
        for key, value in (existing_meta or {}).items()
        if key not in {"created_at", "updated_at", "status"}
    }
    user_meta.update(
        {
            key: value
            for key, value in (incoming_meta or {}).items()
            if key not in {"created_at", "updated_at", "status"}
        }
    )
    created_at = None
    if isinstance(existing_meta, dict):
        existing_created_at = existing_meta.get("created_at")
        if isinstance(existing_created_at, str) and existing_created_at:
            created_at = existing_created_at
    if not created_at:
        created_at = now
    next_status = status
    if next_status is None:
        existing_status = (existing_meta or {}).get("status")
        next_status = existing_status if existing_status == "verified" else "pending"
    return {
        **user_meta,
        "created_at": created_at,
        "updated_at": now,
        "status": next_status,
    }


def list_documents_page(
    settings: Settings,
    project_id: str,
    offset: int,
    limit: int,
    search: str = "",
    sort: str = "created",
) -> Tuple[List[Dict[str, Any]], int, int]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(engine)
    status_expr = _document_status_expr()
    conditions = _document_filter_conditions(project_id, search)
    with engine.connect() as conn:
        rows = (
            conn.execute(_documents_select(project_id, search, sort).offset(offset).limit(limit))
            .mappings()
            .all()
        )
        total = conn.execute(
            select(func.count()).select_from(documents_table).where(*conditions)
        ).scalar_one()
        pending_total = conn.execute(
            select(func.count())
            .select_from(documents_table)
            .where(
                *conditions,
                or_(status_expr.is_(None), status_expr != "verified"),
            )
        ).scalar_one()
    documents = [_document_from_row(project_name, row) for row in rows]
    return documents, total, pending_total


def list_all_documents(
    settings: Settings,
    project_id: str,
    sort: str = "created",
) -> List[Dict[str, Any]]:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    project_name = _project_name(engine)
    with engine.connect() as conn:
        rows = conn.execute(_documents_select(project_id, sort=sort)).mappings().all()
    return [_document_from_row(project_name, row) for row in rows]


def document_name_exists(
    settings: Settings,
    project_id: str,
    document_name: str,
    exclude_document_id: Optional[str] = None,
) -> bool:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    query = select(documents_table.c.id).where(
        documents_table.c.project_id == project_id,
        documents_table.c.document_name == document_name,
    )
    if exclude_document_id is not None:
        query = query.where(documents_table.c.id != exclude_document_id)
    with engine.connect() as conn:
        return conn.execute(query.limit(1)).first() is not None


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
    system_meta = _document_meta_with_system_fields(meta, status="pending")
    with engine.begin() as conn:
        conn.execute(
            documents_table.insert().values(
                id=document_id,
                project_id=project_id,
                document_name=document_name,
                text=text,
                meta=encode_meta(system_meta),
            )
        )
    project_name = _project_name(engine)
    return {
        "id": document_id,
        "project_id": project_id,
        "project_name": project_name,
        "document_name": document_name,
        "text": text,
        "meta": system_meta,
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
    new_meta = _document_meta_with_system_fields(meta, document.get("meta"))

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
        "meta": new_meta,
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


def _existing_annotations_by_id(conn, project_id: str, document_id: str) -> Dict[str, Dict[str, Any]]:
    rows = (
        conn.execute(
            select(
                annotations_table.c.id,
                annotations_table.c.label_id,
                annotations_table.c.start,
                annotations_table.c.end,
                annotations_table.c.span_text,
                annotations_table.c.comment,
                annotations_table.c.status,
                annotations_table.c.meta,
            )
            .select_from(
                annotations_table.join(
                    documents_table, annotations_table.c.document_id == documents_table.c.id
                )
            )
            .where(
                annotations_table.c.document_id == document_id,
                documents_table.c.project_id == project_id,
            )
        )
        .mappings()
        .all()
    )
    return {
        row["id"]: {
            "id": row["id"],
            "label_id": row["label_id"],
            "start": row["start"],
            "end": row["end"],
            "span_text": row["span_text"],
            "comment": row["comment"],
            "status": row["status"],
            "meta": decode_meta(row["meta"]),
        }
        for row in rows
    }


def _final_document_status(items: List[Dict[str, Any]]) -> str:
    return "verified" if items and all(item["status"] == "verified" for item in items) else "pending"


def save_document_bundle(
    settings: Settings,
    project_id: str,
    document_id: str,
    items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    document = get_document(settings, project_id, document_id)
    if not document:
        raise ValueError("Document not found")

    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))
    final_status = _final_document_status(items)

    with engine.begin() as conn:
        existing_annotations = _existing_annotations_by_id(conn, project_id, document_id)
        requested_existing_ids = {item["id"] for item in items if item.get("id")}
        if requested_existing_ids - set(existing_annotations):
            raise ValueError("Annotation not found")

        for item in items:
            annotation_id = item.get("id")
            if not annotation_id:
                continue
            existing = existing_annotations[annotation_id]
            immutable_fields = ("label_id", "start", "end", "span_text")
            if any(existing[field] != item[field] for field in immutable_fields):
                raise ValueError("Existing annotation immutable fields do not match bundle")

        omitted_ids = set(existing_annotations) - requested_existing_ids
        if omitted_ids:
            conn.execute(annotations_table.delete().where(annotations_table.c.id.in_(sorted(omitted_ids))))

        for item in items:
            annotation_id = item.get("id")
            if annotation_id:
                conn.execute(
                    annotations_table.update()
                    .where(
                        annotations_table.c.id == annotation_id,
                        annotations_table.c.document_id == document_id,
                    )
                    .values(
                        comment=item["comment"],
                        status=item["status"],
                        meta=encode_meta(item.get("meta")),
                    )
                )
                continue

            conn.execute(
                annotations_table.insert().values(
                    id=str(uuid.uuid4()),
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

        conn.execute(
            documents_table.update()
            .where(
                documents_table.c.project_id == project_id,
                documents_table.c.id == document_id,
            )
            .values(
                meta=encode_meta(
                    _document_meta_with_system_fields(
                        document.get("meta"),
                        document.get("meta"),
                        status=final_status,
                    )
                )
            )
        )

    refreshed = get_document(settings, project_id, document_id)
    if not refreshed:
        raise ValueError("Document not found")
    refreshed["annotations"] = list_document_annotations(settings, project_id, document_id)
    return refreshed
