#!/usr/bin/env python3
"""Reproducible FFmpeg renderer for the LetShare4Gov film.

The renderer deliberately keeps the visual assembly (the cached silent master)
separate from narration and captions.  Once a silent master exists, changing
caption language or styling only reruns the final mux, rather than decoding
the ten generated source shots again.

Run from the repository root with:
    python3 media/letshare4gov-film/render.py
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import json
import shutil
import subprocess
import sys
import textwrap
import wave
from pathlib import Path
from typing import Any, Iterable


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRIPT_PATH = HERE / "script.json"
ASSET_VIDEO = ROOT / "attached_assets" / "generated_videos" / "letshare4gov"
ASSET_AUDIO = ROOT / "attached_assets" / "generated_audio" / "letshare4gov"
LOGO_PATH = ROOT / "attached_assets" / "letshare4gov-logo-dark.png"
SCORE_PATH = ASSET_AUDIO / "score.mp3"
FONT_DIR = HERE / "fonts"
FONT_PATH = FONT_DIR / "Inter-Variable.ttf"
EXPORT_DIR = HERE / "exports"
CACHE_DIR = HERE / "cache"

TARGETS = {
    "16x9": (1920, 1080),
    "9x16": (1080, 1920),
    "1x1": (1080, 1080),
    "4x5": (1080, 1350),
}
LANGUAGES = ("NL", "PT")
LANG_KEYS = {"NL": "nl", "PT": "pt"}
PORTRAIT_SHOTS = {1, 4, 5, 7, 8, 10}
PORTRAIT_FOR_ALL_COMPACT_LAYOUTS = {1, 4, 10}

# These are intentionally plain data so an editor can adjust a crop without
# changing the rendering logic.  Values are the horizontal crop centre in the
# source frame (0 = left, 0.5 = centre, 1 = right).
CROP_CENTERS = {
    "16x9": {shot: 0.50 for shot in range(1, 11)},
    "9x16": {
        1: 0.50, 2: 0.49, 3: 0.52, 4: 0.50, 5: 0.50,
        6: 0.48, 7: 0.51, 8: 0.50, 9: 0.52, 10: 0.50,
    },
    "1x1": {
        1: 0.50, 2: 0.49, 3: 0.52, 4: 0.50, 5: 0.50,
        6: 0.48, 7: 0.51, 8: 0.50, 9: 0.52, 10: 0.50,
    },
    "4x5": {
        1: 0.50, 2: 0.49, 3: 0.52, 4: 0.50, 5: 0.50,
        6: 0.48, 7: 0.51, 8: 0.50, 9: 0.52, 10: 0.50,
    },
}

# Caption line widths are in characters, not pixels.  ASS styles also set
# explicit pixel margins below, so social UI overlays do not cover text.
CAPTION_WIDTHS = {"16x9": 42, "9x16": 27, "1x1": 34, "4x5": 32}
CAPTION_STYLE = {
    "16x9": {"fontsize": 54, "margin_v": 82, "outline": 3},
    "9x16": {"fontsize": 60, "margin_v": 300, "outline": 4},
    "1x1": {"fontsize": 52, "margin_v": 180, "outline": 3},
    "4x5": {"fontsize": 52, "margin_v": 220, "outline": 3},
}


class RenderError(RuntimeError):
    """A missing or invalid input that must be fixed before rendering."""


def fail(message: str) -> None:
    raise RenderError(message)


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
        )
    except FileNotFoundError as exc:
        raise RenderError(f"Required executable is not available: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip()
        if len(details) > 4000:
            details = details[-4000:]
        raise RenderError(f"Command failed ({' '.join(command[:4])} …):\n{details}") from exc


def probe(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"Missing input: {path}")
    result = run(
        [
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ],
        capture=True,
    )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RenderError(f"ffprobe returned invalid JSON for {path}") from exc
    try:
        duration = float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RenderError(f"ffprobe did not report a duration for {path}") from exc
    data["_duration"] = duration
    return data


def video_stream(metadata: dict[str, Any], path: Path) -> dict[str, Any]:
    streams = [s for s in metadata.get("streams", []) if s.get("codec_type") == "video"]
    if not streams:
        fail(f"No video stream in {path}")
    return streams[0]


def audio_stream(metadata: dict[str, Any], path: Path) -> dict[str, Any]:
    streams = [s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"]
    if not streams:
        fail(f"No audio stream in {path}")
    return streams[0]


def load_script() -> dict[str, Any]:
    if not SCRIPT_PATH.is_file():
        fail(f"Missing script: {SCRIPT_PATH}")
    try:
        data = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RenderError(f"Invalid JSON in {SCRIPT_PATH}") from exc
    lines = data.get("lines")
    if not isinstance(lines, list) or len(lines) != 11:
        fail("script.json must contain exactly 11 voice lines")
    expected_ids = list(range(1, 12))
    if [line.get("id") for line in lines] != expected_ids:
        fail("script.json line ids must be consecutive 1 through 11")
    for line in lines:
        for key in ("en", "nl", "pt", "audio"):
            if not line.get(key):
                fail(f"script.json line {line.get('id')} is missing {key!r}")
    return data


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def file_signature(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def source_for(ratio: str, shot: int) -> Path:
    landscape = source_path(shot, "landscape")
    portrait = source_path(shot, "portrait") if shot in PORTRAIT_SHOTS else None
    if ratio != "16x9" and (
        shot in PORTRAIT_FOR_ALL_COMPACT_LAYOUTS
        or (ratio == "9x16" and shot in PORTRAIT_SHOTS)
    ):
        # These are specifically composed vertical source shots and should
        # never silently be replaced by a stretched or frozen landscape shot.
        if not portrait.is_file():
            fail(f"Required native portrait source is missing: {portrait}")
        return portrait
    return landscape


def source_path(shot: int, orientation: str) -> Path:
    """Use the approved generation manifest, including replacement shots."""
    manifest = ASSET_VIDEO / "shots.json"
    if not manifest.is_file():
        fail(f"Missing approved source manifest: {manifest}")
    records = json.loads(manifest.read_text(encoding="utf-8"))
    key = f"shot-{shot:02d}-{orientation}"
    matches = [record for record in records if record.get("id") == key]
    if len(matches) != 1:
        fail(f"Expected exactly one approved source for {key}")
    return ROOT / matches[0]["path"]


def validate_native_source(path: Path, ratio: str) -> dict[str, Any]:
    metadata = probe(path)
    stream = video_stream(metadata, path)
    width, height = int(stream.get("width", 0)), int(stream.get("height", 0))
    expected = (1080, 1920) if ratio != "16x9" and path.name.endswith("-portrait.mp4") else (1920, 1080)
    if (width, height) != expected:
        fail(
            f"{path} is {width}x{height}; expected native {expected[0]}x{expected[1]}. "
            "The renderer will not pretend a non-native source is 1080p."
        )
    return metadata


def build_timeline(script: dict[str, Any]) -> tuple[list[dict[str, Any]], float]:
    voice_meta: dict[int, dict[str, Any]] = {}
    for line in script["lines"]:
        line_id = int(line["id"])
        audio_path = ROOT / line["audio"]
        meta = probe(audio_path)
        audio_stream(meta, audio_path)
        voice_meta[line_id] = meta

    timeline: list[dict[str, Any]] = []
    cursor = 0.0
    for line in script["lines"]:
        line_id = int(line["id"])
        speech_duration = float(voice_meta[line_id]["_duration"])
        duration = max(7.0, speech_duration + 0.65)
        slot = {
            "id": line_id,
            "start": round(cursor, 6),
            "duration": round(duration, 6),
            "speech_start": round(cursor + 0.25, 6),
            "speech_duration": round(speech_duration, 6),
            "speech_end": round(cursor + 0.25 + speech_duration, 6),
            "audio": relative(ROOT / line["audio"]),
        }
        timeline.append(slot)
        cursor += duration
    return timeline, round(cursor, 6)


def wrap_lines(text: str, width: int) -> list[str]:
    clean = " ".join(str(text).split())
    return textwrap.wrap(
        clean,
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
        replace_whitespace=True,
    ) or [clean]


def caption_events(text: str, start: float, end: float, width: int) -> list[tuple[float, float, str]]:
    """Make readable, balanced caption chunks with contiguous timing.

    A greedy "fill two lines, then leave the tail" strategy produces awkward
    one-word events (and very short timings).  We instead find the smallest
    number of legal two-line groups, then partition those groups around the
    balanced character target.  Clause punctuation is preferred when it is
    close to that target.  A 1.2s floor is applied by taking time from longer
    groups, while preserving the complete normalized sentence.
    """
    minimum_event_duration = 1.2
    normalized = " ".join(str(text).split())
    words = normalized.split()
    if not words:
        return []
    duration = max(0.0, end - start)

    def legal_group(first: int, last: int) -> bool:
        if last - first < 2 and len(words) > 1:
            return False
        return len(wrap_lines(" ".join(words[first:last]), width)) <= 2

    # Dynamic programming minimizes imbalance while giving punctuation a
    # small preference.  At least two words per group prevents "equipa." /
    # "moeten." style tails.
    groups: list[str] | None = None
    max_group_count = max(1, len(words) // 2)
    for group_count in range(1, max_group_count + 1):
        target = len(normalized) / group_count

        @functools.lru_cache(maxsize=None)
        def best_partition(first: int, remaining: int) -> tuple[float, tuple[int, ...]] | None:
            if remaining == 1:
                if legal_group(first, len(words)):
                    return (
                        (len(" ".join(words[first:])) - target) ** 2,
                        (len(words),),
                    )
                return None
            # Leave at least two words for every later group.
            last_limit = len(words) - 2 * (remaining - 1)
            best: tuple[float, tuple[int, ...]] | None = None
            for last in range(first + 2, last_limit + 1):
                if not legal_group(first, last):
                    continue
                rest = best_partition(last, remaining - 1)
                if rest is None:
                    continue
                group_text = " ".join(words[first:last])
                punctuation = words[last - 1].rstrip("”’'\"")
                punctuation_bonus = 0 if punctuation.endswith((",", ";", ":", ".", "!", "?")) else 18
                score = (len(group_text) - target) ** 2 + punctuation_bonus + rest[0]
                candidate = (score, (last,) + rest[1])
                if best is None or candidate[0] < best[0]:
                    best = candidate
            return best

        solution = best_partition(0, group_count)
        if solution is not None:
            boundaries = solution[1]
            first = 0
            groups = []
            for boundary in boundaries:
                groups.append(" ".join(words[first:boundary]))
                first = boundary
            break

    # This only occurs for an unusually long unbreakable token.  Keep the
    # full text rather than dropping or inventing words.
    if groups is None:
        groups = [normalized]

    if len(groups) == 1:
        return [(start, end, "\\N".join(wrap_lines(groups[0], width)))]

    weights = [max(1, len(group)) for group in groups]
    if duration >= minimum_event_duration * len(groups):
        extra = duration - minimum_event_duration * len(groups)
        weight_total = sum(weights)
        event_durations = [
            minimum_event_duration + extra * weight / weight_total for weight in weights
        ]
    else:
        # There is no legal way to make every required two-line group 1.2s
        # without exceeding the spoken interval.  Preserve exact timing and
        # let the self-test report this exceptional input explicitly.
        weight_total = sum(weights)
        event_durations = [duration * weight / weight_total for weight in weights]

    events: list[tuple[float, float, str]] = []
    cursor = start
    for number, (group, event_duration) in enumerate(zip(groups, event_durations)):
        group_end = end if number == len(groups) - 1 else cursor + event_duration
        events.append((cursor, group_end, "\\N".join(wrap_lines(group, width))))
        cursor = group_end
    return events


def timestamp_srt(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def timestamp_vtt(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def timestamp_ass(seconds: float) -> str:
    centiseconds = max(0, int(round(seconds * 100)))
    hours, remainder = divmod(centiseconds, 360_000)
    minutes, remainder = divmod(remainder, 6_000)
    secs, cs = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{cs:02d}"


def make_captions(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
    ratios: Iterable[str],
    languages: Iterable[str],
) -> dict[str, dict[str, list[tuple[float, float, str]]]]:
    all_events: dict[str, dict[str, list[tuple[float, float, str]]]] = {}
    for language in languages:
        key = LANG_KEYS[language]
        generic: list[tuple[float, float, str]] = []
        by_ratio: dict[str, list[tuple[float, float, str]]] = {}
        for ratio in ratios:
            by_ratio[ratio] = []
        for line, slot in zip(script["lines"], timeline):
            start = slot["speech_start"]
            end = min(total_duration, slot["speech_end"] + 0.20, slot["start"] + slot["duration"])
            generic.extend(caption_events(line[key], start, end, 42))
            for ratio in ratios:
                by_ratio[ratio].extend(
                    caption_events(line[key], start, end, CAPTION_WIDTHS[ratio])
                )
        all_events[language] = {"generic": generic, **by_ratio}
    return all_events


def validate_caption_events(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
    ratios: Iterable[str],
    languages: Iterable[str],
) -> None:
    """Unit-style invariants for every generated language/layout event."""
    for language in languages:
        key = LANG_KEYS[language]
        for ratio in ratios:
            width = CAPTION_WIDTHS[ratio]
            for line, slot in zip(script["lines"], timeline):
                start = float(slot["speech_start"])
                end = min(
                    total_duration,
                    float(slot["speech_end"]) + 0.20,
                    float(slot["start"]) + float(slot["duration"]),
                )
                events = caption_events(line[key], start, end, width)
                expected = " ".join(str(line[key]).split())
                rebuilt = " ".join(
                    " ".join(event_text.replace("\\N", " ").split())
                    for _, _, event_text in events
                )
                if rebuilt != expected:
                    fail(f"{language}/{ratio}/line-{line['id']}: caption text changed")
                previous_end = start
                for event_start, event_end, event_text in events:
                    if event_start < previous_end - 1e-6:
                        fail(f"{language}/{ratio}/line-{line['id']}: caption overlap")
                    if event_end - event_start < 1.2 - 1e-6:
                        fail(
                            f"{language}/{ratio}/line-{line['id']}: caption event is "
                            f"{event_end - event_start:.2f}s; minimum is 1.20s"
                        )
                    if len(event_text.split("\\N")) > 2:
                        fail(f"{language}/{ratio}/line-{line['id']}: more than two lines")
                    if len(events) > 1 and len(event_text.replace("\\N", " ").split()) < 2:
                        fail(f"{language}/{ratio}/line-{line['id']}: one-word caption tail")
                    previous_end = event_end
                if events and events[-1][1] > end + 1e-6:
                    fail(f"{language}/{ratio}/line-{line['id']}: caption exceeds spoken segment")


def run_caption_unit_tests(script: dict[str, Any]) -> None:
    """Run caption tests without probing media or invoking FFmpeg."""
    timeline: list[dict[str, Any]] = []
    cursor = 0.0
    for line in script["lines"]:
        # A conservative synthetic spoken interval exercises wrapping and
        # splitting while keeping the test independent of generated audio.
        speech_duration = max(3.0, len(" ".join(line["nl"].split())) * 0.055)
        timeline.append(
            {
                "id": line["id"],
                "start": cursor,
                "duration": speech_duration + 0.65,
                "speech_start": cursor + 0.25,
                "speech_end": cursor + 0.25 + speech_duration,
            }
        )
        cursor += speech_duration + 0.65
    validate_caption_events(
        script, timeline, cursor, tuple(TARGETS), LANGUAGES
    )


def write_caption_files(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
    ratios: Iterable[str],
    languages: Iterable[str],
) -> list[Path]:
    ratios = tuple(ratios)
    languages = tuple(languages)
    events = make_captions(script, timeline, total_duration, ratios, languages)
    paths: list[Path] = []
    for language in languages:
        language_events = events[language]
        srt_path = HERE / f"captions_{language}.srt"
        vtt_path = HERE / f"captions_{language}.vtt"
        srt_blocks = [
            f"{index}\n{timestamp_srt(start)} --> {timestamp_srt(end)}\n{text.replace(chr(92) + 'N', chr(10))}\n"
            for index, (start, end, text) in enumerate(language_events["generic"], 1)
        ]
        vtt_blocks = [
            f"{timestamp_vtt(start)} --> {timestamp_vtt(end)}\n{text.replace(chr(92) + 'N', chr(10))}\n"
            for start, end, text in language_events["generic"]
        ]
        srt_path.write_text("\n".join(srt_blocks), encoding="utf-8")
        vtt_path.write_text("WEBVTT\n\n" + "\n".join(vtt_blocks), encoding="utf-8")
        paths.extend((srt_path, vtt_path))

        for ratio in ratios:
            ass_path = HERE / f"captions_{ratio}_{language}.ass"
            width, height = TARGETS[ratio]
            style = CAPTION_STYLE[ratio]
            ass = [
                "[Script Info]",
                "ScriptType: v4.00+",
                f"PlayResX: {width}",
                f"PlayResY: {height}",
                "WrapStyle: 2",
                "ScaledBorderAndShadow: yes",
                "",
                "[V4+ Styles]",
                "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
                "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
                "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
                "Alignment, MarginL, MarginR, MarginV, Encoding",
                f"Style: Default,Inter,{style['fontsize']},&H00FFFFFF,&H00FFFFFF,"
                f"&H00101824,&H80101824,0,0,0,0,100,100,0,0,1,{style['outline']},"
                f"1,2,70,70,{style['margin_v']},1",
                "",
                "[Events]",
                "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            ]
            for start, end, text in language_events[ratio]:
                ass.append(
                    f"Dialogue: 0,{timestamp_ass(start)},{timestamp_ass(end)},"
                    f"Default,,0,0,0,,{text}"
                )
            ass_path.write_text("\n".join(ass) + "\n", encoding="utf-8")
            paths.append(ass_path)
    return paths


def escape_filter_path(path: Path) -> str:
    # Paths are absolute on Linux in this environment. Keep this helper for
    # spaces and the characters that have meaning to FFmpeg filter parsing.
    return str(path).replace("\\", "\\\\").replace("'", "\\'")


def crop_filter(ratio: str, centre: float, width: int, height: int) -> str:
    target = width / height
    centre = max(0.0, min(1.0, centre))
    return (
        f"crop='if(gt(iw/ih,{target:.8f}),ih*{target:.8f},iw)':"
        f"'if(gt(iw/ih,{target:.8f}),ih,iw/{target:.8f})':"
        f"(iw-ow)*{centre:.5f}:(ih-oh)*0.5,"
        f"scale={width}:{height}:flags=lanczos,setsar=1"
    )


def drawtext(
    text: str,
    *,
    fontsize: int,
    x: str,
    y: str,
    fontcolor: str,
    box: bool = False,
) -> str:
    safe_text = text.replace("\\", "\\\\").replace("'", "\\'")
    box_options = ":box=1:boxcolor=0x101824@0.30:boxborderw=14" if box else ""
    return (
        f"drawtext=fontfile='{escape_filter_path(FONT_PATH)}':text='{safe_text}':"
        f"fontsize={fontsize}:fontcolor={fontcolor}:x={x}:y={y}{box_options}"
    )


def visual_cache_key(
    timeline: list[dict[str, Any]],
    total_duration: float,
    source_records: dict[str, dict[str, Any]],
) -> str:
    settings = {
        "targets": TARGETS,
        "crop_centres": CROP_CENTERS,
        "timeline": timeline,
        "total_duration": total_duration,
        "sources": source_records,
        "logo": (
            relative(LOGO_PATH),
            LOGO_PATH.stat().st_size,
            LOGO_PATH.stat().st_mtime_ns,
        ),
        "font": (relative(FONT_PATH), FONT_PATH.stat().st_size, FONT_PATH.stat().st_mtime_ns),
        "renderer": 5,
    }
    return hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:16]


def build_silent_master(
    ratio: str,
    timeline: list[dict[str, Any]],
    total_duration: float,
    source_records: dict[str, dict[str, Any]],
    cache_key: str,
) -> Path:
    width, height = TARGETS[ratio]
    cache_path = CACHE_DIR / f"silent_{ratio}_{cache_key}.mp4"
    if cache_path.is_file() and cache_path.stat().st_size > 0:
        return cache_path

    inputs: list[Path] = []
    for shot in range(1, 11):
        inputs.append(Path(source_records[f"shot-{shot:02d}"]["path"]))
    if not LOGO_PATH.is_file():
        fail(f"Missing endcard logo: {LOGO_PATH}")

    filters: list[str] = []
    labels: list[str] = []
    for index, shot in enumerate(range(1, 11)):
        slot = timeline[shot - 1]
        duration = float(slot["duration"])
        centre = CROP_CENTERS[ratio][shot]
        # The approved arrival take has a reflected sign at the extreme right.
        # A tighter left-anchored framing removes it while keeping the group.
        pre_crop = "crop=iw*0.88:ih*0.88:0:0," if shot == 1 and ratio == "16x9" else ""
        if shot == 7 and ratio == "9x16":
            # The generator included fixed black mattes inside the native
            # portrait frame. Remove them and preserve the receptionist at right.
            pre_crop = "crop=1080:1584:0:168,"
            centre = 1.0
        chain = (
            f"[{index}:v]trim=duration={duration:.6f},setpts=PTS-STARTPTS,"
            f"{pre_crop}{crop_filter(ratio, centre, width, height)},fps=30,settb=AVTB"
        )
        if shot == 1:
            heading_size = max(26, round(min(width, height) * 0.026))
            chain += "," + drawtext(
                "LetShare4Gov",
                fontsize=heading_size,
                x=f"{round(width * 0.06)}",
                y=f"{round(height * 0.07)}",
                fontcolor="white@0.88",
                box=True,
            )
        label = f"v{shot}"
        chain += f"[{label}]"
        filters.append(chain)
        labels.append(f"[{label}]")

    logo_input = len(inputs)
    logo_width = round(width * (0.42 if ratio == "16x9" else 0.52))
    logo_height = round(height * (0.20 if ratio == "16x9" else 0.16))
    safe_bottom = CAPTION_STYLE[ratio]["margin_v"]
    title_size = max(42, round(min(width, height) * 0.075))
    subtitle_size = max(25, round(min(width, height) * 0.035))
    disclosure_size = max(18, round(min(width, height) * 0.018))
    logo_y = round(height * (0.14 if ratio == "16x9" else 0.13))
    title_y = round(height * (0.53 if ratio == "16x9" else 0.48))
    subtitle_y = title_y + round(title_size * 1.45)
    # Keep the disclosure in the endcard's open middle area.  It must sit
    # above the caption-safe boundary rather than sharing the lower caption
    # region, especially on 9:16 where social UI can cover the bottom 300px.
    disclosure_y = min(
        subtitle_y + subtitle_size + round(min(width, height) * 0.035),
        height - safe_bottom - disclosure_size - 30,
    )
    endcard_duration = float(timeline[-1]["duration"])
    filters.extend(
        [
            f"color=c=0xF6F8FA:s={width}x{height}:r=30:d={endcard_duration:.6f},"
            "settb=AVTB[ecard]",
            f"[{logo_input}:v]format=rgba,scale=w={logo_width}:h={logo_height}:"
            "force_original_aspect_ratio=decrease[logo]",
            f"[ecard][logo]overlay=x=(main_w-overlay_w)/2:y={logo_y}:shortest=1,"
            + drawtext(
                "Book a demo",
                fontsize=title_size,
                x="(w-text_w)/2",
                y=str(title_y),
                fontcolor="0x101824",
            )
            + ","
            + drawtext(
                "A more connected working day",
                fontsize=subtitle_size,
                x="(w-text_w)/2",
                y=str(subtitle_y),
                fontcolor="0x334155",
            )
            + ","
            + drawtext(
                "AI-generated scenes and narration. Not footage of actual customers or employees.",
                fontsize=disclosure_size,
                x="(w-text_w)/2",
                y=str(disclosure_y),
                fontcolor="0x52606D",
            )
            + "[endcard]",
            "".join(labels) + "[endcard]concat=n=11:v=1:a=0,format=yuv420p[vout]",
        ]
    )
    command = ["ffmpeg", "-y", "-filter_complex_threads", "2"]
    for path in inputs:
        command.extend(["-threads", "2", "-i", str(path)])
    command.extend(["-loop", "1", "-i", str(LOGO_PATH)])
    command.extend(
        [
            "-filter_complex", ";".join(filters),
            "-map", "[vout]", "-an", "-t", f"{total_duration:.6f}",
            "-threads", "3", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-r", "30", "-fps_mode", "cfr",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(cache_path),
        ]
    )
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    run(command)
    if not cache_path.is_file() or cache_path.stat().st_size == 0:
        fail(f"FFmpeg did not create silent master: {cache_path}")
    return cache_path


def audio_cache_key(
    script: dict[str, Any], timeline: list[dict[str, Any]], total_duration: float
) -> str:
    files = []
    for line in script["lines"]:
        path = ROOT / line["audio"]
        signature = file_signature(path)
        files.append((relative(path), signature))
    score_signature = file_signature(SCORE_PATH)
    settings = {
        "timeline": timeline,
        "total_duration": total_duration,
        "narration": files,
        "score": (relative(SCORE_PATH), score_signature),
        "narration_loudnorm": "I=-16:TP=-1.5:LRA=11",
        "score_volume": 0.08,
        "amix_normalize": 0,
        "renderer": 3,
    }
    return hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:16]


SAMPLE_RATE = 48000
SAMPLE_CHANNELS = 2
SAMPLE_WIDTH = 2


def decode_normalized_pcm(path: Path) -> bytes:
    """Decode one narration file to deterministic little-endian s16 stereo PCM."""
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vn", "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000:async=1:first_pts=0",
        "-ac", "2", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-",
    ]
    try:
        result = subprocess.run(
            command, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "stderr", b"")
        if isinstance(detail, bytes):
            detail = detail.decode("utf-8", "replace")
        raise RenderError(f"Could not decode normalized narration {path}: {detail[-2000:]}") from exc
    pcm = result.stdout
    frame_bytes = SAMPLE_CHANNELS * SAMPLE_WIDTH
    if not pcm or len(pcm) % frame_bytes:
        fail(f"Normalized narration is not complete stereo PCM: {path}")
    return pcm


def pcm_rms_db(pcm: bytes) -> float:
    """Return RMS level for s16le stereo PCM without third-party modules."""
    if not pcm:
        return -120.0
    total = 0
    count = 0
    for offset in range(0, len(pcm), SAMPLE_WIDTH):
        sample = int.from_bytes(pcm[offset:offset + SAMPLE_WIDTH], "little", signed=True)
        total += sample * sample
        count += 1
    if not count or total <= 0:
        return -120.0
    import math
    return 20.0 * math.log10(math.sqrt(total / count) / 32768.0)


def build_sequenced_narration(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
) -> tuple[Path, list[dict[str, Any]]]:
    """Place independently decoded narration at exact sample offsets.

    This intentionally does not use adelay or timestamp-sensitive amix
    alignment.  Every source is normalized and decoded first, then copied into
    one zero-filled 77-second PCM buffer at speech_start * 48000.
    """
    wav_path = CACHE_DIR / "audio-sequenced.wav"
    stats_path = CACHE_DIR / "audio-sequenced-stats.json"
    total_samples = round(total_duration * SAMPLE_RATE)
    frame_bytes = SAMPLE_CHANNELS * SAMPLE_WIDTH
    buffer = bytearray(total_samples * frame_bytes)
    stats: list[dict[str, Any]] = []
    previous_end = 0
    for line, slot in zip(script["lines"], timeline):
        path = ROOT / line["audio"]
        pcm = decode_normalized_pcm(path)
        sample_start = round(float(slot["speech_start"]) * SAMPLE_RATE)
        sample_count = len(pcm) // frame_bytes
        sample_end = sample_start + sample_count
        if sample_start < previous_end:
            fail(
                f"Narration overlap at line {line['id']}: "
                f"{sample_start / SAMPLE_RATE:.6f}s < {previous_end / SAMPLE_RATE:.6f}s"
            )
        if sample_start < 0 or sample_end > total_samples:
            fail(
                f"Narration line {line['id']} overflows {total_duration:.3f}s mix: "
                f"{sample_end / SAMPLE_RATE:.6f}s"
            )
        begin = sample_start * frame_bytes
        buffer[begin:begin + len(pcm)] = pcm
        previous_end = sample_end
        stats.append(
            {
                "id": line["id"],
                "start_sample": sample_start,
                "start_s": sample_start / SAMPLE_RATE,
                "samples": sample_count,
                "duration_s": sample_count / SAMPLE_RATE,
                "end_s": sample_end / SAMPLE_RATE,
                "rms_db": round(pcm_rms_db(pcm), 2),
                "bytes": len(pcm),
            }
        )

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_path), "wb") as output:
        output.setnchannels(SAMPLE_CHANNELS)
        output.setsampwidth(SAMPLE_WIDTH)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(buffer)
    stats_path.write_text(
        json.dumps(
            {
                "cache_version": 3,
                "sample_rate": SAMPLE_RATE,
                "channels": SAMPLE_CHANNELS,
                "total_duration": total_duration,
                "slots": stats,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    return wav_path, stats


def build_audio_mix(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
) -> Path:
    key = audio_cache_key(script, timeline, total_duration)
    cache_path = CACHE_DIR / "audio-sequenced.m4a"
    wav_path, slot_stats = build_sequenced_narration(script, timeline, total_duration)
    voices = [ROOT / line["audio"] for line in script["lines"]]
    if len(slot_stats) != len(voices):
        fail("Sequenced narration slot count does not match script")
    command = [
        "ffmpeg", "-hide_banner", "-y", "-filter_complex_threads", "2",
        "-i", str(wav_path), "-stream_loop", "-1", "-i", str(SCORE_PATH),
    ]
    audio_filters = [
        "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,"
        f"atrim=duration={total_duration:.6f},asetpts=PTS-STARTPTS[narration]",
        "[1:a]aresample=48000:async=1:first_pts=0,"
        "aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS,"
        f"volume=0.08,apad,atrim=duration={total_duration:.6f},"
        f"afade=t=out:st={max(0.0, total_duration - 2):.6f}:d=2[score]",
        "[narration][score]amix=inputs=2:duration=longest:dropout_transition=0:"
        f"normalize=0,atrim=duration={total_duration:.6f},"
        "alimiter=limit=0.95,asetpts=PTS-STARTPTS[aout]",
    ]
    command.extend(
        [
            "-filter_complex", ";".join(audio_filters),
            "-map", "[aout]", "-vn", "-t", f"{total_duration:.6f}",
            "-threads", "3", "-c:a", "aac", "-b:a", "192k",
            "-ar", "48000", "-ac", "2", str(cache_path),
        ]
    )
    run(command)
    if not cache_path.is_file() or cache_path.stat().st_size == 0:
        fail(f"FFmpeg did not create sequenced audio mix: {cache_path}")
    try:
        generated_metadata = probe(cache_path)
        generated_audio = audio_stream(generated_metadata, cache_path)
        generated_duration = float(
            generated_audio.get("duration", generated_metadata["_duration"])
        )
    except (RenderError, TypeError, ValueError) as exc:
        cache_path.unlink(missing_ok=True)
        raise RenderError(f"Cached audio mix is not probeable: {cache_path}") from exc
    if abs(generated_duration - total_duration) > 0.25:
        cache_path.unlink(missing_ok=True)
        fail(
            f"Sequenced audio mix is {generated_duration:.3f}s; expected "
            f"{total_duration:.3f}s. Refusing to reuse it."
        )
    print(
        f"Sequenced narration: {wav_path} -> {cache_path}; "
        f"{len(slot_stats)} isolated slots, {generated_duration:.3f}s"
    )
    for slot in slot_stats:
        print(
            f"  line {slot['id']:02d}: start={slot['start_s']:.3f}s "
            f"end={slot['end_s']:.3f}s rms={slot['rms_db']:.1f}dB"
        )
    return cache_path


def render_export(
    ratio: str,
    language: str,
    silent_master: Path,
    audio_mix: Path,
    total_duration: float,
) -> Path:
    output = EXPORT_DIR / f"LetShare4Gov_{ratio}_EN_{language}.mp4"
    ass_path = HERE / f"captions_{ratio}_{language}.ass"
    font_dir = escape_filter_path(FONT_DIR)
    ass_file = escape_filter_path(ass_path)
    # The ASS filter receives the checked-in Inter variable font directory,
    # avoiding reliance on whatever fonts happen to be installed on the host.
    video_filter = f"ass=filename='{ass_file}':fontsdir='{font_dir}'"
    command = [
        "ffmpeg", "-y", "-i", str(silent_master), "-i", str(audio_mix),
        "-map", "0:v:0", "-map", "1:a:0", "-vf", video_filter,
        "-t", f"{total_duration:.6f}",
        "-threads", "3", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30", "-fps_mode", "cfr",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", str(output),
    ]
    run(command)
    if not output.is_file() or output.stat().st_size == 0:
        fail(f"FFmpeg did not create export: {output}")
    return output


def write_metadata(
    script: dict[str, Any],
    timeline: list[dict[str, Any]],
    total_duration: float,
    source_records: dict[str, dict[str, Any]],
    captions: Iterable[Path],
    exports: Iterable[Path],
    cache_key: str,
) -> None:
    timeline_data = {
        "title": script.get("title"),
        "brand": script.get("brand"),
        "voice_language": script.get("voiceLanguage"),
        "total_duration": total_duration,
        "slot_count": len(timeline),
        "timing_rule": "max(7.0, actual speech duration + 0.65); narration starts slot + 0.25",
        "timeline": timeline,
        "sources": source_records,
        "crop_centres": CROP_CENTERS,
        "targets": TARGETS,
        "caption_safe_margins_px": {k: v["margin_v"] for k, v in CAPTION_STYLE.items()},
        "cache_key": cache_key,
    }
    (HERE / "render_timeline.json").write_text(
        json.dumps(timeline_data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "film": "LetShare4Gov",
        "generated_by": "media/letshare4gov-film/render.py",
        "total_duration": total_duration,
        "outputs": [relative(path) for path in exports],
        "captions": [relative(path) for path in captions],
        "timeline": relative(HERE / "render_timeline.json"),
        "silent_master_cache_key": cache_key,
        "audio": {
            "narration": "normalized loudnorm I=-16 TP=-1.5 LRA=11",
            "score": f"{relative(SCORE_PATH)} at volume 0.08",
            "source_shot_audio": "muted",
        },
        "video": {
            "codec": "H.264 libx264",
            "pixel_format": "yuv420p",
            "audio_codec": "AAC",
            "faststart": True,
            "threads": 3,
        },
    }
    (HERE / "export_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def selected_values(raw: str, allowed: Iterable[str], label: str) -> tuple[str, ...]:
    allowed = tuple(allowed)
    requested = tuple(dict.fromkeys(item.strip() for item in raw.split(",") if item.strip()))
    invalid = [item for item in requested if item not in allowed]
    if invalid:
        fail(f"Invalid {label}: {', '.join(invalid)}. Choose from {', '.join(allowed)}")
    if not requested:
        fail(f"At least one {label} is required")
    return requested


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild silent masters and overwrite exports (caption files are always refreshed).",
    )
    parser.add_argument(
        "--ratios",
        default=",".join(TARGETS),
        help="Comma-separated layouts to render (default: all four).",
    )
    parser.add_argument(
        "--languages",
        default=",".join(LANGUAGES),
        help="Comma-separated caption languages to render (default: NL,PT).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run caption wrapping/timing invariants without probing or rendering media.",
    )
    args = parser.parse_args()
    selected_ratios = selected_values(args.ratios, TARGETS, "ratios")
    selected_languages = selected_values(args.languages.upper(), LANGUAGES, "languages")
    script = load_script()
    if args.self_test:
        run_caption_unit_tests(script)
        print("Caption unit tests passed.")
        return 0

    for executable in ("ffmpeg", "ffprobe"):
        if shutil.which(executable) is None:
            fail(f"Required executable is not available on PATH: {executable}")
    if not FONT_PATH.is_file():
        fail(f"Missing local Inter font: {FONT_PATH}")
    if not SCORE_PATH.is_file():
        fail(f"Missing score audio: {SCORE_PATH}")
    score_metadata = probe(SCORE_PATH)
    audio_stream(score_metadata, SCORE_PATH)
    if not LOGO_PATH.is_file():
        fail(f"Missing endcard logo: {LOGO_PATH}")
    if args.force and CACHE_DIR.is_dir():
        for cached in (*CACHE_DIR.glob("silent_*.mp4"), *CACHE_DIR.glob("audio_*.m4a")):
            cached.unlink()

    timeline, total_duration = build_timeline(script)
    validate_caption_events(
        script, timeline, total_duration, selected_ratios, selected_languages
    )
    source_records: dict[str, dict[str, Any]] = {}
    # Validate every landscape source once, including sources that may be
    # replaced by a portrait source in one of the layout passes.
    for shot in range(1, 11):
        path = source_path(shot, "landscape")
        meta = validate_native_source(path, "16x9")
        source_records[f"shot-{shot:02d}-landscape"] = {
            "path": str(path),
            "relative_path": relative(path),
            "width": video_stream(meta, path).get("width"),
            "height": video_stream(meta, path).get("height"),
            "duration": meta["_duration"],
            **file_signature(path),
        }
    for shot in PORTRAIT_SHOTS:
        path = source_path(shot, "portrait")
        if path.is_file():
            meta = validate_native_source(path, "9x16")
            source_records[f"shot-{shot:02d}-portrait"] = {
                "path": str(path),
                "relative_path": relative(path),
                "width": video_stream(meta, path).get("width"),
                "height": video_stream(meta, path).get("height"),
                "duration": meta["_duration"],
                **file_signature(path),
            }

    # Check selected sources and that no shot is too short.  A short source
    # is an explicit error rather than an implicit frozen-frame extension.
    selected_by_ratio: dict[str, dict[str, Path]] = {}
    for ratio in selected_ratios:
        selected_by_ratio[ratio] = {}
        for shot in range(1, 11):
            path = source_for(ratio, shot)
            selected_by_ratio[ratio][str(shot)] = path
            key = f"shot-{shot:02d}-{'portrait' if path.name.endswith('-portrait.mp4') else 'landscape'}"
            duration = float(source_records[key]["duration"])
            if duration + 0.05 < float(timeline[shot - 1]["duration"]):
                fail(
                    f"Source {path} is {duration:.3f}s but slot {shot} needs "
                    f"{timeline[shot - 1]['duration']:.3f}s; refusing to freeze or speed it."
                )

    # Source records for all selected ratios are included in the cache key.
    for ratio, selected in selected_by_ratio.items():
        for shot_string, path in selected.items():
            key = f"{ratio}-shot-{int(shot_string):02d}"
            source_records[key] = {
                "path": str(path),
                "relative_path": relative(path),
                "duration": source_records[
                    f"shot-{int(shot_string):02d}-{'portrait' if path.name.endswith('-portrait.mp4') else 'landscape'}"
                ]["duration"],
                **file_signature(path),
            }

    cache_key = visual_cache_key(timeline, total_duration, source_records)
    captions = write_caption_files(
        script, timeline, total_duration, selected_ratios, selected_languages
    )
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    audio_mix = build_audio_mix(script, timeline, total_duration)
    exports: list[Path] = []
    for ratio in selected_ratios:
        # build_silent_master uses source_records selected for the current
        # ratio, so pass a ratio-specific copy with the canonical shot keys.
        ratio_records = {
            f"shot-{shot:02d}": {
                "path": str(selected_by_ratio[ratio][str(shot)]),
                "duration": source_records[
                    f"{ratio}-shot-{shot:02d}"
                ]["duration"],
            }
            for shot in range(1, 11)
        }
        silent = build_silent_master(
            ratio, timeline, total_duration, ratio_records, cache_key
        )
        for language in selected_languages:
            exports.append(
                render_export(
                    ratio, language, silent, audio_mix, total_duration
                )
            )
    write_metadata(
        script, timeline, total_duration, source_records, captions, exports, cache_key
    )
    print(f"Rendered {len(exports)} exports ({total_duration:.2f}s timeline).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RenderError as exc:
        print(f"render.py: error: {exc}", file=sys.stderr)
        raise SystemExit(2)