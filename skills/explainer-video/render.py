"""Remotion rendering, stills, contact-sheet review, and PSNR verification. Stdlib only."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

from env import (
    FPS,
    SKILL,
    announce_browser_download_if_missing,
    atomic_write_text,
    browser_args,
    browser_exe,
    cli_hint,
    clip_err,
    die,
    ensure_deps,
    env_timeout,
    inside,
    load_scripts,
    run_cli,
    run_guarded,
    scene_starts as _scene_starts,
    tool_env,
)
from features import feature_errors
from mermaid_host import check_mermaid
from figures_host import stage_figures
from validation import validate_all


def read_data(workdir: Path, vid: str) -> dict:
    p = workdir / "public/data" / f"{vid}.json"
    if not p.exists():
        die(f"no timing data for '{vid}'. Run: {cli_hint('audio', workdir, vid)}")
    return json.loads(p.read_text(encoding="utf-8"))


def remotion(sub: list[str], workdir: Path, vid: str, extra: list[str], entry: str = "src/index.ts",
             quiet: bool = False) -> None:
    """quiet: capture output (a failure raises CalledProcessError carrying stderr), for callers running several at once."""
    env = tool_env()
    ensure_deps(env)
    # remotion <render|still> <entry> <composition> <output> | remotion studio <entry>
    # `entry` may be a prebuilt bundle folder (see bundle_once): Remotion 4.0.290 then skips bundling, and the public
    # files are already inside the bundle, so --public-dir is left out.
    action, rest = sub[0], sub[1:]
    is_bundle = entry != "src/index.ts" and Path(entry).is_dir()
    cmd = [str(SKILL / "node_modules/.bin/remotion"), action, entry,
           *([] if action == "studio" else ["Explainer"]), *rest,
           f"--props={json.dumps({'videoId': vid})}",
           *([] if is_bundle else [f"--public-dir={workdir / 'public'}"]), *extra]
    if action == "studio":
        subprocess.run(cmd, cwd=SKILL, env=env, check=True, text=True)
        return
    timeout = env_timeout("EXPLAINER_RENDER_TIMEOUT", 600.0 if action == "still" else 3600.0)
    announce_browser_download_if_missing(browser_exe())
    try:
        r = run_guarded(cmd, timeout=timeout, env=env, cwd=SKILL, capture=quiet)
    except subprocess.TimeoutExpired:
        die(f"remotion {action} timed out after {timeout:.0f}s (set $EXPLAINER_RENDER_TIMEOUT to override)")
    if r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, cmd, r.stdout, clip_err(r.stderr))


def sync_figures(workdir: Path, vid: str, figures: dict[str, tuple[str, float | None]]) -> None:
    """Point timing data figure scenes at the freshly staged `public/figures/<hash><ext>` asset and natural aspect fallback."""
    p = workdir / "public/data" / f"{vid}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    changed = False
    for sc in data["scenes"]:
        info = figures.get(f"{vid}/{sc['id']}")
        if sc["visual"].get("type") != "figure" or not info:
            continue
        asset, nat = info
        if sc.get("figureAsset") != asset:
            sc["figureAsset"] = asset
            changed = True
        want_aspect = round(nat, 4) if nat and sc["visual"].get("aspect") is None else None
        if want_aspect is not None and sc.get("figureAspect") != want_aspect:
            sc["figureAspect"] = want_aspect
            changed = True
        elif want_aspect is None and "figureAspect" in sc:
            sc.pop("figureAspect", None)
            changed = True
    if changed:
        atomic_write_text(p, json.dumps(data, indent=2, ensure_ascii=False))


def sync_svgs(workdir: Path, vid: str, results: dict) -> None:
    """Point the timing data's mermaid scenes at the current svg (the diagram may have changed since `audio`)."""
    p = workdir / "public/data" / f"{vid}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    changed = False
    for sc in data["scenes"]:
        res = results.get(f"{vid}/{sc['id']}")
        if sc["visual"].get("type") != "mermaid" or not res:
            continue
        animated = bool((sc["visual"].get("build") or sc.get("focus")) and res.get("layout"))
        want = res["layout"] if animated else None
        cur = sc.get("mermaidRendered") or {}
        cur_svg = cur.get("svg") or sc["visual"].get("svg")
        cur_lay = cur.get("layout") if "mermaidRendered" in sc else sc["visual"].get("layout")
        if cur_svg == res["svg"] and cur_lay == want and "mermaidRendered" in sc and "svg" not in sc["visual"] and "layout" not in sc["visual"]:
            continue
        if animated and cur_svg != res["svg"]:
            # reveal times were matched to the old diagram's parts
            print(f"warning: {vid}/{sc['id']}: the diagram changed since `audio`; run it again so reveals match "
                  f"the new parts", file=sys.stderr)
        sc["visual"].pop("svg", None)
        sc["visual"].pop("layout", None)
        rendered: dict = {"svg": res["svg"]}
        if want:
            rendered["layout"] = want
        sc["mermaidRendered"] = rendered
        changed = True
    if changed:
        atomic_write_text(p, json.dumps(data, indent=2, ensure_ascii=False))


def sync_mode(workdir: Path, vid: str, script: dict) -> dict:
    """Write the script's current mode into the timing data (only `audio` writes that file, so switching a script to or
    from 3D would otherwise render the old mode, with the old --gl and tab count). Returns the data."""
    p = workdir / "public/data" / f"{vid}.json"
    data = read_data(workdir, vid)
    mode = script.get("mode") or "2d"
    theme = script.get("theme")
    want_theme = theme if theme and theme != "cel-sky" else None
    changed = False
    if data.get("mode") != mode:
        # the rules differ per mode (layers3d needs 3d, continues is not allowed in 3d): validate before switching
        problems = validate_all([(vid, script)])
        if problems:
            die("script errors:\n  " + "\n  ".join(problems))
        data["mode"] = mode
        changed = True
    if data.get("theme") != want_theme:
        if want_theme is None:
            data.pop("theme", None)
        else:
            data["theme"] = want_theme
        changed = True
    if data.get("layout") != script.get("layout"):
        if script.get("layout"):
            data["layout"] = script["layout"]
        else:
            data.pop("layout", None)
        changed = True
    if changed:
        atomic_write_text(p, json.dumps(data, indent=1, ensure_ascii=False))
    return data


def gl_args(data: dict) -> list[str]:
    """3D videos need WebGL in headless Chrome: ANGLE (Metal) by default, $EXPLAINER_GL overrides."""
    return [f"--gl={os.environ.get('EXPLAINER_GL', 'angle')}"] if data.get("mode") == "3d" else []


def is_headless_shell(exe: str | None) -> bool:
    """True when `exe` points to chrome-headless-shell (supports parallel capture per browser)."""
    return bool(exe and Path(exe).name == "chrome-headless-shell")


def _parse_pos_int_env(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        val = int(raw)
        return val if val > 0 else None
    except ValueError:
        return None


VALID_X264_PRESETS = ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow")
DRAFT_SCALE = 2 / 3


def resolve_encode_opts(draft: bool = False) -> tuple[float, str]:
    """Return (render_scale, x264_preset) for final or 720p --draft renders."""
    if draft:
        return DRAFT_SCALE, "ultrafast"
    preset = os.environ.get("EXPLAINER_X264_PRESET", "veryfast").strip().lower() or "veryfast"
    if preset not in VALID_X264_PRESETS:
        die(f"unknown EXPLAINER_X264_PRESET '{preset}' (valid: {', '.join(VALID_X264_PRESETS)})")
    return 1.0, preset


def render_plan(mode: str, total_frames: int, browser: str | None, cpus: int | None = None) -> tuple[int, int]:
    """Return (num_browsers, concurrency_per_browser) tuned for browser mode and 2D vs 3D."""
    ncpu = max(2, cpus or os.cpu_count() or 4)
    headless = is_headless_shell(browser)
    if mode == "3d":
        if headless:
            browsers, conc = (1, min(4, ncpu)) if total_frames < 600 else (2, 2)
        else:
            browsers, conc = min(4, max(1, (total_frames + 119) // 120)), 1
    elif headless:
        if total_frames < 240:
            browsers, conc = 1, min(5, max(2, ncpu // 2))
        else:
            browsers, conc = min(4, max(2, ncpu // 2), max(1, total_frames // 120)), 2
    else:
        if total_frames < 120:
            browsers, conc = 1, 2
        else:
            browsers, conc = min(6, max(2, ncpu // 2), max(1, total_frames // 100)), 1

    env_b = _parse_pos_int_env("EXPLAINER_RENDER_BROWSERS")
    env_c = _parse_pos_int_env("EXPLAINER_RENDER_CONCURRENCY")
    if env_b is not None:
        browsers = env_b
    if env_c is not None:
        conc = env_c
    browsers = max(1, min(browsers, max(1, total_frames)))
    conc = max(1, min(conc, ncpu))
    if mode == "3d" and env_b is None and env_c is None and browsers * conc > 4:
        conc = max(1, 4 // browsers)
    return browsers, conc


def compute_chunks(total_frames: int, num_browsers: int) -> list[tuple[int, int]]:
    """Split [0, total_frames - 1] into balanced contiguous inclusive frame ranges."""
    if total_frames <= 0:
        raise ValueError(f"total_frames must be positive, got {total_frames}")
    k = max(1, min(num_browsers, total_frames))
    base, rem = divmod(total_frames, k)
    chunks: list[tuple[int, int]] = []
    pos = 0
    for i in range(k):
        size = base + (1 if i < rem else 0)
        chunks.append((pos, pos + size - 1))
        pos += size
    return chunks


def compute_run_chunks(runs: list[dict], num_browsers: int) -> list[list[dict]]:
    """Partition run-length frame entries into contiguous slices balanced by unique frame count."""
    if not runs:
        raise ValueError("runs must be non-empty")
    return [runs[a:b + 1] for a, b in compute_chunks(len(runs), num_browsers)]


def schedule_for(data: dict) -> dict | None:
    """Return deduplicated frame schedule for eligible 2D videos, or None to render every frame."""
    if data.get("mode") == "3d":
        return None
    if os.environ.get("EXPLAINER_DEDUP", "1").strip().lower() in ("0", "false", "no"):
        return None
    sched = json.loads(run_cli(["schedule"], json.dumps(data)))
    if not isinstance(sched, dict) or int(sched.get("uniqueFrames", 0)) >= int(sched.get("totalFrames", 0)):
        return None
    return sched


def audio_tracks_for(workdir: Path, data: dict) -> list[tuple[Path, int]]:
    """Return [(wav_path, delay_ms)] for every scene in `data`, confined under <workdir>/public."""
    pub = (workdir / "public").resolve()
    fps = int(data.get("fps") or FPS)
    tracks: list[tuple[Path, int]] = []
    for sc, start_frame in scene_starts(data):
        audio_rel = sc.get("audio")
        if not audio_rel:
            continue
        wav = (pub / audio_rel).resolve()
        if not inside(pub, wav):
            die(f"audio path resolves outside {pub}: {audio_rel}")
        if not wav.is_file():
            die(f"missing scene audio file: {wav}")
        delay_ms = round((start_frame + int(sc.get("leadFrames", 0))) * 1000 / fps)
        tracks.append((wav, delay_ms))
    return tracks


def mux_chunks(
    chunks: list[Path],
    audio_tracks: list[tuple[Path, int]],
    total_frames: int,
    fps: int,
    out: Path,
) -> None:
    """Losslessly concatenate chunk MP4s and mux scene WAV audio in a single FFmpeg pass."""
    if not chunks:
        raise ValueError("chunks must be non-empty")
    out.parent.mkdir(parents=True, exist_ok=True)
    temp_ts: list[Path] = []
    if len(chunks) == 1:
        video_in = ["-i", str(chunks[0])]
    else:
        concat_file = chunks[0].parent / "concat.txt"
        ts_chunks: list[Path] = []
        try:
            for c in chunks:
                if c.suffix.lower() == ".ts":
                    ts_chunks.append(c)
                else:
                    ts = c.with_suffix(".concat.ts")
                    temp_ts.append(ts)
                    r = subprocess.run(
                        [
                            "ffmpeg", "-v", "error", "-y", "-i", str(c),
                            "-c", "copy", "-bsf:v", "h264_mp4toannexb", str(ts),
                        ],
                        capture_output=True, text=True,
                    )
                    if r.returncode != 0:
                        die(f"ffmpeg ts remux failed for {c.name}:\n{clip_err(r.stderr)}")
                    ts_chunks.append(ts)
        except BaseException:
            for ts in temp_ts:
                ts.unlink(missing_ok=True)
            raise
        lines = [
            f"file '{c.name}'" if c.parent == concat_file.parent else f"file '{c.resolve()}'"
            for c in ts_chunks
        ]
        concat_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        video_in = ["-f", "concat", "-safe", "0", "-i", str(concat_file)]

    audio_in: list[str] = []
    audio_args: list[str]
    if audio_tracks:
        total_sec = f"{total_frames / fps:.6f}"
        fc_parts: list[str] = []
        for idx, (wav, delay_ms) in enumerate(audio_tracks):
            audio_in += ["-i", str(wav)]
            delay = f",adelay={delay_ms}:all=1" if delay_ms > 0 else ""
            if len(audio_tracks) == 1:
                fc_parts.append(
                    f"[1:a]aresample=48000,aformat=channel_layouts=stereo{delay},"
                    f"apad=whole_dur={total_sec},atrim=0:{total_sec}[aout]"
                )
            else:
                fc_parts.append(
                    f"[{idx + 1}:a]aresample=48000,aformat=channel_layouts=stereo{delay}[a{idx}]"
                )
        if len(audio_tracks) > 1:
            inputs = "".join(f"[a{i}]" for i in range(len(audio_tracks)))
            fc_parts.append(
                f"{inputs}amix=inputs={len(audio_tracks)}:duration=longest:"
                f"dropout_transition=0:normalize=0,apad=whole_dur={total_sec},atrim=0:{total_sec}[aout]"
            )
        audio_args = [
            "-filter_complex", ";".join(fc_parts),
            "-map", "0:v:0", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
        ]
    else:
        audio_args = ["-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart"]

    tmp_out = out.parent / f".{out.stem}.{os.getpid()}.tmp.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", *video_in, *audio_in, *audio_args, str(tmp_out)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            die(f"ffmpeg mux failed for {out.name}:\n{clip_err(r.stderr)}")
        os.replace(tmp_out, out)
    except BaseException:
        tmp_out.unlink(missing_ok=True)
        raise
    finally:
        for ts in temp_ts:
            ts.unlink(missing_ok=True)


def render_videos_worker(
    workdir: Path,
    worker_videos: list[dict],
    quiet: bool = False,
    timeout: float | None = None,
) -> None:
    """Render muted video chunks for one or more videos in one bundled Node worker."""
    if not worker_videos:
        return
    tenv = tool_env()
    ensure_deps(tenv)
    node = shutil.which("node", path=tenv.get("PATH"))
    if not node:
        die("node not found")
    exe = browser_exe()
    announce_browser_download_if_missing(exe)
    cfg = {
        "entryPoint": str(SKILL / "src/index.ts"),
        "publicDir": str(workdir / "public"),
        "browserExecutable": exe,
        "videos": worker_videos,
    }
    wait = env_timeout("EXPLAINER_RENDER_TIMEOUT", 3600.0) if timeout is None else timeout
    try:
        r = run_guarded(
            [node, str(SKILL / "src/render-worker.mjs")],
            stdin=json.dumps(cfg),
            timeout=wait,
            env={**tenv, "HF_HUB_OFFLINE": "1"},
            cwd=SKILL,
            capture=quiet,
        )
    except subprocess.TimeoutExpired:
        die(f"render-worker timed out after {wait:.0f}s (set $EXPLAINER_RENDER_TIMEOUT to override)")
    if r.returncode != 0:
        err = clip_err(r.stderr or r.stdout) if quiet else f"exit {r.returncode}"
        die(f"render-worker failed:\n{err}")


def cmd_render(workdir: Path, ids: list[str], draft: bool = False) -> None:
    scripts = load_scripts(workdir, ids)
    ferrs = [e for vid, sc in scripts for e in feature_errors(vid, sc)]
    if ferrs:
        die("script errors:\n  " + "\n  ".join(ferrs))
    problems, diagrams = check_mermaid(workdir, scripts, quiet=True)
    if problems:
        die("script errors:\n  " + "\n  ".join(problems))
    fig_errs, figures = stage_figures(workdir, scripts)
    if fig_errs:
        die("script errors:\n  " + "\n  ".join(fig_errs))

    scale, preset = resolve_encode_opts(draft)
    if draft:
        print("[draft] 720p (scale=2/3, preset=ultrafast, 30 fps)", flush=True)

    out_dir = workdir / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob(".render-chunks-*"):
        shutil.rmtree(stale, ignore_errors=True)

    exe = browser_exe()
    chunk_root = Path(tempfile.mkdtemp(prefix=".render-chunks-", dir=out_dir))
    try:
        worker_videos: list[dict] = []
        jobs: list[tuple[str, Path, list[Path], list[tuple[Path, int]], int, int]] = []
        for vid, script in scripts:
            read_data(workdir, vid)          # a clear "run audio first" instead of a traceback
            sync_svgs(workdir, vid, diagrams)
            sync_figures(workdir, vid, figures)
            data = sync_mode(workdir, vid, script)
            mode = data.get("mode") or "2d"
            total_frames = int(data["totalFrames"])
            fps = int(data.get("fps") or FPS)
            sched = schedule_for(data)
            vid_dir = chunk_root / vid
            vid_dir.mkdir(parents=True, exist_ok=True)
            tracks = audio_tracks_for(workdir, data)
            if sched is not None:
                runs = sched["runs"]
                unique = int(sched["uniqueFrames"])
                browsers, conc = render_plan(mode, unique, exe)
                run_slices = compute_run_chunks(runs, browsers)
                chunk_paths = [vid_dir / f"chunk-{i}.ts" for i in range(len(run_slices))]
                saved_pct = 100.0 * (1.0 - unique / max(1, total_frames))
                print(f"[dedup] {vid}: {unique}/{total_frames} unique frames ({saved_pct:.0f}% skipped)", flush=True)
                chunks_cfg = [
                    {"runs": s, "output": str(p)}
                    for s, p in zip(run_slices, chunk_paths)
                ]
            else:
                browsers, conc = render_plan(mode, total_frames, exe)
                ranges = compute_chunks(total_frames, browsers)
                chunk_paths = [vid_dir / f"chunk-{i}.ts" for i in range(len(ranges))]
                chunks_cfg = [
                    {"start": a, "end": b, "output": str(p)}
                    for (a, b), p in zip(ranges, chunk_paths)
                ]
            worker_videos.append({
                "vid": vid,
                "fps": fps,
                "gl": os.environ.get("EXPLAINER_GL", "angle") if mode == "3d" else None,
                "concurrency": conc,
                "scale": scale,
                "x264Preset": preset,
                "chunks": chunks_cfg,
            })
            jobs.append((vid, out_dir / f"{vid}.mp4", chunk_paths, tracks, total_frames, fps))

        render_videos_worker(workdir, worker_videos, quiet=False)
        for vid, out, chunk_paths, tracks, total_frames, fps in jobs:
            print(f"[mux] {vid} -> {out}", flush=True)
            mux_chunks(chunk_paths, tracks, total_frames, fps, out)
            print(f"[render] {vid} -> {out}", flush=True)
        print("[done] videos are in", out_dir)
    finally:
        shutil.rmtree(chunk_root, ignore_errors=True)


def prepare_still(workdir: Path, vid: str) -> dict:
    """Validate and sync everything a still needs (once per command). Returns the timing data."""
    read_data(workdir, vid)
    scripts = load_scripts(workdir, [vid])
    ferrs = [e for v_, sc in scripts for e in feature_errors(v_, sc)]
    if ferrs:
        die("script errors:\n  " + "\n  ".join(ferrs))
    problems, diagrams = check_mermaid(workdir, scripts, quiet=True)
    if problems:
        die("script errors:\n  " + "\n  ".join(problems))
    fig_errs, figures = stage_figures(workdir, scripts)
    if fig_errs:
        die("script errors:\n  " + "\n  ".join(fig_errs))
    sync_svgs(workdir, vid, diagrams)
    sync_figures(workdir, vid, figures)
    return sync_mode(workdir, vid, scripts[0][1])


@contextmanager
def bundle_once(workdir: Path, quiet: bool = False):
    """Bundle the Remotion app once, with the workdir's public files copied in (so call it AFTER prepare_still), and
    remove it afterwards. Remotion 4.0.290 accepts the folder in place of the entry file."""
    out = workdir / "out"
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob("bundle-*"):
        shutil.rmtree(stale, ignore_errors=True)
    tmp = Path(tempfile.mkdtemp(prefix="bundle-", dir=out))
    try:
        env = tool_env()
        ensure_deps(env)
        cmd = [str(SKILL / "node_modules/.bin/remotion"), "bundle", "src/index.ts",
               f"--out-dir={tmp}", f"--public-dir={workdir / 'public'}"]
        timeout = env_timeout("EXPLAINER_RENDER_TIMEOUT", 600.0)
        try:
            r = run_guarded(cmd, timeout=timeout, env=env, cwd=SKILL, capture=quiet)
        except subprocess.TimeoutExpired:
            die(f"remotion bundle timed out after {timeout:.0f}s")
        if r.returncode != 0:
            raise subprocess.CalledProcessError(r.returncode, cmd, r.stdout, clip_err(r.stderr))
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def still_frame(workdir: Path, vid: str, data: dict, frame: int, bundle: Path | None = None, quiet: bool = False) -> Path:
    out = workdir / "out/stills" / f"{vid}-{frame}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    remotion(["still", str(out)], workdir, vid, [f"--frame={frame}", *gl_args(data), *browser_args()],
             entry=str(bundle) if bundle else "src/index.ts", quiet=quiet)
    return out


def cmd_still(workdir: Path, vid: str, scene: str | None, frame: int | None) -> None:
    data = prepare_still(workdir, vid)
    if frame is None:
        scenes = data["scenes"]
        target = next((s for s in scenes if s["id"] == scene), scenes[0]) if scene else scenes[0]
        if scene and target["id"] != scene:
            die(f"no scene '{scene}'. Scenes: {[s['id'] for s in scenes]}")
        start = next(pos for s, pos in scene_starts(data) if s is target)
        frame = start + target["leadFrames"] + int(0.75 * target["durationSec"] * FPS)
    print("[done]", still_frame(workdir, vid, data, frame))


def scene_starts(data: dict) -> list[tuple[dict, int]]:
    return _scene_starts(data["scenes"])[0]


def render_stills_worker(
    workdir: Path,
    worker_videos: list[dict],
    serve_url: str | None = None,
    keep_bundle: bool = False,
    quiet: bool = False,
    timeout: float | None = None,
) -> str | None:
    """Render stills for one or more videos in one bundle + warm Chromium session via src/still-worker.mjs."""
    if not worker_videos:
        return None
    tenv = tool_env()
    ensure_deps(tenv)
    node = shutil.which("node", path=tenv.get("PATH"))
    if not node:
        die("node not found")
    cfg = {
        "entryPoint": str(SKILL / "src/index.ts"),
        "publicDir": str(workdir / "public"),
        "browserExecutable": browser_exe(),
        "videos": worker_videos,
        **({"keepBundle": True} if keep_bundle else {}),
        **({"serveUrl": serve_url} if serve_url else {}),
    }
    wait = env_timeout("EXPLAINER_RENDER_TIMEOUT", 600.0) if timeout is None else timeout
    try:
        r = run_guarded(
            [node, str(SKILL / "src/still-worker.mjs")],
            stdin=json.dumps(cfg),
            timeout=wait,
            env={**tenv, "HF_HUB_OFFLINE": "1"},
            cwd=SKILL,
            capture=(quiet or keep_bundle),
        )
    except subprocess.TimeoutExpired:
        die(f"still-worker timed out after {wait:.0f}s (set $EXPLAINER_RENDER_TIMEOUT to override)")
    if r.returncode != 0:
        err = clip_err(r.stderr or r.stdout) if (quiet or keep_bundle) else f"exit {r.returncode}"
        die(f"still-worker failed:\n{err}")
    if keep_bundle:
        for line in reversed(r.stdout.splitlines()):
            s = line.strip()
            if s.startswith("{"):
                return json.loads(s).get("serveUrl")
    return None


def cmd_review(workdir: Path, vid: str) -> None:
    """One row per scene: stills just after its entrance, at the middle of its narration and near its end."""
    # Never run this alongside TTS: it uses the GPU/Chrome heavily (see AGENTS.md).
    data = prepare_still(workdir, vid)
    frames = []
    for sc, s in scene_starts(data):
        frames += [s + sc["leadFrames"] + 25, s + sc["leadFrames"] + int(sc["durationSec"] * FPS / 2), s + sc["frames"] - 22]
    is3d = data.get("mode") == "3d"
    gl = os.environ.get("EXPLAINER_GL", "angle") if is3d else None
    conc = 2 if is3d else max(1, min(4, (os.cpu_count() or 4) // 2))
    render_stills_worker(workdir, [{
        "vid": vid,
        "gl": gl,
        "concurrency": conc,
        "frames": [{"frame": f, "output": str(workdir / "out/stills" / f"{vid}-{f}.png")} for f in frames],
    }], quiet=True)
    out = workdir / "out/review" / f"{vid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    ins = [x for f in frames for x in ("-i", str(workdir / "out/stills" / f"{vid}-{f}.png"))]
    n = len(frames)
    fc = "".join(f"[{i}]scale=640:-1[s{i}];" for i in range(n)) + "".join(f"[s{i}]" for i in range(n))
    fc += f"xstack=inputs={n}:layout=" + "|".join(f"{(i % 3) * 640}_{(i // 3) * 360}" for i in range(n))
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc, str(out)], check=True)
    print("[done]", out)


def cmd_verify(workdir: Path, vid: str, min_db: float = 30.0) -> None:
    """Compares a late frame of every scene in the rendered video with a still of the same frame. Some bugs only show in
    a full render, where frames are drawn in order (3D materials, font loading), never in stills. H.264 alone costs
    about 33-37 dB, so a scene far below that was drawn differently."""
    # Never run this alongside TTS or a render (GPU/Chrome).
    video = workdir / "out" / f"{vid}.mp4"
    if not video.exists():
        die(f"no video yet. Run: {cli_hint('render', workdir, vid)}")
    data = prepare_still(workdir, vid)
    bad = _verify_scenes(workdir, vid, data, video, min_db)
    if bad:
        die(f"{vid}: the video differs from its stills in {', '.join(bad)}; compare out/stills/*-video.png with the stills")
    print(f"[ok] {vid}: every scene matches its still")


def _verify_scenes(workdir: Path, vid: str, data: dict, video: Path, min_db: float, bundle: Path | None = None) -> list[str]:
    targets = [(sc, s + sc["frames"] - 22) for sc, s in scene_starts(data)]
    if bundle is not None:
        for _, f in targets:
            still_frame(workdir, vid, data, f, bundle)
    elif targets:
        gl = os.environ.get("EXPLAINER_GL", "angle") if data.get("mode") == "3d" else None
        render_stills_worker(workdir, [{
            "vid": vid,
            "gl": gl,
            "concurrency": 1,
            "frames": [{"frame": f, "output": str(workdir / "out/stills" / f"{vid}-{f}.png")} for _, f in targets],
        }], quiet=True)
    bad = []
    for sc, f in targets:
        grab = workdir / "out/stills" / f"{vid}-{f}-video.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"select=eq(n\\,{f})", "-vframes", "1", str(grab)], check=True)
        r = subprocess.run(["ffmpeg", "-i", str(grab), "-i", str(workdir / "out/stills" / f"{vid}-{f}.png"), "-lavfi", "psnr", "-f", "null", "-"],
                           capture_output=True, text=True)
        m = re.search(r"average:(\S+)", r.stderr)
        db = float(m.group(1)) if m else 0.0
        print(f"  {sc['id']:8} {sc['visual']['type']:9} frame {f:5}  {db:5.1f} dB")
        if db < min_db:
            bad.append(sc["id"])
    return bad
