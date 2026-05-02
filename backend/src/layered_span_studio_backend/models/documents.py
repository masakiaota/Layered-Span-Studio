from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import Field

from layered_span_studio_backend.models.common import AnnotationStatus
from layered_span_studio_backend.models.annotations import AnnotationOut
from layered_span_studio_backend.models.common import APIModel, Meta


class DocumentListSort(str, Enum):
    created = "created"
    pending = "pending"
    updated = "updated"
    name = "name"


class DocumentCreate(APIModel):
    document_name: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    meta: Meta = None


class DocumentBundleAnnotationIn(APIModel):
    id: Optional[str] = None
    label_id: str
    start: int = Field(..., ge=0)
    end: int = Field(..., gt=0)
    span_text: str
    comment: str = ""
    status: AnnotationStatus
    meta: Meta = None


class DocumentBundleIn(APIModel):
    annotations: list[DocumentBundleAnnotationIn]
    submit: bool = False


class DocumentOut(APIModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    document_name: str
    text: str
    status: AnnotationStatus
    created_at: str
    updated_at: str
    meta: Meta = None


class DocumentDetailOut(DocumentOut):
    annotations: list[AnnotationOut]


class DocumentListResponse(APIModel):
    documents: list[DocumentOut]
    total: int
    pending_total: int
    offset: int
    limit: int
    search: str
    sort: DocumentListSort


class DocumentNavigationResponse(APIModel):
    current_document_id: str
    prev_document_id: Optional[str] = None
    next_document_id: Optional[str] = None
    prev_pending_document_id: Optional[str] = None
    next_pending_document_id: Optional[str] = None
    search: str
    sort: DocumentListSort
