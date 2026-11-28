"""TTS synthesis, forced alignment, word timings, and timing-data generation. Stdlib only."""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import timing
from env import (
    ALIGN_LANGUAGE,
    ALIGN_MODEL,
    FPS,
    KOKORO_MODEL,
    LANG_MODEL,
    LEAD,
    SILMA_MODEL,
    SKILL,
    TAIL,
    announce_model_download_if_missing,
    atomic_write_text,
    clip_err,
    die,
    env_timeout,
    find_speak,
    find_uv,
    load_scripts,
    run_guarded,
    scene_starts,
    sync_uv_env,
)
from features import lang_of
from mermaid_host import check_mermaid
from figures_host import stage_figures
from pronounce import pronouncer, warn_unspoken_acronyms
from report import esc
from validation import describe_visuals, resolve_speed, resolve_voice, validate_all

QWEN3_REPO = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"
QWEN3_INSTRUCT = ("Native General American English accent with natural American intonation and rhythm, no foreign accent. "
                  "Calm, warm, natural explainer narrator with a conversational pace and clear diction.")


def wav_seconds(wav: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
                         check=True, capture_output=True, text=True)
    return float(out.stdout.strip())


def _valid_wav(wav: Path) -> float | None:
    """Return positive audio duration in seconds if `wav` is non-empty and readable, else None."""
    try:
        if not wav.is_file() or wav.stat().st_size <= 44:
            return None
        dur = wav_seconds(wav)
        return dur if dur > 0 else None
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None


# Two-voice dialogue (scripts with `speakers`): Kokoro's voices differ in level (af_heart about -25.5 LUFS, am_michael about -27.1 per scene), which
# is audible when they alternate. Each such scene is brought to one fixed level right after synthesis, once, in place: the gain only scales samples, so
# durations and the word times next to the wav stay valid. Scripts without `speakers` are never touched (their audio and cache keys are unchanged).
LOUDNESS_TARGET_LUFS = -26.0     # integrated loudness every dialogue scene is brought to (near the louder voice, so the louder one is trimmed only a little)
LOUDNESS_PEAK_CEIL_DB = -1.0     # a boost is limited so the true peak stays at or below this (no clipping)
LOUDNESS_NORM = "loudness1"      # in the dialogue scenes' cache key: bump it when the target or the method changes, and the audio is made again
LOUDNESS_SKIP_DB = 0.05          # a gain this small is inaudible: leave the file alone


def loudness_gain_db(lufs: float, true_peak: float, target: float = LOUDNESS_TARGET_LUFS, ceil: float = LOUDNESS_PEAK_CEIL_DB) -> float:
    """Gain (dB) that brings a scene measured at `lufs` / `true_peak` to `target`, never past `ceil` at the peak (a cut is never limited)."""
    gain = target - lufs
    if gain > 0:
        gain = min(gain, max(0.0, ceil - true_peak))
    return gain


def measure_loudness(wav: Path) -> tuple[float, float] | None:
    """(integrated loudness in LUFS, true peak in dBFS) of `wav` by ffmpeg's EBU R128 measurement, or None when it is unmeasurable (silent or under 400 ms)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"loudness measurement failed for {wav.name}:\n{clip_err(r.stderr)}")
    m = re.search(r"\{[^{}]*\}", r.stderr)
    try:
        d = json.loads(m.group(0)) if m else {}
        lufs, peak = float(d["input_i"]), float(d["input_tp"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return (lufs, peak) if math.isfinite(lufs) and math.isfinite(peak) else None


def match_loudness(wav: Path) -> float:
    """Bring `wav` to LOUDNESS_TARGET_LUFS in place (PCM 16-bit, same rate and length). Returns the gain applied in dB (0.0 when left alone)."""
    got = measure_loudness(wav)
    if got is None:
        return 0.0
    gain = loudness_gain_db(*got)
    if abs(gain) < LOUDNESS_SKIP_DB:
        return 0.0
    tmp = wav.with_name(f".{wav.stem}.norm.wav")
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(wav), "-af", f"volume={gain:.4f}dB", "-c:a", "pcm_s16le", str(tmp)],
                           capture_output=True, text=True)
        if r.returncode != 0 or _valid_wav(tmp) is None:
            die(f"loudness matching failed for {wav.name}:\n{clip_err(r.stderr)}")
        os.replace(tmp, wav)
    finally:
        tmp.unlink(missing_ok=True)
    return gain


def scene_digest(text: str, model: str, voice: str, speed: float, extra: str, lang: str, vfinger: str, norm: str = "") -> str:
    """The cache key of a scene's audio. English keeps its original key (existing caches stay valid), other languages add theirs so no two collide,
    and `norm` (dialogue scenes: LOUDNESS_NORM) is appended only when given, so every other script's key is byte-identical to before."""
    return hashlib.sha256((f"{text}|{model}|{voice}|{speed}|{extra}" + (f"|{lang}|{vfinger}" if lang != "en" else "") + (f"|{norm}" if norm else "")).encode()).hexdigest()


def synth_qwen3(speak: Path, jobs: list[tuple[str, str, Path]], voice: str) -> None:
    """Qwen3-TTS CustomVoice for several scenes with one model load. jobs: (scene id, spoken text, target wav)."""
    tmp = jobs[0][2].parent / ".qwen3"
    shutil.rmtree(tmp, ignore_errors=True)
    req = {"out": str(tmp), "candidates": [{"key": "q", "repo": QWEN3_REPO, "kind": "qwen3_custom", "voice": voice,
                                            "instruct": QWEN3_INSTRUCT}],
           "scenes": [{"id": sid, "text": text} for sid, text, _ in jobs]}
    cmd = [find_uv(), "run", "--no-sync", "--project", str(speak), "python", str(SKILL / "ab_worker.py")]
    timeout = env_timeout("EXPLAINER_TTS_TIMEOUT", 1800.0)
    announce_model_download_if_missing(QWEN3_REPO, "~3.5 GB")
    try:
        try:
            r = run_guarded(cmd, stdin=json.dumps(req), timeout=timeout, capture=True, capture_stderr=False)
        except subprocess.TimeoutExpired:
            die(f"Qwen3-TTS timed out after {timeout:.0f}s (set $EXPLAINER_TTS_TIMEOUT to override)")
        try:
            res = json.loads(r.stdout)["results"]["q"] if r.returncode == 0 and r.stdout.strip() else {"error": "worker crashed"}
        except (json.JSONDecodeError, KeyError, TypeError):
            res = {"error": "worker returned malformed JSON"}
        if res.get("error"):
            die(f"Qwen3-TTS failed: {res['error']}")
        for sid, _, wav in jobs:
            os.replace(res["scenes"][sid]["wav"], wav)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def tts_words_path(wav: Path) -> Path:
    """Where speak.py writes the TTS model's own token times for this scene's audio."""
    return wav.with_suffix(".words.json")


def synth(speak: Path, text: str, wav: Path, model: str, voice: str, speed: float, lang: str = "en") -> None:
    cmd = [find_uv(), "run", "--no-sync", "--project", str(speak), "python", str(speak / "speak.py"),
           *(["--lang", lang] if lang != "en" else []),
           "--model", model, "--voice", voice, "--speed", str(speed), "--out", str(wav),
           "--timings", str(tts_words_path(wav))]
    timeout = env_timeout("EXPLAINER_TTS_TIMEOUT", 600.0)
    for attempt in (1, 2):
        try:
            r = run_guarded(cmd, stdin=text, timeout=timeout, capture=True)
        except subprocess.TimeoutExpired:
            die(f"TTS timed out after {timeout:.0f}s (set $EXPLAINER_TTS_TIMEOUT to override)")
        if r.returncode == 0 and wav.exists():
            return
        if attempt == 1 and re.search(r"No module named|ModuleNotFoundError|No such file|Failed to spawn", r.stderr):
            print("[setup] syncing tts environment (first run only)...", file=sys.stderr, flush=True)
            sync_uv_env(speak)
            continue
        die(f"TTS failed:\n{clip_err(r.stderr)}")


def tts_timed_scenes(jobs: list[tuple[str, str, Path, str]], vid: str, lang: str = "en") -> tuple[dict, dict]:
    """Word times from the TTS model itself (Kokoro, SILMA), written next to each wav by speak.py --timings.

    These are the durations the audio was generated from, so they need no second model. Returns (exact, approx), each
    {scene_id: [{w, start, end}]}: `exact` for the scenes where the times map cleanly onto the spoken words and pass the
    same validation as forced alignment; `approx` for ones the TTS itself flagged as estimated ("approx": true in the
    file), which are used only if forced alignment fails too. The rest are left to align_scenes.
    """
    out: dict[str, list[dict]] = {}
    approx: dict[str, list[dict]] = {}
    for sid, text, wav, _ in jobs:
        f = tts_words_path(wav)
        if not f.exists():
            if lang != "en":
                print(f"warning: {vid}/{sid}: the TTS wrote no word times; using forced alignment for this scene", file=sys.stderr)
            continue  # audio from before --timings existed, or from a model without timings (qwen3)
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            tokens = data["words"]
            if not isinstance(tokens, list):
                raise TypeError("words is not a list")
            items = timing.words_from_tts(tokens, text)
            dur = _valid_wav(wav)
            if dur is None:
                raise ValueError("audio file is unreadable or empty")
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            print(f"warning: {vid}/{sid}: corrupt TTS timings ({e}); discarding cache and using forced alignment", file=sys.stderr)
            f.unlink(missing_ok=True)
            continue
        bad = "its tokens do not match the spoken text" if items is None else \
            timing.validate_alignment(items, text, dur)
        if bad:
            print(f"warning: {vid}/{sid}: TTS word times unusable ({bad}); using forced alignment for this scene",
                  file=sys.stderr)
            continue
        (approx if data.get("approx") else out)[sid] = items
    return out, approx


def align_scenes(speak: Path, adir: Path, jobs: list[tuple[str, str, Path, str]], vid: str, lang: str = "en") -> dict[str, list[dict]]:
    """Word times for each scene's audio via forced alignment, cached per (text, audio, aligner).

    Returns {scene_id: [{w, start, end}]}. A scene whose alignment fails validation is left out (with a warning),
    and the renderer falls back to the old even spread for that scene only.
    """
    out: dict[str, list[dict]] = {}
    todo = []
    for sid, text, wav, tts_digest in jobs:
        key = hashlib.sha256((f"{text}|{tts_digest}|{ALIGN_MODEL}" + ("" if lang == "en" else f"|{lang}")).encode()).hexdigest()
        cache = adir / f"{sid}.align.json"
        if cache.exists():
            try:
                c = json.loads(cache.read_text(encoding="utf-8"))
                if isinstance(c, dict) and c.get("key") == key and isinstance(c.get("words"), list):
                    out[sid] = c["words"]
                    continue
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError) as e:
                print(f"warning: {vid}/{sid}: corrupt alignment cache ({e}); re-aligning", file=sys.stderr)
                cache.unlink(missing_ok=True)
        todo.append((sid, text, wav, key, cache))
    if not todo:
        return out
    print(f"[align] {vid}: {len(todo)} scene(s) with {ALIGN_MODEL} ({ALIGN_LANGUAGE[lang]})", flush=True)
    if lang != "en":
        print(f"warning: {vid}: forced alignment for {ALIGN_LANGUAGE[lang]} is unverified (Qwen3-ForcedAligner does not list it); "
              f"results are validated and rejected if implausible", file=sys.stderr)
    announce_model_download_if_missing(ALIGN_MODEL, "~1.3 GB")
    req = json.dumps({"items": [{"id": sid, "wav": str(wav), "text": text} for sid, text, wav, _, _ in todo]})
    cmd = [find_uv(), "run", "--no-sync", "--project", str(speak), "python", str(SKILL / "align_worker.py"), "--model", ALIGN_MODEL,
           "--language", ALIGN_LANGUAGE[lang]]
    timeout = env_timeout("EXPLAINER_ALIGN_TIMEOUT", 900.0)
    try:
        r = run_guarded(cmd, stdin=req, timeout=timeout, capture=True)
    except subprocess.TimeoutExpired:
        print(
            f"warning: alignment timed out after {timeout:.0f}s (set $EXPLAINER_ALIGN_TIMEOUT to override); "
            "falling back to approximate/even-spread timing",
            file=sys.stderr,
        )
        return out
    if r.returncode != 0:
        print(f"warning: alignment failed; scenes fall back to the TTS's approximate times if it gave any, else an even spread:\n{clip_err(r.stderr)}", file=sys.stderr)
        return out
    try:
        results = json.loads(r.stdout)["results"]
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"warning: alignment output invalid ({e}); falling back to approximate/even-spread timing", file=sys.stderr)
        return out
    for sid, text, wav, key, cache in todo:
        items = results.get(sid, [])
        dur = _valid_wav(wav)
        if dur is None:
            print(f"warning: {vid}/{sid}: unreadable wav during alignment; skipping cache", file=sys.stderr)
            continue
        bad = timing.validate_alignment(items, text, dur)
        if bad:
            print(f"warning: {vid}/{sid}: alignment rejected ({bad}); using even-spread timing for this scene", file=sys.stderr)
            continue
        atomic_write_text(cache, json.dumps({"key": key, "words": items}, ensure_ascii=False))
        out[sid] = items
    return out


def pick_voice(lang: str, vid: str, model: str | None, voice: str | None) -> tuple[str, str, str]:
    """(model, voice, voice fingerprint) for a script of this language. --model/--voice that belong to another language
    are ignored with a warning, so one command can serve a mix of English and Arabic scripts."""
    default_model = LANG_MODEL[lang]
    if model and model not in ({"kokoro", "qwen3"} if lang == "en" else {"silma"}):
        print(f"warning: {vid}: --model {model} is not available for language \"{lang}\"; using {default_model}", file=sys.stderr)
        model = None
    model = model or default_model
    if lang == "en":
        if voice == "default" or (voice and voice.endswith(".wav")):
            print(f"warning: {vid}: voice '{voice}' is for Arabic scripts; using the English default", file=sys.stderr)
            voice = None
        return model, voice or ("Ryan" if model == "qwen3" else "af_heart"), ""
    # ar: SILMA speaks with its built-in voice ("default") or clones a reference recording (a .wav path)
    if voice and voice != "default":
        if voice.lower().endswith(".wav"):
            ref = Path(voice).expanduser()
            if not ref.is_file():
                die(f"voice file not found: {voice}")
            txt = ref.with_suffix(".txt")
            if not txt.is_file():
                # Without a transcript SILMA would download Whisper (~1.6 GB) to transcribe the clip.
                die(f"voice {voice}: put the clip's transcript in {txt.name} next to it")
            h = hashlib.sha256(ref.read_bytes())
            h.update(txt.read_bytes())  # the transcript changes the voice too, so it is part of the cache key
            return model, str(ref.resolve()), h.hexdigest()[:16]
        print(f"warning: {vid}: voice '{voice}' is not an Arabic voice (use 'default' or a .wav reference); using default", file=sys.stderr)
    return model, "default", ""


def cmd_audio(workdir: Path, ids: list[str], model: str | None, voice: str | None, cli_speed: float | None, strict: bool = False) -> None:
    if model == 'qwen3' and cli_speed not in (None, 1.0):
        print('warning: --speed is ignored by Qwen3-TTS', file=sys.stderr)
    speak = find_speak()
    en_say = pronouncer(workdir)
    scripts = load_scripts(workdir, ids)
    warn_unspoken_acronyms(workdir, scripts)
    problems = validate_all(scripts, workdir, strict)
    if problems:
        die("script errors:\n  " + "\n  ".join(problems))
    problems, diagrams = check_mermaid(workdir, scripts)
    if problems:
        die("script errors:\n  " + "\n  ".join(problems))
    fig_errs, figures = stage_figures(workdir, scripts)
    if fig_errs:
        die("script errors:\n  " + "\n  ".join(fig_errs))

    def build_full(vid: str, script: dict) -> list[dict]:
        out = []
        for sc in script["scenes"]:
            if sc["visual"].get("type") == "mermaid":
                res = diagrams[f"{vid}/{sc['id']}"]
                animated = (sc["visual"].get("build") or sc.get("focus")) and res.get("layout")
                sc = {**sc, "mermaidRendered": {"svg": res["svg"], **({"layout": res["layout"]} if animated else {})}}
            elif sc["visual"].get("type") == "figure":
                asset, nat = figures[f"{vid}/{sc['id']}"]
                sc = {**sc, "figureAsset": asset, **({"figureAspect": round(nat, 4)} if nat and sc["visual"].get("aspect") is None else {})}
            out.append(sc)
        return out

    full_by_vid = {vid: build_full(vid, script) for vid, script in scripts}
    all_desc_items = [
        (sc["visual"], full_by_vid[vid][i - 1]["visual"] if i and sc.get("continues") else None, sc.get("mermaidRendered"))
        for vid, _ in scripts
        for i, sc in enumerate(full_by_vid[vid])
    ]
    descs_by_vid: dict[str, list[dict]] | None = None
    announced_models: set[str] = set()

    for vid, script in scripts:
        lang = lang_of(script)
        speed = resolve_speed(script, cli_speed, workdir)   # --speed, else the style's default speed, else 1.0
        speakers = script.get("speakers")
        if speakers and voice:
            die(f"{vid}: --voice cannot be combined with a script that has speakers (each speaker's own voice is used)")
        if speakers and model == "qwen3":
            die(f"{vid}: --model qwen3 cannot be combined with a script that has speakers (two-voice dialogue needs kokoro)")
        vmodel, vvoice, vfinger = pick_voice(lang, vid, model, resolve_voice(script, voice, workdir))
        # Voice precedence: the scene's speaker, then --voice, then the style default, then the language default.
        scene_voice = {sc["id"]: speakers[sc["speaker"]]["voice"] if speakers else vvoice for sc in script["scenes"]}
        say = en_say if lang == "en" else (lambda t: t)    # Arabic narration is spoken as written (it carries its own vowels)
        adir = workdir / "public/audio" / vid
        adir.mkdir(parents=True, exist_ok=True)
        (workdir / "public/data").mkdir(parents=True, exist_ok=True)
        (workdir / "transcripts").mkdir(parents=True, exist_ok=True)
        prepared, pending = [], []
        for sc in script["scenes"]:
            text = say(sc["narration"])
            wav, stamp = adir / f"{sc['id']}.wav", adir / f"{sc['id']}.sha"
            extra = QWEN3_INSTRUCT if vmodel == "qwen3" else ""
            digest = scene_digest(text, vmodel, scene_voice[sc["id"]], speed, extra, lang, vfinger, LOUDNESS_NORM if speakers else "")
            cached_stamp = None
            if stamp.is_file():
                try:
                    cached_stamp = stamp.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    cached_stamp = None
            cached_dur = _valid_wav(wav) if cached_stamp == digest else None
            if cached_dur is None:
                if cached_stamp == digest and wav.exists():
                    print(f"warning: {vid}/{sc['id']}: cached audio is empty or corrupt; re-synthesizing", file=sys.stderr)
                pending.append((sc["id"], text, wav, stamp, digest))
            prepared.append([sc, text, wav, cached_dur, digest])
        for _, _, wav, stamp, _ in pending:
            tts_words_path(wav).unlink(missing_ok=True)  # stale times/stamps must never outlive their audio
            stamp.unlink(missing_ok=True)
        if vmodel == "qwen3":
            if pending:
                announce_model_download_if_missing(QWEN3_REPO, "~3.5 GB", announced_models)
                print(f"[tts] {vid}: {len(pending)} scene(s) with Qwen3-TTS ({vvoice})", flush=True)
                synth_qwen3(speak, [(sid, t, w) for sid, t, w, _, _ in pending], vvoice)
                for sid, _, wav, stamp, digest in pending:
                    if _valid_wav(wav) is None:
                        die(f"TTS produced invalid audio for {vid}/{sid}: {wav}")
                    atomic_write_text(stamp, digest)
        else:
            if pending:
                if vmodel == "kokoro":
                    announce_model_download_if_missing(KOKORO_MODEL, "~160 MB", announced_models)
                elif vmodel == "silma":
                    announce_model_download_if_missing(SILMA_MODEL, "~900 MB", announced_models)
            total_pending = len(pending)
            # Scenes of one voice run back to back (first-seen voice first, scene order kept within a voice).
            voice_rank = {v: i for i, v in enumerate(dict.fromkeys(scene_voice[p[0]] for p in pending))}
            pending.sort(key=lambda p: voice_rank[scene_voice[p[0]]])
            for idx, (sid, text, wav, stamp, digest) in enumerate(pending, 1):
                print(f"[tts] {vid}/{sid} ({idx}/{total_pending})" + (f" ({vmodel}, {lang})" if lang != "en" else ""), flush=True)
                synth(speak, text, wav, vmodel, scene_voice[sid], speed, lang)
                if _valid_wav(wav) is None:
                    die(f"TTS produced invalid audio for {vid}/{sid}: {wav}")
                if speakers:   # before the stamp: a stamp always means "synthesised and levelled", so the gain is never applied twice
                    match_loudness(wav)
                atomic_write_text(stamp, digest)
        for p in prepared:
            if p[3] is None:
                p[3] = wav_seconds(p[2])
        prepared = [tuple(p) for p in prepared]
        jobs = [(sc["id"], text, wav, digest) for sc, text, wav, _, digest in prepared]
        aligned, approx = tts_timed_scenes(jobs, vid, lang)
        if lang == "ar":
            # Measured: Qwen3-ForcedAligner ignores Arabic and gave zero-length or misplaced words, so SILMA's own
            # pause-and-letter-count estimate beats it. Use the estimate directly; the aligner only sees scenes without one.
            for sid, items in approx.items():
                aligned.setdefault(sid, items)
            approx = {}
        aligned.update(align_scenes(speak, adir, [j for j in jobs if j[0] not in aligned], vid, lang))
        for sid, items in approx.items():
            if sid not in aligned:   # last resort before an even spread: the TTS's own estimate
                print(f"warning: {vid}/{sid}: using the TTS's approximate word times (forced alignment failed); "
                      f"reveals and captions may be a little off", file=sys.stderr)
                aligned[sid] = items
        scenes, md = [], [f"# {script['title']}\n"]
        # mermaid scenes get their rendered svg (and layout, when animated) under mermaidRendered so visual stays strictly schema-conformant
        full = full_by_vid[vid]
        if descs_by_vid is None:
            all_descs = describe_visuals(all_desc_items)
            descs_by_vid = {}
            pos = 0
            for v_id, _ in scripts:
                n = len(full_by_vid[v_id])
                descs_by_vid[v_id] = all_descs[pos:pos + n]
                pos += n
        descs = descs_by_vid[vid]
        for (_, text, wav, dur, _x), sc, desc in zip(prepared, full, descs):
            items = aligned.get(sc["id"])
            timing_data: dict = {}
            if items:
                timing_data["words"] = items
                timing_data["sentences"] = timing.sentence_starts(sc["narration"], text, items)
                slots, carried = desc["slots"], desc["carried"]
                if slots:
                    # a continued diagram: carried items are already on screen, only the new ones are revealed (and cued)
                    fresh = [s for s, c in zip(slots, carried) if not c]
                    times, fb = timing.reveal_times(fresh, items, sc.get("cues"), dur) if fresh else ([], [])
                    it = iter(times)
                    timing_data["revealSec"] = [0.0 if c else next(it) for c in carried]
                    if fb:
                        print(f"warning: {vid}/{sc['id']}: no keyword match for item(s) {[i + 1 for i in fb]}; "
                              f"placed by interpolation. Add \"cues\": [...] to this scene to pin them.", file=sys.stderr)
            if sc.get("focus"):
                ftimes, missing = timing.focus_times([say(f["at"]) for f in sc["focus"]], text, items, dur)
                timing_data["focusSec"] = [{"t": t, "on": f["on"]} for t, f in zip(ftimes, sc["focus"])]
                for i in missing:
                    print(f"warning: {vid}/{sc['id']}: focus phrase \"{sc['focus'][i]['at']}\" not found in the spoken "
                          f"text (a pronunciation fix changed it?); placed after the previous focus.", file=sys.stderr)
            scenes.append({**sc, "audio": f"audio/{vid}/{sc['id']}.wav", "durationSec": round(dur, 3),
                           "frames": math.ceil((LEAD + dur + TAIL) * FPS), "leadFrames": round(LEAD * FPS), **timing_data})
            who = f" - {esc(speakers[sc['speaker']]['name'])} ({esc(speakers[sc['speaker']]['role'])})" if speakers else ""
            md.append(f"## Scene {sc['id']}{who} ({dur:.1f}s)\n\n{sc['narration']}\n")
        _, total = scene_starts(scenes)
        theme = script.get("theme")
        theme_field = {"theme": theme} if theme and theme != "cel-sky" else {}
        if script.get("layout"):
            theme_field["layout"] = script["layout"]
        if speakers:   # names and roles only; the voices are audio-side and stay out of the render data
            theme_field["speakers"] = {k: {"name": v["name"], "role": v["role"]} for k, v in speakers.items()}
        atomic_write_text(
            workdir / "public/data" / f"{vid}.json",
            json.dumps(
                {"id": vid, "title": script["title"], "language": lang, "dir": "rtl" if lang == "ar" else "ltr", "mode": script.get("mode") or "2d",
                 **theme_field, "fps": FPS, "totalFrames": total, "scenes": scenes},
                indent=1,
            ),
        )
        md.append(f"\n_Total runtime: {total / FPS:.0f}s_\n")
        atomic_write_text(workdir / "transcripts" / f"{vid}.md", "\n".join(md))
        print(f"[done] {vid}: {len(scenes)} scenes, {total / FPS:.0f}s", flush=True)
