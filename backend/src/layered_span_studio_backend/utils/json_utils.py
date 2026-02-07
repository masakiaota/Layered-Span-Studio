from __future__ import annotations

import json
from typing import Any, Dict, Optional


def encode_meta(meta: Optional[Dict[str, Any]]) -> Optional[str]:
    if meta is None:
        return None
    return json.dumps(meta, ensure_ascii=True)


def decode_meta(value: Optional[str]) -> Dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {}
