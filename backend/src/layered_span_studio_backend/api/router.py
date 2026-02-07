from __future__ import annotations

from fastapi import APIRouter

from layered_span_studio_backend.api import annotations, auth, documents, import_export, labels, projects

router = APIRouter()

router.include_router(auth.router)
router.include_router(projects.router)
router.include_router(labels.router)
router.include_router(documents.router)
router.include_router(annotations.router)
router.include_router(import_export.router)
