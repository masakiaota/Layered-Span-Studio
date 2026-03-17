from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.labels import (
    LabelExamplesResponse,
    LabelExamplesSampleMode,
    LabelSurfaceGroupsResponse,
    LabelExamplesStatusFilter,
    LabelListResponse,
    LabelSyncIn,
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
        response = labels_service.list_labels_state(settings, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return response


@router.put("", response_model=LabelListResponse)
def save_labels(project_id: str, payload: LabelSyncIn, settings=Depends(get_settings)):
    try:
        response = labels_service.save_labels(
            settings,
            project_id,
            [label.model_dump(mode="json") for label in payload.labels],
            payload.base_revision,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message or "Label not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        if message == "Label revision mismatch":
            status_code = status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=message)
    return response


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


@router.get("/{label_id}/surface-groups", response_model=LabelSurfaceGroupsResponse)
def list_label_surface_groups(
    project_id: str,
    label_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: LabelExamplesStatusFilter = Query(LabelExamplesStatusFilter.verified, alias="status"),
    context_window: int = Query(20, ge=0, le=200),
    exclude_annotation_id: str | None = Query(None),
    settings=Depends(get_settings),
):
    try:
        return labels_service.list_label_surface_groups(
            settings,
            project_id,
            label_id,
            offset,
            limit,
            status_filter.value,
            context_window,
            exclude_annotation_id,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if message in {"Project not found", "Label not found"}:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
