from __future__ import annotations

import uuid
from typing import Any, Dict, List

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories.projects import project_db_path
from layered_span_studio_backend.storage.project_db import (
    annotations_table,
    documents_table,
    get_project_engine,
    labels_table,
)
from layered_span_studio_backend.utils.json_utils import encode_meta

DOCUMENT_SYSTEM_FIELD_KEYS = {"status", "created_at", "updated_at"}


def _new_id() -> str:
    return str(uuid.uuid4())


def _sanitize_document_meta(meta: Dict[str, Any] | None) -> Dict[str, Any]:
    return {
        key: value
        for key, value in (meta or {}).items()
        if key not in DOCUMENT_SYSTEM_FIELD_KEYS
    }


def import_entities(
    settings: Settings,
    project_id: str,
    existing_label_by_name: Dict[str, Dict[str, Any]],
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
) -> None:
    db_path = project_db_path(settings, project_id)
    engine = get_project_engine(str(db_path))

    label_id_by_name = {
        name: label["id"] for name, label in existing_label_by_name.items()
    }
    label_rows = []
    for label in incoming_labels:
        label_id = _new_id()
        label_id_by_name[label["name"]] = label_id
        label_rows.append(
            {
                "id": label_id,
                "project_id": project_id,
                "name": label["name"],
                "color": label["color"],
                "description": label["description"],
                "shortcut": label.get("shortcut"),
                "meta": encode_meta(label.get("meta")),
            }
        )

    document_rows = []
    annotation_rows = []
    for doc in incoming_documents:
        document_id = _new_id()
        document_rows.append(
            {
                "id": document_id,
                "project_id": project_id,
                "document_name": doc["document_name"],
                "text": doc["text"],
                "status": doc["status"],
                "created_at": doc["created_at"],
                "updated_at": doc["updated_at"],
                "meta": encode_meta(_sanitize_document_meta(doc.get("meta"))),
            }
        )
        for ann in doc.get("annotations", []):
            annotation_rows.append(
                {
                    "id": _new_id(),
                    "document_id": document_id,
                    "label_id": label_id_by_name[ann["label_name"]],
                    "start": ann["start"],
                    "end": ann["end"],
                    "span_text": ann["span_text"],
                    "comment": ann.get("comment", ""),
                    "status": ann["status"],
                    "meta": encode_meta(ann.get("meta")),
                }
            )

    with engine.begin() as conn:
        if label_rows:
            conn.execute(labels_table.insert(), label_rows)
        if document_rows:
            conn.execute(documents_table.insert(), document_rows)
        if annotation_rows:
            conn.execute(annotations_table.insert(), annotation_rows)
