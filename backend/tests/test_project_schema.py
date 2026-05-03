from __future__ import annotations

from pathlib import Path

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.main import create_app
from layered_span_studio_backend.repositories import projects as projects_repo
from layered_span_studio_backend.storage.project_db import get_project_engine, init_project_db


RELATED_EXAMPLE_INDEXES = {
    "idx_annotations_surface_search",
    "idx_annotations_label_surface_groups",
}

RELATED_EXAMPLE_INDEX_COLUMNS = {
    "idx_annotations_surface_search": ["span_text", "status", "document_id", "label_id", "start", "id"],
    "idx_annotations_label_surface_groups": ["label_id", "status", "span_text", "document_id", "start", "id"],
}


def _annotation_index_names(db_path: Path) -> set[str]:
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA index_list('annotations')").mappings().all()
    return {row["name"] for row in rows}


def _annotation_index_columns(db_path: Path, index_name: str) -> list[str]:
    engine = get_project_engine(str(db_path))
    with engine.connect() as conn:
        rows = conn.exec_driver_sql(f"PRAGMA index_info('{index_name}')").mappings().all()
    return [row["name"] for row in rows]


def test_init_project_db_creates_related_example_indexes(tmp_path: Path) -> None:
    db_path = tmp_path / "project.db"

    init_project_db(db_path)

    assert RELATED_EXAMPLE_INDEXES <= _annotation_index_names(db_path)


def test_related_example_indexes_keep_expected_column_order(tmp_path: Path) -> None:
    db_path = tmp_path / "project.db"

    init_project_db(db_path)

    assert {
        index_name: _annotation_index_columns(db_path, index_name)
        for index_name in RELATED_EXAMPLE_INDEX_COLUMNS
    } == RELATED_EXAMPLE_INDEX_COLUMNS


def test_create_app_migrates_existing_project_related_example_indexes(settings: Settings) -> None:
    project = projects_repo.create_project(settings, "Existing Project", "desc", {})
    db_path = projects_repo.project_db_path(settings, project["id"])
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        for index_name in RELATED_EXAMPLE_INDEXES:
            conn.exec_driver_sql(f"DROP INDEX IF EXISTS {index_name}")

    create_app(settings)

    assert RELATED_EXAMPLE_INDEXES <= _annotation_index_names(db_path)
