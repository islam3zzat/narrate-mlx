"""Shared constants, environment/tool discovery, and script I/O for explainer-video. Stdlib only."""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parent
_CONSTANTS = json.loads((SKILL / "src/constants.json").read_text(encoding="utf-8"))

FPS: int = int(_CONSTANTS["fps"])
LEAD: float = float(_CONSTANTS["leadSec"])
TAIL: float = float(_CONSTANTS["tailSec"])
CHAPTER_FRAMES: int = int(_CONSTANTS["chapterFrames"])
TRANSITION_FRAMES: int = int(_CONSTANTS["transitionFrames"])
WPS: dict[str, float] = {k: float(v) for k, v in _CONSTANTS["wps"].items()}


def scene_starts(scenes: list[dict]) -> tuple[list[tuple[dict, int]], int]:
    """Start frame of each scene and total video frames, accounting for chapter cards and transitions."""
    out: list[tuple[dict, int]] = []
    pos = 0
    for i, sc in enumerate(scenes):
        if sc.get("chapter"):
            pos += CHAPTER_FRAMES - (2 * TRANSITION_FRAMES if i > 0 else TRANSITION_FRAMES)
        out.append((sc, pos))
        pos += sc["frames"]
    return out, pos

ALIGN_MODEL = os.environ.get("EXPLAINER_ALIGN_MODEL", "mlx-community/Qwen3-ForcedAligner-0.6B-8bit")

# Languages. A script says which in its top-level "language" (default "en"); "ar" is Modern Standard Arabic and also
# switches the layout to right to left (src/rtl.ts). Each language has one voice model.
LANGS = ("en", "ar")
LANG_MODEL = {"en": "kokoro", "ar": "silma"}
ALIGN_LANGUAGE = {"en": "English", "ar": "Arabic"}   # the aligner's language name; Qwen3-ForcedAligner lists no Arabic, so
                                                       # for "ar" it is a best-effort attempt behind SILMA's own word times
MAX_WORDS = {"en": 75, "ar": 48}                       # about 30 s of narration
TASHKEEL_MIN = 0.5                                     # share of Arabic words that should carry a vowel mark


def die(msg: str) -> None:
    sys.exit(f"explainer: {msg}")


def atomic_write_bytes(path: Path, data: bytes) -> None:
    """Write `data` to `path` via a sibling temp file and os.replace so crashes never leave truncated files."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def atomic_write_text(path: Path, text: str, encoding: str = "utf-8") -> None:
    atomic_write_bytes(path, text.encode(encoding))


def sync_uv_env(project: Path, env: dict | None = None, quiet: bool = True) -> None:
    """Sync a uv project, retrying with --system-certs if a TLS proxy rejects the default trust store."""
    cmd = ["uv", "sync", *(["--quiet"] if quiet else []), "--project", str(project)]
    if subprocess.run(cmd, env=env).returncode == 0:
        return
    print("warning: uv sync failed; retrying with system TLS certificates", file=sys.stderr, flush=True)
    subprocess.run([*cmd, "--system-certs"], env=env, check=True)


def inside(workdir: Path, p: Path) -> bool:
    try:
        p.resolve().relative_to(workdir.resolve())
        return True
    except ValueError:
        return False


def tool_env() -> dict:
    """Environment with node on PATH (falls back to the newest nvm install)."""
    env = dict(os.environ)
    if shutil.which("node", path=env.get("PATH")) is None:
        versions = sorted((Path.home() / ".nvm/versions/node").glob("v*/bin/node"),
                          key=lambda p: [int(x) for x in re.findall(r"\d+", p.parts[-3])])
        if not versions:
            die("node not found. Install Node.js (brew install node).")
        env["PATH"] = f"{versions[-1].parent}{os.pathsep}{env.get('PATH', '')}"
    return env


def _required_node_paths(skill_dir: Path) -> tuple[str, ...]:
    bins = ("node_modules/.bin/remotion", "node_modules/.bin/tsx")
    pkg_json = skill_dir / "package.json"
    if not pkg_json.is_file():
        return bins
    deps = json.loads(pkg_json.read_text(encoding="utf-8")).get("dependencies", {})
    return bins + tuple(f"node_modules/{pkg}/package.json" for pkg in sorted(deps))


def ensure_deps(env: dict) -> None:
    if all((SKILL / f).exists() for f in _required_node_paths(SKILL)):
        return
    print("[setup] installing Remotion (first run only)...", flush=True)
    cmd = ["npm", "ci" if (SKILL / "package-lock.json").exists() else "install", "--no-audit", "--no-fund"]
    subprocess.run(cmd, cwd=SKILL, env=env, check=True)


_SYSTEM_BROWSERS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)


def _cached_headless_shell() -> str | None:
    """Return the newest locally cached executable chrome-headless-shell without triggering a download."""
    roots = (
        SKILL / "node_modules/.remotion/chrome-headless-shell",
        Path.home() / ".cache/puppeteer/chrome-headless-shell",
    )
    for root in roots:
        if not root.is_dir():
            continue
        candidates = [
            p for p in root.rglob("chrome-headless-shell")
            if p.is_file() and os.access(p, os.X_OK)
        ]
        if candidates:
            candidates.sort(key=lambda p: [int(x) for x in re.findall(r"\d+", str(p.relative_to(root)))])
            return str(candidates[-1])
    return None


def browser_exe() -> str | None:
    """Resolve the browser executable: $EXPLAINER_BROWSER > cached chrome-headless-shell > installed Chrome/Edge."""
    exe = os.environ.get("EXPLAINER_BROWSER")
    if exe:
        return exe
    exe = _cached_headless_shell()
    if exe:
        return exe
    for p in _SYSTEM_BROWSERS:
        if Path(p).exists():
            return p
    return None


def browser_args() -> list[str]:
    exe = browser_exe()
    return [f"--browser-executable={exe}"] if exe else []


def find_speak() -> Path:
    # The sibling skills/speak in this repo comes first, so the project is self-contained.
    candidates = [os.environ.get("EXPLAINER_TTS_DIR"), SKILL.parent / "speak"]
    for c in candidates:
        if c and (Path(c) / "speak.py").exists():
            return Path(c).resolve()
    die("'speak' skill not found next to explainer-video. Set EXPLAINER_TTS_DIR to its folder "
        "(the one containing speak.py).")


def load_scripts(workdir: Path, ids: list[str]) -> list[tuple[str, dict]]:
    found = sorted((workdir / "scripts").glob("*.json"))
    if not found:
        die(f"no scripts in {workdir / 'scripts'}. Run: explainer.py init {workdir}")
    out = []
    for p in found:
        if ids and p.stem not in ids:
            continue
        try:
            out.append((p.stem, json.loads(p.read_text(encoding="utf-8"))))
        except json.JSONDecodeError as e:
            die(f"{p.name}: invalid JSON: {e}")
    if ids and len(out) != len(set(ids)):
        die(f"unknown video id(s): {sorted(set(ids) - {i for i, _ in out})}. "
            f"Available: {[p.stem for p in found]}")
    return out


def clip_err(text: str | None, head: int = 300, tail: int = 600) -> str:
    """Keep both the opening error line and final traceback frame when truncating long subprocess stderr."""
    s = (text or "").strip()
    if len(s) <= head + tail + 20:
        return s
    return f"{s[:head]}\n...[truncated]...\n{s[-tail:]}"


def env_timeout(name: str, default: float | None) -> float | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        val = float(raw)
        return val if val > 0 else None
    except ValueError:
        return default


def run_guarded(
    cmd: list[str],
    *,
    stdin: str | None = None,
    timeout: float | None = None,
    env: dict | None = None,
    cwd: Path | None = None,
    capture: bool = True,
) -> subprocess.CompletedProcess:
    """Run a non-interactive subprocess in its own process group so timeouts/interrupts reap child browsers cleanly."""
    p = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE if stdin is not None else None,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
        env=env,
        cwd=cwd,
        start_new_session=True,
    )
    try:
        so, se = p.communicate(input=stdin, timeout=timeout)
        return subprocess.CompletedProcess(cmd, p.returncode, so or "", se or "")
    except subprocess.TimeoutExpired as exc:
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        try:
            so, se = p.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
            try:
                so, se = p.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                p.kill()
                so, se = "", ""
        raise subprocess.TimeoutExpired(cmd, timeout or 0, output=so, stderr=se) from exc
    except BaseException:
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        try:
            p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
            try:
                p.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
        raise
    finally:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass


def run_cli(args: list[str], stdin: str = "") -> str:
    """Run src/cli.ts (validate / schema / describe) with tsx; returns stdout."""
    env = tool_env()
    ensure_deps(env)
    cmd = [str(SKILL / "node_modules/.bin/tsx"), str(SKILL / "src/cli.ts"), *args]
    timeout = env_timeout("EXPLAINER_CLI_TIMEOUT", 120.0)
    try:
        r = run_guarded(cmd, stdin=stdin, timeout=timeout, env=env, cwd=SKILL, capture=True)
    except subprocess.TimeoutExpired:
        die(f"cli.ts {args[0]} timed out after {timeout:.0f}s")
    if r.returncode != 0:
        die(f"cli.ts {args[0]} failed: {clip_err(r.stderr)}")
    return r.stdout
