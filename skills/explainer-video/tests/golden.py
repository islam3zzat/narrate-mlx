#!/usr/bin/env python3
"""Golden-file safety net for explainer-video refactors. Stdlib only.

  golden.py record [ids...]   regenerate tests/golden/ from tests/corpus (audio must exist; see `make golden`); with ids, only those videos
  golden.py compare           regenerate into a scratch dir and diff against tests/golden/ (exit 1 on any difference)
  golden.py compare --type X  same, but stills only for scenes whose visual type is X (data JSON and check output
                              are still compared for every video); `make golden-type T=X`. Fast loop while moving one type.
  golden.py det               render the stills twice, print PSNR between runs (3D threshold calibration)

Per video: data JSON (byte-identical), normalized `check` output (identical), 3 stills per scene (after the first
reveal, middle, last frame). 2D and Arabic stills must be pixel-exact (md5 of decoded full-size pixels); 3D stills
are compared by PSNR of the 640 px review image against PSNR_3D_MIN.
Stills: one warm Node worker (tests/still_worker.mjs) via @remotion/bundler + @remotion/renderer: bundles once across
all target videos, opens at most one headless Chrome per GL mode (2D vs 3D), selects each composition once, and
renders with GOLDEN_JOBS (default 4; 3D videos at most GOLDEN_JOBS_3D, default 2) concurrent tabs. GOLDEN_JOBS=1 is the
serial run. Under parallel load Chrome sometimes rasterizes a few compositor tiles slightly differently (whole-frame tile
pattern, max 4-41 levels; serial renders always match), so `compare` re-renders any 2D still that differs on its own
via render.still_frame, and only fails if that one differs too (a real change is deterministic). `record` renders with
concurrency 1, so a load artifact never becomes a golden.
Existing workdirs (sample, oauth21, docs/video) are not in the corpus: their committed audio is stale (see README note
in the Makefile), so `audio` would re-synthesize it.
"""
from __future__ import annotations

import json, math, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
CORPUS = HERE / "corpus"
GOLDEN = HERE / "golden"
ROOT = SKILL.parent.parent
PSNR_3D_MIN = float(os.environ.get("PSNR_3D_MIN", "40"))
ENV = {**os.environ, "HF_HUB_OFFLINE": "1"}
JOBS = max(1, int(os.environ.get("GOLDEN_JOBS", "4")))
JOBS_3D = max(1, min(JOBS, int(os.environ.get("GOLDEN_JOBS_3D", "2"))))  # 3D: GPU-heavy, one 4-tab render once hung

sys.path.insert(0, str(SKILL))
import env as ev_env  # noqa: E402  (stdlib only; node/browser discovery)
import render  # noqa: E402  (stdlib only; prepare_still + serial_md5 fallback via render.still_frame)


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, env=ENV, **kw)


def norm(s: str) -> str:
    s = s.replace(str(ROOT), "<ROOT>")
    return re.sub(r"\d+ cached", "N cached", s)


def videos():
    out = sorted(p.stem for p in (CORPUS / "scripts").glob("*.json"))
    if not out:
        sys.exit(f"no corpus scripts in {CORPUS / 'scripts'}: nothing to compare")
    return out


def frames(data, types=None):
    type_set = {types} if isinstance(types, str) else (set(types) if types else None)
    out, s = [], 0
    for sc in data["scenes"]:
        F, lead = sc["frames"], sc["leadFrames"]
        if type_set is not None and sc["visual"]["type"] not in type_set:
            s += F
            continue
        rv = [r for r in sc.get("revealSec", []) if r > 0] or [0.3]
        out += [(sc["id"], "a", s + min(F - 1, lead + round(min(rv) * ev_env.FPS) + 6)), (sc["id"], "b", s + F // 2), (sc["id"], "c", s + F - 1)]
        s += F
    return out


def pixmd5(png):
    r = sh(["ffmpeg", "-v", "error", "-i", str(png), "-f", "md5", "-"])
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError(f"ffmpeg md5 failed on {png}: {r.stderr.strip()}")
    return r.stdout.strip()


def small(png, dst):
    r = sh(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-vf", "scale=640:-1:flags=bicubic", str(dst)])
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg scale failed on {png}: {r.stderr.strip()}")


def psnr(a, b):
    r = sh(["ffmpeg", "-i", str(a), "-i", str(b), "-lavfi", "psnr", "-f", "null", "-"])
    m = re.search(r"average:(\S+)", r.stderr)
    if r.returncode != 0 or not m:
        raise RuntimeError(f"ffmpeg psnr failed on {a} vs {b}: {r.stderr.strip()}")
    return float("inf") if m.group(1) == "inf" else float(m.group(1))


def chrome_version() -> str:
    exe = ev_env.browser_exe()
    if not exe:
        return "unknown"
    r = sh([exe, "--version"])
    return (r.stdout or r.stderr).strip() or "unknown"


def chrome_major(ver: str) -> str | None:
    m = re.search(r"(\d+)\.", ver or "")
    return m.group(1) if m else None


def diff_report(gold_png: Path, new_png: Path, out_diff: Path) -> str:
    """Compute 640px PSNR + pixel bbox and generate a 3-pane [golden | actual | amplified diff] PNG."""
    db = psnr(new_png, gold_png)
    if math.isinf(db):
        return "PSNR(640px)=inf (differs only at 1080p full-res)"
    out_diff.parent.mkdir(parents=True, exist_ok=True)
    r1 = subprocess.run(["ffmpeg", "-v", "error", "-i", str(gold_png), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    r2 = subprocess.run(["ffmpeg", "-v", "error", "-i", str(new_png), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    detail = ""
    if r1.returncode == 0 and r2.returncode == 0 and len(r1.stdout) == len(r2.stdout):
        a, b = r1.stdout, r2.stdout
        w = 640
        diff_px = 0
        max_d = 0
        min_x, max_x, min_y, max_y = w, -1, 10**9, -1
        for i in range(0, len(a), 3):
            d0 = abs(a[i] - b[i])
            d1 = abs(a[i + 1] - b[i + 1])
            d2 = abs(a[i + 2] - b[i + 2])
            md = max(d0, d1, d2)
            if md:
                diff_px += 1
                if md > max_d:
                    max_d = md
                px = i // 3
                x, y = px % w, px // w
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
        if diff_px:
            detail = f", changed={diff_px}px bbox=({min_x},{min_y})..({max_x},{max_y}) max_delta={max_d}"
    r_strip = sh([
        "ffmpeg", "-v", "error", "-y", "-i", str(gold_png), "-i", str(new_png),
        "-filter_complex", "[0:v][1:v]blend=all_mode=difference,lutrgb=r='clip(val*12,0,255)':g='clip(val*12,0,255)':b='clip(val*12,0,255)'[d];[0:v][1:v][d]hstack=inputs=3",
        str(out_diff),
    ])
    strip_note = f", strip={out_diff}" if r_strip.returncode == 0 else ""
    return f"PSNR(640px)={db:.2f} dB{detail}{strip_note}"


def produce(dest: Path, vid: str, stills: bool = True, only=None, jobs=None):
    """Writes data.json, check.txt, stills/<scene>_<a|b|c>_<frame>.png (640 px) and stills.md5 for one video into dest."""
    data = prepare(dest, vid)
    if stills:
        render_stills(dest, vid, data, only, jobs)
    return data.get("mode") == "3d"


def prepare_batch(dest_by_vid: dict[str, Path], workers: int = 6) -> dict[str, dict]:
    """Batched check.txt + data.json preparation for all videos in dest_by_vid (one audio invocation + parallel check)."""
    if not dest_by_vid:
        return {}
    for dest in dest_by_vid.values():
        dest.mkdir(parents=True, exist_ok=True)
    py = sys.executable
    vids = list(dest_by_vid)
    # no TTS allowed here: audio must already be cached (one batched call validates + writes all data JSONs)
    shim = next(iter(dest_by_vid.values())).parent / "_shim"
    shim.mkdir(exist_ok=True)
    (shim / "uv").write_text("#!/bin/sh\necho 'audio is not cached: run make golden-audio' >&2\nexit 99\n")
    (shim / "uv").chmod(0o755)
    ar = subprocess.run([py, str(SKILL / "explainer.py"), "audio", str(CORPUS), *vids], capture_output=True, text=True,
                        env={**ENV, "PATH": f"{shim}:{ENV['PATH']}"})
    if ar.returncode:
        sys.exit(f"audio step failed (would re-synthesize?):\n{ar.stderr[-600:]}")

    def run_check(vid: str) -> None:
        r = sh([py, str(SKILL / "explainer.py"), "check", str(CORPUS), vid])
        (dest_by_vid[vid] / "check.txt").write_text(
            f"exit {r.returncode}\n--stdout--\n{norm(r.stdout)}--stderr--\n{norm(r.stderr)}"
        )

    with ThreadPoolExecutor(max(1, min(workers, len(vids)))) as ex:
        list(ex.map(run_check, vids))

    out: dict[str, dict] = {}
    for vid, dest in dest_by_vid.items():
        data_file = CORPUS / "public/data" / f"{vid}.json"
        shutil.copy(data_file, dest / "data.json")
        out[vid] = json.loads(data_file.read_text())
    return out


def prepare(dest: Path, vid: str) -> dict:
    """check.txt and data.json (audio must be cached). Returns the timing data."""
    return prepare_batch({vid: dest})[vid]


def run_worker(worker_videos: list[dict], keep_bundle: bool = False, serve_url: str | None = None) -> str | None:
    return render.render_stills_worker(CORPUS, worker_videos, serve_url=serve_url, keep_bundle=keep_bundle, quiet=True)


def render_stills_batch(items: list[tuple[Path, str, dict, str | set[str] | None]], jobs: int | None = None,
                        already_prepared: bool = False, keep_bundle: bool = False, serve_url: str | None = None) -> str | None:
    """Render stills for all (dest, vid, data, only) in one bundle + warm browser session per GL mode."""
    worker_videos = []
    post_jobs = []
    per_vid_targets: dict[str, tuple[Path, list[tuple[str, str, int]]]] = {}
    for dest, vid, data, only in items:
        (dest / "stills").mkdir(exist_ok=True)
        targets = frames(data, only)
        per_vid_targets[vid] = (dest, targets)
        if not targets:
            (dest / "stills.md5").write_text("{}\n")
            continue
        sdata = data if already_prepared else render.prepare_still(CORPUS, vid)  # validate + sync svgs/mode once per video
        is3d = sdata.get("mode") == "3d"
        conc = jobs or (JOBS_3D if is3d else JOBS)
        gl = os.environ.get("EXPLAINER_GL", "angle") if is3d else None
        worker_videos.append({
            "vid": vid,
            "gl": gl,
            "concurrency": conc,
            "frames": [{"frame": f, "output": str(CORPUS / "out/stills" / f"{vid}-{f}.png")} for _, _, f in targets],
        })
        for sid, tag, f in targets:
            post_jobs.append((dest, vid, sid, tag, f))

    retained = run_worker(worker_videos, keep_bundle=keep_bundle, serve_url=serve_url)

    def post(item):
        dest, vid, sid, tag, f = item
        png = CORPUS / "out/stills" / f"{vid}-{f}.png"
        if not png.exists():
            raise RuntimeError(f"still failed {vid} {sid} frame {f}: no {png}")
        name = f"{sid}_{tag}_{f}"
        small(png, dest / "stills" / f"{name}.png")
        return vid, name, pixmd5(png)

    md5_by_vid: dict[str, dict[str, str]] = {vid: {} for vid in per_vid_targets}
    if post_jobs:
        try:
            with ThreadPoolExecutor(JOBS) as ex:
                for vid, name, digest in ex.map(post, post_jobs):
                    md5_by_vid[vid][name] = digest
        except RuntimeError as e:
            if retained:
                shutil.rmtree(retained, ignore_errors=True)
            sys.exit(str(e))
    for vid, (dest, targets) in per_vid_targets.items():
        if targets:
            (dest / "stills.md5").write_text(json.dumps(md5_by_vid[vid], indent=1, sort_keys=True) + "\n")
    return retained


def render_stills(dest: Path, vid: str, data: dict, only=None, jobs=None) -> None:
    """stills/*.png (640 px) and stills.md5 for one video."""
    render_stills_batch([(dest, vid, data, only)], jobs=jobs)


def retry_2d_batch(mismatches: list[tuple[str, str, int, Path]], serve_url: str | None = None) -> dict[tuple[str, str], str]:
    """Re-render mismatching 2D stills together in one fresh concurrency=1 browser (reusing `serve_url` if given)."""
    by_vid: dict[str, list[tuple[str, int, Path]]] = {}
    for vid, name, frame, out_small in mismatches:
        by_vid.setdefault(vid, []).append((name, frame, out_small))
    worker_videos = [{
        "vid": vid,
        "gl": None,
        "concurrency": 1,
        "frames": [{"frame": fr, "output": str(CORPUS / "out/stills" / f"{vid}-{fr}-retry.png")} for _, fr, _ in items],
    } for vid, items in by_vid.items()]
    run_worker(worker_videos, keep_bundle=False, serve_url=serve_url)
    out: dict[tuple[str, str], str] = {}
    for vid, items in by_vid.items():
        for name, fr, out_small in items:
            png = CORPUS / "out/stills" / f"{vid}-{fr}-retry.png"
            if not png.exists():
                sys.exit(f"retry still failed {vid} frame {fr}: no {png}")
            small(png, out_small)
            out[(vid, name)] = pixmd5(png)
    return out


def compare(only_types=None, only_videos=None, no_stills=False):
    if isinstance(only_types, str):
        only_types = None if only_types == "-" else {only_types}
        no_stills = no_stills or (only_types is None)
    type_set = set(only_types) if only_types else None
    video_set = set(only_videos) if only_videos else None
    scratch = HERE / ".scratch"
    shutil.rmtree(scratch, ignore_errors=True)
    bad, retried = [], []
    all_vids = videos()
    prepared = prepare_batch({vid: scratch / vid for vid in all_vids})
    for vid in all_vids:  # cheap pass first: data JSON and check output, so a timing change fails in seconds
        for fn in ("data.json", "check.txt"):
            if not (GOLDEN / vid / fn).exists() or (scratch / vid / fn).read_bytes() != (GOLDEN / vid / fn).read_bytes():
                bad.append(f"{vid}: {fn} differs (diff {GOLDEN / vid / fn} {scratch / vid / fn})")
    if bad:
        print("GOLDEN MISMATCH. First difference:\n  " + bad[0])
        for b in bad[1:]:
            print("  " + b)
        sys.exit(1)
    batch = []
    batch_meta = []
    if not no_stills:
        for vid in all_vids:
            gold = GOLDEN / vid
            gdata = json.loads((gold / "data.json").read_text())
            if video_set is not None and vid in video_set:
                scene_types = None
            elif type_set is not None and any(sc["visual"]["type"] in type_set for sc in gdata["scenes"]):
                scene_types = type_set
            elif type_set is None and video_set is None:
                scene_types = None
            else:
                continue
            new = scratch / vid  # data.json and check.txt were made and compared in the first pass
            data = prepared[vid]
            batch.append((new, vid, data, scene_types))
            batch_meta.append((vid, gold, gdata, new, data.get("mode") == "3d", scene_types))
    bundle_url = None
    try:
        bundle_url = render_stills_batch(batch, already_prepared=True, keep_bundle=True)
        pending_2d: list[tuple[str, str, int, Path, Path, str]] = []
        for vid, gold, gdata, new, is3d, scene_types in batch_meta:
            old_md5 = json.loads((gold / "stills.md5").read_text())
            if scene_types is not None:
                keep = {sc["id"] for sc in gdata["scenes"] if sc["visual"]["type"] in scene_types}
                old_md5 = {k: v for k, v in old_md5.items() if k.rsplit("_", 2)[0] in keep}
            new_md5 = json.loads((new / "stills.md5").read_text())
            if old_md5.keys() != new_md5.keys():
                bad.append(f"{vid}: still frame set differs (timing changed?)")
                continue
            for name in sorted(old_md5, key=lambda n: int(n.rsplit("_", 1)[1])):
                gold_png = gold / "stills" / f"{name}.png"
                new_png = new / "stills" / f"{name}.png"
                if is3d:
                    db = psnr(new_png, gold_png)
                    if db < PSNR_3D_MIN:
                        diag = diff_report(gold_png, new_png, scratch / "diffs" / f"{vid}_{name}.png")
                        bad.append(f"{vid}: still {name} (3D) PSNR {db:.1f} dB < {PSNR_3D_MIN} ({diag})")
                elif old_md5[name] != new_md5[name]:
                    pending_2d.append((vid, name, int(name.rsplit("_", 1)[1]), gold_png, new_png, old_md5[name]))
        if pending_2d:
            retried_md5 = retry_2d_batch([(v, n, fr, np_p) for v, n, fr, _, np_p, _ in pending_2d], serve_url=bundle_url)
            for vid, name, _, gold_png, new_png, want_md5 in pending_2d:
                retried.append(f"{vid}/{name}")
                if retried_md5[(vid, name)] == want_md5:
                    continue
                diag = diff_report(gold_png, new_png, scratch / "diffs" / f"{vid}_{name}.png")
                bad.append(f"{vid}: still {name} pixels differ ({diag}; compare {gold_png} with {new_png})")
    finally:
        if bundle_url:
            shutil.rmtree(bundle_url, ignore_errors=True)
    if retried:
        print(f"note: {len(retried)} still(s) differed under parallel load and were re-rendered alone: " + ", ".join(retried))
    if bad:
        meta_path = GOLDEN / ".meta.json"
        if meta_path.is_file():
            try:
                rec_ver = json.loads(meta_path.read_text()).get("chrome_version", "")
                cur_ver = chrome_version()
                if rec_ver and cur_ver and chrome_major(rec_ver) != chrome_major(cur_ver):
                    print(f"NOTE: Chrome updated (recorded {rec_ver} -> local {cur_ver}); 2D MD5s may reflect Skia rasterizer changes.")
            except (OSError, json.JSONDecodeError):
                pass
        print("GOLDEN MISMATCH. First difference:\n  " + bad[0])
        for b in bad[1:]:
            print("  " + b)
        sys.exit(1)
    shutil.rmtree(scratch, ignore_errors=True)
    scope = []
    if no_stills:
        scope.append("data/check only")
    else:
        if type_set:
            scope.append("types=" + ",".join(sorted(type_set)))
        if video_set:
            scope.append("videos=" + ",".join(sorted(video_set)))
    suffix = f" ({'; '.join(scope)})" if scope else ""
    print(f"golden ok: {len(all_vids)} videos{suffix}")


def record(ids=None):
    """All videos (wipes tests/golden), or only the given ids (leaves every other golden untouched)."""
    if ids:
        unknown = sorted(set(ids) - set(videos()))
        if unknown:
            sys.exit(f"unknown corpus video(s): {unknown}")
    else:
        shutil.rmtree(GOLDEN, ignore_errors=True)
    target_ids = ids or videos()
    for vid in target_ids:
        shutil.rmtree(GOLDEN / vid, ignore_errors=True)
    prepared = prepare_batch({vid: GOLDEN / vid for vid in target_ids})
    batch = [(GOLDEN / vid, vid, prepared[vid], None) for vid in target_ids]
    render_stills_batch(batch, jobs=1, already_prepared=True)  # concurrency 1: a parallel-load raster artifact must never become a golden
    for _, vid, _, _ in batch:
        print("recorded", vid)
    (GOLDEN / ".meta.json").write_text(json.dumps({"chrome_version": chrome_version()}, indent=1) + "\n")
    shutil.rmtree(GOLDEN / "_shim", ignore_errors=True)


def parse_det_args(argv: list[str]) -> tuple[list[str] | None, int]:
    ids, runs, i = [], 2, 0
    while i < len(argv):
        if argv[i] == "--runs" and i + 1 < len(argv):
            runs = max(2, int(argv[i + 1]))
            i += 2
        else:
            ids.append(argv[i])
            i += 1
    return (ids or None), runs


def det(ids=None, runs: int = 2):
    target_ids = ids or videos()
    unknown = sorted(set(target_ids) - set(videos()))
    if unknown:
        sys.exit(f"unknown corpus video(s): {unknown}")
    dirs = [HERE / f".det_{r}" for r in range(runs)]
    for d in dirs:
        shutil.rmtree(d, ignore_errors=True)
    try:
        prepared = prepare_batch({vid: dirs[0] / vid for vid in target_ids})
        for d in dirs[1:]:
            shutil.copytree(dirs[0], d)
        for r_idx, d in enumerate(dirs):
            batch = [(d / vid, vid, prepared[vid], None) for vid in target_ids]
            render_stills_batch(batch, already_prepared=True)
        for vid in target_ids:
            is3d = prepared[vid].get("mode") == "3d"
            md5s = [json.loads((dirs[r] / vid / "stills.md5").read_text()) for r in range(runs)]
            keys = sorted(md5s[0].keys())
            same = sum(len({m[k] for m in md5s}) == 1 for k in keys)
            lows = sorted(
                psnr(dirs[0] / vid / "stills" / f"{k}.png", dirs[r] / vid / "stills" / f"{k}.png")
                for k in keys for r in range(1, runs)
            )
            print(f"{vid} ({'3D' if is3d else '2D'}): {same}/{len(keys)} pixel-identical across {runs} runs; lowest PSNRs: {lows[:3]}")
    finally:
        for d in dirs:
            shutil.rmtree(d, ignore_errors=True)


def parse_compare_args(argv: list[str]) -> tuple[set[str] | None, set[str] | None, bool]:
    types: set[str] = set()
    vids: set[str] = set()
    no_stills = False
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("--type", "--types") and i + 1 < len(argv):
            for part in argv[i + 1].split(","):
                part = part.strip()
                if part == "-":
                    no_stills = True
                elif part:
                    types.add(part)
            i += 2
        elif arg == "--videos" and i + 1 < len(argv):
            for part in argv[i + 1].split(","):
                if part.strip():
                    vids.add(part.strip())
            i += 2
        else:
            sys.exit(f"unknown compare argument: {arg}")
    return (types or None), (vids or None), no_stills


if __name__ == "__main__":
    if sys.argv[1] == "compare":
        t_arg, v_arg, no_st = parse_compare_args(sys.argv[2:])
        compare(only_types=t_arg, only_videos=v_arg, no_stills=no_st)
    elif sys.argv[1] == "record":
        record(sys.argv[2:])
    else:
        d_ids, d_runs = parse_det_args(sys.argv[2:])
        det(ids=d_ids, runs=d_runs)
