"""Deterministic JSON for Ed25519 receipts.

Lexicographic keys,
no insignificant whitespace, UTF-8, and integral floats collapsed to integers
so a later language round-trip cannot change the signed bytes. Unknown types
are rejected instead of being stringified, which would hide a path or object.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _normalize(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("non-finite numbers cannot be canonicalized")
        if value.is_integer():
            return int(value)
        return value
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("canonical JSON object keys must be strings")
        return {key: _normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    raise ValueError("unsupported canonical type: {0}".format(type(value).__name__))


def canonicalize(value: Any) -> bytes:
    """Return the signed byte string for a JSON-compatible value."""
    normalized = _normalize(value)
    encoded = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )
    return encoded.encode("utf-8")


def sha256_canonical(value: Any) -> str:
    """Lowercase hex SHA-256 of the canonical JSON bytes."""
    return hashlib.sha256(canonicalize(value)).hexdigest()
