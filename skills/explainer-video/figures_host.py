"""Secure local figure validation & staging for `figure` scenes. Stdlib only."""
from __future__ import annotations

import hashlib
import re
import struct
import sys
from pathlib import Path, PurePosixPath

from env import atomic_write_bytes, inside

MAX_FIGURE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".svg"}

_UNSAFE_SVG_RE = re.compile(
    r"<\s*script\b|<!\s*(?:ENTITY|DOCTYPE)\b|\bon[a-z]+\s*=|javascript\s*:|vbscript\s*:|<\s*foreignObject\b|<\s*(?:iframe|object|embed)\b",
    re.IGNORECASE,
)
_EXTERNAL_HREF_RE = re.compile(
    r"""(?:xlink:)?href\s*=\s*["']\s*(?:https?:|file:|//|data:)""",
    re.IGNORECASE,
)


def _validate_svg_bytes(data: bytes) -> None:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ValueError(f"SVG file must be valid UTF-8: {e}") from e
    stripped = text.lstrip("\ufeff \t\r\n")
    if not (stripped.startswith("<svg") or stripped.startswith("<?xml")):
        raise ValueError("SVG file does not start with <svg or <?xml header")
    if "<svg" not in stripped.lower():
        raise ValueError("SVG file does not contain an <svg root element")
    if _UNSAFE_SVG_RE.search(text):
        raise ValueError("SVG contains disallowed active content, scripts, event handlers, or entity declarations")
    if _EXTERNAL_HREF_RE.search(text):
        raise ValueError("SVG contains disallowed external or data: href references")


def resolve_figure(workdir: Path, rel: str) -> Path:
    """Resolve `rel` strictly inside `workdir` with symlink, extension, size, and magic-byte validation."""
    if not isinstance(rel, str) or not rel or rel.strip() != rel:
        raise ValueError("figure path must be a non-empty trimmed relative path")
    if "\x00" in rel or any(ord(c) < 32 for c in rel):
        raise ValueError("figure path contains control characters")
    if rel.startswith(("/", "~")) or "\\" in rel or "://" in rel:
        raise ValueError(f"figure path must be a relative POSIX path inside workdir: {rel!r}")

    posix = PurePosixPath(rel)
    if not posix.parts or any(p in ("", ".", "..") for p in posix.parts):
        raise ValueError(f"figure path contains invalid segment or '..' traversal: {rel!r}")

    ext = posix.suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise ValueError(f"unsupported figure extension {ext!r} (allowed: PNG, JPG/JPEG, SVG)")

    root = workdir.resolve()
    cur = root
    for part in posix.parts:
        cur = cur / part
        if cur.is_symlink():
            raise ValueError(f"figure path must not traverse symlinks: {rel!r}")

    if not inside(root, cur):
        raise ValueError(f"figure path resolves outside workdir: {rel!r}")
    if not cur.is_file():
        raise ValueError(f"figure asset not found inside workdir: {rel!r}")

    size = cur.stat().st_size
    if size <= 0:
        raise ValueError(f"figure asset is empty: {rel!r}")
    if size > MAX_FIGURE_BYTES:
        raise ValueError(f"figure asset exceeds {MAX_FIGURE_BYTES // (1024 * 1024)} MB cap ({size} bytes): {rel!r}")

    header = cur.read_bytes()
    if ext == ".png":
        if not header.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"file extension is .png but magic bytes are not PNG: {rel!r}")
    elif ext in (".jpg", ".jpeg"):
        if not header.startswith(b"\xff\xd8\xff"):
            raise ValueError(f"file extension is {ext} but magic bytes are not JPEG: {rel!r}")
    elif ext == ".svg":
        _validate_svg_bytes(header)

    return cur


def probe_figure_aspect(path: Path) -> float | None:
    """Return natural width/height aspect ratio of a validated PNG, JPEG, or SVG file (or None if indeterminate)."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    ext = path.suffix.lower()
    if ext == ".png" and len(raw) >= 24 and raw.startswith(b"\x89PNG\r\n\x1a\n") and raw[12:16] == b"IHDR":
        w, h = struct.unpack("!II", raw[16:24])
        return (w / h) if (w > 0 and h > 0) else None
    if ext in (".jpg", ".jpeg") and raw.startswith(b"\xff\xd8"):
        i = 2
        while i + 4 <= len(raw):
            if raw[i] != 0xFF:
                i += 1
                continue
            while i < len(raw) and raw[i] == 0xFF:
                i += 1
            if i >= len(raw):
                break
            marker = raw[i]
            i += 1
            if marker in (0xD8, 0xD9) or (0xD0 <= marker <= 0xD7):
                continue
            if i + 2 > len(raw):
                break
            seg_len = struct.unpack("!H", raw[i : i + 2])[0]
            if seg_len < 2 or i + seg_len > len(raw):
                break
            if (0xC0 <= marker <= 0xCF) and marker not in (0xC4, 0xC8, 0xCC) and seg_len >= 7:
                h, w = struct.unpack("!HH", raw[i + 3 : i + 7])
                return (w / h) if (w > 0 and h > 0) else None
            i += seg_len
        return None
    if ext == ".svg":
        try:
            text = raw.decode("utf-8", errors="ignore")
        except Exception:
            return None
        vb = re.search(r"""viewBox\s*=\s*["']\s*[-+0-9.eE]+[,\s]+[-+0-9.eE]+[,\s]+([0-9.eE]+)[,\s]+([0-9.eE]+)\s*["']""", text, re.IGNORECASE)
        if vb:
            w, h = float(vb.group(1)), float(vb.group(2))
            return (w / h) if (w > 0 and h > 0) else None
    return None


def stage_figure_info(workdir: Path, rel: str) -> tuple[str, float | None]:
    """Validate and stage a workdir figure, returning `(staged_rel, natural_aspect_or_None)`."""
    src = resolve_figure(workdir, rel)
    raw = src.read_bytes()
    aspect = probe_figure_aspect(src)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    pub = workdir / "public"
    if pub.is_symlink():
        raise ValueError("workdir public/ directory must not be a symlink")
    pub_figs = pub / "figures"
    if pub_figs.is_symlink():
        raise ValueError("workdir public/figures/ directory must not be a symlink")
    pub_figs.mkdir(parents=True, exist_ok=True)
    dest_name = f"{digest}{src.suffix.lower()}"
    dest = pub_figs / dest_name
    if dest.is_symlink():
        raise ValueError(f"destination path is a symlink: {dest}")
    if not dest.exists() or dest.read_bytes() != raw:
        atomic_write_bytes(dest, raw)
    return f"figures/{dest_name}", aspect


def stage_figure(workdir: Path, rel: str) -> str:
    """Validate and copy a workdir figure into `<workdir>/public/figures/<hash><ext>` for Remotion staticFile()."""
    rel_path, _ = stage_figure_info(workdir, rel)
    return rel_path


def _warn_aspect_mismatch(where: str, v: dict, nat: float | None) -> None:
    if nat is None or nat <= 0:
        return
    explicit = v.get("aspect")
    if isinstance(explicit, (int, float)) and explicit > 0:
        if abs(explicit - nat) / nat > 0.05:
            print(
                f"warning: {where}: figure aspect {explicit:.3f} differs from natural asset aspect {nat:.3f}; spotlight regions may misalign",
                file=sys.stderr,
            )


def check_figures(workdir: Path, scripts: list[tuple[str, dict]]) -> list[str]:
    """Validate every `figure` scene's `src` asset cleanly without mutating `public/`."""
    errs: list[str] = []
    for vid, script in scripts:
        for sc in script.get("scenes") or []:
            v = sc.get("visual") or {}
            if v.get("type") == "figure":
                where = f"{vid}/{sc.get('id', '?')}"
                try:
                    src = resolve_figure(workdir, v.get("src", ""))
                    _warn_aspect_mismatch(where, v, probe_figure_aspect(src))
                except ValueError as e:
                    errs.append(f"{where}: {e}")
    return errs


def stage_figures(workdir: Path, scripts: list[tuple[str, dict]]) -> tuple[list[str], dict[str, tuple[str, float | None]]]:
    """Validate and stage every `figure` asset into `<workdir>/public/figures/`, returning `(errors, {vid/sid: (asset, aspect)})`."""
    errs: list[str] = []
    staged: dict[str, tuple[str, float | None]] = {}
    for vid, script in scripts:
        for sc in script.get("scenes") or []:
            v = sc.get("visual") or {}
            if v.get("type") == "figure":
                key = f"{vid}/{sc.get('id', '?')}"
                try:
                    asset, nat = stage_figure_info(workdir, v.get("src", ""))
                    _warn_aspect_mismatch(key, v, nat)
                    staged[key] = (asset, nat)
                except ValueError as e:
                    errs.append(f"{key}: {e}")
    return errs, staged
