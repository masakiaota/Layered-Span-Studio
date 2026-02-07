from __future__ import annotations

import re
from typing import Optional

from pydantic import Field, field_validator

from layered_span_studio_backend.models.common import APIModel, Meta

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
