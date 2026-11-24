"""Arabic speech with SILMA TTS v1. Runs inside the silma uv project, driven by speak.py:

    echo '{"blocks": ["نص أول.", "نص ثان."], "voice": "default", "speed": 1.0}' | \
        uv run --project <speak-dir>/silma python synth.py --out a.wav --result r.json

stdin JSON: blocks (list of text), voice ("default" or a reference WAV path), speed, diacritize (bool),
pause (seconds between blocks). Writes a 24 kHz mono 16-bit WAV and a result JSON:
{"rate", "approx": true, "words": [{"w", "start", "end", "block"}]}.

SILMA has no word times (and Qwen3-ForcedAligner does not support Arabic: it returns zero-length
words), so the times are estimated: see estimate_words(). Progress goes to stderr.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from timing_ar import (
    ARABIC_LETTER,
    DIACRITICS,
    EDGE_KEEP,
    FRAME,
    MIN_GAP,
    estimate_words,
    speech_regions,
    tashkeel_ratio,
    trim,
)

SEED = 42
RATE = 24000
# Transcript of silma_tts/infer/ref_audio_samples/ar.ref.24k.wav (the bundled voice).
DEFAULT_REF_TEXT = "ويدقق النظر في القرآن الكريم وسائر الكتب السماوية ويتبع مسالك الرسل العظام عليهم الصلاة والسلام."


def log(*a) -> None:
    print(*a, file=sys.stderr, flush=True)


def load_voice(voice: str) -> tuple[str, str]:
    """Reference WAV path and its transcript (empty: SILMA transcribes it)."""
    if voice == "default":
        from importlib.resources import files

        return str(files("silma_tts").joinpath("infer/ref_audio_samples/ar.ref.24k.wav")), DEFAULT_REF_TEXT
    p = Path(voice).expanduser()
    if not p.is_file():
        sys.exit(f"voice '{voice}': not 'default' and not a file")
    txt = p.with_suffix(".txt")
    if not txt.is_file():
        log(f"warning: {txt} not found next to {p.name}; SILMA will auto-transcribe the reference clip "
            f"(requires ~1.6 GB Whisper model if not already cached)")
        return str(p), ""
    return str(p), txt.read_text(encoding="utf-8").strip()


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--result", required=True)
    a = ap.parse_args()
    req = json.load(sys.stdin)
    blocks: list[str] = req["blocks"]
    speed = float(req.get("speed", 1.0))
    diacritize = bool(req.get("diacritize", False))
    pause = float(req.get("pause", 0.3))

    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # silma prints progress with print()
    ref, ref_text = load_voice(req.get("voice") or "default")

    from silma_tts.api import SilmaTTS

    # Its own CATT diacritizer is off by default: it put wrong case endings on some words, and
    # hand-vowelled text sounded best. NeMo's normalizer is stubbed out (see pyproject.toml).
    tts = SilmaTTS(enable_normalizer=False, force_tashkeel=diacritize)

    chunks: list[np.ndarray] = []
    words: list[dict] = []
    elapsed = 0.0
    for i, text in enumerate(blocks):
        log(f"[silma] block {i + 1}/{len(blocks)}")
        wav, sr, _ = tts.infer(ref_file=ref, ref_text=ref_text, gen_text=text, speed=speed,
                               normalize_numbers=False, force_tashkeel=diacritize, seed=SEED,
                               show_info=lambda *_: None)
        audio = np.asarray(wav, dtype=np.float32).reshape(-1)
        if sr != RATE:
            raise RuntimeError(f"unexpected sample rate {sr}")
        audio = trim(audio, sr)
        if i:
            chunks.append(np.zeros(int(pause * sr), dtype=np.float32))
            elapsed += pause
        words += estimate_words(text, audio, sr, elapsed, i)
        chunks.append(audio)
        elapsed += len(audio) / sr
    write_wav(Path(a.out), np.concatenate(chunks), RATE)
    _atomic_write_text(Path(a.result), json.dumps({"rate": RATE, "approx": True, "words": words}, ensure_ascii=False))
    real_stdout.write("ok\n")


if __name__ == "__main__":
    main()
