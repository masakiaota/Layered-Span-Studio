from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.import_export import (
    ExportRequest,
    ExportResponse,
    ImportRequest,
    ImportResponse,
)
from layered_span_studio_backend.services import import_export_service

router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["import-export"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/export", response_model=ExportResponse)
def export_project(
    project_id: str,
    payload: ExportRequest = Body(default_factory=ExportRequest),
    settings=Depends(get_settings),
):
    try:
        return import_export_service.export_project(
            settings,
            project_id,
            include_pending=payload.include_pending,
            include_verified=payload.include_verified,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/import", response_model=ImportResponse)
def import_project(project_id: str, payload: ImportRequest, settings=Depends(get_settings)):
    try:
        return import_export_service.import_project(settings, project_id, payload.model_dump())
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST
        if "Project not found" in message:
            status_code = status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message)
