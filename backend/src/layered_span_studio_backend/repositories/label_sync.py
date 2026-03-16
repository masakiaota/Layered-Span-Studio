from __future__ import annotations

import uuid
from typing import Any, Dict, List, Sequence

from sqlalchemy import select
from sqlalchemy.engine import Connection, RowMapping

from layered_span_studio_backend.storage.project_db import labels_table
from layered_span_studio_backend.utils.json_utils import encode_meta


def load_label_rows(conn: Connection, project_id: str) -> Sequence[RowMapping]:
    return conn.execute(
        select(labels_table).where(labels_table.c.project_id == project_id)
    ).mappings().all()


def sync_labels(
    conn: Connection,
    project_id: str,
    items: List[Dict[str, Any]],
    existing_rows: Sequence[RowMapping] | None = None,
) -> None:
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

    for item in items:
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
            )
        )
