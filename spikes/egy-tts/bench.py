"""Shared bake-off driver (stdlib only). Run inside an engine's uv env:
   uv run --project engines/<name> python ../../bench.py <name> [--ids a,b] [--speaker X]
Engine modules (engines/<name>/engine.py) expose load() -> synth(text, out_path)->None.
Writes out/<name>/<id>.wav and out/<name>/results.json (seconds, audio seconds, RTF)."""
import argparse, importlib.util, json, sys, time, wave
from pathlib import Path

ROOT = Path(__file__).parent

def wav_seconds(p):
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("engine")
    ap.add_argument("--ids")
    ap.add_argument("--sentences", default="sentences.json")
    ap.add_argument("--field", default="text", help="JSON field holding the text to speak")
    ap.add_argument("--tag", help="output folder name (default: engine)")
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location("engine", ROOT / "engines" / a.engine / "engine.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    items = json.loads((ROOT / a.sentences).read_text())
    if a.ids:
        keep = set(a.ids.split(",")); items = [i for i in items if i["id"] in keep]
    out = ROOT / "out" / (a.tag or a.engine); out.mkdir(parents=True, exist_ok=True)
    t0 = time.time(); synth = mod.load(); load_s = time.time() - t0
    print(f"loaded in {load_s:.1f}s", flush=True)
    results = []
    for i, it in enumerate(items):
        p = out / f"{it['id']}.wav"
        t = time.time(); synth(it[a.field], str(p)); dt = time.time() - t
        dur = wav_seconds(p)
        r = {"id": it["id"], "kind": it["kind"], "gen_s": round(dt, 2), "audio_s": round(dur, 2), "rtf": round(dt / dur, 2)}
        results.append(r); print(r, flush=True)
        if i == 0:  # first call includes warm-up; note it
            r["warmup"] = True
    (out / "results.json").write_text(json.dumps({"load_s": round(load_s, 1), "results": results}, ensure_ascii=False, indent=1))

main()
