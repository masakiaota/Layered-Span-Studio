from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import select

from layered_span_studio_backend.storage.document_system_fields_migration import migrate_document_system_fields
from layered_span_studio_backend.storage.project_db import documents_table, get_project_engine
from layered_span_studio_backend.utils.json_utils import decode_meta, encode_meta


def _create_legacy_project_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE project (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                meta TEXT
            );
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                document_name TEXT NOT NULL,
                text TEXT NOT NULL,
                meta TEXT
            );
            """
        )
        conn.execute(
            "INSERT INTO project (id, name, description, meta) VALUES (?, ?, ?, ?)",
            ("project-1", "Legacy Project", "desc", "{}"),
        )
        conn.execute(
            "INSERT INTO documents (id, project_id, document_name, text, meta) VALUES (?, ?, ?, ?, ?)",
            (
                "doc-1",
                "project-1",
                "Legacy Doc",
                "Hello world",
                encode_meta(
                    {
                        "status": "verified",
                        "created_at": "2026-03-01T00:00:00Z",
                        "updated_at": "2026-03-02T00:00:00Z",
                        "source": "legacy",
                    }
                ),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def test_migrate_document_system_fields_moves_values_out_of_meta(tmp_path: Path) -> None:
    db_path = tmp_path / "project-1" / "database.db"
    _create_legacy_project_db(db_path)

    updated_rows = migrate_document_system_fields(db_path)
    assert updated_rows == 1

    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = conn.execute(select(documents_table)).mappings().one()

    assert row["status"] == "verified"
    assert row["created_at"] == "2026-03-01T00:00:00Z"
    assert row["updated_at"] == "2026-03-02T00:00:00Z"
    assert decode_meta(row["meta"]) == {"source": "legacy"}


def test_migrate_document_system_fields_is_idempotent(tmp_path: Path) -> None:
    db_path = tmp_path / "project-2" / "database.db"
    _create_legacy_project_db(db_path)

    assert migrate_document_system_fields(db_path) == 1
    assert migrate_document_system_fields(db_path) == 0

    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        row = conn.execute(select(documents_table)).mappings().one()
    assert decode_meta(row["meta"]) == {"source": "legacy"}
