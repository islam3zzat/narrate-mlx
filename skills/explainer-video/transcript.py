"""Meeting transcripts (WebVTT, SRT, Zoom, plain text) -> plain `[HH:MM:SS] Speaker: text` lines. Standard library only, pure.

The output is what a fact ledger's `source` should be: no markup, no cue ids, no styling, one line per speaker turn.
Transcripts are untrusted data: this module only parses and strips, it never interprets anything it reads.
Timestamps are recording-relative (seconds from the start of the recording), not wall-clock times.

    parse(text)  -> (lines, warnings)       text already decoded
    load(path)   -> (lines, warnings)       reads a file: size cap, UTF-8 only, TranscriptError on a bad file
"""
from __future__ import annotations

import html
import re
from pathlib import Path

MAX_BYTES = 5_000_000
MAX_SPEAKER = 60


class TranscriptError(ValueError):
    """A file that cannot be turned into a transcript, with a message fit to show the user."""


_TIME = r"(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?"
_CUE_LINE = re.compile(rf"^\s*{_TIME}\s*-->\s*(.*)$")   # settings after the end time are ignored
_ZOOM_TXT = re.compile(r"^\[([^\]\n]{1,80})\]\s+(\d{1,3}):(\d{2}):(\d{2})\s*:?\s*(.*)$")   # "[Name] 10:19:03 text"
# Every repetition below is bounded and stops at the next "<" or "}", so an unterminated tag costs a bounded scan per "<": linear overall.
_VOICE = re.compile(r"<v(?:\.[^\s<>]{0,100})?(?:\s+([^<>]{0,200}))?>", re.I)
# only the WebVTT/SRT tags are removed, so "if a<b and c>d" keeps its text; <v ...> is handled before this
_TAG = re.compile(r"</?(?:c|i|b|u|ruby|rt)(?:\.[^\s<>]{0,100})?>|</?(?:v|lang|font)(?:[.\s][^<>]{0,200})?>|<\d{1,3}:\d{2}(?::\d{2})?[.,]?\d{0,3}>", re.I)
_BRACE = re.compile(r"\{\\[^{}]{0,200}\}")                               # SRT/ASS overrides such as {\an8}
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f​-‏ -‮﻿]")
# "Name: text" as Zoom writes it: a capitalised name of up to five words, then a colon and a space
_NAME_COLON = re.compile(r"^([^\W\d_][\w.'’\-]*(?: [\w.'’\-]+){0,4}):\s+(\S.*)$")


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", _CONTROL.sub(" ", s)).strip()


def _speaker(s: str) -> str | None:
    s = _squash(html.unescape(s)).replace("[", "(").replace("]", ")").replace(":", " ")
    s = _squash(s)[:MAX_SPEAKER].strip()
    return s or None


def _seconds(h: str | None, m: str, s: str) -> int:
    return int(h or 0) * 3600 + int(m) * 60 + int(s)


def stamp(sec: int) -> str:
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def _segments(payload: str) -> list[tuple[str | None, str]]:
    """Split a cue's text on <v Name> voice tags into (speaker, text); other tags and entities are removed."""
    out: list[tuple[str | None, str]] = []
    pos, who = 0, None
    for m in _VOICE.finditer(payload):
        out.append((who, payload[pos:m.start()]))
        who, pos = _speaker(m.group(1) or "") if m.group(1) else None, m.end()
    out.append((who, payload[pos:]))
    res = []
    for who, raw in out:
        text = _squash(html.unescape(_BRACE.sub(" ", _TAG.sub(" ", raw))))
        if not text:
            continue
        if who is None:
            m = _NAME_COLON.match(text)
            if m and m.group(1)[0].isupper() and _speaker(m.group(1)):
                who, text = _speaker(m.group(1)), m.group(2)
        res.append((who, text))
    return res


Entry = tuple["int | None", "str | None", str]


def _blocks(lines: list[str]) -> list[list[str]]:
    """Blocks of lines. A blank line ends a block, and so does a timing line that is not the block's first (or second, after a
    bare cue id): cues written without blank lines between them must not merge, nor leak a timing line into cue text."""
    blocks: list[list[str]] = []
    cur: list[str] = []
    for ln in lines:
        if not ln.strip():
            if cur:
                blocks.append(cur)
                cur = []
            continue
        ti = next((i for i, x in enumerate(cur) if _CUE_LINE.match(x)), None) if _CUE_LINE.match(ln) else None
        if ti is not None:
            # the previous cue ends here. A bare number on the last line, after at least one text line, is this cue's id.
            ident = [cur.pop()] if len(cur) - ti > 2 and cur[-1].strip().isdigit() else []
            blocks.append(cur)
            cur = ident
        cur.append(ln)
    if cur:
        blocks.append(cur)
    return blocks


def _cues(blocks: list[list[str]], warnings: list[str]) -> list[Entry]:
    entries: list[Entry] = []
    for n, block in enumerate(blocks, 1):
        head = block[0].strip()
        if re.match(r"^(NOTE|STYLE|REGION)\b", head) or (head.startswith("WEBVTT") and not any("-->" in ln for ln in block)):
            continue   # (a header run straight into its first cue is tolerated: the timing line is found below)
        idx = next((i for i, ln in enumerate(block) if "-->" in ln), None)
        if idx is None:
            warnings.append(f"block {n}: no timing line, text ignored")
            continue
        m = _CUE_LINE.match(block[idx])
        start = _seconds(m.group(1), m.group(2), m.group(3)) if m else None
        if start is None:
            warnings.append(f"block {n}: unreadable timing line, kept without a time")
        for who, text in _segments(" ".join(block[idx + 1:])):
            entries.append((start, who, text))
    return entries


def _merge(entries: list[Entry], warnings: list[str] | None = None) -> list[Entry]:
    """Consecutive cues of the same named speaker become one turn (it keeps the first cue's time), unless the cue starts before
    the turn it would join (out-of-order times): then it stays a line of its own, with a warning."""
    out: list[Entry] = []
    for t, who, text in entries:
        if out and who is not None and out[-1][1] == who:
            if t is not None and out[-1][0] is not None and t < out[-1][0]:
                if warnings is not None:
                    warnings.append(f"cue at {stamp(t)} starts before the previous cue of {who} ({stamp(out[-1][0])}); kept as a separate line")
                out.append((t, who, text))
                continue
            out[-1] = (out[-1][0], who, out[-1][2] + " " + text)
        else:
            out.append((t, who, text))
    return out


def _format(entries: list[Entry]) -> list[str]:
    lines = []
    for t, who, text in entries:
        lines.append((f"[{stamp(t)}] " if t is not None else "") + (f"{who}: " if who else "") + text)
    return lines


def parse(text: str) -> tuple[list[str], list[str]]:
    """(lines, warnings). Raises TranscriptError when there is no text at all."""
    warnings: list[str] = []
    text = text.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    if any(_CUE_LINE.match(ln) for ln in lines):                      # WebVTT or SRT
        blocks = _blocks(lines)
        entries = _cues(blocks, warnings)
        if not entries:
            raise TranscriptError("the file has cues but no text in them")
        return _format(_merge(entries, warnings)), warnings
    if text.lstrip("﻿ \t\n").startswith("WEBVTT"):
        raise TranscriptError("WEBVTT header but no cues (lines with `-->`); is the file truncated?")
    zoom = [(i, _ZOOM_TXT.match(ln)) for i, ln in enumerate(lines)]
    if any(m for _, m in zoom):                                         # Zoom .txt: "[Name] 10:19:03" then text
        entries, cur = [], None
        for ln, (_, m) in zip(lines, zoom):
            if m:
                who = _speaker(m.group(1))
                t = _seconds(m.group(2), m.group(3), m.group(4))
                cur = (t, who, [m.group(5)] if m.group(5).strip() else [])
                entries.append(cur)
            elif cur is not None and ln.strip():
                cur[2].append(ln)
        done = [(t, who, _squash(" ".join(parts))) for t, who, parts in entries]
        done = [e for e in done if e[2]]
        if done:
            return _format(_merge(done, warnings)), warnings
    plain = [_squash(ln) for ln in lines]
    plain = [ln for ln in plain if ln]
    if not plain:
        raise TranscriptError("the file is empty")
    return plain, warnings   # plain text (including lines already in `[HH:MM:SS] Speaker: text` form) passes through


def load(path: Path) -> tuple[list[str], list[str]]:
    try:
        with open(path, "rb") as f:
            raw = f.read(MAX_BYTES + 1)
    except OSError as e:
        raise TranscriptError(f"cannot read {path}: {e.strerror or e}") from None
    if len(raw) > MAX_BYTES:
        raise TranscriptError(f"{path} is over {MAX_BYTES // 1_000_000} MB; split the recording's transcript and process the parts one by one")
    if b"\0" in raw[:4096]:
        raise TranscriptError(f"{path} looks binary (NUL bytes), not a text transcript")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise TranscriptError(f"{path} is not valid UTF-8 (byte {e.start}); re-save it as UTF-8 and try again") from None
    return parse(text)
