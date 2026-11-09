"""What actually runs on this node, stage by stage. The console shows this verbatim."""

from __future__ import annotations

import os

from brand_forward import llm
from brand_forward.media import ffmpeg_version, probe_ok
from brand_forward.vision import METHOD


def report() -> dict:
    ffmpeg_problem = probe_ok()
    local = None if os.environ.get("BRAND_FORWARD_LOCAL") == "rule" else llm.local_model()
    cloud = llm.cloud_config()
    return {
        "media": {
            "state": "real" if ffmpeg_problem is None else "missing",
            "detail": "ffmpeg {0}".format(ffmpeg_version()) if ffmpeg_problem is None else ffmpeg_problem,
        },
        "vision": {
            "state": "real",
            "detail": "{0}: per-frame pixel coverage of the wordmark against the brand template".format(METHOD),
            "target": "SAM 3.1 on RTX PRO 6000",
        },
        "face": {"state": "layout", "detail": "Face box from the scene layout", "target": "SAM 3.1 on RTX PRO 6000"},
        "asr": {"state": "fixture", "detail": "Fixture transcript (en, ja)", "target": "Whisper large-v3 on RTX PRO 6000"},
        "local_reasoner": {
            "state": "real" if local else "rule",
            "detail": "{0} via Ollama".format(local) if local else "Deterministic rule planner (no local weight loaded)",
            "model": local,
            "target": "30B+ open weights on RTX PRO 6000",
        },
        "cloud": {
            "state": "configured" if cloud.configured else "unconfigured",
            "detail": "{0} at {1}".format(cloud.model, cloud.host) if cloud.configured else "No API key; live cloud fails over",
            "model": cloud.model,
            "host": cloud.host,
        },
        "receipts": {"state": "real", "detail": "Ed25519 over canonical JSON"},
    }
