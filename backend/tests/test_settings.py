from __future__ import annotations

from pathlib import Path

from layered_span_studio_backend.core.config import Settings


def test_default_data_dir_points_to_backend_data():
    settings = Settings(jwt_secret="test-secret")
    expected = Path(__file__).resolve().parents[1] / "data"
    assert settings.data_dir == expected
