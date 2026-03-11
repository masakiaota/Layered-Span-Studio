from __future__ import annotations

import argparse
from pathlib import Path

from layered_span_studio_backend.storage.document_system_fields_migration import (
    migrate_projects_dir,
    summarize_migration,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate document status/created_at/updated_at from meta JSON to dedicated columns."
    )
    parser.add_argument(
        "--projects-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "projects",
        help="Directory containing project database folders",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    results = migrate_projects_dir(args.projects_dir)
    summary = summarize_migration(results)
    print(
        f"migrated {summary['databases']} database(s), updated {summary['updated_rows']} document row(s)"
    )
    for db_path, updated_rows in results:
        print(f"{db_path}: {updated_rows} row(s) updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
