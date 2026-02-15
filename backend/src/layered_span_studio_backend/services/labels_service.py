from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo


def _ensure_project(settings: Settings, project_id: str) -> None:
    if not projects_repo.get_project(settings, project_id):
        raise ValueError("Project not found")


def list_labels(settings: Settings, project_id: str) -> List[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    return labels_repo.list_labels(settings, project_id)


def get_label(settings: Settings, project_id: str, label_id: str) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    return labels_repo.get_label(settings, project_id, label_id)


def create_label(
    settings: Settings,
    project_id: str,
    name: str,
    color: str,
    description: str,
    shortcut: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    _ensure_project(settings, project_id)
    if labels_repo.get_label_by_name(settings, project_id, name):
        raise ValueError("Label name already exists in this project")
    return labels_repo.create_label(settings, project_id, name, color, description, shortcut, meta)


def update_label(
    settings: Settings,
    project_id: str,
    label_id: str,
    name: Optional[str],
    color: Optional[str],
    description: Optional[str],
    shortcut: Optional[str],
    meta: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    _ensure_project(settings, project_id)
    if name is not None:
        existing = labels_repo.get_label_by_name(settings, project_id, name)
        if existing and existing["id"] != label_id:
            raise ValueError("Label name already exists in this project")
    return labels_repo.update_label(
        settings, project_id, label_id, name, color, description, shortcut, meta
    )


def delete_label(settings: Settings, project_id: str, label_id: str) -> bool:
    _ensure_project(settings, project_id)
    return labels_repo.delete_label(settings, project_id, label_id)


def list_label_examples(
    settings: Settings,
    project_id: str,
    label_id: str,
    offset: int,
    limit: int,
    status_filter: str,
    sample: str,
    seed: Optional[int],
    context_window: int,
) -> Dict[str, Any]:
    _ensure_project(settings, project_id)
    if not labels_repo.get_label(settings, project_id, label_id):
        raise ValueError("Label not found")

    statuses = ["pending", "verified"] if status_filter == "all" else [status_filter]
    rows = labels_repo.list_label_examples(settings, project_id, label_id, statuses)
    total_matched = len(rows)

    if sample == "random":
        picked = rows[:]
        random.Random(seed).shuffle(picked)
        picked = picked[:limit]
        offset_applied = 0
    else:
        picked = rows[offset : offset + limit]
        offset_applied = offset

    examples: List[Dict[str, Any]] = []
    for row in picked:
        text = row["document_text"]
        start = row["start"]
        end = row["end"]
        before_start = max(0, start - context_window)
        after_end = min(len(text), end + context_window)
        examples.append(
            {
                "annotation_id": row["annotation_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "span_text": row["span_text"],
                "start": start,
                "end": end,
                "status": row["status"],
                "context_before": text[before_start:start],
                "context_after": text[end:after_end],
            }
        )

    return {
        "examples": examples,
        "total_matched": total_matched,
        "offset_applied": offset_applied,
        "limit": limit,
        "status": status_filter,
        "sample": sample,
        "seed": seed,
        "context_window": context_window,
    }
