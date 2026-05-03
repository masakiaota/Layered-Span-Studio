from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
)
from sqlalchemy.engine import Engine
from sqlalchemy import event
from sqlalchemy.pool import NullPool

metadata = MetaData()

project_table = Table(
    "project",
    metadata,
    Column("id", String, primary_key=True),
    Column("name", String, nullable=False),
    Column("description", Text),
    Column("meta", Text),
    Column("created_at", Text, nullable=False),
)

labels_table = Table(
    "labels",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, ForeignKey("project.id", ondelete="CASCADE"), nullable=False),
    Column("name", String, nullable=False),
    Column("color", String, nullable=False),
    Column("description", Text, nullable=False),
    Column("shortcut", String),
    Column("meta", Text),
    Column("display_order", Integer),
)

# SQLite does not enforce foreign keys unless PRAGMA is set. We'll enable it per-connection.


documents_table = Table(
    "documents",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, ForeignKey("project.id", ondelete="CASCADE"), nullable=False),
    Column("document_name", String, nullable=False),
    Column("text", Text, nullable=False),
    Column("status", String, nullable=False, server_default="pending"),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("meta", Text),
    CheckConstraint("status IN ('pending', 'verified')", name="ck_documents_status"),
)

annotations_table = Table(
    "annotations",
    metadata,
    Column("id", String, primary_key=True),
    Column("document_id", String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
    Column("label_id", String, ForeignKey("labels.id", ondelete="CASCADE"), nullable=False),
    Column("start", Integer, nullable=False),
    Column("end", Integer, nullable=False),
    Column("span_text", Text, nullable=False),
    Column("comment", Text, nullable=False, server_default=""),
    Column("status", String, nullable=False, server_default="pending"),
    Column("meta", Text),
    CheckConstraint("start >= 0", name="ck_annotations_start"),
    CheckConstraint("end > start", name="ck_annotations_end"),
    CheckConstraint("status IN ('pending','verified')", name="ck_annotations_status"),
)

Index("idx_labels_project", labels_table.c.project_id)
Index("idx_labels_name", labels_table.c.name)
Index("idx_documents_project", documents_table.c.project_id)
Index("idx_documents_document_name", documents_table.c.document_name)
Index("idx_documents_status", documents_table.c.status)
Index("idx_documents_updated_at", documents_table.c.updated_at)
Index("idx_annotations_document", annotations_table.c.document_id)
Index("idx_annotations_label", annotations_table.c.label_id)
Index("idx_annotations_status", annotations_table.c.status)
Index("idx_annotations_position", annotations_table.c.document_id, annotations_table.c.start, annotations_table.c.end)
RELATED_EXAMPLE_INDEX_COLUMNS = (
    ("idx_annotations_surface_search", ("span_text", "status", "document_id", "label_id", "start", "id")),
    ("idx_annotations_label_surface_groups", ("label_id", "status", "span_text", "document_id", "start", "id")),
)

for index_name, column_names in RELATED_EXAMPLE_INDEX_COLUMNS:
    Index(index_name, *(annotations_table.c[column_name] for column_name in column_names))

PROJECT_INDEX_DDL = tuple(
    f"CREATE INDEX IF NOT EXISTS {index_name} ON annotations ({', '.join(column_names)})"
    for index_name, column_names in RELATED_EXAMPLE_INDEX_COLUMNS
)


def _engine_for_path(path: Path) -> Engine:
    engine = create_engine(
        f"sqlite:///{path}",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    event.listen(engine, "connect", _set_sqlite_pragma)
    return engine


def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.close()


@lru_cache
def get_project_engine(db_path: str) -> Engine:
    return _engine_for_path(Path(db_path))


def init_project_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = _engine_for_path(db_path)
    metadata.create_all(engine)
    ensure_project_indexes(engine)


def ensure_project_indexes(engine: Engine) -> None:
    with engine.begin() as conn:
        has_annotations_table = (
            conn.exec_driver_sql("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'annotations'")
            .first()
            is not None
        )
        if not has_annotations_table:
            return
        for ddl in PROJECT_INDEX_DDL:
            conn.exec_driver_sql(ddl)
