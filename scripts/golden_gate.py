#!/usr/bin/env python3
"""Pick the scope of the golden compare from what changed (the last step of `make test`).

  golden_gate.py [--dry-run]     run the compare that the diff against main warrants
  FULL=1 make test               always run the full compare

Rules (skills/explainer-video):
- A shared atom changed: everything under src/ outside src/visuals/<type>/, non-script corpus assets
  (tests/corpus/public, figures, ledger), plus remotion/package/lock files, explainer.py, timing.py,
  and tests/golden.py. It can move pixels in any type: FULL compare.
- Only type folders (src/visuals/<type>/), corpus scripts (tests/corpus/scripts/<vid>.json), or goldens
  (tests/golden/<vid>/...) changed: ONE batched `golden.py compare` scoping Chromium stills with
  `--types ...` and/or `--videos ...` (data JSON and `check` output are still compared for every video).
- Nothing that renders changed (docs, unit tests, styles, DATA_ONLY files, wiring-only edits):
  data/check only (`--type -` renders no stills).
When unsure the script fails safe to the full compare.
"""
import os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EV = "skills/explainer-video/"
GOLDEN = ROOT / EV / "tests/golden.py"
WIRING = {"registry.ts", "views.tsx", "capabilities.ts", "meta-types.ts", "meta-lint.ts", "docs.ts", "common.ts", "props.ts", "order.json", "lazy-view.tsx"}
CROSS_TYPE_DEPS = {"stat": ("chart",)}
# validation, linting, timing and docs only: they change the data JSON or the `check` output (always compared), never a pixel
DATA_ONLY = {
    "src/docs.ts", "src/schema.ts", "src/cli.ts", "src/styles.ts", "src/ledger.ts",
    "src/style-files.ts", "src/lint-narration.ts", "src/words.ts", "src/types.ts",
    "src/gen-visuals.ts", "src/visual-lint.ts", "visual_host.py",
    "src/CatalogScene.tsx", "src/CatalogRoot.tsx", "src/catalog-index.ts",
    "src/visuals/catalog.ts", "src/visuals/catalog-types.ts",
}
SHARED_ROOT_FILES = {
    "package.json", "package-lock.json", "remotion.config.ts", "tsconfig.json",
    "explainer.py", "render.py", "timing.py", "figures_host.py", "audio.py",
    "validation.py", "mermaid_host.py", "features.py", "env.py", "pronounce.py",
    "tests/golden.py", "src/still-worker.mjs", "src/render-worker.mjs", "src/bundle-cache.mjs",
}


def git(*a):
    return subprocess.run(["git", "-C", str(ROOT), *a], capture_output=True, text=True).stdout.split("\n")


def changed():
    base = "".join(git("merge-base", "HEAD", "main")).strip() or "HEAD"
    files = set(git("diff", "--name-only", base)) | set(git("ls-files", "--others", "--exclude-standard"))
    return sorted(f for f in files if f.startswith(EV))


def plan(files):
    """('full' | 'scoped' | 'data', types, videos, reason)"""
    types, vids, shared = set(), set(), []
    for f in files:
        rel = f[len(EV):]
        if rel in DATA_ONLY or rel.startswith("catalog-public/") or re.match(r"src/visuals/[a-z0-9_-]+/catalog\.ts$", rel):
            continue
        m = re.match(r"src/visuals/([a-z0-9_-]+)/", rel)
        if m:
            t = m.group(1)
            types.add(t)
            types.update(CROSS_TYPE_DEPS.get(t, ()))
        elif rel.startswith("src/semantics/") or (rel.startswith("src/visuals/") and rel.count("/") == 2 and rel.split("/")[-1] in WIRING):
            continue
        elif rel.startswith("src/") or rel in SHARED_ROOT_FILES:
            shared.append(rel)
        elif rel.startswith("tests/corpus/scripts/"):
            m = re.match(r"tests/corpus/scripts/([^/.]+)\.json$", rel)
            if m:
                vids.add(m.group(1))
            else:
                shared.append(rel)
        elif rel.startswith("tests/golden/"):
            m = re.match(r"tests/golden/([^/]+)/", rel)
            if m:
                vids.add(m.group(1))
            else:
                shared.append(rel)
        elif rel.startswith("tests/corpus/"):
            shared.append(rel)
    if shared:
        return "full", [], [], "shared atoms changed: " + ", ".join(shared[:6]) + (" ..." if len(shared) > 6 else "")
    if types or vids:
        parts = []
        if types:
            parts.append("types: " + ", ".join(sorted(types)))
        if vids:
            parts.append("videos: " + ", ".join(sorted(vids)))
        return "scoped", sorted(types), sorted(vids), "scoped (" + "; ".join(parts) + ")"
    return "data", [], [], "nothing that renders changed"


def cmd_args(kind, types, videos):
    if kind == "full":
        return ["compare"]
    if kind == "data":
        return ["compare", "--type", "-"]
    args = ["compare"]
    if types:
        args += ["--types", ",".join(types)]
    if videos:
        args += ["--videos", ",".join(videos)]
    return args


def needs_verify_seq(files: list[str]) -> bool:
    """True when edits touch sequential-render-sensitive 3D/chrome/SVG rendering paths."""
    for f in files:
        if f.startswith((f"{EV}src/three/", f"{EV}src/visuals/svg/")) or f == f"{EV}src/SceneChrome.tsx":
            return True
        if f.startswith(f"{EV}src/visuals/") and f.endswith("/View3D.tsx"):
            return True
    return False


def on_clean_main() -> bool:
    head = "".join(git("rev-parse", "HEAD")).strip()
    main_ref = "".join(git("rev-parse", "main")).strip()
    dirty = any(line.strip() for line in git("status", "--porcelain"))
    return bool(head and head == main_ref and not dirty)


def main():
    dry = "--dry-run" in sys.argv
    files = changed()
    kind, types, videos, why = ("full", [], [], "FULL=1") if os.environ.get("FULL") else plan(files)
    if not files and not os.environ.get("FULL") and on_clean_main():
        print("note: on main with clean tree; use FULL=1 to force a full golden compare")
    if needs_verify_seq(files):
        print("note: sequential-render-sensitive files changed; run 'make verify-seq' before merging")
    print(f"golden gate: {kind} compare ({why})")
    args = cmd_args(kind, types, videos)
    if dry:
        print("  would run: golden.py " + " ".join(args))
        return 0
    return subprocess.run([sys.executable, str(GOLDEN), *args]).returncode


if __name__ == "__main__":
    sys.exit(main())
