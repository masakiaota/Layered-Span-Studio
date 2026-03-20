from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import tomllib

PACKAGE_NAME = "layered-span-studio-backend"
FALLBACK_VERSION = "0.0.0"


def get_app_version() -> str:
    try:
        return version(PACKAGE_NAME)
    except PackageNotFoundError:
        pyproject_path = Path(__file__).resolve().parents[3] / "pyproject.toml"
        if not pyproject_path.exists():
            return FALLBACK_VERSION
        pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        return pyproject.get("project", {}).get("version", FALLBACK_VERSION)
