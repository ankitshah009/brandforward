"""The egress seam. This module is the only code path that can send bytes off the machine.

`send` accepts the anonymized proxy and nothing else. It runs the leakage guard,
serializes the exact request body, records it in the egress ledger (size and
SHA-256), and only then contacts the cloud. A down link never reaches the
network. The scripted provider never reaches the network either; it is labeled
as scripted wherever it appears.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from brand_forward import llm
from brand_forward.guard import assert_export_safe
from brand_forward.planner import messages, scripted_cloud


@dataclass
class Egress:
    record: dict
    answer: Optional[object] = None
    payload: bytes = field(default=b"", repr=False)


def _record(seq: int, *, provider: str, destination: str, model: str, status: str, payload: bytes, sent: bool) -> dict:
    return {
        "seq": seq,
        "provider": provider,
        "destination": destination,
        "model": model,
        "status": status,
        "transmitted": sent,
        "bytes": len(payload) if sent else 0,
        "payload_bytes": len(payload),
        "payload_sha256": hashlib.sha256(payload).hexdigest() if payload else None,
        "raw_media_bytes": 0,
        "guard": "pass",
    }


def send(
    proxy: dict,
    *,
    seq: int,
    link_up: bool,
    provider: str,
    fixture: dict,
    ledger_dir: Path,
    revision: Optional[dict] = None,
) -> Egress:
    """Route the proxy (plus verifier feedback on a revision) to the cloud, or refuse.

    Never raises for a cloud failure: the caller fails over.
    """
    assert_export_safe(proxy)
    if revision:
        assert_export_safe(revision["feedback"])
    config = llm.cloud_config()
    payload = llm.openai_request_body(config.model, messages(proxy, revision))
    ledger_dir.mkdir(parents=True, exist_ok=True)
    (ledger_dir / "{0:03d}.json".format(seq)).write_bytes(payload)

    if not link_up:
        record = _record(seq, provider=provider, destination=config.host, model=config.model,
                         status="blocked", payload=payload, sent=False)
        record["reason"] = "Link down. The request was built and guarded but not sent."
        return Egress(record=record, payload=payload)

    if provider == "scripted":
        record = _record(seq, provider="scripted", destination="none (scripted)", model="scripted-cloud",
                         status="scripted", payload=payload, sent=False)
        record["reason"] = "Scripted cloud answer for the stage demo. This request was not transmitted."
        return Egress(record=record, answer=scripted_cloud(fixture, revised=bool(revision)), payload=payload)

    started = time.monotonic()
    record = _record(seq, provider="live", destination=config.host, model=config.model,
                     status="sending", payload=payload, sent=True)
    try:
        answer = llm.openai_chat(config, payload)
    except llm.LlmError as exc:
        record["status"] = "failed"
        record["reason"] = str(exc)
        record["transmitted"] = not str(exc).startswith(("no cloud API key", "unreachable"))
        record["bytes"] = len(payload) if record["transmitted"] else 0
        record["latency_ms"] = int((time.monotonic() - started) * 1000)
        return Egress(record=record, payload=payload)
    record["status"] = "answered"
    record["latency_ms"] = int((time.monotonic() - started) * 1000)
    return Egress(record=record, answer=answer, payload=payload)
