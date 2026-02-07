from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    data_dir: Path = Path(__file__).resolve().parents[3] / "data"
    jwt_secret: str
    jwt_expires_in: int = 28800
    cors_allow_origins: List[str] = ["*"]

    @property
    def app_db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"


@lru_cache
def get_settings() -> Settings:
    return Settings()
