"""Pronunciation dictionary, pluralization, and acronym warnings for English TTS. Stdlib only."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from env import atomic_write_text, die, find_speak, load_scripts, sync_uv_env
from features import lang_of

# Spoken forms, applied to the TTS text only (the transcript and captions stay as written).
# Add project-specific ones in <workdir>/pronounce.json: {"Christoph": "Kristof"}.
PRONOUNCE = {
    # Said letter by letter. Kokoro spells a plain ALL-CAPS acronym correctly on its own, with one stress at the end
    # ("API" -> ay-pee-EYE) and correct plurals ("APIs"). Do NOT respell these with spaces ("A P I"): the phonemizer
    # then reads "A" as the article "uh" and stresses every letter. They map to themselves so no warning is raised.
    **{w: w for w in ("MCP", "API", "AI", "SLA", "PII", "RFC", "IDE", "URL", "SDK", "CLI", "UI", "UX", "XSS",
                      "TLS", "OIDC", "SSO", "URI", "HTTP", "HTTPS", "GPU", "OAuth")},
    "GA": "G.A.", "B2B": "B to B", "B2C": "B to C",   # a bare "GA" is read as the word "gah"; digits need words
    # Identity / security terms people say as words, not letter by letter
    "PKCE": "pixie", "JWT": "jot", "JWTs": "jots", "JWKS": "jay woks", "SAML": "sam-ul", "DPoP": "dee pop",
    "CSRF": "sea surf", "mTLS": "mutual TLS", "JSON": "jay-son", "SQL": "sequel",
}

LETTER_PLURAL = {"I": "Eyes", "L": "Ells", "P": "Peez", "E": "Ees", "D": "Dees", "S": "Esses", "T": "Tees",
                 "B": "Bees", "C": "Sees", "G": "Gees", "M": "Ems", "N": "Ens", "O": "Ohs", "R": "Ars", "K": "Kays"}


def global_pronounce_file() -> Path:
    """Learned pronunciations shared by every project on this machine (override with EXPLAINER_PRONOUNCE_FILE)."""
    env = os.environ.get("EXPLAINER_PRONOUNCE_FILE")
    return Path(env).expanduser() if env else Path.home() / ".config/explainer-video/pronounce.json"


def read_map(p: Path) -> dict:
    try:
        d = json.loads(p.read_text()) if p.exists() else {}
    except json.JSONDecodeError as e:
        die(f"{p} is not valid JSON: {e}")
    return {k: v for k, v in d.items() if isinstance(k, str) and isinstance(v, str)}


def plural_spoken(spoken: str) -> str:
    """Spoken form of a plural: 'pixie' -> 'pixies', 'URL' -> 'URLs' (Kokoro reads that right). For an entry the user
    respelled with spaced letters ('U R L') a bare 's' would be read as a word, so those get 'U R Ells'."""
    head, _, last = spoken.rpartition(" ")
    if last in LETTER_PLURAL:
        return f"{head} {LETTER_PLURAL[last]}".strip()
    if len(last) == 1 and last.isalpha():
        return spoken + "s"
    return spoken[:-1] + "ies" if spoken.endswith("y") else spoken + "s"


def pronunciation_table(workdir: Path | None) -> dict:
    """Built-in < learned (global) < project. Plurals of every entry are derived unless given explicitly."""
    table = dict(PRONOUNCE)
    table.update(read_map(global_pronounce_file()))
    if workdir is not None:
        table.update(read_map(workdir / "pronounce.json"))
    for k, v in list(table.items()):
        if not k.endswith("s") and k + "s" not in table:
            table[k + "s"] = plural_spoken(v)
    return table


def pronouncer(workdir: Path):
    table = pronunciation_table(workdir)
    pattern = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(table, key=len, reverse=True)) + r")\b")
    return lambda text: pattern.sub(lambda m: table[m.group(1)], text)


def _speak_kokoro(text: str, out: Path | None = None) -> None:
    """Synthesize `text` with Kokoro af_heart (plays aloud when `out` is None, else writes WAV to `out`)."""
    speak = find_speak()
    cmd = ["uv", "run", "--no-sync", "--project", str(speak), "python", str(speak / "speak.py"),
           "--model", "kokoro", "--voice", "af_heart", *(["--out", str(out)] if out else [])]
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
    for attempt in (1, 2):
        r = subprocess.run(cmd, input=text, text=True, capture_output=True)
        if r.returncode == 0 and (out is None or out.exists()):
            return
        if attempt == 1 and re.search(r"No module named|ModuleNotFoundError|No such file|Failed to spawn", r.stderr or ""):
            sync_uv_env(speak)
            continue
        die(f"TTS failed:\n{(r.stderr or '').strip()[-800:]}")


def cmd_pronounce(a) -> None:
    """Persist a pronunciation that slipped, so it is right in every future video (not just this one)."""
    synth_out = getattr(a, "synth_out", None)
    if synth_out is not None:
        text = " ".join(x for x in (a.word, a.spoken) if x)
        if not text:
            die('usage: explainer.py pronounce --synth-out FILE.wav "<text to speak>"')
        _speak_kokoro(text, Path(synth_out).expanduser().resolve())
        print(f"wrote {synth_out}")
        return
    target = (a.workdir.expanduser().resolve() / "pronounce.json") if a.project else global_pronounce_file()
    if a.list:
        for name, p in (("learned (global)", global_pronounce_file()), ("project", target if a.project else None)):
            if p is not None and p.exists():
                print(f"# {name}: {p}")
                for k, v in read_map(p).items():
                    print(f"  {k} -> {v}")
        return
    if not a.word:
        die("usage: explainer.py pronounce <word> \"<spoken form>\" [--project --workdir DIR]   |   --remove <word>   |   --list   |   --synth-out FILE.wav \"<text>\"")
    data = read_map(target)
    if a.remove:
        if data.pop(a.word, None) is None:
            die(f"'{a.word}' is not in {target}")
        print(f"removed {a.word} from {target}")
    else:
        if not a.spoken:
            die("give the spoken form, e.g.  explainer.py pronounce PKCE pixie")
        data[a.word] = a.spoken
        print(f"saved: {a.word} -> {a.spoken}  ({target})")
    target.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(target, json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    if a.preview and not a.remove:
        text = f"{a.spoken}. The {a.spoken} is ready. Two {plural_spoken(a.spoken)}."
        _speak_kokoro(text)
    if a.workdir and not a.project:
        hits = [f"{vid}/{sc['id']}" for vid, sc_ in load_scripts(a.workdir.expanduser().resolve(), [])
                for sc in sc_["scenes"] if re.search(r"\b" + re.escape(a.word) + r"\b", sc["narration"])]
        if hits:
            print(f"affects {len(hits)} scene(s): {', '.join(hits)}\nre-run: explainer.py audio {a.workdir}  (only those scenes are redone)")


def warn_unspoken_acronyms(workdir: Path, scripts: list[tuple[str, dict]]) -> None:   # English scripts only
    """Warn about ALL-CAPS words with no pronunciation entry: the voice will spell them letter by letter, which is
    right for ones like API but wrong for words people say aloud (PKCE is "pixie"). Silence a word by adding it to
    <workdir>/pronounce.json (map it to itself to keep letter-by-letter)."""
    table = pronunciation_table(workdir)
    seen: dict[str, str] = {}
    for vid, s in scripts:
        if lang_of(s) != "en":
            continue    # the English pronunciation table and the ALL-CAPS warning mean nothing for Arabic narration
        for sc in s["scenes"]:
            for w in re.findall(r"\b(?:[A-Za-z]*[A-Z]{2,}[A-Za-z0-9]*|[a-z]+[A-Z][A-Za-z0-9]*)\b", sc["narration"]):
                if w not in table:
                    seen.setdefault(w, f"{vid}/{sc['id']}")
    for w, where in sorted(seen.items()):
        print(f"warning: '{w}' (first in {where}) has no pronunciation entry; it may be spelled letter by letter. "
              f'If it is said as a word, fix it for good with: explainer.py pronounce {w} "spoken form"', file=sys.stderr)
