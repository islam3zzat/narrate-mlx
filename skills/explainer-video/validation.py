"""Styles, fact-ledger context, script schema/lint validation, and Arabic narration checks. Stdlib only."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import timing
from env import MAX_WORDS, SKILL, TASHKEEL_MIN, die, inside, run_cli
from features import feature_errors, lang_of
from mermaid_host import mermaid_static
from figures_host import check_figures

STYLES_DIR = SKILL / "styles"
USER_STYLES_DIR = Path.home() / ".config/explainer-video/styles"
DEFAULT_STYLE = "explainer"
MAX_LEDGER_BYTES, MAX_SOURCE_BYTES = 2_000_000, 8_000_000


def style_dirs(workdir: Path | None = None) -> list[Path]:
    return [*([workdir / "styles"] if workdir else []), USER_STYLES_DIR, STYLES_DIR]


def style_names(workdir: Path | None = None) -> list[str]:
    """The registry is <workdir>/styles/, ~/.config/explainer-video/styles/, and styles/: every <name>.json must have a <name>.md playbook next to it."""
    names: set[str] = set()
    for d in style_dirs(workdir):
        if not d.is_dir():
            continue
        for p in d.glob("*.json"):
            if not (d / f"{p.stem}.md").is_file():
                die(f"{p} has no playbook {d / (p.stem + '.md')}")
            names.add(p.stem)
    return sorted(names)


def find_style(name: str, workdir: Path | None = None) -> Path:
    if not name or "/" in name or "\\" in name or ".." in name:
        die(f"invalid style name '{name}'")
    for d in style_dirs(workdir):
        p = d / f"{name}.json"
        if p.is_file():
            if not (d / f"{name}.md").is_file():
                die(f"{p} has no playbook {d / (name + '.md')}")
            return p
    die(f"unknown style '{name}'. Known: {', '.join(style_names(workdir))}")


def load_style(name: str, workdir: Path | None = None) -> dict:
    return json.loads(find_style(name, workdir).read_text(encoding="utf-8"))


def resolve_speed(script: dict, cli_speed: float | None, workdir: Path | None = None) -> float:
    """--speed beats the script style's default speed beats 1.0."""
    if cli_speed is not None:
        return cli_speed
    return float(load_style(script["style"], workdir)["defaults"]["speed"]) if script.get("style") else 1.0


def resolve_voice(script: dict, cli_voice: str | None, workdir: Path | None = None) -> str | None:
    """--voice beats the script style's default voice (none of the styles set one yet) beats the language default."""
    if cli_voice:
        return cli_voice
    return load_style(script["style"], workdir)["defaults"].get("voice") if script.get("style") else None


def cmd_styles(as_json: bool, workdir: Path | None = None) -> None:
    rows = []
    for n in style_names(workdir):
        p = find_style(n, workdir)
        rows.append(json.loads(p.read_text(encoding="utf-8")) | {"playbook": str(p.with_suffix(".md"))})
    if as_json:
        print(json.dumps({"styles": rows}, indent=2))
        return
    for r in rows:
        b = r["bounds"]
        print(f"{r['name']:26} speed {r['defaults']['speed']:<4} {b['scenes'][0]}-{b['scenes'][1]} scenes, {b['seconds'][0]}-{b['seconds'][1]} s, "
              f"{b['wordsPerScene'][0]}-{b['wordsPerScene'][1]} words/scene, ledger {'required' if r['ledger']['required'] else 'optional'}")
        print(f"{'':26} {r['description']}")
        print(f"{'':26} playbook: {r['playbook']}")


def ledger_context(workdir: Path, selected: list[tuple[str, dict]], strict: bool) -> tuple[dict | None, list[str]]:
    """(context for cli.ts validate, errors). The context is None unless a selected script has a style or scene facts.
    It holds <workdir>/ledger.json (parsed, or None), the text of its source file (or None), --strict, and every script of
    the workdir (coverage counts all videos). Files must stay inside the workdir (no symlink escapes) and under a size cap."""
    uses = any(isinstance(s, dict) and (s.get("style") or any(isinstance(sc, dict) and sc.get("facts") for sc in s.get("scenes") or []))
               for _, s in selected)
    if not uses:
        return None, []
    errs: list[str] = []
    ledger = source = None
    lp = workdir / "ledger.json"
    if lp.exists() or lp.is_symlink():
        if not inside(workdir, lp):
            errs.append("ledger.json resolves outside the workdir; refusing to read it")
        elif lp.stat().st_size > MAX_LEDGER_BYTES:
            errs.append(f"ledger.json is over {MAX_LEDGER_BYTES // 1_000_000} MB")
        else:
            try:
                ledger = json.loads(lp.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                errs.append(f"ledger.json: invalid JSON: {e}")
        src = ledger.get("source") if isinstance(ledger, dict) else None
        if isinstance(src, str) and src and not src.startswith("/") and ".." not in Path(src).parts:   # zod reports a bad path
            try:
                sp = workdir / src
                if sp.exists() and not inside(workdir, sp):
                    errs.append(f"ledger.json: source \"{src[:80]}\" resolves outside the workdir; refusing to read it")
                elif sp.is_file():
                    if sp.stat().st_size > MAX_SOURCE_BYTES:
                        errs.append(f"ledger.json: source \"{src[:80]}\" is over {MAX_SOURCE_BYTES // 1_000_000} MB")
                    else:
                        source = sp.read_text(encoding="utf-8", errors="replace")
            except OSError as e:   # a name too long for the file system, a permission error, a vanished file
                errs.append(f"ledger.json: source \"{src[:80]}\" cannot be read: {e.strerror or e}")
    everything: dict = {}
    for p in sorted((workdir / "scripts").glob("*.json")):
        try:
            everything[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return {"ledger": ledger, "source": source, "strict": strict, "workdir": str(workdir), "all": everything}, errs


def describe_visuals(items: list[tuple[dict, dict | None] | tuple[dict, dict | None, dict | None]]) -> list[dict]:
    """[{slots, carried}] per (visual, previous visual or None[, rendered]), from src/semantics via one batched cli.ts call.

    slots: the text of each reveal slot, in reveal order; carried: per slot, True when it carries over from the
    previous scene (a "continues" scene)."""
    payload = json.dumps([
        {"visual": it[0], "prev": it[1], **({"rendered": it[2]} if len(it) > 2 and it[2] is not None else {})}
        for it in items
    ])
    return json.loads(run_cli(["describe"], payload)) if items else []


def check_scripts(scripts: list[tuple[str, dict]], ctx: dict | None = None) -> dict[str, dict[str, list[str]]]:
    """cli.ts validate: {video: {errors, warnings}}. Schema errors (zod) and the per-type checks (meta.lint) with the
    generic capability checks; messages are already "<video>/<scene id>: ...". Lint runs only for scripts that pass the schema.
    With `ctx` (see ledger_context) the result also has "$ledger": the workdir's fact ledger checked against all its scripts."""
    payload = dict(scripts)
    if ctx is not None:
        payload["$context"] = ctx
    return json.loads(run_cli(["validate"], json.dumps(payload)))


def validate_all(scripts: list[tuple[str, dict]], workdir: Path | None = None, strict: bool = False) -> list[str]:
    """Schema errors first (zod); style checks and warnings only for scripts that pass the schema. With `workdir`, a script that
    has a style or scene facts also gets the workdir's fact ledger checked (coverage over all its videos)."""
    ctx, errs = ledger_context(workdir, scripts, strict) if workdir else (None, [])
    if errs:
        return errs
    res = check_scripts(scripts, ctx)
    led = res.pop("$ledger", {"errors": [], "warnings": []})
    for m in led["warnings"]:
        print(f"warning: {m}", file=sys.stderr)
    for vid, s in scripts:
        errs += res[vid]["errors"]
        if not res[vid]["errors"]:
            errs += validate(vid, s, res[vid]["warnings"])
    if workdir is not None:
        errs += check_figures(workdir, scripts)
    return errs + led["errors"]


def validate(vid: str, script: dict, lint_warnings: list[str]) -> list[str]:
    """Checks the schema cannot express (mermaid syntax limits, scene length, Arabic text rules). Assumes the schema already passed.
    The per-type rules (item counts, label length, Arabic support) come from meta.lint via `lint_warnings`."""
    errs: list[str] = []
    lang = lang_of(script)
    errs += feature_errors(vid, script)
    for sc in script["scenes"]:
        where = f"{vid}/{sc['id']}"
        words = len(sc["narration"].split())
        if words > MAX_WORDS[lang]:
            print(f"warning: {where}: {words} words is long (over ~30s); consider splitting", file=sys.stderr)
        if lang == "ar":
            errs += check_arabic_narration(where, sc["narration"])
        v = sc["visual"]
        if v["type"] == "mermaid":
            errs += mermaid_static(where, v["code"])
        for w in lint_warnings:
            if w.startswith(f"{where}: "):
                print(f"warning: {w}", file=sys.stderr)
    for w in lint_warnings:   # about the whole video (style bounds, sections): "<video>: ..."
        if w.startswith(f"{vid}: "):
            print(f"warning: {w}", file=sys.stderr)
    return errs


def check_arabic_narration(where: str, narration: str) -> list[str]:
    """SILMA reads hand-vowelled Arabic and does not expand digits or Latin text: report what it would get wrong."""
    if not timing.has_arabic(narration):
        return [f"{where}: language is \"ar\" but the narration has no Arabic text"]
    if re.search(r"[0-9\u0660-\u0669]", narration):
        print(f"warning: {where}: the narration contains digits; the voice does not expand them. Write numbers, times and "
              f"percentages as Arabic words (ثَلَاثَةٌ، خَمْسُونَ بِالْمِائَةِ)", file=sys.stderr)
    latin = sorted(set(re.findall(r"[A-Za-z]+", narration)))
    if latin:
        print(f"warning: {where}: Latin text in the narration ({', '.join(latin[:5])}{'...' if len(latin) > 5 else ''}); the voice "
              f"cannot read it. Spell names and acronyms in Arabic script (واجِهَةُ بَرْمَجَةِ التَّطْبِيقَاتِ, أُوأُوث)", file=sys.stderr)
    ar_words = [w for w in narration.split() if timing.has_arabic(w)]
    marked = sum(1 for w in ar_words if timing.AR_DIACRITICS.search(w))
    if ar_words and marked / len(ar_words) < TASHKEEL_MIN:
        print(f"warning: {where}: only {marked} of {len(ar_words)} Arabic words carry vowel marks (tashkeel). The voice "
              f"guesses the vowels of bare text and often guesses wrong; vowel the narration fully", file=sys.stderr)
    return []
