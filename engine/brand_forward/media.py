"""Local media work with ffmpeg: generate, hash, decode, extract, render.

Every function here runs on the workstation. Nothing in this module talks to
the network. ffmpeg is required: a pre-publishability engine that cannot decode
frames has nothing to measure, so a missing binary fails loudly instead of
writing a placeholder file.
"""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Optional, Sequence

from brand_forward import scene
from brand_forward.errors import MediaError

_TIMEOUT_SECONDS = 120
_LOWER_THIRD_SAFE = re.compile(r"[^A-Za-z0-9 .,:;!?'&()\-À-ɏ　-ヿ一-鿿]")


def sha256_file(path: Path) -> str:
    """Streaming SHA-256 of a local file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffmpeg_bin() -> str:
    found = shutil.which("ffmpeg")
    if not found:
        raise MediaError("ffmpeg is not installed on this workstation")
    return found


@lru_cache(maxsize=1)
def ffmpeg_version() -> str:
    try:
        completed = subprocess.run(
            [ffmpeg_bin(), "-hide_banner", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired, MediaError):
        return "unknown"
    first = (completed.stdout or "").splitlines()[:1]
    match = re.match(r"ffmpeg version (\S+)", first[0]) if first else None
    return match.group(1) if match else "unknown"


def run_ffmpeg(args: Sequence[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    command = [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y", *list(args)]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            timeout=_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaError("ffmpeg timed out") from exc
    if completed.returncode != 0:
        tail = completed.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or [""]
        raise MediaError("ffmpeg exited {0}: {1}".format(completed.returncode, tail[0][:200]))
    return completed


def display_command(args: Sequence[str]) -> list:
    """argv for display: binary name plus arguments, without host paths."""
    shown = ["ffmpeg"]
    for item in args:
        text = str(item)
        shown.append(Path(text).name if text.startswith("/") else text)
    return shown


def generate_master(dest: Path) -> list:
    dest.parent.mkdir(parents=True, exist_ok=True)
    args = scene.master_args(dest)
    run_ffmpeg(args)
    if not dest.is_file() or dest.stat().st_size == 0:
        raise MediaError("ffmpeg did not write the master")
    return display_command(args)


def generate_clean_plate(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(scene.clean_plate_args(dest))


def frame_hashes(master: Path) -> list:
    """SHA-256 of every decoded video frame, in presentation order."""
    completed = run_ffmpeg(
        ["-i", str(master), "-map", "0:v:0", "-f", "framehash", "-hash", "sha256", "-"],
        capture=True,
    )
    hashes = []
    for line in completed.stdout.decode("ascii", "replace").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.split(",")]
        if len(parts) >= 6:
            hashes.append(parts[-1].lower())
    if not hashes:
        raise MediaError("ffmpeg returned no frame hashes")
    return hashes


def gray_region(source: Path, box: scene.Box, *, scale: int, single: bool) -> bytes:
    """Decode a region as 8-bit gray, area-downscaled by `scale`."""
    out_w = box.w // scale
    out_h = box.h // scale
    vf = "crop={0}:{1}:{2}:{3},scale={4}:{5}:flags=area,format=gray".format(
        box.w, box.h, box.x, box.y, out_w, out_h
    )
    args = ["-i", str(source), "-vf", vf]
    if single:
        args += ["-frames:v", "1"]
    args += ["-f", "rawvideo", "-pix_fmt", "gray", "-"]
    return run_ffmpeg(args, capture=True).stdout


def extract_jpeg(master: Path, dest: Path, *, frame_index: int, width: int) -> Path:
    """Decode one frame by index to a JPEG for the local console. Cached on disk."""
    if dest.is_file() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-i", str(master),
            "-vf", "select=eq(n\\,{0}),scale={1}:-2".format(frame_index, width),
            "-frames:v", "1", "-q:v", "3",
            str(dest),
        ]
    )
    if not dest.is_file():
        raise MediaError("frame extraction wrote nothing")
    return dest


def safe_overlay_text(text: str) -> str:
    cleaned = _LOWER_THIRD_SAFE.sub("", text or "").strip()
    return cleaned[:64] or "MIRA"


def _seconds(ms: int) -> str:
    return "{0:.3f}".format(ms / 1000.0)


def render_plan(master: Path, directory: Path, *, plan: dict) -> tuple:
    """Render the cleared plan: face blur, lower third, wordmark callout.

    Returns (output path, display argv). The plan arrives already verified; this
    function only draws what the receipt allowed.
    """
    directory.mkdir(parents=True, exist_ok=True)
    dest = directory / "proof.mp4"
    text_file = directory / "lower_third.txt"
    face = scene.FACE
    band = scene.LOWER_THIRD
    word = scene.WORDMARK

    chains = ["[0:v]split=2[base][faceSrc]"]
    if plan.get("face_blur"):
        chains.append(
            "[faceSrc]crop={0}:{1}:{2}:{3},scale={4}:{5}:flags=area,scale={0}:{1}:flags=neighbor[faceBlur]".format(
                face.w, face.h, face.x, face.y, max(1, face.w // 14), max(1, face.h // 14)
            )
        )
        chains.append("[base][faceBlur]overlay=x={0}:y={1}[v0]".format(face.x, face.y))
    else:
        chains.append("[faceSrc]nullsink")
        chains.append("[base]null[v0]")

    current = "v0"
    lower = plan.get("lower_third")
    if lower:
        text_file.write_text(safe_overlay_text(str(lower.get("text") or "")), encoding="utf-8")
        enable = "between(t,{0},{1})".format(_seconds(lower["start_ms"]), _seconds(lower["end_ms"]))
        font = scene.display_font()
        font_arg = "fontfile='{0}':".format(font.replace(":", "\\:")) if font else ""
        chains.append(
            (
                "[{cur}]drawbox=x={x}:y={y}:w={w}:h={h}:color=0x0B0F14@0.86:t=fill:enable='{en}',"
                "drawbox=x={x}:y={y}:w=6:h={h}:color=0xC89B54:t=fill:enable='{en}',"
                "drawtext={font}textfile='{tf}':fontsize=40:fontcolor=0xF1E7D2:"
                "x=48:y={ty}:enable='{en}'[v1]"
            ).format(
                cur=current,
                x=band.x,
                y=band.y,
                w=band.w,
                h=band.h,
                en=enable,
                font=font_arg,
                tf=str(text_file).replace(":", "\\:"),
                ty=band.y + (band.h - 40) // 2,
            )
        )
        current = "v1"
    hold = plan.get("wordmark_hold")
    if hold:
        enable = "between(t,{0},{1})".format(_seconds(hold["start_ms"]), _seconds(hold["end_ms"]))
        chains.append(
            "[{0}]drawbox=x={1}:y={2}:w={3}:h={4}:color=0xE7C27A:t=4:enable='{5}'[v2]".format(
                current, word.x - 10, word.y - 10, word.w + 20, word.h + 20, enable
            )
        )
        current = "v2"
    chains.append("[{0}]null[out]".format(current))
    args = [
        "-i", str(master),
        "-filter_complex", ";".join(chains),
        "-map", "[out]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(dest),
    ]
    run_ffmpeg(args)
    if not dest.is_file() or dest.stat().st_size == 0:
        raise MediaError("ffmpeg did not write the proof render")
    return dest, display_command(args)


def probe_ok() -> Optional[str]:
    """None when ffmpeg is usable, otherwise the reason."""
    try:
        ffmpeg_bin()
    except MediaError as exc:
        return str(exc)
    return None
