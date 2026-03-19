from __future__ import annotations

from typing import Any, Dict, List

from layered_span_studio_backend.models.common import APIModel


class ExportRequest(APIModel):
    include_pending: bool = True
    include_verified: bool = True


class ExportResponse(APIModel):
    project: Dict[str, Any]
    labels: List[Dict[str, Any]]
    documents: List[Dict[str, Any]]
    meta: Dict[str, Any]


class ImportRequest(APIModel):
    project: Dict[str, Any]
    labels: List[Dict[str, Any]]
    documents: List[Dict[str, Any]]
    meta: Dict[str, Any] | None = None


class ImportResponse(APIModel):
    imported: Dict[str, int]
    errors: List[Dict[str, Any]]


class ProjectImportResponse(APIModel):
    project: Dict[str, Any]
    imported: Dict[str, int]
    errors: List[Dict[str, Any]]


class ImportPreflightIssue(APIModel):
    message: str


class ImportPreflightResponse(APIModel):
    ok: bool
    imported: Dict[str, int]
    errors: List[ImportPreflightIssue]


class ProjectImportPreflightResponse(ImportPreflightResponse):
    resolved_project_name: str | None = None
