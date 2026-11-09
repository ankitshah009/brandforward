"""Pixel-measured vision. Runs on decoded frames from the local master.

Wordmark visibility is measured, not asserted: every decoded frame's wordmark
region is compared with the brand template (the same region on the clean
plate). A pixel counts as covered when its downscaled luma moves by more than
`DIFF_THRESHOLD`. Coverage is reported in integer basis points so the numbers
can go into a signed receipt without float drift.

Talent face and product hero come from the scene layout. On the ThinkStation
P8 a SAM 3.1 tracker replaces this module behind the same `analyze` output.
"""

from __future__ import annotations

from pathlib import Path

from brand_forward import scene
from brand_forward.media import frame_hashes, generate_clean_plate, gray_region, sha256_file
from brand_forward.timecode import ms_tc

METHOD = "template-diff.v1"
SCALE = 4
DIFF_THRESHOLD = 40
OCCLUDED_BP = 300  # 3 % of the wordmark region


def frame_start_ms(index: int, fps: int) -> int:
    return (index * 1000 + fps // 2) // fps if index else 0


def frame_at_ms(ms: int, fps: int, count: int) -> int:
    """Index of the frame on screen at `ms` (floor)."""
    index = (ms * fps) // 1000
    return max(0, min(count - 1, index))


def _coverage(frame: bytes, template: bytes) -> int:
    covered = 0
    for a, b in zip(frame, template):
        if a - b > DIFF_THRESHOLD or b - a > DIFF_THRESHOLD:
            covered += 1
    return (covered * 10000) // max(1, len(template))


def _spans(coverage: list, fps: int, duration_ms: int) -> list:
    spans = []
    start = 0
    state = coverage[0] >= OCCLUDED_BP
    for index in range(1, len(coverage) + 1):
        current = coverage[index] >= OCCLUDED_BP if index < len(coverage) else None
        if current is state:
            continue
        end_ms = frame_start_ms(index, fps) if index < len(coverage) else duration_ms
        window = coverage[start:index]
        spans.append(
            {
                "start": ms_tc(frame_start_ms(start, fps)),
                "end": ms_tc(end_ms),
                "visible": not state,
                "occlusion": "occluded" if state else "none",
                "peak_coverage_bp": max(window),
            }
        )
        start = index
        state = current
    return spans


def analyze(master: Path, work_dir: Path) -> dict:
    """Measure the master. Returns per-frame records plus derived tracks."""
    plate = work_dir / "clean_plate.png"
    generate_clean_plate(plate)
    template = gray_region(plate, scene.WORDMARK, scale=SCALE, single=True)
    region = gray_region(master, scene.WORDMARK, scale=SCALE, single=False)
    size = len(template)
    if size == 0 or len(region) % size:
        raise ValueError("decoded region size does not match the template")
    hashes = frame_hashes(master)
    count = min(len(hashes), len(region) // size)
    coverage = [_coverage(region[i * size:(i + 1) * size], template) for i in range(count)]
    fps = scene.FPS
    frames = [
        {
            "index": i,
            "timecode": ms_tc(frame_start_ms(i, fps)),
            "sha256": hashes[i],
            "wordmark_coverage_bp": coverage[i],
        }
        for i in range(count)
    ]
    duration_ms = scene.DURATION_MS
    tracks = [
        {
            "track_id": "product_hero",
            "kind": "product",
            "label": "hull",
            "redacted": False,
            "evidence": "scene-layout",
            "box": scene.HULL.as_dict(),
            "spans": [{"start": ms_tc(0), "end": ms_tc(duration_ms), "visible": True, "occlusion": "none"}],
        },
        {
            "track_id": "talent",
            "kind": "person",
            "label": "talent",
            "redacted": True,
            "redaction": "face",
            "evidence": "scene-layout",
            "box": scene.FACE.as_dict(),
            "spans": [
                {
                    "start": ms_tc(0),
                    "end": ms_tc(duration_ms),
                    "visible": True,
                    "occlusion": "none",
                    "face_present": True,
                }
            ],
        },
        {
            "track_id": "wordmark",
            "kind": "logo",
            "label": "MIRA wordmark",
            "redacted": False,
            "evidence": "pixel-measured",
            "box": scene.WORDMARK.as_dict(),
            "spans": _spans(coverage, fps, duration_ms),
        },
    ]
    return {
        "method": METHOD,
        "fps": fps,
        "frame_count": count,
        "threshold": {"diff_luma": DIFF_THRESHOLD, "occluded_bp": OCCLUDED_BP, "scale": SCALE},
        "template_sha256": sha256_file(plate),
        "frames": frames,
        "tracks": tracks,
    }
