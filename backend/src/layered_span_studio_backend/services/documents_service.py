from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo


def _ensure_project(settings: Settings, project_id: str) -> None:
    if not projects_repo.get_project(settings, project_id):
        raise ValueError("Project not found")


def list_documents(
    settings: Settings,
    project_id: str,
    offset: int,
    limit: int,
    search: str,
    sort: str,
) -> Tuple[List[Dict[str, Any]], int, int]:
    _ensure_project(settings, project_id)
    return documents_repo.list_documents_page(settings, project_id, offset, limit, search, sort)


def get_document(settings: Settings, project_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    document = documents_repo.get_document(settings, project_id, document_id)
    if not document:
        return None
    annotations = documents_repo.list_document_annotations(settings, project_id, document_id)
    document["annotations"] = annotations
    return document


def create_document(
    settings: Settings,
    project_id: str,
    document_name: str,
    text: str,
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    _ensure_project(settings, project_id)
    if documents_repo.document_name_exists(settings, project_id, document_name):
        raise ValueError("Document name already exists in this project")
    return documents_repo.create_document(settings, project_id, document_name, text, meta)


def _validate_document_bundle(
    settings: Settings,
    project_id: str,
    document_id: str,
    items: List[Dict[str, Any]],
) -> None:
    document_text = documents_repo.get_document_text(settings, project_id, document_id)
    if document_text is None:
        raise ValueError("Document not found")

    valid_label_ids = {label["id"] for label in labels_repo.list_labels(settings, project_id)}
    spans_by_label: Dict[str, List[tuple[int, int]]] = {}
    seen_annotation_ids: set[str] = set()
    for item in items:
        annotation_id = item.get("id")
        if annotation_id:
            if annotation_id in seen_annotation_ids:
                raise ValueError("Duplicate annotation id in bundle")
            seen_annotation_ids.add(annotation_id)

        label_id = item["label_id"]
        if label_id not in valid_label_ids:
            raise ValueError("Label not found")

        start = item["start"]
        end = item["end"]
        if start < 0 or end <= start or end > len(document_text):
            raise ValueError("Annotation range is out of bounds")
        if document_text[start:end] != item["span_text"]:
            raise ValueError("span_text does not match the specified range")

        label_spans = spans_by_label.setdefault(label_id, [])
        if any(existing_start < end and existing_end > start for existing_start, existing_end in label_spans):
            raise ValueError("Overlapping annotation span for the same label is not allowed")
        label_spans.append((start, end))


def update_document(
    settings: Settings,
    project_id: str,
    document_id: str,
    document_name: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    if document_name is not None:
        if documents_repo.document_name_exists(
            settings, project_id, document_name, exclude_document_id=document_id
        ):
            raise ValueError("Document name already exists in this project")
    return documents_repo.update_document(settings, project_id, document_id, document_name, meta)


def delete_document(settings: Settings, project_id: str, document_id: str) -> bool:
    _ensure_project(settings, project_id)
    return documents_repo.delete_document(settings, project_id, document_id)


def save_document_bundle(
    settings: Settings,
    project_id: str,
    document_id: str,
    items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    _ensure_project(settings, project_id)
    _validate_document_bundle(settings, project_id, document_id, items)
    return documents_repo.save_document_bundle(settings, project_id, document_id, items)
