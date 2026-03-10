from __future__ import annotations

import re


_NORMALIZE_SEARCH_PATTERN = re.compile(r"[_\-\s]+")


def normalize_search_text(value: str) -> str:
    return _NORMALIZE_SEARCH_PATTERN.sub(" ", value.strip()).lower()
