from __future__ import annotations

from typing import Optional

from pydantic import Field

from layered_span_studio_backend.models.common import APIModel, Meta


class ProjectCreate(APIModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    meta: Meta = None


class ProjectUpdate(APIModel):
    name: Optional[str] = None
    description: Optional[str] = None
    meta: Meta = None


class ProjectSettingsPut(APIModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    meta: Meta = None


class ProjectOut(APIModel):
    id: str
    name: str
    description: Optional[str] = None
    meta: Meta = None


class ProjectListResponse(APIModel):
    projects: list[ProjectOut]
