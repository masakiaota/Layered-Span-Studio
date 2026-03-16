from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from sqlalchemy import Column, MetaData, String, Table, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

metadata = MetaData()

users_table = Table(
    "users",
    metadata,
    Column("id", String, primary_key=True),
    Column("username", String, nullable=False, unique=True),
    Column("password_hash", String, nullable=False),
    Column("meta", String),
)

sessions_table = Table(
    "sessions",
    metadata,
    Column("id", String, primary_key=True),
    Column("user_id", String, nullable=False),
    Column("created_at", String, nullable=False),
    Column("expires_at", String, nullable=False),
)


def _engine_for_path(path: Path) -> Engine:
    return create_engine(
        f"sqlite:///{path}",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )


@lru_cache
def get_app_engine(db_path: str) -> Engine:
    return _engine_for_path(Path(db_path))


def init_app_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = _engine_for_path(db_path)
    metadata.create_all(engine)
