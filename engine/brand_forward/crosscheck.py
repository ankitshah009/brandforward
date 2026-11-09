"""Frame cross-check: turn a plan (a model's opinion) into measured checks.

The planner's own claims are checked, and so is everything its edits imply:

- `measured`  wordmark visibility over an interval, read from per-frame pixel coverage
- `geometry`  the lower third must not cover the talent's face or the wordmark
- `policy`    a talent flagged for face redaction must be blurred
- `layout`    claims about tracks whose evidence is the scene layout

Verdict is `clear` only when every check passes. Evidence carries frame
indexes, frame SHA-256s, and integer basis points, so it can be signed.
"""

from __future__ import annotations

import hashlib

from brand_forward import CROSS_CHECK_SCHEMA, scene
from brand_forward.timecode import tc_ms
from brand_forward.vision import OCCLUDED_BP, frame_at_ms


def _frames_in(frames: list, start_ms: int, end_ms: int, fps: int) -> list:
    count = len(frames)
    first = frame_at_ms(start_ms, fps, count)
    last = frame_at_ms(max(start_ms, end_ms - 1), fps, count)
    return frames[first:last + 1]


def _visibility_check(check_id: str, source: str, subject: str, asserted: str, start: str, end: str, vision: dict) -> dict:
    window = _frames_in(vision["frames"], tc_ms(start), tc_ms(end), vision["fps"])
    worst = max(window, key=lambda frame: (frame["wordmark_coverage_bp"], -frame["index"]))
    occluded = [frame for frame in window if frame["wordmark_coverage_bp"] >= OCCLUDED_BP]
    if asserted == "fully_visible":
        passed = not occluded
    else:
        passed = len(occluded) == len(window)
    if occluded:
        observed = "occluded in {0} of {1} frames".format(len(occluded), len(window))
    else:
        observed = "visible in all {0} frames".format(len(window))
    digest = hashlib.sha256("".join(frame["sha256"] for frame in window).encode("ascii")).hexdigest()
    if passed:
        reason = "Decoded frames {0}-{1} agree.".format(window[0]["index"], window[-1]["index"])
    else:
        reason = "Frame {0} at {1} shows the wordmark {2:.1f}% covered.".format(
            worst["index"], worst["timecode"], worst["wordmark_coverage_bp"] / 100.0
        )
    return {
        "id": check_id,
        "kind": "measured",
        "source": source,
        "subject": subject,
        "asserted": asserted,
        "interval": {"start": start, "end": end},
        "observed": observed,
        "passed": passed,
        "reason": reason,
        "evidence": {
            "method": vision["method"],
            "frames_examined": len(window),
            "first_frame": window[0]["index"],
            "last_frame": window[-1]["index"],
            "frames_sha256": digest,
            "worst_frame": worst["index"],
            "worst_timecode": worst["timecode"],
            "worst_frame_sha256": worst["sha256"],
            "worst_coverage_bp": worst["wordmark_coverage_bp"],
            "threshold_bp": OCCLUDED_BP,
        },
    }


def _layout_check(check_id: str, claim: dict, tracks: list) -> dict:
    track = next((t for t in tracks if t.get("track_id") == claim["track_id"]), None)
    visible = bool(track) and all(span.get("visible") for span in track.get("spans") or [])
    observed = "fully_visible" if visible else "occluded"
    passed = observed == claim["asserted"]
    return {
        "id": check_id,
        "kind": "layout",
        "source": "claim",
        "subject": claim["track_id"],
        "asserted": claim["asserted"],
        "interval": {"start": claim["start"], "end": claim["end"]},
        "observed": observed,
        "passed": passed,
        "reason": "Scene layout places the {0} in frame for the whole film.".format(claim["track_id"].replace("_", " ")),
        "evidence": {"method": "scene-layout"},
    }


def _lower_third_check(lower: dict) -> dict:
    band = scene.LOWER_THIRD
    hits = [name for name, box in (("face", scene.FACE), ("wordmark", scene.WORDMARK)) if band.overlaps(box)]
    passed = not hits
    return {
        "id": "lower-third-safe-area",
        "kind": "geometry",
        "source": "edit",
        "subject": "lower_third",
        "asserted": "covers neither face nor wordmark",
        "interval": {"start": lower["start"], "end": lower["end"]},
        "observed": "clear of face and wordmark" if passed else "covers " + " and ".join(hits),
        "passed": passed,
        "reason": "Lower-third band y {0}-{1} against face y {2}-{3} and wordmark y {4}-{5}.".format(
            band.y, band.y + band.h, scene.FACE.y, scene.FACE.y + scene.FACE.h,
            scene.WORDMARK.y, scene.WORDMARK.y + scene.WORDMARK.h,
        ),
        "evidence": {
            "lower_third": band.as_dict(),
            "face": scene.FACE.as_dict(),
            "wordmark": scene.WORDMARK.as_dict(),
        },
    }


def _redaction_check(plan: dict, tracks: list) -> dict:
    needs = any(t.get("redacted") and t.get("redaction") == "face" for t in tracks)
    blurred = bool(plan.get("face_blur"))
    passed = blurred or not needs
    return {
        "id": "talent-face-redacted",
        "kind": "policy",
        "source": "policy",
        "subject": "talent",
        "asserted": "face blurred" if blurred else "face not blurred",
        "interval": None,
        "observed": "talent flagged for face redaction" if needs else "no redaction flag",
        "passed": passed,
        "reason": "Unreleased talent must be blurred before publish." if needs else "No face redaction required.",
        "evidence": {"method": "proxy-redaction-flag"},
    }


def cross_check(proposal: dict, vision: dict) -> dict:
    tracks = vision["tracks"]
    plan = proposal.get("plan") or {}
    checks = []
    hold = plan.get("wordmark_hold")
    if hold:
        checks.append(
            _visibility_check("logo-hold-visible", "edit", "wordmark", "fully_visible", hold["start"], hold["end"], vision)
        )
    lower = plan.get("lower_third")
    if lower:
        checks.append(_lower_third_check(lower))
    checks.append(_redaction_check(plan, tracks))
    for claim in proposal.get("claims") or []:
        check_id = "claim-{0}".format(claim["id"])
        if claim["track_id"] == "wordmark":
            checks.append(
                _visibility_check(check_id, "claim", "wordmark", claim["asserted"], claim["start"], claim["end"], vision)
            )
        else:
            checks.append(_layout_check(check_id, claim, tracks))
    verdict = "clear" if checks and all(check["passed"] for check in checks) else "hold"
    failed = [check for check in checks if not check["passed"]]
    if failed:
        summary = "Hold. {0}".format(failed[0]["reason"])
    else:
        summary = "Clear. {0} checks agree with decoded frames, layout, and policy.".format(len(checks))
    return {
        "schema": CROSS_CHECK_SCHEMA,
        "proposal_id": proposal.get("id"),
        "verdict": verdict,
        "summary": summary,
        "checks": checks,
    }
