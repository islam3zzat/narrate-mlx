"""Speak text or a Markdown file aloud via local text-to-speech (Kokoro / SILMA).

Markdown syntax is not read out and code blocks are skipped. Long text opens a
read-along window with the formatted text and the spoken word highlighted.

Examples:
    uv run python speak.py "Hello there"
    uv run python speak.py notes.md
    echo "Hello" | uv run python speak.py --voice bm_george
    uv run python speak.py --speed 1.25 < notes.md
    echo "مَرْحَبًا بِكُمْ." | uv run python speak.py --lang ar
"""
# English uses Kokoro-82M (real per-word timings); Arabic (--lang ar) uses SILMA TTS v1
# through a separate uv project in silma/ (its torch/onnx pins conflict with mlx-audio's,
# so this file must stay importable without torch).
import argparse
import gc
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

import mdparse
from mdparse import Block

MODELS = {
    # name: (Hugging Face repo, sample rate, default voice)
    "kokoro": ("mlx-community/Kokoro-82M-bf16", 24000, "af_heart"),
}
SILMA_REPO = "silma-ai/silma-tts"
SAMPLE_RATE = MODELS["kokoro"][1]
LANGS = {
    # lang: (default model, default voice)
    "en": ("kokoro", "af_heart"),
    "ar": ("silma", "default"),
}
HERE = Path(__file__).resolve().parent
CACHE_LIMIT_BYTES = 1024**3  # cap on MLX's GPU buffer cache
ARABIC_LETTER = re.compile("[\u0621-\u064a\u0671-\u06d3]")
TASHKEEL = re.compile("[\u064b-\u0652]")
LATIN = re.compile("[A-Za-z0-9]")
PAUSE_SECONDS = 0.3  # silence between blocks (headings, paragraphs, list items)
WINDOW_MIN_WORDS = 100  # longer text gets a window with the spoken word highlighted
WINDOW_MIN_CHARS = 500
SPEED_MIN = 0.5
SPEED_MAX = 2.0


def _speed_arg(raw: str) -> float:
    try:
        val = float(raw)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"invalid float value: {raw!r}") from e
    if not math.isfinite(val) or not (SPEED_MIN <= val <= SPEED_MAX):
        raise argparse.ArgumentTypeError(f"must be between {SPEED_MIN} and {SPEED_MAX} (got {raw})")
    return val


def hf_cache_dir() -> Path:
    hub_cache = os.environ.get("HF_HUB_CACHE", "").strip()
    if hub_cache:
        return Path(hub_cache).expanduser()
    hf_home = os.environ.get("HF_HOME", "").strip()
    if hf_home:
        return Path(hf_home).expanduser() / "hub"
    return Path.home() / ".cache/huggingface/hub"


def hf_model_cached(repo_id: str) -> bool:
    snaps = hf_cache_dir() / f"models--{repo_id.replace('/', '--')}" / "snapshots"
    try:
        return snaps.is_dir() and any(p.is_dir() for p in snaps.iterdir())
    except OSError:
        return False


def synthesize(blocks: list[Block], voice: str, speed: float):
    """Return (audio, sample_rate, display text, highlight words, styles, spoken text, token times) for the spoken blocks.

    Token times are [{w, start, end}] in seconds for every token Kokoro timed, as Kokoro split the
    spoken text (punctuation is its own token). They come from the durations the audio was built from.
    """
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    from highlight import Style, Word

    # MLX keeps freed GPU buffers cached. Without a limit, Kokoro's varying shapes
    # grew it to ~12 GB on a 16 GB machine, and it stayed held while the window ran.
    mx.set_cache_limit(CACHE_LIMIT_BYTES)

    display = "\n".join(b.text for b in blocks)
    offsets = []  # start of each block in display
    pos = 0
    for b in blocks:
        offsets.append(pos)
        pos += len(b.text) + 1
    spoken = [(b, off) for b, off in zip(blocks, offsets) if b.spoken_from is not None]
    speech = "\n".join(b.speech for b, _ in spoken)

    if not hf_model_cached(MODELS["kokoro"][0]):
        print(f"[setup] downloading {MODELS['kokoro'][0]} (~160 MB, first run only)...", file=sys.stderr, flush=True)
    model = load_model(MODELS["kokoro"][0])
    pipeline = model._get_pipeline(voice[0])  # voice prefix: a = US, b = UK
    pipeline.voices = {}

    words: list[Word] = []
    timed: list[dict] = []
    chunks = []
    rate = int(getattr(model, "sample_rate", None) or SAMPLE_RATE)
    elapsed = 0.0
    block_idx = None
    cursor = block_end = 0
    for result in pipeline(speech, voice=voice, speed=speed):
        rate = int(getattr(result, "sample_rate", None) or rate)
        if result.text_index != block_idx:
            if block_idx is not None:
                chunks.append(np.zeros(int(PAUSE_SECONDS * rate), dtype=np.float32))
                elapsed += PAUSE_SECONDS
            block_idx = result.text_index
            block, cursor = spoken[block_idx]
            block_end = cursor + len(block.text)
        audio = np.array(result.audio, dtype=np.float32).reshape(-1)
        for t in result.tokens or []:
            if not t.text.strip():
                continue
            if t.start_ts is not None and t.end_ts is not None:
                timed.append({"w": t.text, "start": round(elapsed + t.start_ts, 3),
                              "end": round(elapsed + t.end_ts, 3)})
            found = display.find(t.text, cursor, block_end)
            if found < 0:
                continue  # tokenizer rewrote this word; leave it unhighlighted
            cursor = found + len(t.text)
            if t.start_ts is not None and t.end_ts is not None:
                words.append(Word(elapsed + t.start_ts, found, cursor))
        chunks.append(audio)
        elapsed += len(audio) / rate
    if not chunks:
        sys.exit("mlx-audio produced no audio")
    del pipeline, model, result
    gc.collect()
    mx.clear_cache()  # hand the GPU memory back before the window opens

    styles = [
        Style(off + s, off + e, kind) for b, off in zip(blocks, offsets) for s, e, kind in b.spans
    ]
    return np.concatenate(chunks), rate, display, words, styles, speech, timed


def find_uv() -> str:
    uv = shutil.which("uv")
    if uv:
        return uv
    for p in (Path.home() / ".local/bin/uv", Path("/opt/homebrew/bin/uv"), Path("/usr/local/bin/uv")):
        if p.exists():
            return str(p)
    sys.exit("uv not found. brew install uv")


def synthesize_ar(blocks: list[Block], voice: str, speed: float, diacritize: bool):
    """Same return as synthesize(), from SILMA in the silma/ project. Word times are estimates."""
    from highlight import Style, Word

    display = "\n".join(b.text for b in blocks)
    offsets = []
    pos = 0
    for b in blocks:
        offsets.append(pos)
        pos += len(b.text) + 1
    spoken = [(b, off) for b, off in zip(blocks, offsets) if b.spoken_from is not None]
    texts = [b.speech for b, _ in spoken]
    speech = "\n".join(texts)

    joined = " ".join(texts)
    if not diacritize and ARABIC_LETTER.search(joined):
        letters = len(ARABIC_LETTER.findall(joined))
        if len(TASHKEEL.findall(joined)) < letters * 0.2:
            print("warning: the Arabic text has little or no diacritics (tashkeel). Pronunciation may suffer: "
                  "write it fully vowelled, or pass --diacritize (SILMA's own diacritizer, which makes "
                  "mistakes).", file=sys.stderr)
    if LATIN.search(joined):
        print("warning: Latin letters or digits in the text. SILMA reads them badly or not at all: spell "
              "numbers and acronyms in Arabic script.", file=sys.stderr)

    uv = find_uv()
    if not hf_model_cached(SILMA_REPO):
        print(f"[setup] downloading {SILMA_REPO} (~900 MB, first run only)...", file=sys.stderr, flush=True)
    project = str(HERE / "silma")
    env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}  # the caller's venv is not ours
    with tempfile.TemporaryDirectory() as tmp:
        wav, result = Path(tmp) / "ar.wav", Path(tmp) / "ar.json"
        req = {"blocks": texts, "voice": voice, "speed": speed, "diacritize": diacritize,
               "pause": PAUSE_SECONDS}
        cmd = [uv, "run", "--no-sync", "--project", project, "python", str(HERE / "silma" / "synth.py"),
               "--out", str(wav), "--result", str(result)]
        payload = json.dumps(req, ensure_ascii=False)
        for attempt in (1, 2):
            run = subprocess.run(cmd, input=payload, text=True, env=env, capture_output=(attempt == 1))
            if run.returncode == 0 and wav.exists():
                break
            if attempt == 1 and re.search(r"No module named|ModuleNotFoundError|No such file|Failed to spawn", run.stderr or ""):
                sync = [uv, "sync", "--quiet", "--project", project]
                if subprocess.run(sync, env=env).returncode != 0:
                    print("uv sync failed; retrying with system TLS certificates", file=sys.stderr)
                    if subprocess.run(sync + ["--system-certs"], env=env).returncode != 0:
                        sys.exit("could not set up the Arabic environment (skills/speak/silma)")
                continue
            if attempt == 1 and run.stderr:
                sys.stderr.write(run.stderr)
            sys.exit("Arabic speech generation failed (see above)")
        data = json.loads(result.read_text(encoding="utf-8"))
        with wave.open(str(wav)) as f:
            rate = int(f.getframerate())
            audio = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32767

    words: list[Word] = []
    timed: list[dict] = []
    cursors = {i: spoken[i][1] for i in range(len(spoken))}
    for t in data["words"]:
        b = t["block"]
        timed.append({"w": t["w"], "start": t["start"], "end": t["end"]})
        block, _ = spoken[b]
        end_of_block = spoken[b][1] + len(block.text)
        found = display.find(t["w"], cursors[b], end_of_block)
        if found < 0:
            continue
        cursors[b] = found + len(t["w"])
        words.append(Word(t["start"], found, cursors[b]))
    styles = [
        Style(off + s, off + e, kind) for b, off in zip(blocks, offsets) for s, e, kind in b.spans
    ]
    return audio, rate, display, words, styles, speech, timed


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def write_wav(path: Path, audio: np.ndarray, rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp.wav", dir=path.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        with wave.open(str(tmp), "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(rate)
            f.writeframes(pcm.tobytes())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Long text opens a window: click a word to seek, Space pause/replay, Left/Right sentence, Up/Down speed, Cmd+Q/Esc close.",
    )
    parser.add_argument("text", nargs="?", help="text or file path to speak (default: stdin)")
    parser.add_argument("--text", dest="literal_text", action="store_true",
                        help="treat positional argument as literal text even if a file with that name exists")
    parser.add_argument("--lang", choices=list(LANGS), default="en", help="en (Kokoro) or ar (SILMA, Modern Standard Arabic)")
    parser.add_argument("--model", help="en: kokoro; ar: silma (default by --lang)")
    parser.add_argument("--voice", help="en: af_heart (default). ar: default (bundled reference) or a reference WAV, "
                        "with its transcript in a .txt of the same name")
    parser.add_argument("--diacritize", action="store_true", help="ar: let SILMA add diacritics (default: speak the text as written)")
    parser.add_argument("--speed", type=_speed_arg, default=1.0,
                        help=f"speaking speed ({SPEED_MIN}-{SPEED_MAX}, default 1.0)")
    parser.add_argument("--out", help="save WAV here instead of playing it")
    parser.add_argument("--timings", help="also write per-token times as JSON here: {\"words\": [{w, start, end}]} (ar: estimated, \"approx\": true)")
    parser.add_argument("--auto-close", action="store_true", help="close the read-along window automatically when playback finishes")
    args = parser.parse_args()

    if args.text is None and sys.stdin.isatty():
        parser.error('no text given. Usage: speak.py "text", or pipe text in')
    if args.text is not None:
        text = args.text
        if not args.literal_text and "\n" not in text and "\r" not in text and len(text) <= 1024:
            try:
                p = Path(text).expanduser()
                is_file = p.is_file()
            except OSError:
                is_file = False
            if is_file:
                print(f"Reading {args.text}", file=sys.stderr)
                try:
                    text = p.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError) as e:
                    parser.error(f"cannot read {args.text}: {e}")
    else:
        text = sys.stdin.read()
    default_model, default_voice = LANGS[args.lang]
    model = args.model or default_model
    if model != default_model:
        parser.error(f"--model {model} does not match --lang {args.lang} (use --model {default_model})")
    if args.diacritize and args.lang != "ar":
        parser.error("--diacritize only applies to --lang ar")
    voice = args.voice or default_voice
    blocks = mdparse.parse(text)
    if not any(b.spoken_from is not None for b in blocks):
        parser.error("nothing to speak")

    print(f"Generating speech ({model}, {voice})...", file=sys.stderr)
    if args.lang == "ar":
        audio, rate, display, words, styles, speech, timed = synthesize_ar(blocks, voice, args.speed, args.diacritize)
    else:
        audio, rate, display, words, styles, speech, timed = synthesize(blocks, voice, args.speed)
    if args.timings:
        meta = {"model": model, "voice": voice, "speed": args.speed}
        if args.lang == "ar":
            meta["approx"] = True
        else:
            meta["approx"] = False
        _atomic_write_text(Path(args.timings), json.dumps({**meta, "words": timed}, ensure_ascii=False))

    if args.out:
        write_wav(Path(args.out), audio, rate)
        print(f"Saved {args.out}", file=sys.stderr)
        return

    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "out.wav"
        write_wav(wav, audio, rate)
        print("Playing...", file=sys.stderr)
        if len(speech.split()) > WINDOW_MIN_WORDS or len(speech) > WINDOW_MIN_CHARS:
            from highlight import show_and_play

            show_and_play(
                display,
                words,
                styles,
                str(wav),
                rtl=args.lang == "ar",
                base_speed=args.speed,
                auto_close=args.auto_close,
            )
        else:
            subprocess.run(["afplay", str(wav)], check=True)


if __name__ == "__main__":
    main()
