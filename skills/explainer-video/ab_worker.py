"""Synthesizes the A/B sample scenes with each candidate TTS model. Runs inside the speak skill's environment
(see ab_voices.py, which calls this). One model is loaded at a time and freed before the next.

stdin:  {"out": "/abs/dir", "candidates": [{key, repo, kind, voice, instruct?}], "scenes": [{id, text}]}
stdout: {"results": {key: {"error": str | None, "scenes": {scene_id: {wav, seconds, rtf, f0_std_st}}}}}
"""
from __future__ import annotations

import gc
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np


def write_wav(path: Path, audio: np.ndarray, rate: int) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def f0_std_semitones(audio: np.ndarray, rate: int) -> float | None:
    """Spread of the pitch contour in semitones. A weak hint only: very flat delivery (< ~1.5 st) often sounds robotic."""
    hop, win = int(rate * 0.010), int(rate * 0.040)
    lo, hi = int(rate / 400), int(rate / 70)
    f0 = []
    for s in range(0, len(audio) - win, hop * 2):
        fr = audio[s:s + win] - audio[s:s + win].mean()
        if np.sqrt((fr ** 2).mean()) < 0.01:
            continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.45:
            f0.append(rate / lag)
    if len(f0) < 20:
        return None
    st = 12 * np.log2(np.array(f0) / np.median(f0))
    return round(float(np.std(st)), 2)


def synth(model, c: dict, text: str):
    kind = c["kind"]
    if kind == "kokoro":
        pipeline = model._get_pipeline(c["voice"][0])
        pipeline.voices = {}
        gen = model.generate(text=text, voice=c["voice"], speed=1.0, lang_code=c["voice"][0])
    elif kind == "qwen3_custom":
        gen = model.generate_custom_voice(text=text, speaker=c["voice"], language="English", instruct=c.get("instruct", ""))
    elif kind == "qwen3_design":
        gen = model.generate_voice_design(text=text, language="English", instruct=c["instruct"])
    else:  # ming, chatterbox, anything with the plain generate(text=..., voice=...) shape
        kw = {"voice": c["voice"]} if c.get("voice") else {}
        gen = model.generate(text=text, **kw)
    parts, rate = [], getattr(model, "sample_rate", 24000)
    for r in gen:
        parts.append(np.array(r.audio, dtype=np.float32).reshape(-1))
        rate = getattr(r, "sample_rate", None) or rate
    return np.concatenate(parts), int(rate)


def main() -> None:
    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # libraries may print; only our JSON goes to the real stdout
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    req = json.load(sys.stdin)
    out = Path(req["out"])
    out.mkdir(parents=True, exist_ok=True)
    results = {}
    for c in req["candidates"]:
        res = {"error": None, "scenes": {}}
        print(f"[ab] loading {c['key']} ({c['repo']})", file=sys.stderr, flush=True)
        try:
            model = load_model(c["repo"])
            for sc in req["scenes"]:
                t0 = time.time()
                audio, rate = synth(model, c, sc["text"])
                took = time.time() - t0
                wav = out / f"{c['key']}__{sc['id']}.wav"
                write_wav(wav, audio, rate)
                sec = len(audio) / rate
                res["scenes"][sc["id"]] = {"wav": str(wav), "seconds": round(sec, 2), "rtf": round(took / sec, 2),
                                           "f0_std_st": f0_std_semitones(audio, rate)}
                print(f"[ab]   {c['key']} {sc['id']}: {sec:.1f}s audio in {took:.1f}s", file=sys.stderr, flush=True)
            del model
        except Exception as e:  # one broken candidate must not stop the rest
            res["error"] = f"{type(e).__name__}: {e}"[:400]
            print(f"[ab] {c['key']} FAILED: {res['error']}", file=sys.stderr, flush=True)
        gc.collect()
        mx.clear_cache()
        results[c["key"]] = res
    json.dump({"results": results}, real_stdout)


if __name__ == "__main__":
    main()
