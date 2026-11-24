"""Mermaid diagram static checks, Chromium rendering orchestration, and animation validation. Stdlib only."""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

from env import SKILL, browser_exe, clip_err, die, ensure_deps, run_cli, tool_env

MERMAID_TYPES = ["flowchart", "graph", "sequenceDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram",
                 "classDiagram", "journey", "timeline", "mindmap", "gantt", "pie"]
MERMAID_MAX_CHARS = 5000
MERMAID_MAX_DIAGRAMS = 50


def mermaid_static(where: str, code) -> list[str]:
    """Checks that need no browser. Returns errors; prints warnings."""
    if not isinstance(code, str) or not code.strip():
        return [f"{where}: visual 'mermaid' needs non-empty 'code'"]
    errs: list[str] = []
    if re.search(r"%%\{\s*(init|initialize)", code) or re.search(r"^\s*(click|href)\b", code, re.M):
        errs.append(f"{where}: remove %%{{init}}/click; theme is fixed")
    first = next((ln.split()[0] for ln in code.splitlines()
                  if ln.strip() and not (ln.strip().startswith("%%") and not ln.strip().startswith("%%{"))), "")
    if first.startswith("%%{"):
        first = ""  # already reported above
    elif first not in MERMAID_TYPES:
        errs.append(f"{where}: mermaid diagram type '{first}' not supported; use one of {', '.join(MERMAID_TYPES)}")
    if len(code) > MERMAID_MAX_CHARS:
        errs.append(f"{where}: mermaid code is {len(code)} chars; limit is {MERMAID_MAX_CHARS}, split the diagram")
    elif len(code) > 600:
        print(f"warning: {where}: diagram code is {len(code)} characters; keep it small and split it across scenes",
              file=sys.stderr)
    return errs


def _theme_file(theme: str) -> Path:
    return SKILL / ("src/theme.json" if theme == "paper" else "src/cel-sky.json")


def mermaid_hash(code: str, theme: str = "paper") -> str:
    h = hashlib.sha256(code.strip().encode())
    h.update(_theme_file(theme).read_bytes())
    h.update((SKILL / "src/mermaid-render.mjs").read_bytes())
    h.update((SKILL / "src/mermaid-layout.mjs").read_bytes())
    pkg = SKILL / "node_modules/mermaid/package.json"
    h.update(json.loads(pkg.read_text())["version"].encode() if pkg.exists() else b"?")
    return h.hexdigest()[:24]


def mermaid_items(scripts: list[tuple[str, dict]]) -> list[dict]:
    return [{"key": f"{vid}/{sc['id']}", "code": sc["visual"]["code"], "theme": s.get("theme") or "cel-sky"}
            for vid, s in scripts for sc in s["scenes"] if sc["visual"].get("type") == "mermaid"]


def render_mermaid(workdir: Path, items: list[dict]) -> dict[str, dict]:
    """items: [{key, code}] -> {key: {svg, nodes, w, h} | {error}}. Cache misses go to ONE node call."""
    if len(items) > MERMAID_MAX_DIAGRAMS:
        die(f"{len(items)} mermaid diagrams; limit is {MERMAID_MAX_DIAGRAMS} per workdir")
    pub = (workdir / "public").resolve()
    out_dir = workdir / "public/mermaid"
    if out_dir.is_symlink() or (out_dir.exists() and not out_dir.resolve().is_relative_to(workdir.resolve())) \
            or (workdir / "public").is_symlink() or not pub.is_relative_to(workdir.resolve()):
        die(f"{out_dir} is a symlink or resolves outside the workdir; remove it")
    results: dict[str, dict] = {}
    todo = []
    dupes: dict[str, list[str]] = {}  # hash -> other scene keys with identical code (rendered once)
    for it in items:
        theme = it.get("theme") or "cel-sky"
        h = mermaid_hash(it["code"], theme)
        svg, meta = out_dir / f"{h}.svg", out_dir / f"{h}.json"
        cached = None
        if svg.exists() and meta.exists():
            try:
                m = json.loads(meta.read_text())
                # an animated diagram's layers live next to it; any missing layer is a cache miss
                lay = m.get("layout")
                if all(isinstance(m.get(k), (int, float)) for k in ("nodes", "w", "h")) and (not lay or all(
                        (out_dir / h / f).exists() for f in ["base.svg", *(p.get("file", "") for p in lay.get("parts", []))])):
                    cached = m
            except (OSError, ValueError):
                pass  # unreadable meta -> cache miss
        if cached:
            results[it["key"]] = {"svg": f"mermaid/{h}.svg", **cached, "cached": True}
        elif h in dupes:
            dupes[h].append(it["key"])
        else:
            dupes[h] = []
            todo.append({"key": it["key"], "hash": h, "code": it["code"].strip(), "theme": theme})
    if not todo:
        return results
    env = tool_env()
    ensure_deps(env)
    exe = browser_exe()

    budget = 60 + 15 * len(todo)

    def run(browser: str | None) -> subprocess.CompletedProcess:
        cmd = ["node", str(SKILL / "src/mermaid-render.mjs"), "--out-dir", str(out_dir),
               "--budget-ms", str((budget - 5) * 1000)]
        if browser:
            cmd += ["--browser", browser]
        # own process group so a timeout can kill node AND its headless Chrome
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, env=env, cwd=SKILL, start_new_session=True)
        try:
            so, se = p.communicate(json.dumps(todo), timeout=budget)
        except subprocess.TimeoutExpired:
            # SIGTERM first: node closes its headless Chrome (a separate process group) before exiting
            p.terminate()
            try:
                p.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
                p.communicate()
            where = ", ".join(t["key"] for t in todo[:5]) + (", ..." if len(todo) > 5 else "")
            die(f"mermaid render timed out ({where}); simplify or split the diagram")
        finally:
            try:
                os.killpg(p.pid, signal.SIGKILL)  # reap any stray chrome left in the group
            except (ProcessLookupError, PermissionError):
                pass
        return subprocess.CompletedProcess(cmd, p.returncode, so, se)

    r = run(exe)
    fatal = None
    try:
        parsed = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else None
    except json.JSONDecodeError:
        parsed = None
    if r.returncode != 0 or not isinstance(parsed, list):
        fatal = parsed.get("fatal") if isinstance(parsed, dict) else (clip_err(r.stderr) or "unknown error")
        where = todo[0]["key"]
        hint = "" if exe else " No system browser was found, so Remotion's own download was tried; if that failed, check your proxy."
        die(f"mermaid scenes need a Chromium browser to render ({where}). Install Chrome/Edge or set "
            f"$EXPLAINER_BROWSER.{hint} Launch error: {fatal}")
    for res in parsed:
        key = res.pop("key")
        results[key] = {"error": res.get("error", "unknown error")} if not res.get("ok") else \
            {k: res[k] for k in ("svg", "nodes", "w", "h", "layout") if k in res}
    for t in todo:
        for k in dupes[t["hash"]]:
            results[k] = dict(results[t["key"]])
    return results


def check_mermaid(workdir: Path, scripts: list[tuple[str, dict]], quiet: bool = False) -> tuple[list[str], dict]:
    """Render every mermaid scene (cached). Returns (errors, results by 'vid/sid')."""
    items = mermaid_items(scripts)
    if not items:
        return [], {}
    results = render_mermaid(workdir, items)
    errs: list[str] = []
    for key, res in results.items():
        if "error" in res:
            lines = res["error"].strip().splitlines()[:6]
            errs.append(f"{key}: mermaid parse error:\n" + "\n".join("      " + ln for ln in lines))
            continue
        if res["nodes"] > 12:
            print(f"warning: {key}: {res['nodes']} nodes; keep to about 12 and split it across scenes", file=sys.stderr)
        if res["h"] and res["w"] / res["h"] > 3.5:
            print(f"warning: {key}: diagram is very wide; use direction TB or split", file=sys.stderr)
    errs += check_mermaid_animation(scripts, results)
    if not errs and not quiet:
        cached = sum(1 for r in results.values() if r.get("cached"))
        print(f"ok mermaid: {len(results)} diagrams, {cached} cached")
    return errs, results


def norm_name(s: str) -> str:
    """How mermaid focus names are compared; mirrors normName in src/words.ts."""
    return re.sub(r"[\s\x1c-\x1f\x85\ufeff]+", "", s).lower()


def check_mermaid_animation(scripts: list[tuple[str, dict]], results: dict) -> list[str]:
    """Delegate mermaid build/focus validation to src/cli.ts validate-mermaid."""
    needs_check = any(
        sc["visual"].get("type") == "mermaid"
        and (sc["visual"].get("build") or sc.get("focus"))
        and "error" not in results.get(f"{vid}/{sc['id']}", {"error": 1})
        for vid, s in scripts
        for sc in s["scenes"]
    )
    if not needs_check:
        return []
    return json.loads(run_cli(["validate-mermaid"], json.dumps({"scripts": dict(scripts), "results": results})))
