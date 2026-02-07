from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import projects as projects_repo


def _ensure_project(settings: Settings, project_id: str) -> None:
    if not projects_repo.get_project(settings, project_id):
        raise ValueError("Project not found")


def list_documents(settings: Settings, project_id: str, offset: int, limit: int) -> Tuple[List[Dict[str, Any]], int]:
    _ensure_project(settings, project_id)
    return documents_repo.list_documents(settings, project_id, offset, limit)


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
    documents, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
    if any(doc["document_name"] == document_name for doc in documents):
        raise ValueError("Document name already exists in this project")
    return documents_repo.create_document(settings, project_id, document_name, text, meta)


def update_document(
    settings: Settings,
    project_id: str,
    document_id: str,
    document_name: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    if document_name is not None:
        documents, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
        if any(doc["document_name"] == document_name and doc["id"] != document_id for doc in documents):
            raise ValueError("Document name already exists in this project")
    return documents_repo.update_document(settings, project_id, document_id, document_name, meta)


def delete_document(settings: Settings, project_id: str, document_id: str) -> bool:
    _ensure_project(settings, project_id)
    return documents_repo.delete_document(settings, project_id, document_id)
