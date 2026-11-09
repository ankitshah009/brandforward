"""JSON job store under the engine data directory."""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from brand_forward.errors import JobNotFound

_JOB_ID = re.compile(r"^job_[0-9a-f]{16}$")
_HIDDEN_KEYS = {"local_path", "seed_b64", "private_key", "seed"}


class JobStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.jobs_dir = root / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def path_for(self, job_id: str) -> Path:
        if not _JOB_ID.fullmatch(job_id or ""):
            raise JobNotFound("job not found")
        return self.jobs_dir / job_id / "job.json"

    def job_dir(self, job_id: str) -> Path:
        return self.path_for(job_id).parent

    def reserve(self, job_id: str) -> Path:
        directory = self.job_dir(job_id)
        directory.mkdir(parents=True, exist_ok=False)
        return directory

    def save(self, job: dict) -> None:
        path = self.path_for(job["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(job, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        temporary = path.with_suffix(".json.tmp")
        with self._lock:
            temporary.write_text(payload, encoding="utf-8")
            temporary.replace(path)

    def load(self, job_id: str) -> dict:
        path = self.path_for(job_id)
        if not path.is_file():
            raise JobNotFound("job not found")
        return json.loads(path.read_text(encoding="utf-8"))

    def list_jobs(self) -> list:
        found = []
        for path in sorted(self.jobs_dir.glob("job_*/job.json")):
            found.append(json.loads(path.read_text(encoding="utf-8")))
        found.sort(key=lambda job: (job.get("created_at", ""), job.get("id", "")))
        return found


def public_view(value):
    """Drop local paths and key material before an API response."""
    if isinstance(value, dict):
        return {
            key: public_view(item)
            for key, item in value.items()
            if key not in _HIDDEN_KEYS and not str(key).endswith("_path")
        }
    if isinstance(value, list):
        return [public_view(item) for item in value]
    return value
