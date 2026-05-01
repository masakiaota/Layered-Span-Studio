#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pydantic-settings>=2.0",
#   "sqlalchemy>=2.0",
# ]
# ///
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


SCRIPT_ID = "script/build_stockmark_ner_import.py"
DATASET_NAME = "stockmark/ner-wikipedia-dataset"
DATASET_VERSION = "2.0"
DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/stockmarkteam/ner-wikipedia-dataset/main/ner.json"
DEFAULT_PROJECT_NAME = "Stockmark NER Wikipedia Dataset"
BACKEND_IMPORT_META = {"format": "layered-span-studio/export", "version": "1.0"}

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"

LABEL_DEFINITIONS = [
    {
        "name": "人名",
        "color": "#D94841",
        "description": "人物の氏名、通称、芸名などに付与する。",
    },
    {
        "name": "法人名",
        "color": "#2F6FED",
        "description": "会社、学校、法人、法人に類する組織名に付与する。",
    },
    {
        "name": "政治的組織名",
        "color": "#7A3E9D",
        "description": "政党、政府組織、行政組織、軍隊、国際組織などに付与する。",
    },
    {
        "name": "その他の組織名",
        "color": "#2B8A3E",
        "description": "競技組織、公演組織、その他の組織名に付与する。",
    },
    {
        "name": "地名",
        "color": "#D97706",
        "description": "国、地域、自治体、自然地名などに付与する。",
    },
    {
        "name": "施設名",
        "color": "#00838F",
        "description": "建物、施設、交通施設、会場などの名称に付与する。",
    },
    {
        "name": "製品名",
        "color": "#C2185B",
        "description": "商品、番組、映画、書籍、楽曲、ブランドなどの名称に付与する。",
    },
    {
        "name": "イベント名",
        "color": "#5D6D7E",
        "description": "事件、催事、大会、キャンペーンなどの名称に付与する。",
    },
]

LABEL_NAMES = {label["name"] for label in LABEL_DEFINITIONS}


@dataclass(frozen=True)
class BuildResult:
    payload: dict[str, Any]
    source_sha256: str
    documents_count: int
    annotations_count: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Stockmark ner-wikipedia-dataset を Layered Span Studio の import JSON に変換し、"
            "必要に応じて backend project として取り込む。"
        )
    )
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL, help="ner.json の取得 URL")
    parser.add_argument(
        "--source-path",
        type=Path,
        help="手元の ner.json を使う場合の path。指定時は --source-url を取得しない。",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "stockmark-ner-wikipedia-import.json",
        help="生成する import JSON の保存先",
    )
    parser.add_argument("--project-name", default=DEFAULT_PROJECT_NAME, help="import JSON 内の project 名")
    parser.add_argument(
        "--backend-data-dir",
        type=Path,
        default=PROJECT_ROOT / "backend" / "data",
        help="backend project を作成する data directory",
    )
    parser.add_argument(
        "--import-backend",
        action="store_true",
        help="生成した JSON を backend project として取り込む",
    )
    parser.add_argument(
        "--replace-script-projects",
        action="store_true",
        help="このスクリプトが以前作成した Stockmark project だけを import 前に削除する",
    )
    parser.add_argument(
        "--document-status",
        choices=["pending", "verified"],
        default="pending",
        help="生成する document の status",
    )
    parser.add_argument(
        "--annotation-status",
        choices=["pending", "verified"],
        default="verified",
        help="生成する annotation の status",
    )
    parser.add_argument("--limit", type=int, help="先頭 N 件だけ変換する。動作確認用。")
    return parser.parse_args()


def read_source_bytes(source_url: str, source_path: Path | None) -> bytes:
    if source_path is not None:
        return source_path.read_bytes()

    request = Request(source_url, headers={"User-Agent": "Layered-Span-Studio-import-script"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def require_dict(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path}: object is required")
    return value


def require_string(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{path}: string is required")
    return value


def require_int(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{path}: integer is required")
    return value


def has_overlap(ranges: list[tuple[int, int]], start: int, end: int) -> bool:
    return any(existing_start < end and existing_end > start for existing_start, existing_end in ranges)


def load_stockmark_records(source_bytes: bytes) -> list[dict[str, Any]]:
    parsed = json.loads(source_bytes.decode("utf-8"))
    if not isinstance(parsed, list):
        raise ValueError("source root: array is required")
    return [require_dict(record, f"records[{index}]") for index, record in enumerate(parsed)]


def build_import_payload(
    records: list[dict[str, Any]],
    *,
    source_kind: str,
    source_reference: str,
    source_sha256: str,
    project_name: str,
    document_status: str,
    annotation_status: str,
    limit: int | None,
) -> BuildResult:
    selected_records = records[:limit] if limit is not None else records
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    documents: list[dict[str, Any]] = []
    annotations_count = 0

    for index, record in enumerate(selected_records):
        path = f"records[{index}]"
        curid = require_string(record.get("curid"), f"{path}.curid")
        text = require_string(record.get("text"), f"{path}.text")
        entities = record.get("entities")
        if not isinstance(entities, list):
            raise ValueError(f"{path}.entities: array is required")

        annotations: list[dict[str, Any]] = []
        ranges_by_label: dict[str, list[tuple[int, int]]] = {}
        for entity_index, entity_value in enumerate(entities):
            entity = require_dict(entity_value, f"{path}.entities[{entity_index}]")
            name = require_string(entity.get("name"), f"{path}.entities[{entity_index}].name")
            label_name = require_string(entity.get("type"), f"{path}.entities[{entity_index}].type")
            if label_name not in LABEL_NAMES:
                raise ValueError(f"{path}.entities[{entity_index}].type: unknown label {label_name!r}")

            span = entity.get("span")
            if not isinstance(span, list) or len(span) != 2:
                raise ValueError(f"{path}.entities[{entity_index}].span: [start, end] is required")
            start = require_int(span[0], f"{path}.entities[{entity_index}].span[0]")
            end = require_int(span[1], f"{path}.entities[{entity_index}].span[1]")
            if start < 0 or end <= start or end > len(text):
                raise ValueError(f"{path}.entities[{entity_index}].span: invalid range [{start}, {end}]")
            if text[start:end] != name:
                raise ValueError(
                    f"{path}.entities[{entity_index}]: span text mismatch: "
                    f"{text[start:end]!r} != {name!r}"
                )

            label_ranges = ranges_by_label.setdefault(label_name, [])
            if has_overlap(label_ranges, start, end):
                raise ValueError(
                    f"{path}.entities[{entity_index}]: overlapping span for the same label {label_name!r}"
                )
            label_ranges.append((start, end))

            annotations.append(
                {
                    "label_name": label_name,
                    "start": start,
                    "end": end,
                    "span_text": name,
                    "comment": "",
                    "status": annotation_status,
                    "meta": {
                        "source_dataset": DATASET_NAME,
                        "source_curid": curid,
                        "source_entity_index": entity_index,
                    },
                }
            )

        annotations_count += len(annotations)
        documents.append(
            {
                "document_name": f"stockmark-ner-{index + 1:05d}-curid-{curid}",
                "text": text,
                "status": document_status,
                "created_at": timestamp,
                "updated_at": timestamp,
                "annotations": annotations,
                "meta": {
                    "source_dataset": DATASET_NAME,
                    "source_curid": curid,
                    "source_record_index": index,
                },
            }
        )

    payload = {
        "project": {
            "name": project_name,
            "description": (
                "Stockmark の Wikipedia 日本語固有表現抽出データセットを "
                "Layered Span Studio の import 形式に変換した project。"
            ),
            "meta": {
                "generated_by": SCRIPT_ID,
                "dataset": DATASET_NAME,
                "dataset_version": DATASET_VERSION,
                "source_kind": source_kind,
                "source_reference": source_reference,
                "source_sha256": source_sha256,
                "source_license": "CC BY-SA 3.0",
                "source_record_count": len(records),
                "converted_record_count": len(selected_records),
                "guideline": (
                    "Wikipedia 文に付与済みの日本語固有表現を確認する。"
                    "ラベルは Stockmark データセットの8分類に従う。"
                ),
            },
        },
        "labels": LABEL_DEFINITIONS,
        "documents": documents,
        "meta": {
            **BACKEND_IMPORT_META,
            "generated_by": SCRIPT_ID,
            "dataset": DATASET_NAME,
            "dataset_version": DATASET_VERSION,
            "source_kind": source_kind,
            "source_reference": source_reference,
            "source_sha256": source_sha256,
        },
    }
    return BuildResult(
        payload=payload,
        source_sha256=source_sha256,
        documents_count=len(documents),
        annotations_count=annotations_count,
    )


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def is_script_generated_stockmark_project(project: dict[str, Any]) -> bool:
    meta = project.get("meta") or {}
    return meta.get("generated_by") == SCRIPT_ID and meta.get("dataset") == DATASET_NAME


def temporary_project_name(base_name: str, existing_names: set[str]) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    candidate = f"{base_name} (rebuild {timestamp})"
    suffix = 2
    while candidate in existing_names:
        candidate = f"{base_name} (rebuild {timestamp}-{suffix})"
        suffix += 1
    return candidate


def import_into_backend(payload: dict[str, Any], data_dir: Path, replace_script_projects: bool) -> dict[str, Any]:
    if str(BACKEND_SRC) not in sys.path:
        sys.path.insert(0, str(BACKEND_SRC))

    from layered_span_studio_backend.core.config import Settings
    from layered_span_studio_backend.repositories import projects as projects_repo
    from layered_span_studio_backend.services import import_export_service

    settings = Settings(data_dir=data_dir, jwt_secret="local-script-secret")

    deleted_project_ids: list[str] = []
    if not replace_script_projects:
        result = import_export_service.import_project_as_new(settings, payload)
        result["deleted_project_ids"] = deleted_project_ids
        return result

    desired_project_name = payload["project"]["name"]
    existing_projects = projects_repo.list_projects(settings)
    existing_names = {project["name"] for project in existing_projects}
    generated_projects = [
        project
        for project in existing_projects
        if project["name"] == desired_project_name and is_script_generated_stockmark_project(project)
    ]
    conflicting_projects = [
        project
        for project in existing_projects
        if project["name"] == desired_project_name and not is_script_generated_stockmark_project(project)
    ]
    if conflicting_projects:
        raise ValueError(
            f"Project name already exists and was not generated by {SCRIPT_ID}: {desired_project_name}"
        )

    import_payload = copy.deepcopy(payload)
    import_payload["project"]["name"] = temporary_project_name(desired_project_name, existing_names)
    result = import_export_service.import_project_as_new(settings, import_payload)
    new_project = result["project"]

    for project in generated_projects:
        if project["id"] == new_project["id"]:
            continue
        if projects_repo.delete_project(settings, project["id"]):
            deleted_project_ids.append(project["id"])

    updated_project = projects_repo.update_project(
        settings,
        new_project["id"],
        desired_project_name,
        new_project.get("description"),
        new_project.get("meta"),
    )
    if updated_project is None:
        raise ValueError("Imported project was not found after creation")

    result["project"] = updated_project
    result["deleted_project_ids"] = deleted_project_ids
    return result


def main() -> int:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        raise ValueError("--limit must be greater than or equal to 1")
    if args.replace_script_projects and not args.import_backend:
        raise ValueError("--replace-script-projects requires --import-backend")

    source_bytes = read_source_bytes(args.source_url, args.source_path)
    source_kind = "path" if args.source_path is not None else "url"
    source_reference = str(args.source_path.resolve()) if args.source_path is not None else args.source_url
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    records = load_stockmark_records(source_bytes)
    result = build_import_payload(
        records,
        source_kind=source_kind,
        source_reference=source_reference,
        source_sha256=source_sha256,
        project_name=args.project_name,
        document_status=args.document_status,
        annotation_status=args.annotation_status,
        limit=args.limit,
    )
    write_json(args.output, result.payload)

    print(f"wrote: {args.output}")
    print(f"source_sha256: {result.source_sha256}")
    print(
        "converted: "
        f"labels={len(LABEL_DEFINITIONS)} "
        f"documents={result.documents_count} "
        f"annotations={result.annotations_count}"
    )

    if args.import_backend:
        import_result = import_into_backend(
            result.payload,
            args.backend_data_dir,
            args.replace_script_projects,
        )
        project = import_result["project"]
        imported = import_result["imported"]
        deleted_project_ids = import_result["deleted_project_ids"]
        print(f"deleted_script_projects: {len(deleted_project_ids)}")
        print(f"imported_project_id: {project['id']}")
        print(f"imported_project_name: {project['name']}")
        print(
            "imported: "
            f"labels={imported['labels']} "
            f"documents={imported['documents']} "
            f"annotations={imported['annotations']}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
