from __future__ import annotations

import uuid
from typing import Any, Dict, List, Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.engine import Connection, RowMapping

from layered_span_studio_backend.storage.project_db import labels_table
from layered_span_studio_backend.utils.json_utils import encode_meta


def ensure_label_display_order_column(conn: Connection, project_id: str | None = None) -> None:
    columns = {row["name"] for row in conn.exec_driver_sql("PRAGMA table_info(labels)").mappings()}
    if "display_order" not in columns:
        try:
            conn.exec_driver_sql("ALTER TABLE labels ADD COLUMN display_order INTEGER")
        except OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise

    query = select(labels_table).where(labels_table.c.display_order.is_(None))
    if project_id is not None:
        query = query.where(labels_table.c.project_id == project_id)
    rows = conn.execute(query.order_by(labels_table.c.name.asc(), labels_table.c.id.asc())).mappings().all()
    next_order_by_project: dict[str, int] = {}
    for row in rows:
        row_project_id = row["project_id"]
        if row_project_id not in next_order_by_project:
            current_max = conn.execute(
                select(func.max(labels_table.c.display_order)).where(
                    labels_table.c.project_id == row_project_id,
                    labels_table.c.display_order.is_not(None),
                )
            ).scalar_one()
            next_order_by_project[row_project_id] = int(current_max) + 1 if current_max is not None else 0
        display_order = next_order_by_project[row_project_id]
        conn.execute(
            labels_table.update()
            .where(labels_table.c.id == row["id"])
            .values(display_order=display_order)
        )
        next_order_by_project[row_project_id] = display_order + 1


def next_label_display_order(conn: Connection, project_id: str) -> int:
    ensure_label_display_order_column(conn, project_id)
    current_max = conn.execute(
        select(func.max(labels_table.c.display_order)).where(labels_table.c.project_id == project_id)
    ).scalar_one()
    return int(current_max) + 1 if current_max is not None else 0


def load_label_rows(conn: Connection, project_id: str) -> Sequence[RowMapping]:
    ensure_label_display_order_column(conn, project_id)
    return conn.execute(
        select(labels_table)
        .where(labels_table.c.project_id == project_id)
        .order_by(labels_table.c.display_order.asc(), labels_table.c.name.asc(), labels_table.c.id.asc())
    ).mappings().all()


def sync_labels(
    conn: Connection,
    project_id: str,
    items: List[Dict[str, Any]],
    existing_rows: Sequence[RowMapping] | None = None,
) -> None:
    ensure_label_display_order_column(conn, project_id)
    rows = list(existing_rows) if existing_rows is not None else list(load_label_rows(conn, project_id))
    existing_ids = {row["id"] for row in rows}
    requested_ids = {item["id"] for item in items if item.get("id")}
    unknown_ids = requested_ids - existing_ids
    if unknown_ids:
        raise ValueError("Label not found")

    omitted_ids = existing_ids - requested_ids
    if omitted_ids:
        conn.execute(
            labels_table.delete().where(
                labels_table.c.project_id == project_id,
                labels_table.c.id.in_(sorted(omitted_ids)),
            )
        )

    for display_order, item in enumerate(items):
        label_id = item.get("id")
        if label_id:
            conn.execute(
                labels_table.update()
                .where(
                    labels_table.c.project_id == project_id,
                    labels_table.c.id == label_id,
                )
                .values(
                    name=item["name"],
                    color=item["color"],
                    description=item["description"],
                    shortcut=item.get("shortcut"),
                    meta=encode_meta(item.get("meta")),
                    display_order=display_order,
                )
            )
            continue

        conn.execute(
            labels_table.insert().values(
                id=str(uuid.uuid4()),
                project_id=project_id,
                name=item["name"],
                color=item["color"],
                description=item["description"],
                shortcut=item.get("shortcut"),
                meta=encode_meta(item.get("meta")),
                display_order=display_order,
            )
        )
