"""Forced-aligns known text to audio with Qwen3-ForcedAligner (MLX). Runs inside the speak skill's environment:

    echo '{"items":[{"id":"s01","wav":"/abs/a.wav","text":"spoken text"}]}' | \
        uv run --no-sync --project <speak-dir> python align_worker.py [--model REPO]

Prints {"model": REPO, "results": {"s01": [{"w": "spoken", "start": 0.12, "end": 0.40}, ...]}} on stdout.
Progress and warnings go to stderr. One model load serves the whole batch.
"""
from __future__ import annotations

import argparse
import gc
import json
import sys

DEFAULT_MODEL = "mlx-community/Qwen3-ForcedAligner-0.6B-8bit"


def main() -> None:
    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # libraries may print; only our JSON goes to the real stdout
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--language", default="English", help="the aligner's language name: English, Arabic (unverified), ...")
    a = ap.parse_args()
    req = json.load(sys.stdin)

    import mlx.core as mx
    from mlx_audio.stt import load

    mx.set_cache_limit(1024**3)
    model = load(a.model)
    results = {}
    try:
        for it in req["items"]:
            try:
                res = model.generate(audio=it["wav"], text=it["text"], language=a.language)
                spans = [{"w": x.text, "start": round(float(x.start_time), 3), "end": round(float(x.end_time), 3)} for x in res]
            except Exception as e:  # e.g. a language the aligner does not support: report no words; the caller falls back
                print(f"[align] {it['id']}: failed for language {a.language}: {e}", file=sys.stderr, flush=True)
                results[it["id"]] = []
                continue
            toks = it["text"].split()
            # The aligner drops punctuation-only tokens; keep the caller's tokens so indexes line up when counts match.
            if len(spans) == len(toks):
                for s, t in zip(spans, toks):
                    s["w"] = t
            results[it["id"]] = spans
            print(f"[align] {it['id']}: {len(spans)} words", file=sys.stderr, flush=True)
        json.dump({"model": a.model, "results": results}, real_stdout)
    finally:
        del model
        gc.collect()
        mx.clear_cache()


if __name__ == "__main__":
    main()
