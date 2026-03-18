from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.annotations import (
    AnnotationCreate,
    AnnotationOut,
    AnnotationUpdate,
)
from layered_span_studio_backend.services import annotations_service

router = APIRouter(
    prefix="/projects/{project_id}/documents/{document_id}/annotations",
    tags=["annotations"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=AnnotationOut, status_code=status.HTTP_201_CREATED)
def create_annotation(
    project_id: str,
    document_id: str,
    payload: AnnotationCreate,
    settings=Depends(get_settings),
):
    try:
        return annotations_service.create_annotation(
            settings,
            project_id,
            document_id,
            payload.label_id,
            payload.start,
            payload.end,
            payload.span_text,
            payload.comment,
            payload.status.value,
            payload.meta,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "not found" in message.lower():
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)


@router.get("/{annotation_id}", response_model=AnnotationOut)
def get_annotation(project_id: str, document_id: str, annotation_id: str, settings=Depends(get_settings)):
    try:
        annotation = annotations_service.get_annotation(settings, project_id, document_id, annotation_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not annotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    return annotation


@router.patch("/{annotation_id}", response_model=AnnotationOut)
def update_annotation(
    project_id: str,
    document_id: str,
    annotation_id: str,
    payload: AnnotationUpdate,
    settings=Depends(get_settings),
):
    try:
        annotation = annotations_service.update_annotation(
            settings,
            project_id,
            document_id,
            annotation_id,
            payload.comment,
            payload.status.value if payload.status else None,
            payload.meta,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "not found" in message.lower():
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
    if not annotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    return annotation


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    project_id: str, document_id: str, annotation_id: str, settings=Depends(get_settings)
):
    try:
        deleted = annotations_service.delete_annotation(settings, project_id, document_id, annotation_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotation not found")
    return None
