from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.labels import (
    LabelCreate,
    LabelExamplesResponse,
    LabelExamplesSampleMode,
    LabelExamplesStatusFilter,
    LabelListResponse,
    LabelOut,
    LabelUpdate,
)
from layered_span_studio_backend.services import labels_service

router = APIRouter(
    prefix="/projects/{project_id}/labels",
    tags=["labels"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=LabelListResponse)
def list_labels(project_id: str, settings=Depends(get_settings)):
    try:
        labels = labels_service.list_labels(settings, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return {"labels": labels}


@router.post("", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
def create_label(project_id: str, payload: LabelCreate, settings=Depends(get_settings)):
    try:
        return labels_service.create_label(
            settings,
            project_id,
            payload.name,
            payload.color,
            payload.description,
            payload.shortcut,
            payload.meta,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)


@router.get("/{label_id}", response_model=LabelOut)
def get_label(project_id: str, label_id: str, settings=Depends(get_settings)):
    try:
        label = labels_service.get_label(settings, project_id, label_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return label


@router.get("/{label_id}/examples", response_model=LabelExamplesResponse)
def list_label_examples(
    project_id: str,
    label_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: LabelExamplesStatusFilter = Query(LabelExamplesStatusFilter.verified, alias="status"),
    sample: LabelExamplesSampleMode = Query(LabelExamplesSampleMode.sequential),
    seed: int | None = Query(None),
    context_window: int = Query(20, ge=0, le=200),
    settings=Depends(get_settings),
):
    try:
        return labels_service.list_label_examples(
            settings,
            project_id,
            label_id,
            offset,
            limit,
            status_filter.value,
            sample.value,
            seed,
            context_window,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if message in {"Project not found", "Label not found"}:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)


@router.patch("/{label_id}", response_model=LabelOut)
def update_label(project_id: str, label_id: str, payload: LabelUpdate, settings=Depends(get_settings)):
    try:
        label = labels_service.update_label(
            settings,
            project_id,
            label_id,
            payload.name,
            payload.color,
            payload.description,
            payload.shortcut,
            payload.meta,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
    if not label:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return label


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(project_id: str, label_id: str, settings=Depends(get_settings)):
    try:
        deleted = labels_service.delete_label(settings, project_id, label_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return None
