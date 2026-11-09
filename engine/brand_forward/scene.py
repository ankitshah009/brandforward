"""Synthetic harbor-launch master, drawn locally with ffmpeg.

The unreleased camera original is not on this machine, so the engine draws a
stand-in shot with the same story beats: a hull (product hero), talent in the
foreground, a MIRA wordmark panel on the quay, and a crane load that swings in
front of the wordmark. Nothing about the occlusion is scripted downstream: the
vision stage measures it from decoded pixels.

Geometry lives here because the generator owns it. Vision reads the wordmark
region and the brand template from this module, the same way a production
pipeline reads a logo from the brand kit.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

WIDTH = 1280
HEIGHT = 720
FPS = 24
DURATION_MS = 6000


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    w: int
    h: int

    def as_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}

    def overlaps(self, other: "Box") -> bool:
        return not (
            self.x + self.w <= other.x
            or other.x + other.w <= self.x
            or self.y + self.h <= other.y
            or other.y + other.h <= self.y
        )


WORDMARK = Box(800, 230, 380, 150)
FACE = Box(196, 318, 112, 132)
HULL = Box(90, 392, 640, 96)
LOWER_THIRD = Box(0, 600, WIDTH, 84)

# Crane load path. The load is above frame until 3.3 s, descends over the
# wordmark by 3.8 s, sways, and lifts clear between 5.2 s and 5.7 s.
_LOAD_X = 852
_LOAD_W = 300
_LOAD_H = 172
_LOAD_Y = (
    "if(lt(t,3.3),-1400,"
    "if(lt(t,3.8),-420+635*(t-3.3)/0.5,"
    "if(lt(t,5.2),215+9*sin(2*PI*(t-3.8)/1.4),"
    "if(lt(t,5.7),215-635*(t-5.2)/0.5,-1400))))"
)

_DISPLAY_FONTS = (
    "/System/Library/Fonts/Supplemental/Didot.ttc",
    "/System/Library/Fonts/Supplemental/Bodoni 72.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf",
)


def display_font() -> Optional[str]:
    override = os.environ.get("BRAND_FORWARD_FONT")
    if override and Path(override).is_file():
        return override
    for candidate in _DISPLAY_FONTS:
        if Path(candidate).is_file():
            return candidate
    return None


def _escape(path: str) -> str:
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _wordmark_text() -> str:
    font = display_font()
    font_arg = "fontfile='{0}':".format(_escape(font)) if font else ""
    return (
        "drawtext={0}text='MIRA':fontsize=104:fontcolor=0xF1E7D2:"
        "x={1}+({2}-text_w)/2:y={3}+({4}-text_h)/2"
    ).format(font_arg, WORDMARK.x, WORDMARK.w, WORDMARK.y, WORDMARK.h)


def _plate_chain() -> str:
    """Static set: dusk sky, water, crane frame, hull, quay panel, wordmark."""
    w = WORDMARK
    parts = [
        "drawbox=x=0:y=470:w=iw:h=ih-470:color=0x0C1E2A:t=fill",
        "drawbox=x=0:y=468:w=iw:h=3:color=0xE7A868@0.55:t=fill",
        "drawbox=x=0:y=520:w=iw:h=2:color=0x1F3A48@0.8:t=fill",
        "drawbox=x=0:y=575:w=iw:h=2:color=0x1A3340@0.8:t=fill",
        # crane mast and jib; the jib runs along the top edge of frame
        "drawbox=x=1196:y=0:w=20:h=472:color=0x0B0D10:t=fill",
        "drawbox=x=690:y=0:w=530:h=14:color=0x0B0D10:t=fill",
        "drawbox=x=1150:y=14:w=66:h=10:color=0x0B0D10:t=fill",
        # hull: the product hero
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0x111A22:t=fill".format(HULL.x, HULL.y, HULL.w, HULL.h),
        "drawbox=x={0}:y={1}:w={2}:h=6:color=0xC89B54:t=fill".format(HULL.x, HULL.y + 40, HULL.w),
        "drawbox=x=400:y=330:w=220:h=62:color=0x161F28:t=fill",
        "drawbox=x=430:y=346:w=150:h=10:color=0xE7C27A@0.65:t=fill",
        # quay panel and wordmark
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0x0A0E13:t=fill".format(w.x, w.y, w.w, w.h),
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0xC89B54:t=3".format(w.x, w.y, w.w, w.h),
        "drawbox=x={0}:y={1}:w=10:h={2}:color=0x0B0D10:t=fill".format(w.x + 40, w.y + w.h, 470 - w.y - w.h),
        "drawbox=x={0}:y={1}:w=10:h={2}:color=0x0B0D10:t=fill".format(w.x + w.w - 50, w.y + w.h, 470 - w.y - w.h),
        _wordmark_text(),
        # talent body (face is overlaid separately)
        "drawbox=x=168:y=452:w=168:h=268:color=0x1B1C22:t=fill",
        "drawbox=x=232:y=452:w=40:h=70:color=0xD8CFC0:t=fill",
    ]
    return ",".join(parts)


def _sky() -> str:
    return (
        "gradients=s={0}x{1}:r={2}:d={3}:c0=0x16222F:c1=0xD38C5A:"
        "x0=640:y0=0:x1=640:y1=470:nb_colors=2:speed=0:type=linear"
    ).format(WIDTH, HEIGHT, FPS, DURATION_MS / 1000.0)


def _face_source() -> str:
    cx = FACE.w / 2.0
    cy = FACE.h / 2.0
    rx = FACE.w / 2.0 - 2
    ry = FACE.h / 2.0 - 2
    return (
        "color=c=0xD9A27E:s={0}x{1}:r={2}:d={3},format=rgba,"
        "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
        "a='if(lte(pow((X-{4})/{6},2)+pow((Y-{5})/{7},2),1),255,0)'"
    ).format(FACE.w, FACE.h, FPS, DURATION_MS / 1000.0, cx, cy, rx, ry)


def _features() -> str:
    """Hair, eyes, brows, and mouth, so a face redaction is visibly a redaction."""
    f = FACE
    boxes = [
        (f.x + 14, f.y + 2, f.w - 28, 22, "0x2A1C14"),
        (f.x + 4, f.y + 14, 16, 40, "0x2A1C14"),
        (f.x + f.w - 20, f.y + 14, 16, 40, "0x2A1C14"),
        (f.x + 28, f.y + 50, 18, 4, "0x3B2618"),
        (f.x + f.w - 46, f.y + 50, 18, 4, "0x3B2618"),
        (f.x + 31, f.y + 60, 12, 10, "0x1A1410"),
        (f.x + f.w - 43, f.y + 60, 12, 10, "0x1A1410"),
        (f.x + f.w // 2 - 4, f.y + 72, 8, 18, "0xC48C69"),
        (f.x + f.w // 2 - 18, f.y + 100, 36, 6, "0x8A3F35"),
    ]
    return ",".join(
        "drawbox=x={0}:y={1}:w={2}:h={3}:color={4}:t=fill".format(*box) for box in boxes
    )


def master_graph(*, with_load: bool = True) -> str:
    """Full filter graph. `with_load=False` is the clean plate."""
    duration = DURATION_MS / 1000.0
    graph = [
        "{0},format=yuv420p,{1}[plate]".format(_sky(), _plate_chain()),
        "{0}[face]".format(_face_source()),
        "[plate][face]overlay=x={0}:y={1}:format=auto,{2}[lit]".format(FACE.x, FACE.y, _features()),
    ]
    if not with_load:
        graph.append("[lit]vignette=angle=PI/5[out]")
        return ";".join(graph)
    graph.extend(
        [
            (
                "color=c=0xA8502A:s={0}x{1}:r={2}:d={3},"
                "drawbox=x=0:y=0:w=iw:h=ih:color=0x5E2A15:t=6,"
                "drawbox=x=0:y=40:w=iw:h=4:color=0x7A3519:t=fill,"
                "drawbox=x=0:y=84:w=iw:h=4:color=0x7A3519:t=fill,"
                "drawbox=x=0:y=128:w=iw:h=4:color=0x7A3519:t=fill[load]"
            ).format(_LOAD_W, _LOAD_H, FPS, duration),
            "color=c=0x0A0A0C:s=6x1400:r={0}:d={1}[cable]".format(FPS, duration),
            "[lit][cable]overlay=x={0}:y='({1})-1400':eval=frame[cabled]".format(
                _LOAD_X + _LOAD_W // 2 - 3, _LOAD_Y
            ),
            "[cabled][load]overlay=x={0}:y='{1}':eval=frame[loaded]".format(_LOAD_X, _LOAD_Y),
            "[loaded]vignette=angle=PI/5[out]",
        ]
    )
    return ";".join(graph)


def master_args(dest: Path) -> list:
    duration = DURATION_MS / 1000.0
    return [
        "-filter_complex", master_graph(with_load=True),
        "-map", "[out]",
        "-t", "{0:.3f}".format(duration),
        "-r", str(FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
        "-threads", "1", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(dest),
    ]


def clean_plate_args(dest: Path) -> list:
    """One lossless PNG of the set without the crane load: the brand template source."""
    return [
        "-filter_complex", master_graph(with_load=False),
        "-map", "[out]",
        "-frames:v", "1",
        str(dest),
    ]


def available() -> bool:
    return bool(shutil.which("ffmpeg"))
