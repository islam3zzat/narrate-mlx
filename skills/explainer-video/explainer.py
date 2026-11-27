#!/usr/bin/env python3
"""Narrated explainer videos from a JSON script (Remotion + the sibling speak skill). Standard library only.

A *work directory* holds one project's videos:

    <workdir>/scripts/<id>.json       you write these (narration + a visual per scene)
    <workdir>/public/audio/<id>/*.wav generated (cached by text, voice, speed, model)
    <workdir>/public/data/<id>.json   generated (scene timings, read by Remotion)
    <workdir>/transcripts/<id>.md     generated
    <workdir>/out/<id>.mp4            rendered video

Usage:
    explainer.py init   <workdir> [--lang en|ar] [--style NAME]   create a work dir with an example script (English or Arabic, or a style skeleton)
    explainer.py check  <workdir> [ids...] [--strict] validate scripts (no audio, fast); --strict: every ledger fact must be narrated
    explainer.py styles [--json] [--workdir DIR]     list the styles (audience/purpose profiles) a script's "style" may name
    explainer.py transcript <file.vtt|.srt|.txt> [--out FILE] [--force]   meeting transcript -> `[HH:MM:SS] Speaker: text` lines (flag transcripts, on by default)
    explainer.py report <workdir>                    <workdir>/report.md from ledger.json: timeline, actions, decisions, contradictions, deferred facts
    explainer.py features [--json] [--enabled NAME]  list the feature flags and which are on (--features a,b on any command turns flags on)
    explainer.py pronounce [WORD SPOKEN] [...]       persist or preview English pronunciation overrides
    explainer.py visual {init,check,list,promote,regen}   scaffold, verify, list, promote, or regenerate visual types
    explainer.py schema [--style] [--builtin]        print the JSON Schema of a script (or of a style definition with --style)
    explainer.py audio  <workdir> [ids...]           narration -> WAV + timings + transcripts
    explainer.py still  <workdir> <id> --scene s03   one PNG, to check the layout
    explainer.py review <workdir> <id>               contact sheet of frames across every scene
    explainer.py render <workdir> [ids...] [--draft]  MP4 per video (--draft: 720p ultrafast)
    explainer.py verify <workdir> <id>               compare late video frames against stills (PSNR)
    explainer.py all    <workdir> [ids...] [--draft]  audio, then render
    explainer.py studio <workdir> <id>               Remotion Studio preview
    explainer.py catalog                             open the Visual Catalog in Remotion Studio (no workdir required)
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import report as report_md
import transcript as transcript_mod
import visual_host

# Re-export public symbols from focused modules so existing callers/tests importing `explainer` continue to work.
from audio import (
    QWEN3_INSTRUCT,
    QWEN3_REPO,
    align_scenes,
    cmd_audio,
    pick_voice,
    synth,
    synth_qwen3,
    tts_timed_scenes,
    tts_words_path,
    wav_seconds,
)
from env import (
    ALIGN_LANGUAGE,
    ALIGN_MODEL,
    FPS,
    KOKORO_MODEL,
    LANG_MODEL,
    LANGS,
    LEAD,
    MAX_WORDS,
    SILMA_MODEL,
    SKILL,
    SPEED_MAX,
    SPEED_MIN,
    TAIL,
    TASHKEEL_MIN,
    WPS,
    announce_browser_download_if_missing,
    announce_model_download_if_missing,
    atomic_write_text,
    browser_args,
    browser_exe,
    cli_hint,
    die,
    ensure_deps,
    env_timeout,
    find_speak,
    find_uv,
    hf_cache_dir,
    hf_model_cached,
    inside as _inside,
    load_scripts,
    run_cli,
    run_guarded,
    tool_env,
)
from features import (
    DEFAULT_ON_FEATURES,
    FEATURES,
    RETIRED_FEATURES,
    apply_features_arg,
    cmd_features,
    enabled_features,
    feature_errors,
    feature_on,
    feature_tokens,
    lang_of,
)
from mermaid_host import (
    MERMAID_MAX_CHARS,
    MERMAID_MAX_DIAGRAMS,
    MERMAID_TYPES,
    check_mermaid,
    check_mermaid_animation,
    mermaid_hash,
    mermaid_items,
    mermaid_static,
    norm_name,
    render_mermaid,
)
from pronounce import (
    LETTER_PLURAL,
    PRONOUNCE,
    cmd_pronounce,
    global_pronounce_file,
    plural_spoken,
    pronouncer,
    pronunciation_table,
    read_map,
    warn_unspoken_acronyms,
)
from render import (
    _verify_scenes,
    bundle_once,
    cmd_render,
    cmd_review,
    cmd_still,
    cmd_verify,
    gl_args,
    prepare_still,
    read_data,
    remotion,
    scene_starts,
    still_frame,
    sync_mode,
    sync_svgs,
)
from validation import (
    DEFAULT_STYLE,
    MAX_LEDGER_BYTES,
    MAX_SOURCE_BYTES,
    STYLES_DIR,
    check_arabic_narration,
    check_scripts,
    cmd_styles,
    describe_visuals,
    find_style,
    ledger_context,
    load_style,
    resolve_speed,
    resolve_voice,
    style_names,
    validate,
    validate_all,
)


def _speed_arg(raw: str) -> float:
    try:
        val = float(raw)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"invalid float value: {raw!r}") from e
    if not math.isfinite(val) or not (SPEED_MIN <= val <= SPEED_MAX):
        raise argparse.ArgumentTypeError(f"must be between {SPEED_MIN} and {SPEED_MAX} (got {raw})")
    return val


def cmd_init(workdir: Path, lang: str = "en", style: str | None = None) -> None:
    style_path: Path | None = None
    if style and style != DEFAULT_STYLE:
        style_path = find_style(style, workdir)   # unknown style: error with the list
        if lang != "en":
            die("style skeletons are English; use --lang en")
    (workdir / "scripts").mkdir(parents=True, exist_ok=True)
    dest = workdir / "scripts/example.json"
    is_builtin_style = style_path is not None and style_path.parent == STYLES_DIR
    skeleton: Path | None = None
    if style_path is not None:
        if is_builtin_style and (SKILL / f"templates/style-{style}.json").is_file():
            skeleton = SKILL / f"templates/style-{style}.json"
        elif style_path.with_name(f"{style}.skeleton.json").is_file():
            skeleton = style_path.with_name(f"{style}.skeleton.json")

    if dest.exists():
        print(f"{dest} already exists; left untouched")
    elif skeleton is not None:
        shutil.copy(skeleton, dest)
        print(f"created {dest}")
    elif style_path is not None:
        base = json.loads((SKILL / "templates/example.json").read_text(encoding="utf-8"))
        seeded = {"style": style, **base}
        atomic_write_text(dest, json.dumps(seeded, indent=2, ensure_ascii=False) + "\n")
        print(f"note: no {style}.skeleton.json found; seeded {dest} from templates/example.json with style={style!r}")
    else:
        shutil.copy(SKILL / ("templates/example.json" if lang == "en" else f"templates/example.{lang}.json"), dest)
        print(f"created {dest}")

    if style_path is not None:
        if is_builtin_style:
            # a style with a fact ledger also gets a stub: ledger.json (facts the skeleton covers) and its source text
            for name, to in (("ledger.json", "ledger.json"), ("source.txt", "source.txt")):
                src = SKILL / f"templates/style-{style}.{name}"
                if src.exists() and not (workdir / to).exists():
                    shutil.copy(src, workdir / to)
                    print(f"created {workdir / to}")
        print(f"playbook: {style_path.with_suffix('.md')}")
    print(f"next: {cli_hint('check', workdir)} && {cli_hint('all', workdir)}")


def cmd_transcript(src: Path, out: Path | None, force: bool) -> None:
    if not feature_on("transcripts"):
        die("the transcripts feature is switched off (remove -transcripts from --features / NARRATE_FEATURES)")
    src = src.expanduser()
    try:
        lines, warns = transcript_mod.load(src)
    except transcript_mod.TranscriptError as e:
        die(str(e))
    for w in warns[:10]:
        print(f"warning: {w}", file=sys.stderr)
    if len(warns) > 10:
        print(f"warning: ... and {len(warns) - 10} more", file=sys.stderr)
    body = "\n".join(lines) + "\n"
    if out is None:
        sys.stdout.write(body)
        return
    out = out.expanduser()
    if not out.parent.is_dir():
        die(f"{out.parent} is not a directory; create it first")
    target = out.parent.resolve() / out.name
    if target.is_symlink() or (target.exists() and not target.is_file()):
        die(f"{out} is a symlink or not a regular file; refusing to write through it")
    if target.exists() and target.samefile(src.resolve()):
        die("--out is the input file; choose another path")
    if target.exists() and not force:
        die(f"{out} already exists; use --force to overwrite it")
    atomic_write_text(target, body)
    print(f"wrote {target}: {len(lines)} lines from {src.name}")


def cmd_report(workdir: Path) -> None:
    lp = workdir / "ledger.json"
    if not lp.is_file():
        die(f"no {lp}; the report is built from the fact ledger (see SKILL.md, Fact ledger)")
    if not _inside(workdir, lp):
        die("ledger.json resolves outside the workdir; refusing to read it")
    if lp.stat().st_size > MAX_LEDGER_BYTES:
        die(f"ledger.json is over {MAX_LEDGER_BYTES // 1_000_000} MB")
    try:
        ledger = json.loads(lp.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        die(f"ledger.json: invalid JSON: {e}")
    if not isinstance(ledger, dict) or not isinstance(ledger.get("facts"), list):
        die('ledger.json must be an object with a "facts" list')
    coverage: dict[str, list[str]] = {}
    for p in sorted((workdir / "scripts").glob("*.json")):
        try:
            sc_list = json.loads(p.read_text(encoding="utf-8")).get("scenes") or []
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
            continue
        for sc in sc_list:
            if isinstance(sc, dict) and isinstance(sc.get("facts"), list):
                for fid in sc["facts"]:
                    coverage.setdefault(str(fid), []).append(f"{p.stem}/{sc.get('id')}")
    dest = workdir / "report.md"
    if dest.is_symlink() or (dest.exists() and not dest.is_file()):
        die("report.md is a symlink or not a regular file; refusing to write it")
    if dest.exists() and not dest.read_text(encoding="utf-8", errors="replace").startswith(report_md.MARKER):
        die("report.md exists and was not generated by this command; move it away first")
    atomic_write_text(dest, report_md.render_report(ledger, coverage))
    print(f"wrote {dest}: {len(ledger['facts'])} facts")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    feat = argparse.ArgumentParser(add_help=False)
    feat.add_argument("--features", default=None, help="feature flags to turn on for this run, e.g. svg,3d (adds to $NARRATE_FEATURES; see `features`)")
    sp_schema = sub.add_parser("schema", parents=[feat])
    sp_schema.add_argument("--style", action="store_true", help="print the JSON Schema of a style definition instead of a script")
    sp_schema.add_argument("--builtin", action="store_true", help="exclude user-local visuals (~/.config/explainer-video/visuals/)")
    fp = sub.add_parser("features", parents=[feat], help="list the feature flags and which are on")
    fp.add_argument("--json", action="store_true")
    fp.add_argument("--enabled", metavar="NAME", help="exit 0 if feature NAME is enabled, 1 otherwise")
    pp = sub.add_parser("pronounce", parents=[feat], help="remember how a word is spoken, for every future video")
    pp.add_argument("word", nargs="?")
    pp.add_argument("spoken", nargs="?")
    pp.add_argument("--project", action="store_true", help="save in <workdir>/pronounce.json instead of the shared file")
    pp.add_argument("--workdir", type=Path, help="a project: report which scenes the word affects")
    pp.add_argument("--remove", action="store_true")
    pp.add_argument("--preview", action="store_true", help="say the spoken form aloud (Kokoro af_heart) before you commit to a re-render")
    pp.add_argument("--synth-out", type=Path, metavar="WAV", help="synthesize the given text to WAV (Kokoro af_heart) without saving any mapping")
    pp.add_argument("--list", action="store_true")
    sp = sub.add_parser("styles", parents=[feat], help="list the styles (audience/purpose profiles) and their playbooks")
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--workdir", type=Path, default=None, help="also include project-local styles from <workdir>/styles/")
    tp = sub.add_parser("transcript", parents=[feat], help="turn a WebVTT/SRT/Zoom/plain transcript into `[HH:MM:SS] Speaker: text` lines")
    tp.add_argument("file", type=Path)
    tp.add_argument("--out", type=Path, default=None, help="write here instead of stdout (refuses to overwrite without --force)")
    tp.add_argument("--force", action="store_true", help="overwrite --out if it exists")
    rp = sub.add_parser("report", parents=[feat], help="write <workdir>/report.md from ledger.json")
    rp.add_argument("workdir", type=Path)
    sub.add_parser("catalog", parents=[feat], help="launch the interactive Remotion Studio Visual Catalog (no workdir required)")
    vp = sub.add_parser("visual", parents=[feat], help="scaffold and verify reusable visual types")
    vsub = vp.add_subparsers(dest="vcmd", required=True)
    vp_init = vsub.add_parser("init", parents=[feat], help="scaffold a new visual under ~/.config/explainer-video/visuals/<slug>/ (default) or src/visuals/<slug>/ (--builtin)")
    vp_init.add_argument("slug")
    vp_init.add_argument("--template", default="basic", choices=visual_host.VISUAL_TEMPLATES)
    vp_init_scope = vp_init.add_mutually_exclusive_group()
    vp_init_scope.add_argument("--local", dest="scope", action="store_const", const="local", help="save under ~/.config/explainer-video/visuals/<slug>/ (default)")
    vp_init_scope.add_argument("--builtin", dest="scope", action="store_const", const="builtin", help="save under src/visuals/<slug>/ and update built-in docs/schema")
    vp_init.set_defaults(scope="local")
    vp_chk = vsub.add_parser("check", parents=[feat], help="typecheck, AST-lint, and render a multi-theme contact sheet for a visual")
    vp_chk.add_argument("slug")
    vp_chk.add_argument("--out", type=Path, default=None, help="optional output PNG path for contact sheet")
    vp_chk.add_argument("--no-render", action="store_true", help="skip Chromium contact-sheet render (run tsc + lint-visual only)")
    vp_list = vsub.add_parser("list", parents=[feat], help="list built-in and user-local visual types")
    vp_list.add_argument("--json", action="store_true")
    vp_promo = vsub.add_parser("promote", parents=[feat], help="promote a user-local visual into built-in src/visuals/<slug>/")
    vp_promo.add_argument("slug")
    vsub.add_parser("regen", parents=[feat], help="regenerate built-in visual registries, SKILL.md docs, and JSON schemas")
    for name in ("init", "check", "audio", "render", "all", "still", "studio", "review", "verify"):
        p = sub.add_parser(name, parents=[feat])
        p.add_argument("workdir", type=Path)
        if name in ("still", "studio", "review", "verify"):
            p.add_argument("id")
        elif name != "init":
            p.add_argument("ids", nargs="*")
        if name in ("check", "audio", "all"):
            p.add_argument("--strict", action="store_true", help="a style's fact ledger: no deferral, every fact must be narrated by a scene")
        if name == "init":
            p.add_argument("--style", default=None, help="start from a style skeleton (see `styles`)")
            p.add_argument("--lang", default="en", choices=list(LANGS), help="language of the example script: en (default) or ar (Modern Standard Arabic, right to left)")
        if name in ("audio", "all"):
            p.add_argument("--model", default=None, choices=["kokoro", "qwen3", "silma"], help="default per script language: kokoro (en), silma (ar); qwen3 is English only")
            p.add_argument("--voice", default=None, help="en: kokoro af_heart (default), am_michael, ...; qwen3: Ryan or Aiden. ar: default, or a .wav reference to clone. A voice for another language than a script's is ignored with a warning")
            p.add_argument("--speed", type=_speed_arg, default=None, help=f"speaking speed ({SPEED_MIN}-{SPEED_MAX}); default: the script style's speed, else 1.0")
        if name in ("render", "all"):
            p.add_argument("--draft", action="store_true", help="fast 720p preview render (scale=2/3, x264 ultrafast; keeps 30 fps)")
        if name == "still":
            p.add_argument("--scene")
            p.add_argument("--frame", type=int)
    a = ap.parse_args()
    apply_features_arg(a.features)
    if a.cmd == "features":
        return cmd_features(a.json, a.enabled)
    if a.cmd == "styles":
        return cmd_styles(a.json, a.workdir.expanduser().resolve() if a.workdir else None)
    if a.cmd == "transcript":
        return cmd_transcript(a.file, a.out, a.force)
    if a.cmd == "report":
        return cmd_report(a.workdir.expanduser().resolve())
    if a.cmd == "pronounce":
        if a.project and not a.workdir:
            die("--project needs --workdir DIR")
        cmd_pronounce(a)
        return
    if a.cmd in ("schema", "check", "audio", "render", "all", "still", "studio", "review", "verify", "catalog"):
        visual_host.sync_local_visuals()
    if a.cmd == "schema":
        args = ["style-schema" if a.style else "schema"]
        if a.builtin:
            args.append("--builtin")
        sys.stdout.write(run_cli(args))
        return
    if a.cmd == "catalog":
        env = tool_env()
        ensure_deps(env)
        subprocess.run(
            [str(SKILL / "node_modules/.bin/remotion"), "studio", "src/catalog-index.ts", "--public-dir=catalog-public", *browser_args()],
            cwd=SKILL,
            env=env,
            check=True,
        )
        return
    if a.cmd == "visual":
        if a.vcmd == "init":
            visual_host.cmd_visual_init(a.slug, a.template, a.scope)
        elif a.vcmd == "check":
            visual_host.cmd_visual_check(a.slug, a.out, a.no_render)
        elif a.vcmd == "list":
            visual_host.cmd_visual_list(a.json)
        elif a.vcmd == "promote":
            visual_host.cmd_visual_promote(a.slug)
        elif a.vcmd == "regen":
            visual_host.cmd_visual_regen()
        return
    wd = a.workdir.expanduser().resolve()

    if a.cmd == "init":
        cmd_init(wd, a.lang, a.style)
    elif a.cmd == "check":
        scripts = load_scripts(wd, a.ids)
        problems = validate_all(scripts, wd, a.strict)
        if problems:
            die("script errors:\n  " + "\n  ".join(problems))
        problems, _ = check_mermaid(wd, scripts)
        if problems:
            die("script errors:\n  " + "\n  ".join(problems))
        warn_unspoken_acronyms(wd, scripts)
        for vid, s in scripts:
            words = sum(len(sc["narration"].split()) for sc in s["scenes"])
            lang = lang_of(s)
            print(f"ok {vid}{' [ar, right to left]' if lang == 'ar' else ''}{' [style ' + s['style'] + ']' if s.get('style') else ''}: {len(s['scenes'])} scenes, {words} words, about {words / WPS[lang]:.0f}s")
    elif a.cmd == "audio":
        cmd_audio(wd, a.ids, a.model, a.voice, a.speed, a.strict)
        loaded = load_scripts(wd, a.ids)
        first_vid, first_script = loaded[0]
        first_scene = (first_script.get("scenes") or [{}])[0].get("id")
        still_part = f"{cli_hint('still', wd, first_vid, '--scene', first_scene)} or " if first_scene else ""
        print(f"next: {still_part}{cli_hint('render', wd, *a.ids)}")
    elif a.cmd == "render":
        cmd_render(wd, a.ids, draft=a.draft)
    elif a.cmd == "all":
        cmd_audio(wd, a.ids, a.model, a.voice, a.speed, a.strict)
        cmd_render(wd, a.ids, draft=a.draft)
    elif a.cmd == "still":
        cmd_still(wd, a.id, a.scene, a.frame)
    elif a.cmd == "review":
        cmd_review(wd, a.id)
    elif a.cmd == "verify":
        cmd_verify(wd, a.id)
    elif a.cmd == "studio":
        read_data(wd, a.id)
        remotion(["studio"], wd, a.id, browser_args())


if __name__ == "__main__":
    main()
