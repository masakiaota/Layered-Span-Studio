from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError

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


def test_project_db_path_migrates_existing_project_related_example_indexes(settings: Settings) -> None:
    project = projects_repo.create_project(settings, "Existing Project", "desc", {})
    db_path = projects_repo.project_db_path(settings, project["id"])
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        for index_name in RELATED_EXAMPLE_INDEXES:
            conn.exec_driver_sql(f"DROP INDEX IF EXISTS {index_name}")
    projects_repo._ensure_project_indexes_once.cache_clear()

    projects_repo.project_db_path(settings, project["id"])

    assert RELATED_EXAMPLE_INDEXES <= _annotation_index_names(db_path)


def test_create_app_does_not_block_on_existing_project_index_migration(settings: Settings) -> None:
    project = projects_repo.create_project(settings, "Startup Project", "desc", {})
    db_path = projects_repo.project_db_path(settings, project["id"])
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        for index_name in RELATED_EXAMPLE_INDEXES:
            conn.exec_driver_sql(f"DROP INDEX IF EXISTS {index_name}")
    projects_repo._ensure_project_indexes_once.cache_clear()

    create_app(settings)

    assert not RELATED_EXAMPLE_INDEXES <= _annotation_index_names(db_path)


def test_project_db_path_retries_related_example_index_migration(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = projects_repo.create_project(settings, "Retry Project", "desc", {})
    db_path = projects_repo.project_db_path(settings, project["id"])
    projects_repo._ensure_project_indexes_once.cache_clear()
    attempts = 0
    real_ensure_project_indexes = projects_repo.ensure_project_indexes

    def flaky_ensure_project_indexes(engine) -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise OperationalError("CREATE INDEX", {}, Exception("database is locked"))
        real_ensure_project_indexes(engine)

    monkeypatch.setattr(projects_repo, "ensure_project_indexes", flaky_ensure_project_indexes)

    projects_repo.project_db_path(settings, project["id"])

    assert attempts == 2


def test_project_db_path_skips_related_example_indexes_when_annotations_table_is_missing(
    settings: Settings,
) -> None:
    project_id = "legacy-project-without-annotations"
    db_path = settings.projects_dir / project_id / "database.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = get_project_engine(str(db_path))
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, meta TEXT, created_at TEXT NOT NULL)"
        )

    projects_repo._ensure_project_indexes_once.cache_clear()

    assert projects_repo.project_db_path(settings, project_id) == db_path
