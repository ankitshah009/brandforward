"""Edit plans: one schema for every planner, cloud or on-device.

A plan is a model's opinion. It names a wordmark hold (the logo reveal), a
lower third, whether to blur the talent's face, and any factual claims the
planner relied on. The cross-check never trusts the claims list alone: every
edit implies checks of its own.

Planners:
- `scripted`  a fixed cloud response used for stage demos (it makes the bad claim)
- `live`      an OpenAI-compatible chat endpoint, reached only through `cloud.send`
- `ollama`    an open-weight model on this machine
- `rule`      a deterministic planner that reads measured spans, used as last resort
"""

from __future__ import annotations

import json
from typing import Optional

from brand_forward.canonical import sha256_canonical
from brand_forward.errors import PlanInvalid
from brand_forward.guard import assert_export_safe
from brand_forward.timecode import ms_tc, tc_ms

TRACK_IDS = ("product_hero", "talent", "wordmark")

SYSTEM_PROMPT = (
    "You are the edit planner for BrandForward, a pre-publishability pipeline. "
    "You receive only an anonymized metadata proxy of a short launch film: track ids, "
    "timecodes, visibility spans, redaction flags, transcript lines, and keyframe hashes. "
    "You never see pixels. Plan a social cut:\n"
    "1. wordmark_hold: the logo reveal, 0.6 to 1.5 seconds, placed where the wordmark is on screen.\n"
    "2. lower_third: a title of at most six words.\n"
    "3. face_blur: true when a track is flagged redacted with redaction face.\n"
    "4. claims: every factual assumption about a track's visibility that your plan relies on.\n"
    "Definitions: visible true means the object is physically on screen and unobstructed. "
    "occlusion means something physically covers it. A redaction flag is a publishing rule, "
    "not an occlusion: a face that must be blurred is still fully_visible in the footage. "
    "Timecodes use MM:SS.mmm and intervals are half-open [start, end). "
    "The workstation verifies every claim and every edit against decoded frames before anything renders."
)


_TIMECODE = {"type": "string", "pattern": "^[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"}

PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "wordmark_hold", "lower_third", "face_blur", "claims"],
    "properties": {
        "summary": {"type": "string"},
        "wordmark_hold": {
            "type": "object",
            "additionalProperties": False,
            "required": ["start", "end"],
            "properties": {"start": _TIMECODE, "end": _TIMECODE},
        },
        "lower_third": {
            "type": "object",
            "additionalProperties": False,
            "required": ["start", "end", "text"],
            "properties": {"start": _TIMECODE, "end": _TIMECODE, "text": {"type": "string"}},
        },
        "face_blur": {"type": "boolean"},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["track_id", "asserted", "start", "end"],
                "properties": {
                    "track_id": {"type": "string", "enum": list(TRACK_IDS)},
                    "asserted": {"type": "string", "enum": ["fully_visible", "occluded"]},
                    "start": _TIMECODE,
                    "end": _TIMECODE,
                },
            },
        },
    },
}


def _interval(raw: object, duration_ms: int, label: str) -> dict:
    if not isinstance(raw, dict):
        raise PlanInvalid("{0} is missing".format(label))
    try:
        start = tc_ms(str(raw.get("start")))
        end = tc_ms(str(raw.get("end")))
    except ValueError as exc:
        raise PlanInvalid("{0} has a bad timecode".format(label)) from exc
    if not 0 <= start < end <= duration_ms:
        raise PlanInvalid("{0} is outside the film".format(label))
    return {"start": ms_tc(start), "end": ms_tc(end)}


def normalize_plan(raw: object, *, duration_ms: int) -> dict:
    """Coerce planner output into the plan schema or raise PlanInvalid."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise PlanInvalid("planner did not return JSON") from exc
    if not isinstance(raw, dict):
        raise PlanInvalid("planner did not return an object")
    hold = _interval(raw.get("wordmark_hold"), duration_ms, "wordmark_hold")
    lower_raw = raw.get("lower_third")
    lower = _interval(lower_raw, duration_ms, "lower_third")
    text = str((lower_raw or {}).get("text") or "").strip()
    if not text:
        raise PlanInvalid("lower_third text is empty")
    lower["text"] = text[:64]
    face_blur = raw.get("face_blur")
    if not isinstance(face_blur, bool):
        raise PlanInvalid("face_blur must be true or false")
    claims = []
    for index, item in enumerate(raw.get("claims") or []):
        if not isinstance(item, dict):
            raise PlanInvalid("claim {0} is not an object".format(index + 1))
        track_id = str(item.get("track_id") or "")
        asserted = str(item.get("asserted") or "")
        if track_id not in TRACK_IDS or asserted not in ("fully_visible", "occluded"):
            raise PlanInvalid("claim {0} is outside the schema".format(index + 1))
        span = _interval(item, duration_ms, "claim {0}".format(index + 1))
        claims.append({"id": "c{0}".format(index + 1), "track_id": track_id, "asserted": asserted, **span})
    summary = str(raw.get("summary") or "").strip()[:400]
    return {
        "summary": summary or "Edit plan.",
        "plan": {"wordmark_hold": hold, "lower_third": lower, "face_blur": face_blur},
        "claims": claims,
    }


def seal(
    *,
    proposal_id: str,
    source: str,
    provider: str,
    model: str,
    mode: str,
    normalized: dict,
    proxy: dict,
) -> dict:
    """Bind a normalized plan to the exact proxy the planner was allowed to see."""
    assert_export_safe(proxy)
    return {
        "id": proposal_id,
        "source": source,
        "provider": provider,
        "model": model,
        "mode": mode,
        "summary": normalized["summary"],
        "input_proxy_sha256": sha256_canonical(proxy),
        "plan": normalized["plan"],
        "claims": normalized["claims"],
    }


def scripted_cloud(fixture: dict, *, revised: bool = False) -> dict:
    """The fixture's scripted cloud answer (the demo's bad claim) or its scripted revision."""
    if revised and fixture.get("scripted_cloud_revision"):
        return dict(fixture["scripted_cloud_revision"])
    return dict(fixture["scripted_cloud"])


def _wordmark_spans(proxy: dict) -> list:
    track = next((t for t in proxy.get("tracks") or [] if t.get("track_id") == "wordmark"), None)
    return list((track or {}).get("spans") or [])


def rule_plan(proxy: dict) -> dict:
    """Deterministic planner. Puts the logo hold inside the longest measured visible span."""
    duration = int(proxy.get("duration_ms") or 0)
    best: Optional[tuple] = None
    for span in _wordmark_spans(proxy):
        if not span.get("visible"):
            continue
        start = tc_ms(span["start"])
        end = tc_ms(span["end"])
        if best is None or end - start > best[1] - best[0]:
            best = (start, end)
    if best is None:
        best = (0, min(duration, 1000))
    length = min(1200, best[1] - best[0])
    middle = (best[0] + best[1]) // 2
    hold_start = max(best[0], (middle - length // 2 + 99) // 100 * 100)
    hold_end = min(best[1], hold_start + length) // 100 * 100
    lower_start = min(500, max(0, duration - 3000))
    lower_end = min(duration, lower_start + 2500)
    return {
        "summary": (
            "Logo reveal moved inside the longest span where the wordmark is measured visible. "
            "Lower third early, face blurred because the talent is flagged for redaction."
        ),
        "wordmark_hold": {"start": ms_tc(hold_start), "end": ms_tc(hold_end)},
        "lower_third": {"start": ms_tc(lower_start), "end": ms_tc(lower_end), "text": "MIRA - Harbor launch"},
        "face_blur": True,
        "claims": [
            {
                "track_id": "wordmark",
                "asserted": "fully_visible",
                "start": ms_tc(hold_start),
                "end": ms_tc(hold_end),
            }
        ],
    }


def proxy_message(proxy: dict) -> str:
    """The user message every planner receives: the proxy and nothing else."""
    return json.dumps(proxy, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def feedback(report: dict) -> list:
    """Failed checks, reduced to what a planner may see: ids, intervals, numbers, reasons."""
    items = []
    for check in report.get("checks") or []:
        if check.get("passed"):
            continue
        items.append(
            {
                "check": check["id"],
                "subject": check["subject"],
                "asserted": check["asserted"],
                "interval": check.get("interval"),
                "observed": check["observed"],
                "reason": check["reason"],
            }
        )
    assert_export_safe(items)
    return items


def plan_document(proposal: dict) -> dict:
    """A sealed proposal turned back into the planner's own answer format."""
    plan = proposal["plan"]
    return {
        "summary": proposal["summary"],
        "wordmark_hold": plan["wordmark_hold"],
        "lower_third": plan["lower_third"],
        "face_blur": plan["face_blur"],
        "claims": [
            {key: claim[key] for key in ("track_id", "asserted", "start", "end")}
            for claim in proposal.get("claims") or []
        ],
    }


def messages(proxy: dict, revision: Optional[dict] = None) -> list:
    """Chat transcript for a planner. `revision` = {"previous": proposal, "feedback": [...]}."""
    out = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": proxy_message(proxy)},
    ]
    if revision:
        out.append(
            {
                "role": "assistant",
                "content": json.dumps(plan_document(revision["previous"]), ensure_ascii=False, separators=(",", ":")),
            }
        )
        out.append(
            {
                "role": "user",
                "content": (
                    "The workstation checked your plan against decoded frames and rejected it. "
                    "Failed checks: {0}. Revise the plan so every edit and claim matches the measured "
                    "spans in the proxy. Return the full plan."
                ).format(json.dumps(revision["feedback"], ensure_ascii=False, separators=(",", ":"))),
            }
        )
    return out
