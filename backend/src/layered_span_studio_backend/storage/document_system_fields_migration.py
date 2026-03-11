from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, select, text

from layered_span_studio_backend.storage.project_db import documents_table, get_project_engine, metadata
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


SYSTEM_FIELD_KEYS = {"status", "created_at", "updated_at"}
MISSING_STATUS = "pending"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_status(value: Any) -> str:
    return value if value in {"pending", "verified"} else MISSING_STATUS


def _normalize_timestamp(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value:
        return value
    return fallback


def _document_column_names(engine) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns("documents")}


def migrate_document_system_fields(db_path: Path) -> int:
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        column_names = _document_column_names(engine)
        if "status" not in column_names:
            conn.execute(text("ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'"))
        if "created_at" not in column_names:
            now = _utc_now_iso()
            conn.execute(text(f"ALTER TABLE documents ADD COLUMN created_at TEXT NOT NULL DEFAULT '{now}'"))
        if "updated_at" not in column_names:
            now = _utc_now_iso()
            conn.execute(text(f"ALTER TABLE documents ADD COLUMN updated_at TEXT NOT NULL DEFAULT '{now}'"))

        rows = conn.execute(
            select(
                documents_table.c.id,
                documents_table.c.meta,
                documents_table.c.status,
                documents_table.c.created_at,
                documents_table.c.updated_at,
            )
        ).mappings()
        updated_rows = 0
        for row in rows:
            meta = decode_meta(row["meta"])
            now = _utc_now_iso()
            created_at = _normalize_timestamp(meta.get("created_at") or row["created_at"], now)
            updated_at = _normalize_timestamp(meta.get("updated_at") or row["updated_at"], created_at)
            status = _normalize_status(meta.get("status") or row["status"])
            cleaned_meta = {key: value for key, value in meta.items() if key not in SYSTEM_FIELD_KEYS}
            needs_update = (
                row["status"] != status
                or row["created_at"] != created_at
                or row["updated_at"] != updated_at
                or cleaned_meta != meta
            )
            if not needs_update:
                continue
            conn.execute(
                documents_table.update()
                .where(documents_table.c.id == row["id"])
                .values(
                    status=status,
                    created_at=created_at,
                    updated_at=updated_at,
                    meta=encode_meta(cleaned_meta),
                )
            )
            updated_rows += 1

    metadata.create_all(engine)
    return updated_rows


def migrate_projects_dir(projects_dir: Path) -> list[tuple[Path, int]]:
    results: list[tuple[Path, int]] = []
    if not projects_dir.exists():
        return results
    for db_path in sorted(projects_dir.glob("*/database.db")):
        results.append((db_path, migrate_document_system_fields(db_path)))
    return results


def summarize_migration(results: Iterable[tuple[Path, int]]) -> dict[str, int]:
    normalized = list(results)
    return {
        "databases": len(normalized),
        "updated_rows": sum(updated_rows for _, updated_rows in normalized),
    }
