"""Local fixture catalog. Fixtures are JSON, never media uploads."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from brand_forward.errors import UnknownFixture

_FIXTURE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,64}$")
_REQUIRED = ("id", "title", "transcript", "scripted_cloud")


def repo_root() -> Path:
    """Find the brand-forward checkout that holds fixtures/ and engine/."""
    override = os.environ.get("BRAND_FORWARD_ROOT")
    if override:
        return Path(override)
    here = Path(__file__).resolve()
    for parent in here.parents:
        fixture = parent / "fixtures" / "harbor-launch.json"
        package = parent / "engine" / "brand_forward"
        if fixture.is_file() and package.is_dir():
            return parent
    return here.parents[2]


def fixtures_dir() -> Path:
    return repo_root() / "fixtures"


def load_fixture(fixture_id: str) -> dict:
    """Load one fixture document. The id is a single safe filename stem."""
    if not _FIXTURE_ID.fullmatch(fixture_id or ""):
        raise UnknownFixture("unknown fixture")
    path = fixtures_dir() / "{0}.json".format(fixture_id)
    if not path.is_file():
        raise UnknownFixture("unknown fixture")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise UnknownFixture("unknown fixture") from exc
    if not isinstance(data, dict) or data.get("id") != fixture_id:
        raise UnknownFixture("unknown fixture")
    missing = [key for key in _REQUIRED if key not in data]
    if missing:
        raise UnknownFixture("unknown fixture")
    return data
