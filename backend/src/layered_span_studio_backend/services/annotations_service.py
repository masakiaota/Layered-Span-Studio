from __future__ import annotations

from typing import Any, Dict, List, Optional

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import annotations as annotations_repo
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo


def _ensure_project(settings: Settings, project_id: str) -> None:
    if not projects_repo.get_project(settings, project_id):
        raise ValueError("Project not found")


def _ensure_document(settings: Settings, project_id: str, document_id: str) -> None:
    if not documents_repo.get_document(settings, project_id, document_id):
        raise ValueError("Document not found")


def _ensure_label(settings: Settings, project_id: str, label_id: str) -> None:
    if not labels_repo.get_label(settings, project_id, label_id):
        raise ValueError("Label not found")


def _validate_span_text(text: str, start: int, end: int, span_text: str) -> None:
    if text[start:end] != span_text:
        raise ValueError("span_text does not match the specified range")


def get_annotation(
    settings: Settings, project_id: str, document_id: str, annotation_id: str
) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    return annotations_repo.get_annotation(settings, project_id, document_id, annotation_id)


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
    _ensure_project(settings, project_id)
    _ensure_document(settings, project_id, document_id)
    _ensure_label(settings, project_id, label_id)
    text = documents_repo.get_document_text(settings, project_id, document_id)
    if text is None:
        raise ValueError("Document not found")
    _validate_span_text(text, start, end, span_text)
    return annotations_repo.create_annotation(
        settings, project_id, document_id, label_id, start, end, span_text, comment, status, meta
    )


def bulk_create_annotations(
    settings: Settings,
    project_id: str,
    document_id: str,
    items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    _ensure_document(settings, project_id, document_id)
    text = documents_repo.get_document_text(settings, project_id, document_id)
    if text is None:
        raise ValueError("Document not found")

    for item in items:
        _ensure_label(settings, project_id, item["label_id"])
        _validate_span_text(text, item["start"], item["end"], item["span_text"])

    return annotations_repo.bulk_create_annotations(settings, project_id, document_id, items)


def update_annotation(
    settings: Settings,
    project_id: str,
    document_id: str,
    annotation_id: str,
    comment: Optional[str],
    status: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    _ensure_document(settings, project_id, document_id)
    return annotations_repo.update_annotation(
        settings, project_id, document_id, annotation_id, comment, status, meta
    )


def delete_annotation(settings: Settings, project_id: str, document_id: str, annotation_id: str) -> bool:
    _ensure_project(settings, project_id)
    _ensure_document(settings, project_id, document_id)
    return annotations_repo.delete_annotation(settings, project_id, document_id, annotation_id)
