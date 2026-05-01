from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import bulk_import as bulk_import_repo
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo

EXPORT_META = {"format": "layered-span-studio/export", "version": "1.0"}


def _has_overlap(existing_ranges: List[tuple[int, int]], start: int, end: int) -> bool:
    return any(existing_start < end and existing_end > start for existing_start, existing_end in existing_ranges)


def _extract_import_payload(
    payload: Any,
) -> tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    payload_dict = _require_import_dict(payload, "Import payload must be an object")
    incoming_project = _require_import_dict(payload_dict.get("project"), "Project payload must be an object")
    incoming_labels = _require_import_list(
        payload_dict.get("labels"),
        "Labels payload must be an array",
    )
    incoming_documents = _require_import_list(
        payload_dict.get("documents"),
        "Documents payload must be an array",
    )
    raw_meta = payload_dict.get("meta")
    incoming_meta = {} if raw_meta is None else _require_import_dict(
        raw_meta,
        "Import metadata must be an object",
    )
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


def _parse_import_timestamp(value: Any, path: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path}: timezone-aware ISO 8601 timestamp is required")

    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{path}: timezone-aware ISO 8601 timestamp is required") from exc

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{path}: timezone-aware ISO 8601 timestamp is required")

    return parsed.astimezone(timezone.utc)


def _format_import_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_import_labels(incoming_labels: List[Dict[str, Any]]) -> None:
    for label in incoming_labels:
        label_payload = _require_import_dict(label, "Each label must be an object")
        _require_non_empty_string(label_payload.get("name"), "Label name is required")
        _require_non_empty_string(label_payload.get("color"), "Label color is required")
        _require_string(label_payload.get("description"), "Label description is required")


def _normalize_and_validate_import_documents(
    incoming_documents: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    normalized_documents: List[Dict[str, Any]] = []

    for index, doc in enumerate(incoming_documents):
        doc_payload = _require_import_dict(doc, "Each document must be an object")
        _require_non_empty_string(doc_payload.get("document_name"), "Document name is required")
        _require_string(doc_payload.get("text"), "Document text is required")
        status = doc_payload.get("status")
        if status not in {"pending", "verified"}:
            raise ValueError("Document status is required")
        created_at = _parse_import_timestamp(
            doc_payload.get("created_at"),
            f"documents[{index}].created_at",
        )
        updated_at = _parse_import_timestamp(
            doc_payload.get("updated_at"),
            f"documents[{index}].updated_at",
        )
        if updated_at < created_at:
            raise ValueError(
                f"documents[{index}].updated_at: must be greater than or equal to created_at"
            )
        annotations = doc_payload.get("annotations", [])
        for ann in _require_import_list(annotations, "Document annotations must be an array"):
            ann_payload = _require_import_dict(ann, "Each annotation must be an object")
            _require_non_empty_string(ann_payload.get("label_name"), "Annotation label_name is required")
            _require_integer(ann_payload.get("start"), "Annotation start must be an integer")
            _require_integer(ann_payload.get("end"), "Annotation end must be an integer")
            _require_string(ann_payload.get("span_text"), "Annotation span_text is required")

        normalized_documents.append(
            {
                **doc_payload,
                "created_at": _format_import_timestamp(created_at),
                "updated_at": _format_import_timestamp(updated_at),
            }
        )

    return normalized_documents


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
) -> List[Dict[str, Any]]:
    _validate_import_meta(incoming_meta)
    _validate_import_labels(incoming_labels)
    normalized_documents = _normalize_and_validate_import_documents(incoming_documents)

    incoming_label_names = [label["name"] for label in incoming_labels]
    _validate_name_conflicts(
        incoming_label_names,
        set(existing_label_by_name.keys()),
        "Duplicate label names in import payload",
        "Label name already exists in this project",
    )

    incoming_document_names = [doc["document_name"] for doc in normalized_documents]
    _validate_name_conflicts(
        incoming_document_names,
        existing_document_names,
        "Duplicate document names in import payload",
        "Document name already exists in this project",
    )

    label_names_set = set(existing_label_by_name.keys()) | set(incoming_label_names)
    _validate_annotations(normalized_documents, label_names_set)
    return normalized_documents


def _build_import_counts(
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
) -> Dict[str, int]:
    return {
        "labels": len(incoming_labels),
        "documents": len(incoming_documents),
        "annotations": sum(len(doc.get("annotations", [])) for doc in incoming_documents),
    }


def _build_payload_counts(
    incoming_labels: Any,
    incoming_documents: Any,
) -> Dict[str, int]:
    if not isinstance(incoming_labels, list):
        incoming_labels = []
    if not isinstance(incoming_documents, list):
        incoming_documents = []

    annotation_count = 0
    for doc in incoming_documents:
        if not isinstance(doc, dict):
            continue
        annotations = doc.get("annotations")
        if isinstance(annotations, list):
            annotation_count += len(annotations)

    return {
        "labels": len(incoming_labels),
        "documents": len(incoming_documents),
        "annotations": annotation_count,
    }


def _preflight_error_response(
    counts: Dict[str, int],
    message: str,
    *,
    resolved_project_name: str | None = None,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "ok": False,
        "imported": counts,
        "errors": [{"message": message}],
    }
    if resolved_project_name is not None:
        result["resolved_project_name"] = resolved_project_name
    return result


def _import_entities(
    settings: Settings,
    project_id: str,
    existing_label_by_name: Dict[str, Dict[str, Any]],
    incoming_labels: List[Dict[str, Any]],
    incoming_documents: List[Dict[str, Any]],
) -> Dict[str, int]:
    bulk_import_repo.import_entities(
        settings,
        project_id,
        existing_label_by_name,
        incoming_labels,
        incoming_documents,
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
    documents = documents_repo.list_all_documents(settings, project_id)
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


def preflight_import_project(settings: Settings, project_id: str, payload: Any) -> Dict[str, Any]:
    project = projects_repo.get_project(settings, project_id)
    if not project:
        raise ValueError("Project not found")

    raw_labels = payload.get("labels") if isinstance(payload, dict) else None
    raw_documents = payload.get("documents") if isinstance(payload, dict) else None
    fallback_counts = _build_payload_counts(raw_labels, raw_documents)

    try:
        _, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    except ValueError as exc:
        return _preflight_error_response(fallback_counts, str(exc))

    existing_labels = labels_repo.list_labels(settings, project_id)
    existing_label_by_name = {label["name"]: label for label in existing_labels}
    existing_document_names = set(documents_repo.list_document_names(settings, project_id))

    try:
        normalized_documents = _validate_import_payload(
            existing_label_by_name,
            existing_document_names,
            incoming_labels,
            incoming_documents,
            incoming_meta,
        )
    except ValueError as exc:
        return _preflight_error_response(fallback_counts, str(exc))

    return {
        "ok": True,
        "imported": _build_import_counts(incoming_labels, normalized_documents),
        "errors": [],
    }


def preflight_import_project_as_new(settings: Settings, payload: Any) -> Dict[str, Any]:
    raw_labels = payload.get("labels") if isinstance(payload, dict) else None
    raw_documents = payload.get("documents") if isinstance(payload, dict) else None
    fallback_counts = _build_payload_counts(raw_labels, raw_documents)

    try:
        incoming_project, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    except ValueError as exc:
        return _preflight_error_response(fallback_counts, str(exc))

    try:
        normalized_documents = _validate_import_payload(
            {}, set(), incoming_labels, incoming_documents, incoming_meta
        )
    except ValueError as exc:
        return _preflight_error_response(fallback_counts, str(exc))

    try:
        resolved_project_name = _resolve_imported_project_name(settings, incoming_project.get("name"))
    except ValueError as exc:
        return _preflight_error_response(fallback_counts, str(exc))

    return {
        "ok": True,
        "resolved_project_name": resolved_project_name,
        "imported": _build_import_counts(incoming_labels, normalized_documents),
        "errors": [],
    }


def import_project(settings: Settings, project_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    project = projects_repo.get_project(settings, project_id)
    if not project:
        raise ValueError("Project not found")

    _, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    existing_labels = labels_repo.list_labels(settings, project_id)
    existing_label_by_name = {label["name"]: label for label in existing_labels}
    existing_document_names = set(documents_repo.list_document_names(settings, project_id))
    normalized_documents = _validate_import_payload(
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
        normalized_documents,
    )
    return {"imported": counts, "errors": []}


def import_project_as_new(settings: Settings, payload: Dict[str, Any]) -> Dict[str, Any]:
    incoming_project, incoming_labels, incoming_documents, incoming_meta = _extract_import_payload(payload)
    normalized_documents = _validate_import_payload(
        {}, set(), incoming_labels, incoming_documents, incoming_meta
    )

    project = projects_repo.create_project(
        settings,
        _resolve_imported_project_name(settings, incoming_project.get("name")),
        incoming_project.get("description"),
        incoming_project.get("meta"),
    )
    try:
        counts = _import_entities(settings, project["id"], {}, incoming_labels, normalized_documents)
    except Exception:
        projects_repo.delete_project(settings, project["id"])
        raise
    return {"project": project, "imported": counts, "errors": []}
