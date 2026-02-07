from __future__ import annotations

from typing import Optional

from pydantic import Field

from layered_span_studio_backend.models.annotations import AnnotationOut
from layered_span_studio_backend.models.common import APIModel, Meta


class DocumentCreate(APIModel):
    document_name: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    meta: Meta = None


class DocumentUpdate(APIModel):
    document_name: Optional[str] = None
    meta: Meta = None


class DocumentOut(APIModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    document_name: str
    text: str
    meta: Meta = None


class DocumentDetailOut(DocumentOut):
    annotations: list[AnnotationOut]


class DocumentListResponse(APIModel):
    documents: list[DocumentOut]
    total: int
    offset: int
    limit: int
