"""Export guard for the anonymized metadata proxy.

The proxy is the only document that may leave the workstation. It may carry
track ids, timecodes, redaction flags, language tags, and hashes. It may not
carry raw frames, pixel buffers, file bytes, or filesystem paths.
"""

from __future__ import annotations

from typing import Any

from brand_forward.errors import ProxyLeakage

_FORBIDDEN_KEY_PARTS = (
    "path",
    "pixel",
    "filepath",
    "filename",
    "uri",
    "url",
    "raw_frame",
    "frame_bytes",
    "file_bytes",
    "bytes",
    "png",
    "mp4",
    "seed",
    "private",
)

_FORBIDDEN_SUBSTRINGS = (
    "/",
    "\\",
    "..",
    "file:",
    "data:image",
    ".mp4",
    ".png",
    ".jpg",
    ".jpeg",
    ".wav",
    ".mov",
    "Users",
    "fixtures",
    "private_qa",
    "node_key",
    "engine",
    "home",
)


def find_leakage(value: Any) -> list[str]:
    """Return guard codes for anything that must not leave the machine."""
    found: list[str] = []
    _walk(value, "$", found)
    return found


def assert_export_safe(value: Any) -> None:
    """Raise ProxyLeakage when the value is not a safe proxy."""
    problems = find_leakage(value)
    if problems:
        raise ProxyLeakage(problems)


def _walk(value: Any, where: str, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                found.append("{0}:non-string-key".format(where))
                continue
            lowered = key.lower()
            if any(part in lowered for part in _FORBIDDEN_KEY_PARTS):
                found.append("{0}.{1}:forbidden-key".format(where, key))
            _walk(item, "{0}.{1}".format(where, key), found)
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _walk(item, "{0}[{1}]".format(where, index), found)
        return
    if isinstance(value, (bytes, bytearray)):
        found.append("{0}:raw-bytes".format(where))
        return
    if isinstance(value, str):
        if any(marker in value for marker in _FORBIDDEN_SUBSTRINGS):
            found.append("{0}:forbidden-substring".format(where))
        if len(value) >= 128 and _looks_like_base64_blob(value):
            found.append("{0}:opaque-blob".format(where))
        return
    if value is None or isinstance(value, (bool, int, float)):
        return
    found.append("{0}:unsupported-type".format(where))


def _looks_like_base64_blob(value: str) -> bool:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
    return len(value) >= 128 and all(character in alphabet for character in value)
