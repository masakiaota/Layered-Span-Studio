from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import Field

from layered_span_studio_backend.models.common import APIModel, Meta, AnnotationStatus


class AnnotationCreate(APIModel):
    label_id: str
    start: int
    end: int
    span_text: str
    comment: str = ""
    status: AnnotationStatus
    meta: Meta = None


class AnnotationBulkCreate(APIModel):
    annotations: list[AnnotationCreate]


class AnnotationUpdate(APIModel):
    comment: Optional[str] = None
    status: Optional[AnnotationStatus] = None
    meta: Meta = None


class AnnotationOut(APIModel):
    id: str
    document_id: str
    document_name: str
    label_id: str
    label_name: str
    start: int
    end: int
    span_text: str
    comment: str
    status: AnnotationStatus
    meta: Meta = None


class AnnotationSearchMatchMode(str, Enum):
    exact = "exact"
    normalized = "normalized"


class AnnotationSearchItemOut(APIModel):
    annotation_id: str
    document_id: str
    document_name: str
    label_id: str
    label_name: str
    label_color: str
    start: int
    end: int
    span_text: str
    status: AnnotationStatus
    context_before: str
    context_after: str


class AnnotationSearchResponse(APIModel):
    items: list[AnnotationSearchItemOut]
    total: int
    offset: int
    limit: int
    text: str
    match: AnnotationSearchMatchMode
    status: AnnotationStatus | str
    context_window: int
    label_id: Optional[str] = None
    exclude_annotation_id: Optional[str] = None
