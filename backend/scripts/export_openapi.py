from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI

from layered_span_studio_backend.api.router import router as api_router


def build_app() -> FastAPI:
    app = FastAPI(title="Layered Span Studio API")
    app.include_router(api_router)
    return app


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: uv run python scripts/export_openapi.py <output-path>", file=sys.stderr)
        return 1

    output_path = Path(sys.argv[1]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    schema = build_app().openapi()
    output_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
