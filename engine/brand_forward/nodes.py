"""Local node record plus an optional infra/nodes.json written by the probe script."""

from __future__ import annotations

import json
import platform
from pathlib import Path

from brand_forward import NODE_ID
from brand_forward.adapters import report


def local_node() -> dict:
    return {
        "id": NODE_ID,
        "name": "This Mac (Apple M5 Max)",
        "kind": "workstation",
        "role": "local-engine",
        "source": "this-process",
        "platform": "{0} {1}".format(platform.system(), platform.machine()),
        "accelerator": "apple-m5-max",
        "intended_accelerator": "nvidia-rtx-pro-6000-blackwell",
        "intended_host": "lenovo-thinkstation-p8",
        "online": True,
        "raw_media_leaves_machine": False,
        "capabilities": report(),
    }


def _coerce(payload: object) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("nodes", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError("unrecognized nodes document")


def list_nodes(infra_path: Path) -> dict:
    """Always include this process. Tolerate a missing or unreadable infra file."""
    local = local_node()
    warning = None
    extras: list = []
    if infra_path.is_file():
        try:
            raw_nodes = _coerce(json.loads(infra_path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, ValueError, UnicodeError):
            warning = "infra/nodes.json was ignored because it could not be read"
            raw_nodes = []
        for item in raw_nodes:
            if not isinstance(item, dict):
                continue
            node_id = item.get("id")
            if not isinstance(node_id, str) or not node_id or node_id == local["id"]:
                continue
            extras.append(dict(item))
    result = {"nodes": [local, *extras]}
    if warning:
        result["warning"] = warning
    return result
