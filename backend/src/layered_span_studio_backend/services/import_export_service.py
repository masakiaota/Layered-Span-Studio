from __future__ import annotations

from typing import Any, Dict, List

from layered_span_studio_backend.core.config import Settings
from layered_span_studio_backend.repositories import annotations as annotations_repo
from layered_span_studio_backend.repositories import documents as documents_repo
from layered_span_studio_backend.repositories import labels as labels_repo
from layered_span_studio_backend.repositories import projects as projects_repo

EXPORT_META = {"format": "layered-span-studio/export", "version": "1.0"}


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
    documents, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
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

    incoming_project = payload.get("project") or {}
    incoming_labels: List[Dict[str, Any]] = payload.get("labels") or []
    incoming_documents: List[Dict[str, Any]] = payload.get("documents") or []
    incoming_meta: Dict[str, Any] = payload.get("meta") or {}

    if incoming_meta:
        if incoming_meta.get("format") not in {None, EXPORT_META["format"]}:
            raise ValueError("Invalid import format")
        if incoming_meta.get("version") not in {None, EXPORT_META["version"]}:
            raise ValueError("Unsupported import version")

    # Validate label conflicts and duplicates
    existing_labels = labels_repo.list_labels(settings, project_id)
    existing_label_by_name = {label["name"]: label for label in existing_labels}
    incoming_label_names = [label["name"] for label in incoming_labels]

    if len(set(incoming_label_names)) != len(incoming_label_names):
        raise ValueError("Duplicate label names in import payload")

    if any(name in existing_label_by_name for name in incoming_label_names):
        raise ValueError("Label name already exists in this project")

    # Validate document name conflicts and duplicates
    existing_documents, _ = documents_repo.list_documents(settings, project_id, 0, 1000000)
    existing_document_names = {doc["document_name"] for doc in existing_documents}
    incoming_document_names = [doc["document_name"] for doc in incoming_documents]

    if len(set(incoming_document_names)) != len(incoming_document_names):
        raise ValueError("Duplicate document names in import payload")

    if any(name in existing_document_names for name in incoming_document_names):
        raise ValueError("Document name already exists in this project")

    # Validate annotations referencing labels and span_text
    label_names_set = set(existing_label_by_name.keys()) | set(incoming_label_names)
    for doc in incoming_documents:
        text = doc.get("text", "")
        for ann in doc.get("annotations", []):
            label_name = ann.get("label_name")
            if label_name not in label_names_set:
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

    # Update project metadata
    projects_repo.update_project(
        settings,
        project_id,
        incoming_project.get("name"),
        incoming_project.get("description"),
        incoming_project.get("meta"),
    )

    # Create labels
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

    # Create documents and annotations
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

    counts = {
        "labels": len(incoming_labels),
        "documents": len(incoming_documents),
        "annotations": sum(len(doc.get("annotations", [])) for doc in incoming_documents),
    }
    return {"imported": counts, "errors": []}
