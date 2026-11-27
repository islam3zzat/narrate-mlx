#!/usr/bin/env python3
"""Blind A/B test of TTS voices on your own scenes, with forced-alignment accuracy per voice.

    python3 ab_voices.py <workdir> [--scenes 01-x/s02,02-y/s04] [--gender male|female|both]
                         [--only key1,key2] [--out DIR] [--list]

For each candidate voice it synthesizes the chosen scenes, force-aligns them (the same aligner the pipeline uses),
and writes <out>/index.html: a blind listening page (labels shuffled, no model names until you press Reveal).
Rate each clip for naturalness (1-5) and tick "robotic" for any clip that sounds synthetic: one tick disqualifies
that voice. Objective columns (shown on reveal): alignment accepted, real-time factor, pitch variation.

Model weights download on first use (about 15 GB for the full male set).
"""
from __future__ import annotations

import argparse
import html
import json
import random
import subprocess
import sys
from pathlib import Path

import explainer as ex
import timing

NARRATOR = "Calm, warm, natural explainer narrator with a conversational pace and clear diction."

# key: (repo, kind, voice, instruct, gender, licence)
CANDIDATES = {
    "kokoro-am_michael": ("mlx-community/Kokoro-82M-bf16", "kokoro", "am_michael", "", "male", "Apache-2.0 (current pipeline model)"),
    "kokoro-bm_george": ("mlx-community/Kokoro-82M-bf16", "kokoro", "bm_george", "", "male", "Apache-2.0"),
    "ming-james": ("mlx-community/Ming-3.0-tts-0.5B-bf16", "plain", "US_James", "", "male", "MIT"),
    "qwen3-ryan": ("mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "qwen3_custom", "Ryan", NARRATOR, "male", "Apache-2.0"),
    "qwen3-aiden": ("mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "qwen3_custom", "Aiden", NARRATOR, "male", "Apache-2.0"),
    "qwen3-design-male": ("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16", "qwen3_design", "",
                          "A warm adult male narrator, mid-low pitch, " + NARRATOR.lower(), "male", "Apache-2.0"),
    "qwen3-ryan-us": ("mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "qwen3_custom", "Ryan", "Native General American English accent with natural American intonation and rhythm, no foreign accent. " + NARRATOR, "male", "Apache-2.0"),
    "qwen3-design-us": ("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16", "qwen3_design", "",
                        "A native American man from the US Midwest, warm mid-low voice, General American accent, " + NARRATOR.lower(), "male", "Apache-2.0"),
    "kokoro-am_adam": ("mlx-community/Kokoro-82M-bf16", "kokoro", "am_adam", "", "male", "Apache-2.0"),
    "kokoro-am_eric": ("mlx-community/Kokoro-82M-bf16", "kokoro", "am_eric", "", "male", "Apache-2.0"),
    "kokoro-am_fenrir": ("mlx-community/Kokoro-82M-bf16", "kokoro", "am_fenrir", "", "male", "Apache-2.0"),
    "chatterbox": ("mlx-community/chatterbox-fp16", "plain", "", "", "both", "Apache-2.0 (HF card)"),
    "kokoro-af_heart": ("mlx-community/Kokoro-82M-bf16", "kokoro", "af_heart", "", "female", "Apache-2.0 (current voice)"),
    "ming-emma": ("mlx-community/Ming-3.0-tts-0.5B-bf16", "plain", "US_Emma", "", "female", "MIT"),
    "qwen3-design-female": ("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16", "qwen3_design", "",
                            "A warm adult female narrator, " + NARRATOR.lower(), "female", "Apache-2.0"),
}
DEFAULT_SCENES = ["01-what-changed/s02", "02-flows-and-verdict/s04"]


def pick_scenes(workdir: Path, wanted: list[str]) -> list[dict]:
    say = ex.pronouncer(workdir)
    scripts = dict(ex.load_scripts(workdir, []))
    out = []
    for w in wanted:
        vid, sid = w.split("/", 1)
        sc = next((s for s in scripts[vid]["scenes"] if s["id"] == sid), None)
        if sc is None:
            ex.die(f"no scene {w}")
        out.append({"id": f"{vid}__{sid}", "text": say(sc["narration"]), "narration": sc["narration"]})
    return out


def run(cmd: list[str], payload: dict) -> dict:
    timeout = ex.env_timeout("EXPLAINER_TTS_TIMEOUT", 1800.0)
    try:
        r = ex.run_guarded(cmd, stdin=json.dumps(payload), timeout=timeout, capture=True, capture_stderr=False)  # stderr streams live
    except subprocess.TimeoutExpired:
        ex.die(f"{Path(cmd[-1]).name} timed out after {timeout:.0f}s (set $EXPLAINER_TTS_TIMEOUT to override)")
    if r.returncode != 0:
        ex.die(f"{Path(cmd[-1]).name} failed (exit {r.returncode})")
    return json.loads(r.stdout)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workdir", type=Path, nargs="?")
    ap.add_argument("--scenes", default=",".join(DEFAULT_SCENES))
    ap.add_argument("--gender", default="male", choices=["male", "female", "both"])
    ap.add_argument("--only", default="")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        for k, v in CANDIDATES.items():
            print(f"{k:22} {v[4]:7} {v[5]:36} {v[0]}")
        return
    if not a.workdir:
        ap.error("workdir is required")
    wd = a.workdir.expanduser().resolve()
    only = [k for k in a.only.split(",") if k]
    keys = only or [k for k, v in CANDIDATES.items() if a.gender == "both" or v[4] in (a.gender, "both")]
    bad = [k for k in keys if k not in CANDIDATES]
    if bad:
        ex.die(f"unknown candidate(s) {bad}; see --list")
    out = (a.out or wd / "out/ab").resolve()
    scenes = pick_scenes(wd, a.scenes.split(","))
    speak = ex.find_speak()
    uv = [ex.find_uv(), "run", "--no-sync", "--project", str(speak), "python"]

    cands = [{"key": k, "repo": CANDIDATES[k][0], "kind": CANDIDATES[k][1], "voice": CANDIDATES[k][2],
              "instruct": CANDIDATES[k][3]} for k in keys]
    print(f"[ab] {len(cands)} candidates x {len(scenes)} scenes -> {out}", flush=True)
    synth = run([*uv, str(ex.SKILL / "ab_worker.py")], {"out": str(out), "candidates": cands,
                                                      "scenes": [{"id": s["id"], "text": s["text"]} for s in scenes]})["results"]

    jobs = [{"id": f"{k}__{sid}", "wav": r["wav"], "text": next(s["text"] for s in scenes if s["id"] == sid)}
            for k, res in synth.items() for sid, r in res["scenes"].items()]
    aligned = run([*uv, str(ex.SKILL / "align_worker.py"), "--model", ex.ALIGN_MODEL], {"items": jobs})["results"] if jobs else {}

    rows = {}
    for k in keys:
        res = synth[k]
        row = {"error": res["error"], "scenes": {}}
        for sid, r in res["scenes"].items():
            items = aligned.get(f"{k}__{sid}", [])
            text = next(s["text"] for s in scenes if s["id"] == sid)
            why = timing.validate_alignment(items, text, r["seconds"])
            r["aligned"] = why is None
            r["align_note"] = why or ""
            r["wps"] = round(len(text.split()) / r["seconds"], 2)
            row["scenes"][sid] = r
        rows[k] = row

    labels = [chr(65 + i) for i in range(len(keys))]
    order = {}
    for s in scenes:  # a different shuffle per scene, so a label never maps to one model across scenes
        rnd = random.Random(f"{a.seed}-{s['id']}")
        ks = [k for k in keys if not rows[k]["error"]]
        rnd.shuffle(ks)
        order[s["id"]] = {labels[i]: k for i, k in enumerate(ks)}
    (out / "results.json").write_text(json.dumps({"scenes": scenes, "rows": rows, "order": order,
                                                  "meta": {k: CANDIDATES[k] for k in keys}}, indent=1))
    (out / "index.html").write_text(build_html(out, scenes, rows, order))
    failed = {k: v["error"] for k, v in rows.items() if v["error"]}
    for k, e in failed.items():
        print(f"[ab] {k}: FAILED {e}", file=sys.stderr)
    print(f"[done] open {out / 'index.html'}")


def build_html(out: Path, scenes: list[dict], rows: dict, order: dict) -> str:
    data = {"run": out.name, "order": order, "meta": {k: {"repo": v[0], "voice": v[2] or "(default)", "licence": v[5]} for k, v in CANDIDATES.items()},
            "rows": {k: {"error": v["error"], "scenes": {s: {x: y for x, y in r.items() if x != "wav"} for s, r in v["scenes"].items()}}
                     for k, v in rows.items()}}
    blocks = []
    for s in scenes:
        clips = []
        for label in order[s["id"]]:
            key = order[s["id"]][label]
            wav = rows[key]["scenes"][s["id"]]["wav"]
            rel = Path(wav).relative_to(out)
            clips.append(f'<div class="clip" data-scene="{html.escape(s["id"])}" data-label="{label}"><b>{label}</b>'
                         f'<audio controls preload="none" src="{html.escape(str(rel))}"></audio>'
                         f'<label>Natural <select><option value="">-</option>' + "".join(f"<option>{n}</option>" for n in range(1, 6)) + "</select></label>"
                         f'<label class="rb"><input type="checkbox"> robotic</label><span class="rev"></span></div>')
        blocks.append(f'<section><h2>{html.escape(s["id"])}</h2><p class="txt">{html.escape(s["narration"])}</p>{"".join(clips)}</section>')
    return PAGE.replace("__BLOCKS__", "\n".join(blocks)).replace("__DATA__", json.dumps(data))


PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Voice blind test</title>
<style>
:root{--bg:#fafafa;--fg:#111;--mut:#666;--card:#fff;--bd:#ddd;--bad:#c0392b;--ok:#1e8449}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mut:#999;--card:#1e1e1e;--bd:#333;--bad:#ff6b5b;--ok:#4cd07d}}
body{font:16px/1.5 system-ui;background:var(--bg);color:var(--fg);max-width:880px;margin:0 auto;padding:24px 16px}
section{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:16px;margin:16px 0}
.txt{color:var(--mut);margin-top:0}.clip{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--bd)}
.clip b{width:1.5em;font-size:20px}audio{flex:1;min-width:220px}.rb{color:var(--bad)}.rev{width:100%;font-size:13px;color:var(--mut)}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--bd);background:var(--card);color:var(--fg);cursor:pointer}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--bd);padding:6px;text-align:left}.dq{color:var(--bad);font-weight:600}.ok{color:var(--ok)}
</style>
<h1>Voice blind test</h1>
<p>Listen to each clip and rate it. Tick <b>robotic</b> for anything that sounds synthetic, flat or glitchy: one tick disqualifies that voice. Names stay hidden until you press Reveal. Ratings save in this browser.</p>
__BLOCKS__
<p><button id=reveal>Reveal &amp; score</button> <button id=export>Export ratings (JSON)</button></p>
<div id=summary></div>
<script>
const D=__DATA__;const KEY='voice-ab-'+D.run;let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
document.querySelectorAll('.clip').forEach(c=>{const id=c.dataset.scene+'|'+c.dataset.label,sel=c.querySelector('select'),cb=c.querySelector('input');
 const v=S[id]||{};sel.value=v.n||'';cb.checked=!!v.r;
 const upd=()=>{S[id]={n:sel.value,r:cb.checked};save()};sel.onchange=upd;cb.onchange=upd});
document.getElementById('reveal').onclick=()=>{const agg={};
 document.querySelectorAll('.clip').forEach(c=>{const sc=c.dataset.scene,key=D.order[sc][c.dataset.label],r=D.rows[key].scenes[sc],v=S[sc+'|'+c.dataset.label]||{};
  c.querySelector('.rev').textContent=`${key} · ${D.meta[key].voice} · aligned ${r.aligned?'yes':'NO ('+r.align_note+')'} · ${r.rtf}x realtime · pitch spread ${r.f0_std_st??'n/a'} st`;
  const a=agg[key]=agg[key]||{n:[],robotic:0,aligned:0,count:0,f0:[],rtf:[]};if(v.n)a.n.push(+v.n);if(v.r)a.robotic++;a.count++;if(r.aligned)a.aligned++;if(r.f0_std_st!=null)a.f0.push(r.f0_std_st);a.rtf.push(r.rtf)});
 const avg=x=>x.length?(x.reduce((p,q)=>p+q,0)/x.length).toFixed(2):'n/a';
 let h='<table><tr><th>Voice</th><th>Naturalness</th><th>Robotic</th><th>Alignment ok</th><th>Pitch spread (st)</th><th>RTF</th><th>Licence</th></tr>';
 Object.entries(agg).sort((x,y)=>(x[1].robotic-y[1].robotic)||(avg(y[1].n)-avg(x[1].n))).forEach(([k,a])=>{
  h+=`<tr><td>${k}<br><small>${D.meta[k].repo}</small></td><td>${avg(a.n)}</td><td class="${a.robotic?'dq':'ok'}">${a.robotic?'DISQUALIFIED ('+a.robotic+')':'none'}</td><td>${a.aligned}/${a.count}</td><td>${avg(a.f0)}</td><td>${avg(a.rtf)}</td><td>${D.meta[k].licence}</td></tr>`});
 Object.entries(D.rows).filter(([k,v])=>v.error).forEach(([k,v])=>h+=`<tr><td>${k}</td><td colspan=6 class=dq>failed: ${v.error}</td></tr>`);
 document.getElementById('summary').innerHTML=h+'</table><p>Pick the best naturalness among voices with no robotic tick and full alignment. Pitch spread under about 1.5 st is only a hint of monotone delivery; your ears decide.</p>'};
document.getElementById('export').onclick=()=>{const b=new Blob([JSON.stringify(S,null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='voice-ratings.json';a.click()};
</script>"""

if __name__ == "__main__":
    main()
