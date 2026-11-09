"""Timecode helpers for the demo clock.

Fixture timecodes are zero-padded `MM:SS.mmm` or `HH:MM:SS.mmm`. Comparisons
use integer milliseconds so 00:04.200 cannot drift through binary floats.
"""

from __future__ import annotations

import re

_MINUTES = re.compile(r"^(\d{2}):(\d{2})\.(\d{3})$")
_HOURS = re.compile(r"^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$")


def tc_ms(value: str) -> int:
    """Parse a fixture timecode into milliseconds from the start of the film."""
    minutes = _MINUTES.fullmatch(value)
    if minutes:
        minute, second, millis = minutes.groups()
        return int(minute) * 60000 + int(second) * 1000 + int(millis)
    hours = _HOURS.fullmatch(value)
    if hours:
        hour, minute, second, millis = hours.groups()
        return (
            int(hour) * 3600000
            + int(minute) * 60000
            + int(second) * 1000
            + int(millis)
        )
    raise ValueError("bad timecode")


def tc_seconds(value: str) -> str:
    """FFmpeg `-ss` argument with three millisecond digits."""
    return "{0:.3f}".format(tc_ms(value) / 1000.0)


def ms_tc(ms: int) -> str:
    """Integer milliseconds to `MM:SS.mmm`."""
    if ms < 0:
        raise ValueError("negative timecode")
    minutes, rest = divmod(int(ms), 60000)
    seconds, millis = divmod(rest, 1000)
    return "{0:02d}:{1:02d}.{2:03d}".format(minutes, seconds, millis)
