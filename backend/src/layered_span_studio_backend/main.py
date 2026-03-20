from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from layered_span_studio_backend.api.router import router as api_router
from layered_span_studio_backend.core.config import Settings, get_settings
from layered_span_studio_backend.repositories.users import ensure_users_db
from layered_span_studio_backend.version import get_app_version


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Layered Span Studio API", version=get_app_version())
    settings = settings or get_settings()

    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is required")

    app.state.settings = settings
    ensure_users_db(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)
    return app


app = create_app()
