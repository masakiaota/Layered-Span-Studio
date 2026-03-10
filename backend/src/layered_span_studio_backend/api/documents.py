from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.documents import (
    DocumentBundleIn,
    DocumentCreate,
    DocumentDetailOut,
    DocumentListResponse,
    DocumentListSort,
    DocumentOut,
    DocumentUpdate,
)
from layered_span_studio_backend.services import documents_service

router = APIRouter(
    prefix="/projects/{project_id}/documents",
    tags=["documents"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=DocumentListResponse)
def list_documents(
    project_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query(""),
    sort: DocumentListSort = Query(DocumentListSort.created),
    settings=Depends(get_settings),
):
    try:
        documents, total, pending_total = documents_service.list_documents(
            settings,
            project_id,
            offset,
            limit,
            search,
            sort.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return {
        "documents": documents,
        "total": total,
        "pending_total": pending_total,
        "offset": offset,
        "limit": limit,
        "search": search,
        "sort": sort,
    }


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(project_id: str, payload: DocumentCreate, settings=Depends(get_settings)):
    try:
        return documents_service.create_document(
            settings, project_id, payload.document_name, payload.text, payload.meta
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)


@router.get("/{document_id}", response_model=DocumentDetailOut)
def get_document(project_id: str, document_id: str, settings=Depends(get_settings)):
    try:
        document = documents_service.get_document(settings, project_id, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.put("/{document_id}/bundle", response_model=DocumentDetailOut)
def save_document_bundle(
    project_id: str,
    document_id: str,
    payload: DocumentBundleIn,
    settings=Depends(get_settings),
):
    try:
        return documents_service.save_document_bundle(
            settings,
            project_id,
            document_id,
            [annotation.model_dump(mode="json") for annotation in payload.annotations],
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "not found" in message.lower():
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    project_id: str, document_id: str, payload: DocumentUpdate, settings=Depends(get_settings)
):
    try:
        document = documents_service.update_document(
            settings, project_id, document_id, payload.document_name, payload.meta
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(project_id: str, document_id: str, settings=Depends(get_settings)):
    try:
        deleted = documents_service.delete_document(settings, project_id, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return None
