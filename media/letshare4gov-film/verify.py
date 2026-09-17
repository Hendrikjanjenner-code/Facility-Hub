#!/usr/bin/env python3
"""Validate the eight LetShare4Gov exports and their timed captions.

This is intentionally independent of render.py's implementation details: it
probes the encoded files with ffprobe, checks the subtitle formats, and can
extract one representative frame from each export for a quick contact sheet.

Run after rendering:
    python3 media/letshare4gov-film/verify.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EXPORT_DIR = HERE / "exports"
TIMELINE_PATH = HERE / "render_timeline.json"
RATIOS = {"16x9": (1920, 1080), "9x16": (1080, 1920), "1x1": (1080, 1080), "4x5": (1080, 1350)}
LANGUAGES = ("NL", "PT")


class VerificationError(RuntimeError):
    pass


def command(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            cwd=ROOT,
            check=True,
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
        )
    except FileNotFoundError as exc:
        raise VerificationError(f"Required executable is unavailable: {args[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip()
        raise VerificationError(f"Command failed: {' '.join(args[:4])} …\n{detail[-2500:]}") from exc


def probe(path: Path) -> dict[str, Any]:
    result = command(
        [
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ],
        capture=True,
    )
    try:
        data = json.loads(result.stdout)
        data["_duration"] = float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VerificationError(f"Invalid ffprobe data for {path}") from exc
    return data


def check_media(
    expected_duration: float, ratios: tuple[str, ...], languages: tuple[str, ...]
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    expected_outputs = [
        EXPORT_DIR / f"LetShare4Gov_{ratio}_EN_{language}.mp4"
        for ratio in ratios
        for language in languages
    ]
    for path in expected_outputs:
        if not path.is_file() or path.stat().st_size == 0:
            raise VerificationError(f"Missing or empty export: {path}")
        metadata = probe(path)
        streams = metadata.get("streams", [])
        videos = [stream for stream in streams if stream.get("codec_type") == "video"]
        audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
        if len(videos) != 1:
            raise VerificationError(f"{path.name}: expected one video stream")
        if not audios:
            raise VerificationError(f"{path.name}: expected a nonempty audio stream")
        video = videos[0]
        audio = audios[0]
        ratio = path.name.split("_")[1]
        expected_width, expected_height = RATIOS[ratio]
        actual_size = (int(video.get("width", 0)), int(video.get("height", 0)))
        if actual_size != (expected_width, expected_height):
            raise VerificationError(
                f"{path.name}: dimensions {actual_size[0]}x{actual_size[1]}, "
                f"expected {expected_width}x{expected_height}"
            )
        if video.get("codec_name") != "h264":
            raise VerificationError(f"{path.name}: video codec is not H.264")
        if audio.get("codec_name") != "aac":
            raise VerificationError(f"{path.name}: audio codec is not AAC")
        if video.get("pix_fmt") != "yuv420p":
            raise VerificationError(f"{path.name}: pixel format is not yuv420p")
        duration = metadata["_duration"]
        if abs(duration - expected_duration) > 0.20:
            raise VerificationError(
                f"{path.name}: duration {duration:.3f}s differs from timeline "
                f"{expected_duration:.3f}s by more than 0.20s"
            )
        try:
            audio_duration = float(audio["duration"])
        except (KeyError, TypeError, ValueError) as exc:
            raise VerificationError(f"{path.name}: audio duration is missing") from exc
        if audio_duration <= 0.1:
            raise VerificationError(f"{path.name}: audio stream is empty")
        if abs(audio_duration - expected_duration) > 0.30:
            raise VerificationError(
                f"{path.name}: audio duration {audio_duration:.3f}s differs from "
                f"expected {expected_duration:.3f}s"
            )
        if abs(audio_duration - expected_duration) > 0.20:
            raise VerificationError(
                f"{path.name}: audio duration {audio_duration:.3f}s does not cover "
                f"the {expected_duration:.3f}s film"
            )
        records.append(
            {
                "path": str(path),
                "duration": duration,
                "width": expected_width,
                "height": expected_height,
                "video_codec": video.get("codec_name"),
                "audio_codec": audio.get("codec_name"),
                "audio_duration": audio_duration,
            }
        )
        check_audio_volume(path)
    return records


def check_audio_volume(path: Path) -> None:
    """Reject an encoded track that is present but effectively silent."""
    result = command(
        [
            "ffmpeg", "-hide_banner", "-i", str(path), "-vn",
            "-af", "volumedetect", "-f", "null", "-",
        ],
        capture=True,
    )
    mean_match = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", result.stderr or "")
    max_match = re.search(r"max_volume:\s*(-?[\d.]+)\s*dB", result.stderr or "")
    if not mean_match or not max_match:
        raise VerificationError(f"{path.name}: ffmpeg did not report audio levels")
    mean_volume = float(mean_match.group(1))
    max_volume = float(max_match.group(1))
    if max_volume <= -60.0 or mean_volume <= -45.0:
        raise VerificationError(
            f"{path.name}: audio is effectively silent "
            f"(mean {mean_volume:.1f} dB, max {max_volume:.1f} dB)"
        )


def parse_time(value: str) -> float:
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    if len(parts) != 3:
        raise ValueError(value)
    hours, minutes, seconds = parts
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def validate_event_ranges(
    events: list[tuple[float, float, str]], duration: float, label: str
) -> None:
    if not events:
        raise VerificationError(f"{label}: no subtitle events")
    previous = 0.0
    for start, end, text in events:
        if not text.strip():
            raise VerificationError(f"{label}: empty subtitle text")
        if start < -0.01 or end <= start:
            raise VerificationError(f"{label}: invalid subtitle range {start}-->{end}")
        if end > duration + 0.20:
            raise VerificationError(
                f"{label}: subtitle ends at {end:.3f}s after media duration {duration:.3f}s"
            )
        # Events may be split for readability, but must not reverse in time.
        if start + 0.001 < previous:
            raise VerificationError(f"{label}: subtitle events are out of order")
        previous = end


def parse_srt(path: Path) -> list[tuple[float, float, str]]:
    text = path.read_text(encoding="utf-8-sig")
    blocks = re.split(r"\n\s*\n", text.strip())
    events: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3:
            raise VerificationError(f"{path.name}: malformed SRT block")
        match = re.match(r"^\s*(\S+)\s+-->\s+(\S+)", lines[1])
        if not match:
            raise VerificationError(f"{path.name}: malformed SRT timing")
        try:
            start, end = parse_time(match.group(1)), parse_time(match.group(2))
        except ValueError as exc:
            raise VerificationError(f"{path.name}: malformed timestamp") from exc
        events.append((start, end, "\n".join(lines[2:])))
    return events


def parse_vtt(path: Path) -> list[tuple[float, float, str]]:
    text = path.read_text(encoding="utf-8-sig")
    if not text.startswith("WEBVTT"):
        raise VerificationError(f"{path.name}: missing WEBVTT header")
    blocks = re.split(r"\n\s*\n", text[len("WEBVTT"):].strip())
    events: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = block.splitlines()
        timing_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if timing_index is None or timing_index + 1 >= len(lines):
            raise VerificationError(f"{path.name}: malformed VTT block")
        match = re.match(r"^\s*(\S+)\s+-->\s+(\S+)", lines[timing_index])
        if not match:
            raise VerificationError(f"{path.name}: malformed VTT timing")
        events.append(
            (
                parse_time(match.group(1)),
                parse_time(match.group(2)),
                "\n".join(lines[timing_index + 1:]),
            )
        )
    return events


def parse_ass(path: Path) -> list[tuple[float, float, str]]:
    events: list[tuple[float, float, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("Dialogue:"):
            continue
        fields = line.split(",", 9)
        if len(fields) != 10:
            raise VerificationError(f"{path.name}: malformed ASS dialogue")
        events.append((parse_time(fields[1]), parse_time(fields[2]), fields[9]))
    return events


def check_subtitles(
    records: list[dict[str, Any]], ratios: tuple[str, ...], languages: tuple[str, ...]
) -> list[str]:
    labels: list[str] = []
    # SRT/VTT are language-level timed files.  They use the same timeline as
    # every aspect ratio and are checked against the first export duration.
    duration = records[0]["duration"]
    ratio_durations = {
        Path(record["path"]).name.split("_")[1]: record["duration"] for record in records
    }
    for language in languages:
        for suffix, parser in (("srt", parse_srt), ("vtt", parse_vtt)):
            path = HERE / f"captions_{language}.{suffix}"
            if not path.is_file() or path.stat().st_size == 0:
                raise VerificationError(f"Missing subtitle file: {path}")
            validate_event_ranges(parser(path), duration, path.name)
            labels.append(str(path))
        for ratio in ratios:
            ratio_duration = ratio_durations[ratio]
            path = HERE / f"captions_{ratio}_{language}.ass"
            if not path.is_file() or path.stat().st_size == 0:
                raise VerificationError(f"Missing layout subtitle file: {path}")
            validate_event_ranges(parse_ass(path), ratio_duration, path.name)
            labels.append(str(path))
    return labels


def extract_frames(
    records: list[dict[str, Any]],
    output_dir: Path,
    ratios: tuple[str, ...],
    languages: tuple[str, ...],
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    for record in records:
        source = Path(record["path"])
        frame = output_dir / f"{source.stem}.jpg"
        command(
            [
                "ffmpeg", "-y", "-ss", "2", "-i", str(source),
                "-frames:v", "1", "-q:v", "3", str(frame),
            ]
        )
        if not frame.is_file() or frame.stat().st_size == 0:
            raise VerificationError(f"Could not extract representative frame for {source.name}")
        frame_paths.append(frame)
    contact = output_dir / "contact-sheet.jpg"
    input_args: list[str] = []
    for frame in frame_paths:
        input_args.extend(["-i", str(frame)])
    normalized = [
        f"[{index}:v]scale=320:568:force_original_aspect_ratio=decrease,"
        f"pad=320:568:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[v{index}]"
        for index in range(len(frame_paths))
    ]
    frame_labels = "".join(f"[v{index}]" for index in range(len(frame_paths)))
    command(
        [
            "ffmpeg", "-y", "-filter_complex_threads", "2", *input_args,
            "-filter_complex",
            ";".join(normalized) + ";"
            f"{frame_labels}concat=n={len(frame_paths)}:v=1:a=0,"
            f"tile={len(languages)}x{len(ratios)}:padding=8:margin=8",
            "-frames:v", "1", "-q:v", "3", str(contact),
        ]
    )
    if not contact.is_file() or contact.stat().st_size == 0:
        raise VerificationError("FFmpeg did not create the contact sheet")
    return contact


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-frames",
        action="store_true",
        help="Skip representative frame/contact-sheet extraction.",
    )
    parser.add_argument(
        "--frame-dir",
        type=Path,
        default=HERE / "verification",
        help="Directory for representative frames (default: media/letshare4gov-film/verification).",
    )
    parser.add_argument(
        "--ratios",
        default=",".join(RATIOS),
        help="Comma-separated layouts to verify (default: all four).",
    )
    parser.add_argument(
        "--languages",
        default=",".join(LANGUAGES),
        help="Comma-separated caption languages to verify (default: NL,PT).",
    )
    args = parser.parse_args()
    ratios = tuple(dict.fromkeys(item.strip() for item in args.ratios.split(",") if item.strip()))
    languages = tuple(
        dict.fromkeys(item.strip().upper() for item in args.languages.split(",") if item.strip())
    )
    invalid_ratios = [ratio for ratio in ratios if ratio not in RATIOS]
    invalid_languages = [language for language in languages if language not in LANGUAGES]
    if invalid_ratios or invalid_languages or not ratios or not languages:
        raise VerificationError(
            "Use one or more valid ratios (16x9,9x16,1x1,4x5) and languages (NL,PT)."
        )

    for executable in ("ffmpeg", "ffprobe"):
        if shutil.which(executable) is None:
            raise VerificationError(f"Required executable is unavailable on PATH: {executable}")
    if not TIMELINE_PATH.is_file():
        raise VerificationError(f"Missing render timeline metadata: {TIMELINE_PATH}")
    try:
        timeline = json.loads(TIMELINE_PATH.read_text(encoding="utf-8"))
        expected_duration = float(timeline["total_duration"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise VerificationError("Invalid render_timeline.json") from exc

    records = check_media(expected_duration, ratios, languages)
    subtitle_files = check_subtitles(records, ratios, languages)
    contact = None
    if not args.no_frames:
        contact = extract_frames(records, args.frame_dir, ratios, languages)
    print(f"Verified {len(records)} exports, {len(subtitle_files)} subtitle files.")
    if contact:
        print(f"Contact sheet: {contact}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as exc:
        print(f"verify.py: error: {exc}", file=sys.stderr)
        raise SystemExit(2)