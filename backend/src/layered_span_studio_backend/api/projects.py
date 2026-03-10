from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from layered_span_studio_backend.core.dependencies import get_current_user, get_settings
from layered_span_studio_backend.models.projects import (
    ProjectCreate,
    ProjectListResponse,
    ProjectOut,
    ProjectSettingsPut,
    ProjectUpdate,
)
from layered_span_studio_backend.services import projects_service

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=ProjectListResponse)
def list_projects(settings=Depends(get_settings)):
    projects = projects_service.list_projects(settings)
    return {"projects": projects}


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, settings=Depends(get_settings)):
    try:
        return projects_service.create_project(settings, payload.name, payload.description, payload.meta)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, settings=Depends(get_settings)):
    project = projects_service.get_project(settings, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, payload: ProjectUpdate, settings=Depends(get_settings)):
    try:
        project = projects_service.update_project(settings, project_id, payload.name, payload.description, payload.meta)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.put("/{project_id}/settings", response_model=ProjectOut)
def put_project_settings(project_id: str, payload: ProjectSettingsPut, settings=Depends(get_settings)):
    try:
        project = projects_service.update_project(
            settings,
            project_id,
            payload.name,
            payload.description,
            payload.meta,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, settings=Depends(get_settings)):
    deleted = projects_service.delete_project(settings, project_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return None
