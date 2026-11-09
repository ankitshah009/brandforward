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


FRAME_S = 1.0 / FPS


def _hold(chain: str) -> str:
    """Render a static layer once, then repeat that frame for the whole shot."""
    return "{0},loop=loop={1}:size=1:start=0,setpts=N/{2}/TB".format(chain, FPS * DURATION_MS // 1000 - 1, FPS)


def _skyline() -> str:
    """Distant harbor skyline and a far crane, softened for depth."""
    blocks = [
        (0, 418, 70, 52), (64, 436, 54, 34), (118, 404, 38, 66), (150, 428, 90, 42), (236, 412, 46, 58),
        (600, 430, 70, 40), (664, 410, 34, 60), (694, 424, 58, 46), (748, 440, 40, 30),
        (1010, 420, 60, 50), (1064, 436, 44, 34), (1100, 404, 30, 66), (1236, 426, 44, 44),
    ]
    parts = ["drawbox=x={0}:y={1}:w={2}:h={3}:color=0x2A2E3E@0.88:t=fill".format(*b) for b in blocks]
    parts += [
        "drawbox=x=300:y=300:w=6:h=170:color=0x2A2E3E@0.85:t=fill",
        "drawbox=x=262:y=300:w=150:h=5:color=0x2A2E3E@0.85:t=fill",
        "drawbox=x=380:y=305:w=2:h=60:color=0x2A2E3E@0.75:t=fill",
    ]
    lights = [(30, 432), (88, 446), (128, 418), (170, 440), (252, 426), (618, 442), (676, 424), (716, 436), (1028, 434), (1080, 446), (1112, 418)]
    parts += ["drawbox=x={0}:y={1}:w=3:h=3:color=0xF4C47F@0.9:t=fill".format(x, y) for x, y in lights]
    return ",".join(parts)


def _sun() -> str:
    size = 640
    half = size // 2
    return (
        "color=c=0xFFB86E:s={0}x{0}:r={1}:d={2:.4f},format=rgba,"
        "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
        "a='230*pow(max(0\\,1-hypot(X-{3}\\,Y-{3})/{3})\\,2.4)'"
    ).format(size, FPS, FRAME_S, half)


def _reflection() -> str:
    return (
        "color=c=0xF2A766:s=260x250:r={0}:d={1:.4f},format=rgba,"
        "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
        "a='150*pow(max(0\\,1-abs(X-130)/130)\\,2)*pow(max(0\\,1-Y/250)\\,1.4)'"
    ).format(FPS, FRAME_S)


def _set_chain() -> str:
    """Foreground set: water base, crane frame, hull, quay panel, wordmark, talent body."""
    w = WORDMARK
    parts = [
        "drawbox=x=0:y=470:w=iw:h=ih-470:color=0x0A1822:t=fill",
        "drawbox=x=0:y=468:w=iw:h=2:color=0xF3B676@0.7:t=fill",
        # crane mast and jib; the jib runs along the top edge of frame
        "drawbox=x=1196:y=0:w=20:h=472:color=0x07090C:t=fill",
        "drawbox=x=1213:y=0:w=3:h=472:color=0xE7A868@0.35:t=fill",
        "drawbox=x=690:y=0:w=530:h=14:color=0x07090C:t=fill",
        "drawbox=x=1150:y=14:w=66:h=10:color=0x07090C:t=fill",
        # hull: the product hero, with a lit deck edge, portholes and a brass stripe
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0x0E161E:t=fill".format(HULL.x, HULL.y, HULL.w, HULL.h),
        "drawbox=x={0}:y={1}:w={2}:h=2:color=0xF0B878@0.75:t=fill".format(HULL.x, HULL.y, HULL.w),
        "drawbox=x={0}:y={1}:w={2}:h=6:color=0xC89B54:t=fill".format(HULL.x, HULL.y + 40, HULL.w),
        "drawbox=x=400:y=330:w=220:h=62:color=0x121B24:t=fill",
        "drawbox=x=400:y=330:w=220:h=2:color=0xF0B878@0.6:t=fill",
        "drawbox=x=430:y=346:w=150:h=10:color=0xF2CC88@0.85:t=fill",
    ]
    parts += ["drawbox=x={0}:y={1}:w=7:h=7:color=0xF6CF8E@0.9:t=fill".format(x, HULL.y + 20) for x in range(140, 700, 46)]
    parts += [
        # quay panel and wordmark
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0x080B10:t=fill".format(w.x, w.y, w.w, w.h),
        "drawbox=x={0}:y={1}:w={2}:h={3}:color=0xC89B54:t=3".format(w.x, w.y, w.w, w.h),
        "drawbox=x={0}:y={1}:w=10:h={2}:color=0x07090C:t=fill".format(w.x + 40, w.y + w.h, 470 - w.y - w.h),
        "drawbox=x={0}:y={1}:w=10:h={2}:color=0x07090C:t=fill".format(w.x + w.w - 50, w.y + w.h, 470 - w.y - w.h),
        _wordmark_text(),
        # talent body with a warm rim light from the sunset (face is overlaid separately)
        "drawbox=x=168:y=452:w=168:h=268:color=0x2B2D36:t=fill",
        "drawbox=x=168:y=452:w=168:h=3:color=0x3A3D48:t=fill",
        "drawbox=x=333:y=456:w=3:h=264:color=0xE7A868@0.5:t=fill",
        "drawbox=x=232:y=452:w=40:h=70:color=0xCFC6B6:t=fill",
    ]
    return ",".join(parts)


def _sky() -> str:
    return (
        "gradients=s={0}x{1}:r={2}:d={3:.4f}:c0=0x0A111D:c1=0x24304A:c2=0x8E5246:c3=0xF2A464:"
        "x0=640:y0=0:x1=640:y1=470:nb_colors=4:speed=0:type=linear"
    ).format(WIDTH, HEIGHT, FPS, FRAME_S)


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
    """Full filter graph. `with_load=False` is the clean plate.

    Everything static is rendered once and held; only the water shimmer, the
    crane load and the film grain move. All noise uses fixed seeds, so the
    master is byte-identical on every run.
    """
    duration = DURATION_MS / 1000.0
    graph = [
        "{0},format=rgba[sky]".format(_sky()),
        "{0}[sun]".format(_sun()),
        "{0}[refl]".format(_reflection()),
        "[sky][sun]overlay=x={0}:y={1}[s1]".format(WIDTH // 2 - 320 + 120, 470 - 360),
        "[s1]format=yuv420p,{0},{1}[s2]".format(_skyline(), _set_chain()),
        "[s2][refl]overlay=x={0}:y=470[s3]".format(WIDTH // 2 - 130 + 120),
        "{0}[face]".format(_face_source()),
        "[s3][face]overlay=x={0}:y={1}:format=auto,{2},format=yuv420p[static0]".format(FACE.x, FACE.y, _features()),
        "[static0]{0}[static]".format(_hold("null")),
        (
            "color=c=0x0B1A24:s={0}x{1}:r={2}:d={3},noise=alls=70:allf=t+u:all_seed=7,"
            "avgblur=sizeX=30:sizeY=1,eq=brightness=0.04,format=rgba,colorchannelmixer=aa=0.6[shimmer]"
        ).format(WIDTH, HEIGHT - 472, FPS, duration),
        "[static][shimmer]overlay=x=0:y=472:format=auto[lit]",
    ]
    finish = "eq=contrast=1.06:saturation=1.08,vignette=angle=PI/4.5,noise=alls=7:allf=t:all_seed=11,format=yuv420p"
    if not with_load:
        graph.append("[lit]{0}[out]".format(finish))
        return ";".join(graph)
    graph.extend(
        [
            (
                "color=c=0xA14C28:s={0}x{1}:r={2}:d={3},"
                "drawbox=x=0:y=0:w=iw:h=ih:color=0x4E2312:t=6,"
                "drawbox=x=0:y=6:w=iw:h=3:color=0xD27A45@0.6:t=fill,"
                "drawbox=x=0:y=40:w=iw:h=4:color=0x6E3017:t=fill,"
                "drawbox=x=0:y=84:w=iw:h=4:color=0x6E3017:t=fill,"
                "drawbox=x=0:y=128:w=iw:h=4:color=0x6E3017:t=fill[load]"
            ).format(_LOAD_W, _LOAD_H, FPS, duration),
            "color=c=0x07080A:s=6x1400:r={0}:d={1}[cable]".format(FPS, duration),
            "[lit][cable]overlay=x={0}:y='({1})-1400':eval=frame[cabled]".format(_LOAD_X + _LOAD_W // 2 - 3, _LOAD_Y),
            "[cabled][load]overlay=x={0}:y='{1}':eval=frame[loaded]".format(_LOAD_X, _LOAD_Y),
            "[loaded]{0}[out]".format(finish),
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
