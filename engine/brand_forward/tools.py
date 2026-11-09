"""MCP tools. The HTTP server calls these same functions."""

from __future__ import annotations

from pathlib import Path

from brand_forward import PROXY_SCHEMA
from brand_forward.catalog import load_fixture
from brand_forward.crosscheck import cross_check
from brand_forward.guard import assert_export_safe
from brand_forward.planner import normalize_plan, rule_plan, seal
from brand_forward.receipt import Signer
from brand_forward.vision import analyze

TOOL_NAMES = (
    "track_frames",
    "transcribe",
    "reason_local",
    "export_proxy",
    "verify_proposal",
    "sign_receipt",
)

_TRACK_KEYS = ("track_id", "kind", "label", "redacted", "redaction", "evidence")
_SPAN_KEYS = ("start", "end", "visible", "occlusion", "face_present")
_SEGMENT_KEYS = ("start", "end", "lang", "text")
KEYFRAME_EVERY_S = 1


def _tracks(raw: list) -> list:
    cleaned = []
    for track in raw:
        item = {key: track[key] for key in _TRACK_KEYS if key in track}
        item["spans"] = [{key: span[key] for key in _SPAN_KEYS if key in span} for span in track.get("spans") or []]
        cleaned.append(item)
    return cleaned


def _segments(raw: list) -> list:
    return [{key: segment[key] for key in _SEGMENT_KEYS if key in segment} for segment in raw]


def track_frames(master: Path, work_dir: Path) -> dict:
    """Decode, hash, and measure every frame of the local master."""
    return analyze(Path(master), Path(work_dir))


def transcribe(fixture_id: str) -> dict:
    """Fixture transcript. Mode stays `fixture` until Whisper runs on the node."""
    fixture = load_fixture(fixture_id)
    segments = _segments(fixture["transcript"])
    languages = sorted({segment["lang"] for segment in segments if "lang" in segment})
    return {"mode": "fixture", "transcript": segments, "languages": languages}


def export_proxy(*, asset_id: str, asset_sha256: str, duration_ms: int, vision: dict, transcript: list) -> dict:
    """Build the only document that may leave the workstation."""
    segments = _segments(transcript)
    step = vision["fps"] * KEYFRAME_EVERY_S
    keyframes = [
        {"timecode": frame["timecode"], "sha256": frame["sha256"]}
        for frame in vision["frames"][::step]
    ]
    proxy = {
        "schema": PROXY_SCHEMA,
        "asset_id": asset_id,
        "asset_sha256": str(asset_sha256).lower(),
        "duration_ms": int(duration_ms),
        "fps": int(vision["fps"]),
        "frame_count": int(vision["frame_count"]),
        "adapters": {"vision": vision["method"], "face": "scene-layout", "asr": "fixture"},
        "languages": sorted({segment["lang"] for segment in segments if "lang" in segment}),
        "tracks": _tracks(vision["tracks"]),
        "transcript": segments,
        "keyframes": keyframes,
    }
    assert_export_safe(proxy)
    return proxy


def reason_local(proxy: dict, proposal_id: str) -> dict:
    """Deterministic on-device plan from the proxy. Never touches the network."""
    normalized = normalize_plan(rule_plan(proxy), duration_ms=int(proxy["duration_ms"]))
    return seal(
        proposal_id=proposal_id,
        source="local",
        provider="rule",
        model="rule-planner.v1",
        mode="deterministic",
        normalized=normalized,
        proxy=proxy,
    )


def verify_proposal(proposal: dict, vision: dict) -> dict:
    """Cross-check a proposal against measured frames, layout, and policy."""
    return cross_check(proposal, vision)


def sign_receipt(body: dict, signer: Signer) -> dict:
    """Sign a receipt body with the workstation key. The seed is not an argument."""
    return signer.sign(body)


def dispatch(name: str, arguments: dict, *, signer: Signer) -> dict:
    """Run one manifest tool. Unknown names fail closed."""
    if name == "track_frames":
        return track_frames(arguments["master"], arguments["work_dir"])
    if name == "transcribe":
        return transcribe(arguments["fixture_id"])
    if name == "reason_local":
        return reason_local(arguments["proxy"], arguments["proposal_id"])
    if name == "export_proxy":
        return export_proxy(
            asset_id=arguments["asset_id"],
            asset_sha256=arguments["asset_sha256"],
            duration_ms=arguments["duration_ms"],
            vision=arguments["vision"],
            transcript=arguments["transcript"],
        )
    if name == "verify_proposal":
        return verify_proposal(arguments["proposal"], arguments["vision"])
    if name == "sign_receipt":
        return sign_receipt(arguments["body"], signer)
    raise ValueError("unknown tool")
