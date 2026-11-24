# narrate-mlx

Architecture, invariants, and conventions for working in `narrate-mlx` (`speak`, `fix-pronunciation`, and `explainer-video`).

## Layout
Everything lives under `skills/`, `scripts/`, and `docs/`:
- `skills/speak/` — standalone local TTS CLI (`speak.py`, `mdparse.py`, `highlight.py`, `pyproject.toml`, `uv.lock`) plus optional Arabic backend `skills/speak/silma/` (`synth.py`, `stub/`).
- `skills/explainer-video/` — stdlib Python orchestrator (`explainer.py`, `env.py`, `audio.py`, `render.py`, `validation.py`, `timing.py`, `pronounce.py`, `figures_host.py`, `mermaid_host.py`, `transcript.py`, `report.py`, `features.py`), Remotion app (`src/`), templates (`templates/`), audience styles (`styles/`), committed schemas (`schema/`), Visual Catalog assets (`catalog-public/`), and tests (`test_*.py`, `tests/`).
- `scripts/` — `setup.sh`, `install.sh`, `uninstall.sh`, `doctor.sh`, `build-pages.sh`, `golden_gate.py`, `run_pytests.py`, `lib.sh`, `hooks/`.

`skills/explainer-video` resolves `skills/speak` as `../speak` (or `$EXPLAINER_TTS_DIR`), so copy `skills/` as a whole when moving skills.

## Setup & Commands
- `make setup` — runs `uv sync` for `speak` (retries with `--system-certs` behind TLS-inspecting proxies) and `npm ci` for `explainer-video`. `skills/speak/silma` is synced only when `arabic` is in `NARRATE_FEATURES`.
- `make install` / `make uninstall` / `make doctor` — symlink `skills/*` into `~/.claude/skills` and `~/.agents/skills` (`SKILL_DIRS="..."`, `FORCE=1`), remove links pointing into this repo, and validate tools/envs/path length (`SMOKE=1` tests speech).
- `make catalog` — opens the interactive Visual Catalog (`src/catalog-index.ts` + `catalog-public/`) in Remotion Studio.
- `make pages` — builds the static Visual Catalog bundle into `out/pages/` via `scripts/build-pages.sh` (`PUBLIC_PATH=/narrate-mlx/` by default; requires absolute `/.../` path on Remotion 4.0.290 so `staticFile()` resolves cleanly).
- `make docs` — regenerates `skills/explainer-video/SKILL.md` (between `visuals:begin/end`) and `schema/{script,style}.schema.json` from the visual types' `meta.ts` and Zod schemas.
- `make test-unit` — fast zero-Chrome checks (`tsc -p tsconfig.tests.json --noEmit`, `tsx src/cli.ts check-generated`, `speak` unittests, parallel Python tests via `scripts/run_pytests.py`, TS vector & hygiene tests `tests/vectors/*.test.ts`).
- `make test` — `make test-unit` followed by `scripts/golden_gate.py` (`FULL=1` forces full golden compare; `--dry-run` prints scope).

## `speak` Constraints
- **Python & `uv` only:** `skills/speak/pyproject.toml` pins Python `>=3.12,<3.13` because audio dependencies lag new Python releases. Manage dependencies exclusively with `uv` (`uv sync`, `uv run`).
- **Keep `torch` out of `skills/speak`:** `pyproject.toml` depends on `misaki` plus its English extras *except* `spacy-curated-transformers` (which would pull in ~540 MB of `torch`). `en-core-web-sm` is pinned directly by wheel URL.
- **Keep the checkout path short:** `espeak-ng` (via `misaki`) fails to load its data directory when the full path to `espeakng_loader/espeak-ng-data` approaches ~200 characters (`Error processing file '...phontab'`).
- **MLX GPU cache cap:** `speak.py` sets `mx.set_cache_limit(CACHE_LIMIT_BYTES)` and calls `mx.clear_cache()` before opening the read-along window; removing this allows MLX's buffer cache to grow unbounded on 16 GB Macs.
- **Stable CLI contract for `explainer-video`:** `speak.py` takes text on `stdin` and accepts `--model` (`kokoro` for `en`, `silma` for `ar`), `--voice`, `--speed`, `--out file.wav`, `--timings file.json`, and `--lang`.
- **Arabic (`silma/`):** runs SILMA TTS v1 in its own `uv` environment because its `torch`/`onnxruntime` pins conflict with `mlx-audio` (`speak.py` must remain importable without `torch`). NeMo text normalization is stubbed (`silma/stub/`), so digits/times are not expanded and scripts must spell numbers as Arabic words. CATT auto-diacritization is off by default (`--diacritize` opts in); word timings are energy-based estimates (`approx: true`).

## `explainer-video` Architecture & Invariants
- **Single source of truth per visual type (`src/visuals/<type>/`):**
  - Each visual folder contains `schema.ts` (Zod schema), `semantics.ts` (pure reveal slots & carry rules), `capabilities.ts` (pure leaf: `modes`, `continues`, `focus`, `rtl`), `meta.ts` (capabilities, per-type `lint`, and `docs`), `catalog.ts` (pure showcase fixture), `View2D.tsx` (except 3D-only types), and `View3D.tsx` (where supported).
  - Register every new type in the exhaustive `Record<VisualType, ...>` maps: `visuals/capabilities.ts`, `visuals/registry.ts` (must remain free of React, Remotion, and Three.js imports), `visuals/views.tsx`, `visuals/catalog.ts`, and `ORDER` in `src/docs.ts`, then run `make docs`.
  - Shared primitives live outside type folders (`kit2d.tsx`, `flow.tsx`, `plot-svg.tsx`, `three/common.tsx`, `three/{cards,process,diagram}-kit.tsx`, `focus.ts`, `continuity.ts`, `semantics/`, `rtl.ts`, `theme.ts`).
- **Remotion & timing invariants:**
  - All `@remotion/*` packages are pinned to **`4.0.290`** — never bump them without re-testing a full render.
  - Keep `FPS = 30`, `leadSec = 0.35`, `tailSec = 0.55`, and JPEG intermediates (`remotion.config.ts`). Reveal/focus timing and all golden frames depend on `FPS = 30`.
  - Word timings come from Kokoro's token timestamps (`<scene>.words.json` mapped via `timing.words_from_tts`), falling back to `Qwen3-ForcedAligner` (`align_worker.py`) and finally even spread.
  - `node`/`npm` may be installed under `~/.nvm`; `explainer.py` (`env.py`) and `scripts/lib.sh` discover Node directly without spawning interactive login shells.
- **3D mode (`mode: "3d"`):**
  - Uses `@remotion/three` (`src/three/`) with `frameloop: 'never'` and `Stage3D` auto-framing.
  - **Determinism:** motion must be a pure function of `frame` (no `useFrame`, banned by `tests/vectors/hygiene.test.ts`); use unlit `Mat` only; wait for `loadFonts()` before measuring canvas text; key meshes when changing materials instead of mutating materials in place; dim via opaque shader fades rather than toggling `transparent`.
  - Always verify 3D changes with `explainer.py review` and `explainer.py verify` (video frames vs stills, ≥ 30 dB PSNR).
- **RTL & Arabic (`language: "ar"`):**
  - `src/rtl.ts` exposes `useRtl()`. Cairo (`src/fonts/Cairo.ttf`, family `"Explainer Arabic"`) is registered only for RTL videos so English rendering remains byte-identical. Avoid letter-spacing in RTL (breaks Arabic joining).
  - Shared text normalization/matching functions in Python (`timing.py` / `explainer.py`) and TypeScript (`src/schema.ts` / `src/words.ts`) are locked together by `tests/vectors/text.json` (run in both `test_timing.py` and `tests/vectors/text.test.ts`).
- **Security & validation invariants:**
  - Script JSON, style definitions, and fact ledgers are validated by Zod (`src/cli.ts`) and stdlib Python (`validation.py`).
  - `figure` assets (`figures_host.py`): strict workdir confinement, symlink rejection, 10 MB cap, magic-byte validation, and SVG active-content rejection; always rendered via `<Img src={staticFile(...)} />`.
  - `mermaid` (`mermaid_host.py`, `src/mermaid-render.mjs`): `securityLevel: 'strict'` + CDP `Fetch.failRequest` blocking all network access; rendered to SVG/layers and loaded via `<Img>`.
  - `svg` (`src/visuals/svg/parse.ts`) & math expressions (`src/visuals/math-expr.ts`): strict dependency-free parsers rejecting unsafe tags/attributes/`eval`; `tests/vectors/hygiene.test.ts` forbids `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `Math.random`, and `useFrame` in visual components.
  - `equation` (`src/visuals/equation/parse.ts`): offline KaTeX with `trust: false`, `maxExpand: 64`, and macro/HTML sanitization.
- **Testing & resource rules:**
  - **Never run renders and TTS concurrently:** renders use up to 8 headless Chrome tabs (`4` for 3D) and TTS uses the GPU.
  - **Diff-scoped golden gate:** `scripts/golden_gate.py` inspects `git diff` against `main` — changes in shared atoms trigger a full golden compare, changes inside `src/visuals/<type>/` run `--types <type>`, and data/docs-only changes run `--type -`. Use `make golden-type T=<type>` while iterating on a single visual type, and `FULL=1 make test` for a full sweep.
  - When changing a visual's large font size, render one still multiple times and compare decoded MD5s to catch non-deterministic glyph rasterization.

## Feature Flags & Styles
- `NARRATE_FEATURES` (or `--features a,b` on `explainer.py`) controls `arabic`, `3d`, `svg`, and `transcripts` (default on; negate with `-transcripts`). `FEATURES` in `skills/explainer-video/features.py` is the canonical registry.
- Audience styles live in `skills/explainer-video/styles/<name>.json` + `<name>.md` (`STYLE_NAMES` in `src/styles.ts` must match the directory). Fact ledgers (`<workdir>/ledger.json`) and meeting transcripts (`explainer.py transcript`, `explainer.py report`) are validated inside `src/ledger.ts` and `transcript.py`/`report.py` with workdir confinement and Markdown/HTML escaping.
