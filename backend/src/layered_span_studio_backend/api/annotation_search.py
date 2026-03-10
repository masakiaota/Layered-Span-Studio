from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.annotations import (
    AnnotationSearchMatchMode,
    AnnotationSearchResponse,
)
from layered_span_studio_backend.models.labels import LabelExamplesStatusFilter
from layered_span_studio_backend.services import annotations_service

router = APIRouter(
    prefix="/projects/{project_id}/annotations",
    tags=["annotations"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/search", response_model=AnnotationSearchResponse)
def search_annotations(
    project_id: str,
    text: str = Query(..., min_length=1),
    match: AnnotationSearchMatchMode = Query(AnnotationSearchMatchMode.normalized),
    status_filter: LabelExamplesStatusFilter = Query(LabelExamplesStatusFilter.verified, alias="status"),
    label_id: str | None = Query(None),
    exclude_annotation_id: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    context_window: int = Query(20, ge=0, le=200),
    settings=Depends(get_settings),
):
    try:
        return annotations_service.search_annotations(
            settings,
            project_id,
            text,
            match.value,
            status_filter.value,
            label_id,
            exclude_annotation_id,
            offset,
            limit,
            context_window,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if message in {"Project not found", "Label not found"}:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
