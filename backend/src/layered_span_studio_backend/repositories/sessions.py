from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import delete, select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.storage.app_db import get_app_engine, sessions_table


def create_session(
    settings: Settings,
    session_id: str,
    user_id: str,
    created_at: str,
    expires_at: str,
) -> Dict[str, Any]:
    engine = get_app_engine(str(settings.app_db_path))
    with engine.begin() as conn:
        conn.execute(
            sessions_table.insert().values(
                id=session_id,
                user_id=user_id,
                created_at=created_at,
                expires_at=expires_at,
            )
        )
    return {
        "id": session_id,
        "user_id": user_id,
        "created_at": created_at,
        "expires_at": expires_at,
    }


def get_session_by_id(settings: Settings, session_id: str) -> Optional[Dict[str, Any]]:
    engine = get_app_engine(str(settings.app_db_path))
    with engine.connect() as conn:
        row = conn.execute(select(sessions_table).where(sessions_table.c.id == session_id)).mappings().first()
    if not row:
        return None
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
    }


def delete_session(settings: Settings, session_id: str) -> bool:
    engine = get_app_engine(str(settings.app_db_path))
    with engine.begin() as conn:
        result = conn.execute(delete(sessions_table).where(sessions_table.c.id == session_id))
    return bool(result.rowcount)
