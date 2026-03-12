from __future__ import annotations

from enum import Enum
import re
from typing import Optional

from pydantic import Field, field_validator

from layered_span_studio_backend.models.common import APIModel, AnnotationStatus, Meta

HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{6})$")


class LabelCreate(APIModel):
    name: str = Field(..., min_length=1)
    color: str
    description: str
    shortcut: Optional[str] = None
    meta: Meta = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not HEX_COLOR_RE.match(value):
            raise ValueError("color must be a 6-digit hex value")
        return value


class LabelUpdate(APIModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    shortcut: Optional[str] = None
    meta: Meta = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not HEX_COLOR_RE.match(value):
            raise ValueError("color must be a 6-digit hex value")
        return value


class LabelSyncItemIn(APIModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1)
    color: str
    description: str
    shortcut: Optional[str] = None
    meta: Meta = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not HEX_COLOR_RE.match(value):
            raise ValueError("color must be a 6-digit hex value")
        return value


class LabelSyncIn(APIModel):
    labels: list[LabelSyncItemIn]


class LabelOut(APIModel):
    id: str
    project_id: str
    project_name: str
    name: str
    color: str
    description: str
    shortcut: Optional[str] = None
    meta: Meta = None


class LabelListResponse(APIModel):
    labels: list[LabelOut]


class LabelExamplesStatusFilter(str, Enum):
    pending = "pending"
    verified = "verified"
    all = "all"


class LabelExamplesSampleMode(str, Enum):
    sequential = "sequential"
    random = "random"


class LabelExampleOut(APIModel):
    annotation_id: str
    document_id: str
    document_name: str
    span_text: str
    start: int
    end: int
    status: AnnotationStatus
    context_before: str
    context_after: str


class LabelExamplesResponse(APIModel):
    examples: list[LabelExampleOut]
    total_matched: int
    offset_applied: int
    limit: int
    status: LabelExamplesStatusFilter
    sample: LabelExamplesSampleMode
    seed: Optional[int] = None
    context_window: int


class LabelSurfaceGroupRepresentativeOut(APIModel):
    annotation_id: str
    document_id: str
    document_name: str
    span_text: str
    start: int
    end: int
    status: AnnotationStatus
    context_before: str
    context_after: str


class LabelSurfaceGroupOut(APIModel):
    surface_text: str
    duplicate_count: int
    representative: LabelSurfaceGroupRepresentativeOut


class LabelSurfaceGroupsResponse(APIModel):
    items: list[LabelSurfaceGroupOut]
    total: int
    offset: int
    limit: int
    status: LabelExamplesStatusFilter
    context_window: int
    exclude_annotation_id: Optional[str] = None
