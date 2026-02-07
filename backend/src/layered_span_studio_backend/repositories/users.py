from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from sqlalchemy import select

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.storage.app_db import get_app_engine, init_app_db, users_table
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


def ensure_users_db(settings: Settings) -> None:
    init_app_db(settings.app_db_path)


def get_user_by_username(settings: Settings, username: str) -> Optional[Dict[str, Any]]:
    engine = get_app_engine(str(settings.app_db_path))
    with engine.connect() as conn:
        row = conn.execute(select(users_table).where(users_table.c.username == username)).mappings().first()
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "password_hash": row["password_hash"],
        "meta": decode_meta(row["meta"]),
    }


def get_user_by_id(settings: Settings, user_id: str) -> Optional[Dict[str, Any]]:
    engine = get_app_engine(str(settings.app_db_path))
    with engine.connect() as conn:
        row = conn.execute(select(users_table).where(users_table.c.id == user_id)).mappings().first()
    if not row:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "password_hash": row["password_hash"],
        "meta": decode_meta(row["meta"]),
    }


def create_user(settings: Settings, username: str, password_hash: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    engine = get_app_engine(str(settings.app_db_path))
    user_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            users_table.insert().values(
                id=user_id,
                username=username,
                password_hash=password_hash,
                meta=encode_meta(meta),
            )
        )
    return {"id": user_id, "username": username, "meta": meta or {}}
