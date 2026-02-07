from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


Meta = Optional[Dict[str, Any]]


class AnnotationStatus(str, Enum):
    pending = "pending"
    verified = "verified"
