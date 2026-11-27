"""Visual scaffolding and zero-TTS visual verification (`explainer.py visual init|check`). Stdlib only."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from env import (
    SKILL,
    announce_browser_download_if_missing,
    atomic_write_bytes,
    atomic_write_text,
    browser_exe,
    clip_err,
    die,
    ensure_deps,
    env_timeout,
    run_cli,
    run_guarded,
    tool_env,
)

SLUG_RE = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
IDENT_KEY_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
LOCAL_STAGE = SKILL / "src/visuals-local"
TEMPLATE_DIR = SKILL / "templates/visual"
VISUAL_TEMPLATES = ("basic", "algo")
_TOKEN_RE = re.compile(r"__([A-Z]+)__")
_REQUIRED_VISUAL_FILES = ("capabilities.ts", "schema.ts", "semantics.ts", "meta.ts", "catalog.ts")
_MIRROR_SUFFIXES = (".ts", ".tsx", ".json")
_RESERVED_TS_WORDS = {
    "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
    "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "implements",
    "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected",
    "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "type", "typeof",
    "var", "void", "while", "with", "yield",
}


def user_visuals_dir() -> Path | None:
    """User-local visuals directory (`$EXPLAINER_USER_VISUALS_DIR`, or `~/.config/explainer-video/visuals`)."""
    if "EXPLAINER_USER_VISUALS_DIR" in os.environ:
        raw = os.environ["EXPLAINER_USER_VISUALS_DIR"].strip()
        return Path(raw).expanduser() if raw else None
    return Path.home() / ".config/explainer-video/visuals"


def _to_ident(slug: str) -> str:
    parts = slug.split("-")
    camel = parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])
    return f"{camel}_" if camel in _RESERVED_TS_WORDS else camel


def _prop_key(slug: str) -> str:
    return slug if IDENT_KEY_RE.fullmatch(slug) else f"'{slug}'"


def _prop_access(obj: str, slug: str) -> str:
    return f"{obj}.{slug}" if IDENT_KEY_RE.fullmatch(slug) else f"{obj}['{slug}']"


def _write_if_changed(dest: Path, data: bytes) -> None:
    if dest.exists() and dest.is_file() and dest.read_bytes() == data:
        return
    atomic_write_bytes(dest, data)


def validate_slug(slug: str) -> str:
    """Validate a visual type slug (`^[a-z][a-z0-9-]{1,31}$`, no path separators)."""
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        die(f"invalid visual slug {slug!r}: must match ^[a-z][a-z0-9-]{{1,31}}$")
    return slug


def _to_pascal(slug: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in slug.split("-") if part)


def render_visual_template(template: str, slug: str) -> dict[str, str]:
    """Render `templates/visual/<template>/*.tmpl` for `slug` (`__SLUG__`, `__PASCAL__` tokens only)."""
    if template not in VISUAL_TEMPLATES:
        die(f"unknown visual template {template!r} (expected {' or '.join(VISUAL_TEMPLATES)})")
    validate_slug(slug)
    tokens = {"SLUG": slug, "PASCAL": _to_pascal(slug)}

    def sub(m: re.Match[str]) -> str:
        if m.group(1) not in tokens:
            die(f"visual template {template!r}: unknown placeholder {m.group(0)}")
        return tokens[m.group(1)]

    tdir = TEMPLATE_DIR / template
    out = {f.name[: -len(".tmpl")]: _TOKEN_RE.sub(sub, f.read_text(encoding="utf-8")) for f in sorted(tdir.glob("*.tmpl"))}
    missing = [n for n in (*_REQUIRED_VISUAL_FILES, "View2D.tsx") if n not in out]
    if missing:
        die(f"visual template {template!r} in {tdir} is missing file(s): {', '.join(missing)}")
    return out


def _local_entry(slug: str, *, has2d: bool, has3d: bool) -> dict:
    """Bridge-generation entry for one user-local visual."""
    return {
        "slug": slug,
        "ident": _to_ident(slug),
        "pascal": _to_pascal(slug),
        "key": _prop_key(slug),
        "has2d": has2d,
        "has3d": has3d,
    }


def _local_bridge_contents(entries: list[dict]) -> dict[str, str]:
    if not entries:
        return {
            "capabilities.ts": "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_CAPABILITIES = {} as const;\n",
            "registry.ts": "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_SCHEMAS = {};\nexport const LOCAL_REGISTRY = {};\n",
            "views.tsx": "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_VIEWS = {};\n",
            "catalog.ts": "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_CATALOG = {};\n",
        }

    cap_imports = "\n".join(f"import {{capabilities as {e['ident']}}} from './{e['slug']}/capabilities';" for e in entries)
    cap_entries = "\n".join(
        f"  {e['key']}," if e["key"] == e["ident"] else f"  {e['key']}: {e['ident']}," for e in entries
    )

    schema_imports = "\n".join(f"import {{schema as {e['ident']}Schema}} from './{e['slug']}/schema';" for e in entries)
    sem_imports = "\n".join(f"import {{describe as {e['ident']}Sem}} from './{e['slug']}/semantics';" for e in entries)
    meta_imports = "\n".join(f"import {{meta as {e['ident']}Meta}} from './{e['slug']}/meta';" for e in entries)
    schemas_body = "\n".join(f"  {e['key']}: {e['ident']}Schema," for e in entries)
    reg_body = "\n".join(
        f"  {e['key']}: {{schema: {_prop_access('LOCAL_SCHEMAS', e['slug'])}, semantics: {e['ident']}Sem, meta: {e['ident']}Meta}},"
        for e in entries
    )

    lazy_2d = "\n".join(
        f"const {e['pascal']}2D = lazyView<View2DProps<'{e['slug']}'>>(() => import('./{e['slug']}/View2D').then((m) => ({{default: m.View2D}})), '{e['slug']}-2d');"
        for e in entries
        if e["has2d"]
    )
    lazy_3d = "\n".join(
        f"const {e['pascal']}3D = lazyView<Visual3DProps<Extract<Visual, {{type: '{e['slug']}'}}>>>(() => import('./{e['slug']}/View3D').then((m) => ({{default: m.View3D}})), '{e['slug']}-3d');"
        for e in entries
        if e["has3d"]
    )
    view_body = "\n".join(
        f"  {e['key']}: {{View2D: {e['pascal'] + '2D' if e['has2d'] else 'null'}, View3D: {e['pascal'] + '3D' if e['has3d'] else 'null'}}},"
        for e in entries
    )

    cat_imports = "\n".join(f"import {{catalog as {e['ident']}}} from './{e['slug']}/catalog';" for e in entries)
    cat_body = "\n".join(
        f"  {e['key']}," if e["key"] == e["ident"] else f"  {e['key']}: {e['ident']}," for e in entries
    )

    return {
        "capabilities.ts": (
            "// GENERATED from user-local visuals (~/.config/explainer-video/visuals). Gitignored.\n"
            "import type {Capabilities} from '../visuals/capabilities';\n"
            f"{cap_imports}\n\n"
            "export const LOCAL_CAPABILITIES = {\n"
            f"{cap_entries}\n"
            "} satisfies Record<string, Capabilities>;\n"
        ),
        "registry.ts": (
            "// GENERATED from user-local visuals (~/.config/explainer-video/visuals). Gitignored.\n"
            f"{schema_imports}\n"
            f"{sem_imports}\n"
            f"{meta_imports}\n\n"
            "export const LOCAL_SCHEMAS = {\n"
            f"{schemas_body}\n"
            "};\n\n"
            "export const LOCAL_REGISTRY = {\n"
            f"{reg_body}\n"
            "};\n"
        ),
        "views.tsx": (
            "// GENERATED from user-local visuals (~/.config/explainer-video/visuals). Gitignored.\n"
            "import type {Visual} from '../types';\n"
            "import type {Visual3DProps} from '../three/common';\n"
            "import type {View2DProps} from '../visuals/props';\n"
            "import {lazyView} from '../visuals/lazy-view';\n\n"
            f"{lazy_2d}\n"
            f"{lazy_3d}\n\n"
            "export const LOCAL_VIEWS = {\n"
            f"{view_body}\n"
            "};\n"
        ),
        "catalog.ts": (
            "// GENERATED from user-local visuals (~/.config/explainer-video/visuals). Gitignored.\n"
            "import type {CatalogEntry} from '../visuals/catalog-types';\n"
            f"{cat_imports}\n\n"
            "export const LOCAL_CATALOG = {\n"
            f"{cat_body}\n"
            "} satisfies Record<string, CatalogEntry<any>>;\n"
        ),
    }


def sync_local_visuals() -> list[str]:
    """Mirror valid user-local visuals into gitignored `src/visuals-local/` and emit local bridges."""
    LOCAL_STAGE.mkdir(parents=True, exist_ok=True)
    user_dir = user_visuals_dir()
    builtin_dir = SKILL / "src/visuals"

    entries: list[dict] = []
    source_dirs: dict[str, Path] = {}
    if user_dir is not None and user_dir.is_dir():
        for d in sorted((p for p in user_dir.iterdir() if p.is_dir() and not p.name.startswith(".")), key=lambda p: p.name):
            slug = validate_slug(d.name)
            if (builtin_dir / slug).exists():
                die(f"user visual '{slug}' at {d} collides with built-in visual; rename it or remove {d}")
            missing = [f for f in _REQUIRED_VISUAL_FILES if not (d / f).is_file()]
            if missing:
                die(f"user visual '{slug}' at {d} is missing required file(s): {', '.join(missing)}")
            has2d = (d / "View2D.tsx").is_file()
            has3d = (d / "View3D.tsx").is_file()
            if not has2d and not has3d:
                die(f"user visual '{slug}' at {d} must provide at least View2D.tsx or View3D.tsx")
            source_dirs[slug] = d
            entries.append(_local_entry(slug, has2d=has2d, has3d=has3d))

    bridge_names = {"capabilities.ts", "registry.ts", "views.tsx", "catalog.ts"}
    for child in list(LOCAL_STAGE.iterdir()):
        if child.is_dir() and child.name not in source_dirs:
            shutil.rmtree(child)
        elif child.is_file() and child.name not in bridge_names:
            child.unlink()

    for slug, src in source_dirs.items():
        dst = LOCAL_STAGE / slug
        dst.mkdir(parents=True, exist_ok=True)
        keep_rels: set[Path] = set()
        for f in sorted(src.rglob("*")):
            if not f.is_file() or any(part.startswith(".") for part in f.relative_to(src).parts):
                continue
            if f.suffix not in _MIRROR_SUFFIXES:
                continue
            rel = f.relative_to(src)
            keep_rels.add(rel)
            target = dst / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            _write_if_changed(target, f.read_bytes())
        for existing in sorted(dst.rglob("*"), reverse=True):
            if existing.is_file() and existing.relative_to(dst) not in keep_rels:
                existing.unlink()
            elif existing.is_dir() and not any(existing.iterdir()):
                existing.rmdir()

    for fname, content in _local_bridge_contents(entries).items():
        _write_if_changed(LOCAL_STAGE / fname, content.encode("utf-8"))

    return [e["slug"] for e in entries]


def regenerate_builtin_artifacts() -> None:
    """Regenerate built-in visual registries, SKILL.md visuals block, and committed built-in JSON schemas."""
    run_cli(["gen-visuals"])
    run_cli(["docs", "--write"])
    atomic_write_text(SKILL / "schema/script.schema.json", run_cli(["schema", "--builtin"]))
    atomic_write_text(SKILL / "schema/style.schema.json", run_cli(["style-schema", "--builtin"]))


def cmd_visual_regen() -> None:
    """Sync local visual stubs and regenerate all built-in registries, docs, and committed schemas."""
    sync_local_visuals()
    regenerate_builtin_artifacts()
    print("regenerated built-in visual registries, SKILL.md, and schemas")


def cmd_visual_init(slug: str, template: str = "basic", scope: str = "local") -> None:
    """Scaffold a new visual under `~/.config/explainer-video/visuals/<slug>/` (--local, default) or `src/visuals/<slug>/` (--builtin)."""
    validate_slug(slug)
    if template not in VISUAL_TEMPLATES:
        die(f"unknown visual template {template!r} (expected {' or '.join(VISUAL_TEMPLATES)})")
    if scope not in ("local", "builtin"):
        die(f"unknown visual scope {scope!r} (expected local or builtin)")

    builtin_dir = SKILL / "src/visuals" / slug
    user_dir = user_visuals_dir()
    if scope == "local" and user_dir is None:
        die("EXPLAINER_USER_VISUALS_DIR is empty; use --builtin or set EXPLAINER_USER_VISUALS_DIR")
    local_dir = (user_dir / slug) if user_dir is not None else None

    if builtin_dir.exists():
        die(f"visual '{slug}' already exists as built-in at {builtin_dir}")
    if local_dir is not None and local_dir.exists():
        die(f"visual '{slug}' already exists at {local_dir}")

    vdir = builtin_dir if scope == "builtin" else local_dir
    assert vdir is not None
    files = render_visual_template(template, slug)
    vdir.mkdir(parents=True, exist_ok=False)
    for name, body in files.items():
        (vdir / name).write_text(body, encoding="utf-8")

    sync_local_visuals()
    if scope == "builtin":
        regenerate_builtin_artifacts()

    print(f"created {vdir} ({template} template, {scope})")
    print(f"next: python3 {SKILL / 'explainer.py'} visual check {slug}")


def cmd_visual_list(as_json: bool = False) -> None:
    """List built-in and user-local visual types."""
    local_slugs = sync_local_visuals()
    builtin_slugs = sorted(p.name for p in (SKILL / "src/visuals").iterdir() if p.is_dir() and (p / "capabilities.ts").is_file())
    user_dir = user_visuals_dir()
    if as_json:
        print(json.dumps({
            "builtin": builtin_slugs,
            "local": [{"slug": s, "path": str((user_dir / s) if user_dir else "")} for s in local_slugs],
            "userDir": str(user_dir) if user_dir else None,
        }, indent=2))
        return
    print(f"built-in ({len(builtin_slugs)}): {', '.join(builtin_slugs)}")
    if local_slugs and user_dir is not None:
        print(f"user-local ({len(local_slugs)}, {user_dir}):")
        for s in local_slugs:
            print(f"  {s}  ({user_dir / s})")
    else:
        print(f"user-local (0): {user_dir or 'disabled'}")


def cmd_visual_promote(slug: str) -> None:
    """Promote a user-local visual from `~/.config/explainer-video/visuals/<slug>/` into built-in `src/visuals/<slug>/`."""
    validate_slug(slug)
    user_dir = user_visuals_dir()
    if user_dir is None:
        die("EXPLAINER_USER_VISUALS_DIR is disabled")
    src = user_dir / slug
    dst = SKILL / "src/visuals" / slug
    if not src.is_dir():
        die(f"user-local visual '{slug}' not found at {src}")
    if dst.exists():
        die(f"built-in visual '{slug}' already exists at {dst}")
    shutil.move(str(src), str(dst))
    sync_local_visuals()
    regenerate_builtin_artifacts()
    print(f"promoted '{slug}' -> {dst}")


def build_check_frames(meta: dict) -> tuple[list[dict], list[int]]:
    """Build frame specs for visual check (`cel-sky`, `paper`, optional `rtl`, and determinism dup)."""
    dur = max(30, int(meta["durationInFrames"]))
    lead = max(0, int(meta.get("leadFrames", 10)))
    base = dict(meta["defaultProps"])
    mid = min(dur - 12, max(0, int(dur * 0.65)))
    end_steady = min(dur - 1, max(lead + 4, dur - 12))
    cel_frames = [
        min(end_steady, lead + 4),
        min(end_steady, int(dur * 0.35)),
        mid,
        end_steady,
    ]
    specs: list[dict] = []
    for f in cel_frames:
        specs.append({"frame": f, "inputProps": {**base, "theme": "cel-sky"}})
    for f in (min(end_steady, int(dur * 0.50)), end_steady):
        specs.append({"frame": f, "inputProps": {**base, "theme": "paper"}})
    if meta.get("rtl") == "yes":
        specs.append({"frame": mid, "inputProps": {**base, "theme": "cel-sky", "dir": "rtl"}})
    # Index 2 is `mid` in cel-sky; duplicate rendered separately for pixel-MD5 determinism check.
    return specs, [2, mid]


def _pix_md5(png: Path) -> str:
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(png), "-f", "md5", "-"], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        die(f"ffmpeg md5 failed on {png}: {r.stderr.strip()}")
    return r.stdout.strip()


def cmd_visual_check(slug: str, out_png: Path | None = None, no_render: bool = False) -> None:
    """Run tsc, generated-file check, AST hygiene lint, catalog check, and optional contact-sheet render."""
    validate_slug(slug)
    sync_local_visuals()
    builtin_dir = SKILL / "src/visuals" / slug
    local_dir = LOCAL_STAGE / slug
    if not builtin_dir.is_dir() and not local_dir.is_dir():
        user_dir = user_visuals_dir()
        die(f"visual '{slug}' not found in {builtin_dir.parent} or {user_dir}")

    env = tool_env()
    ensure_deps(env)
    timeout = env_timeout("EXPLAINER_RENDER_TIMEOUT", 600.0)

    tsc = subprocess.run(
        [str(SKILL / "node_modules/.bin/tsc"), "-p", "tsconfig.tests.json", "--noEmit"],
        cwd=SKILL,
        env=env,
        capture_output=True,
        text=True,
    )
    if tsc.returncode != 0:
        die(f"tsc failed:\n{(tsc.stdout + tsc.stderr).strip()}")

    run_cli(["check-generated"])
    lint_out = json.loads(run_cli(["lint-visual", slug]))
    print(f"ok lint-visual {slug}: {lint_out['checkedFiles']} file(s), {lint_out['catalogChecks']} catalog variant(s)")

    if no_render:
        return

    meta = json.loads(run_cli(["catalog-props", slug]))
    specs, (det_tile_idx, det_frame) = build_check_frames(meta)
    base_props = dict(meta["defaultProps"])
    gl = os.environ.get("EXPLAINER_GL", "angle") if meta.get("modes") == ["3d"] else None

    target_sheet = (out_png.expanduser().resolve() if out_png else (SKILL / "out/visual-check" / f"{slug}.png"))
    target_sheet.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"visual-check-{slug}-") as td:
        tmp = Path(td)
        worker_frames = [
            {
                "frame": sp["frame"],
                "inputProps": sp["inputProps"],
                "output": str(tmp / f"tile_{i:03d}.png"),
            }
            for i, sp in enumerate(specs)
        ]
        det_dup = tmp / "det_dup.png"
        worker_frames.append({
            "frame": det_frame,
            "inputProps": {**base_props, "theme": "cel-sky"},
            "output": str(det_dup),
        })
        exe = browser_exe()
        announce_browser_download_if_missing(exe)
        cfg = {
            "entryPoint": str(SKILL / "src/catalog-index.ts"),
            "publicDir": str(SKILL / "catalog-public"),
            "browserExecutable": exe,
            "videos": [
                {
                    "vid": slug,
                    "compositionId": slug,
                    "inputProps": base_props,
                    "gl": gl,
                    "concurrency": 2,
                    "frames": worker_frames,
                }
            ],
        }
        node = shutil.which("node", path=env.get("PATH"))
        if not node:
            die("node not found")
        try:
            r = run_guarded(
                [node, str(SKILL / "src/still-worker.mjs")],
                stdin=json.dumps(cfg),
                timeout=timeout,
                env={**env, "HF_HUB_OFFLINE": "1"},
                cwd=SKILL,
                capture=True,
            )
        except subprocess.TimeoutExpired:
            die(f"visual check render timed out after {timeout:.0f}s")
        if r.returncode != 0:
            die(f"still-worker failed:\n{clip_err(r.stderr)}")

        det_a = _pix_md5(tmp / f"tile_{det_tile_idx:03d}.png")
        det_b = _pix_md5(det_dup)
        if det_a != det_b:
            die(f"{slug}: non-deterministic frame {det_frame} ({det_a} vs {det_b})")

        rows = (len(specs) + 1) // 2
        ff = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y",
                "-i", str(tmp / "tile_%03d.png"),
                "-vf", f"scale=640:360,tile=2x{rows}:padding=8:margin=8:color=0x1e293b",
                str(target_sheet),
            ],
            capture_output=True,
            text=True,
        )
        if ff.returncode != 0:
            die(f"ffmpeg contact sheet failed: {ff.stderr.strip()}")

    print(f"[ok] visual check {slug}: determinism MD5 verified ({len(specs)} frames); contact sheet -> {target_sheet}")
