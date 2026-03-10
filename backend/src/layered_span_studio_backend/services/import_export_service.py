from __future__ import annotations

from typing import Any, Dict, List

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import annotations as annotations_repo
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo

EXPORT_META = {"format": "layered-span-studio/export", "version": "1.0"}


def _has_overlap(existing_ranges: List[tuple[int, int]], start: int, end: int) -> bool:
    return any(existing_start < end and existing_end > start for existing_start, existing_end in existing_ranges)


def _extract_import_payload(
    payload: Dict[str, Any],
) -> tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    incoming_project = payload.get("project") or {}
    incoming_labels: List[Dict[str, Any]] = payload.get("labels") or []
    incoming_documents: List[Dict[str, Any]] = payload.get("documents") or []
    incoming_meta: Dict[str, Any] = payload.get("meta") or {}
    return incoming_project, incoming_labels, incoming_documents, incoming_meta


def _validate_import_meta(incoming_meta: Dict[str, Any]) -> None:
    if incoming_meta.get("format") not in {None, EXPORT_META["format"]}:
        raise ValueError("Invalid import format")
    if incoming_meta.get("version") not in {None, EXPORT_META["version"]}:
        raise ValueError("Unsupported import version")


def _require_import_dict(value: Any, message: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(message)
    return value


def _require_import_list(value: Any, message: str) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        raise ValueError(message)
    return value


def _require_non_empty_string(value: Any, message: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(message)
    return value


def _require_string(value: Any, message: str) -> str:
    if not isinstance(value, str):
        raise ValueError(message)
    return value


def _require_integer(value: Any, message: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(message)
    return value


def _validate_import_labels(incoming_labels: List[Dict[str, Any]]) -> None:
    for label in incoming_labels:
        label_payload = _require_import_dict(label, "Each label must be an object")
        _require_non_empty_string(label_payload.get("name"), "Label name is required")
        _require_non_empty_string(label_payload.get("color"), "Label color is required")
        _require_string(label_payload.get("description"), "Label description is required")


def _validate_import_documents(incoming_documents: List[Dict[str, Any]]) -> None:
    for doc in incoming_documents:
        doc_payload = _require_import_dict(doc, "Each document must be an object")
        _require_non_empty_string(doc_payload.get("document_name"), "Document name is required")
        _require_string(doc_payload.get("text"), "Document text is required")
        annotations = doc_payload.get("annotations", [])
        for ann in _require_import_list(annotations, "Document annotations must be an array"):
            ann_payload = _require_import_dict(ann, "Each annotation must be an object")
            _require_non_empty_string(ann_payload.get("label_name"), "Annotation label_name is required")
            _require_integer(ann_payload.get("start"), "Annotation start must be an integer")
            _require_integer(ann_payload.get("end"), "Annotation end must be an integer")
            _require_string(ann_payload.get("span_text"), "Annotation span_text is required")


def _validate_name_conflicts(
    incoming_names: List[str],
    existing_names: set[str],
    duplicate_message: str,
    conflict_message: str,
) -> None:
    if len(set(incoming_names)) != len(incoming_names):
        raise ValueError(duplicate_message)
    if any(name in existing_names for name in incoming_names):
        raise ValueError(conflict_message)


def _validate_annotations(
    incoming_documents: List[Dict[str, Any]],
    allowed_label_names: set[str],
) -> None:
    for doc in incoming_documents:
        text = doc.get("text", "")
        ranges_by_label_name: Dict[str, List[tuple[int, int]]] = {}
        for ann in doc.get("annotations", []):
            label_name = ann.get("label_name")
            if label_name not in allowed_label_names:
                raise ValueError("Annotation refers to unknown label_name")
            start = ann.get("start")
            end = ann.get("end")
            span_text = ann.get("span_text")
            if start is None or end is None or span_text is None:
                raise ValueError("Annotation span is incomplete")
            if text[start:end] != span_text:
                raise ValueError("span_text does not match the specified range")
            status = ann.get("status")
            if status not in {"pending", "verified"}:
                raise ValueError("Invalid annotation status")
            label_ranges = ranges_by_label_name.setdefault(label_name, [])
            if _has_overlap(label_ranges, start, end):
                raise ValueError("Overlapping annotation span for the same label is not allowed")
            label_ranges.append((start, end))


def _validate_import_payload(
    existing_label_by_name: Dict[str, Dict[str, Any]],
    existing_document_names: set[str],
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
    incoming_meta: Dict[str, Any],
) -> None:
    _validate_import_meta(incoming_meta)
    _validate_import_labels(incoming_labels)
    _validate_import_documents(incoming_documents)

    incoming_label_names = [label["name"] for label in incoming_labels]
    _validate_name_conflicts(
        incoming_label_names,
        set(existing_label_by_name.keys()),
        "Duplicate label names in import payload",
        "Label name already exists in this project",
    )

    incoming_document_names = [doc["document_name"] for doc in incoming_documents]
    _validate_name_conflicts(
        incoming_document_names,
        existing_document_names,
        "Duplicate document names in import payload",
        "Document name already exists in this project",
    )

    label_names_set = set(existing_label_by_name.keys()) | set(incoming_label_names)
    _validate_annotations(incoming_documents, label_names_set)


def _build_import_counts(
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
) -> Dict[str, int]:
    return {
        "labels": len(incoming_labels),
        "documents": len(incoming_documents),
        "annotations": sum(len(doc.get("annotations", [])) for doc in incoming_documents),
    }


def _import_entities(
    settings: Settings,
    project_id: str,
    existing_label_by_name: Dict[str, Dict[str, Any]],
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
) -> Dict[str, int]:
    label_id_by_name: Dict[str, str] = {
        name: label["id"] for name, label in existing_label_by_name.items()
    }
    for label in incoming_labels:
        created = labels_repo.create_label(
            settings,
            project_id,
            label["name"],
            label["color"],
            label["description"],
            label.get("shortcut"),
            label.get("meta"),
        )
        label_id_by_name[created["name"]] = created["id"]

    for doc in incoming_documents:
        created_doc = documents_repo.create_document(
            settings,
            project_id,
            doc["document_name"],
            doc["text"],
            doc.get("meta"),
        )
        for ann in doc.get("annotations", []):
            annotations_repo.create_annotation(
                settings,
                project_id,
                created_doc["id"],
                label_id_by_name[ann["label_name"]],
                ann["start"],
                ann["end"],
                ann["span_text"],
                ann.get("comment", ""),
                ann["status"],
                ann.get("meta"),
            )

    return _build_import_counts(incoming_labels, incoming_documents)


def _resolve_imported_project_name(settings: Settings, name: Any) -> str:
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Project name is required")

    base_name = name.strip()
    existing_names = {project["name"] for project in projects_repo.list_projects(settings)}
    if base_name not in existing_names:
        return base_name

    candidate = f"{base_name} (imported)"
    suffix = 2
    while candidate in existing_names:
        candidate = f"{base_name} (imported {suffix})"
        suffix += 1
    return candidate


def export_project(
    settings: Settings,
    project_id: str,
    include_pending: bool = True,
    include_verified: bool = True,
) -> Dict[str, Any]:
    project = projects_repo.get_project(settings, project_id)
    if not project:
        raise ValueError("Project not found")

    labels = labels_repo.list_labels(settings, project_id)
    documents, _, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
    allowed_statuses = set()
    if include_pending:
        allowed_statuses.add("pending")
    if include_verified:
        allowed_statuses.add("verified")
    for doc in documents:
        annotations = documents_repo.list_document_annotations(settings, project_id, doc["id"])
        if allowed_statuses:
            annotations = [ann for ann in annotations if ann["status"] in allowed_statuses]
        else:
            annotations = []
        doc["annotations"] = annotations

    return {"project": project, "labels": labels, "documents": documents, "meta": EXPORT_META}


def import_project(settings: Settings, project_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    project = projects_repo.get_project(settings, project_id)
    if not project:
        raise ValueError("Project not found")

    _, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    existing_labels = labels_repo.list_labels(settings, project_id)
    existing_label_by_name = {label["name"]: label for label in existing_labels}
    existing_documents, _, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
    existing_document_names = {doc["document_name"] for doc in existing_documents}
    _validate_import_payload(
        existing_label_by_name,
        existing_document_names,
        incoming_labels,
        incoming_documents,
        incoming_meta,
    )

    counts = _import_entities(
        settings,
        project_id,
        existing_label_by_name,
        incoming_labels,
        incoming_documents,
    )
    return {"imported": counts, "errors": []}


def import_project_as_new(settings: Settings, payload: Dict[str, Any]) -> Dict[str, Any]:
    incoming_project, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    _validate_import_payload({}, set(), incoming_labels, incoming_documents, incoming_meta)

    project = projects_repo.create_project(
        settings,
        _resolve_imported_project_name(settings, incoming_project.get("name")),
        incoming_project.get("description"),
        incoming_project.get("meta"),
    )
    try:
        counts = _import_entities(settings, project["id"], {}, incoming_labels, incoming_documents)
    except Exception:
        projects_repo.delete_project(settings, project["id"])
        raise
    return {"project": project, "imported": counts, "errors": []}
