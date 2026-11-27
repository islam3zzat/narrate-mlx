---
name: add-visual
description: Design, scaffold, implement, and visually verify a new reusable visual type for explainer-video (such as animated algorithm families) using the canonical Visual SDK and zero-TTS contact-sheet checks.
argument-hint: "[visual-slug] [--template basic|algo]"
allowed-tools: Bash(python3:*), Bash(make:*)
---

# add-visual

Creates a new reusable or ad-hoc, narration-synced visual type for `explainer-video` using the Visual SDK (`src/sdk/`) and zero-TTS contact-sheet verification.

Arguments: `$ARGUMENTS`

`<ev>` below means the `explainer-video` skill directory next to this one (`<this-skill-dir>/../explainer-video`). Substitute its absolute path.

## Where to save (Local ad-hoc vs Built-in)

- **Ad-hoc / user-local (`--local`, default):** saves into **`~/.config/explainer-video/visuals/<slug>/`** (overridable via `$EXPLAINER_USER_VISUALS_DIR`) and mirrors automatically into gitignored `src/visuals-local/` at run time. Use this for topic-specific or experimental visuals (such as map coloring theory, bespoke domain simulators, or one-off proofs) so the repository stays clean with zero git noise.
- **Built-in (`--builtin` or `visual promote <slug>`):** saves into `<ev>/src/visuals/<slug>/` and updates `SKILL.md` / JSON schemas. Use only for broadly reusable visual families meant to be committed to `narrate-mlx` (like `array-algo` or `graph-algo`).
- **Never** place `.ts` / `.tsx` visuals inside `<workdir>`.

## Steps

1. **Design Gate (prevent visual sprawl).** Before scaffolding anything:
   - Check `<ev>/SKILL.md` (`<!-- visuals:begin -->`) and `python3 <ev>/explainer.py visual list` to confirm no existing built-in or user-local visual type already covers the need.
   - Design a **parameterized, data-driven visual** (never hardcode scene strings inside TSX), choose a lowercase slug (`^[a-z][a-z0-9-]{1,31}$`), and define strict Zod limits (`maxItems`, `maxStates`, `displayCells`, `textCharIssues`).

2. **Scaffold the visual directory:**
   ```bash
   python3 <ev>/explainer.py visual init <slug> [--template basic|algo] [--local | --builtin]
   ```
   Defaults to `--local` (`~/.config/explainer-video/visuals/<slug>/`). Use `--template algo` for state-machine / animated algorithm visuals (`steps[]` synced to narration). Either mode creates `{capabilities,schema,semantics,meta,catalog}.ts` + `View2D.tsx` using identical `../../sdk/*` imports. The scaffold sources live in `<ev>/templates/visual/<basic|algo>/*.tmpl` (`__SLUG__`/`__PASCAL__` placeholders) and are type-checked by `test_visual_host.py`.

3. **Author exclusively against `src/sdk/*`:**
   - **Pure files (`capabilities.ts`, `schema.ts`, `semantics.ts`, `meta.ts`, `catalog.ts`, optional `compute.ts`)** import only from `../../sdk/pure` (and `../../sdk/algo-math` for algorithm math):
     - `z`, `text`, `ID`, `GRAPH_TONES`, `displayCells`, `textCharIssues`, `bidiIn`, `fresh`, `lintOrderedSlots`, `lintRtlAndBidi`, `NO_LINT`, `niceTicks`, `formatNumber`, `Capabilities`, `Meta`, `Semantics`, `CatalogEntry`.
     - `schema.ts` must keep `export {<Name>Visual as schema};`.
     - `catalog.ts` should include at least a `default` variant (and ideally a `paper`-theme showcase variant).
   - **2D View (`View2D.tsx`)** imports from `../../sdk/view2d` (and `../../sdk/algo-math` + `../../sdk/algo-2d` for algorithm visuals):
     - `SceneCanvas`, `useStableId`, `useTheme`, `useRtl`, `useBox`, `box`, `Heading`, `prog`, `inStyle`, `at`, `mixHex`, `useFocus`, `look`, `partIn`, `PlotAxes`, `interpolate`, `spring`, `Easing`, `useVideoConfig`, `View2DProps`.
     - **Algo Kit (`algo-math` / `algo-2d`):** `stepTimeline`, `stepActiveIntervals`, `interpolateKeyedPositions` (opposing swap arcs), `computeArrayLayout`, `stackPointers`, `formatCompactNumber`, `AlgoCell`, `AlgoBar`, `PointerBadge`, `WindowBracket`, `AuxStrip`, `StepIndicator`.

4. **Run zero-TTS visual verification:**
   ```bash
   python3 <ev>/explainer.py visual check <slug>
   ```
   For `--builtin` visuals, run `make docs` first if docs/schema changed. `visual check` syncs user-local visuals automatically, runs `tsc --noEmit`, `check-generated`, `cli.ts lint-visual <slug>` (AST hygiene + catalog schema/semantics/lint), renders a multi-frame `cel-sky` + `paper` (and `rtl` if supported) contact sheet at `<ev>/out/visual-check/<slug>.png`, and verifies double-render pixel-MD5 determinism.

5. **Inspect the contact sheet (mandatory):**
   - Open and visually inspect `<ev>/out/visual-check/<slug>.png`.
   - Check every tile for: text clipping/overflow, pointer badge collisions, swap-arc vertical headroom, contrast on `cel-sky` and `paper`, and clean fade-in/settled states. Fix any layout defect in `~/.config/explainer-video/visuals/<slug>/` (or `src/visuals/<slug>/` for built-ins) and re-run `visual check` until spotless.

6. **Promote or test:**
   - Ad-hoc user-local visuals (`--local`) work immediately in `explainer.py check / audio / render / still / catalog` and need no repo edits or `make test`.
   - To promote a user-local visual into the built-in library later, run `python3 <ev>/explainer.py visual promote <slug>`, add unit tests (`test_<slug>.py` / `tests/vectors/<slug>.test.ts`) + corpus script/goldens, and run `make test`.

## Invariants Checklist (Enforced by `visual-lint.ts`)

- **Pure/React separation:** Pure `.ts` files must never import `react`, `remotion`, `three`, `*.tsx`, or `src/sdk/{view2d,algo-2d}`.
- **Deterministic frame rendering:** Take `frame` from props (never `useCurrentFrame()` or `useFrame`); no `Math.random`, `Date.now`, `new Date`, `performance.now`, `Intl`, `toLocaleString`, `setTimeout`, `requestAnimationFrame`, `fetch`, or CSS `transition`/`animation`.
- **Theme tokens only:** Use `useTheme().C` tokens and `mixHex` only — zero raw `#hex`, `rgb()`, or `hsl()` literals; valid `C.<key>` names only.
- **Safe SVG IDs & fonts:** Always use `useStableId(prefix)` for `<clipPath>` / `<mask>` / `<marker>` / gradient IDs (never static string literals); keep `fontSize <= 150`.
- **Narration alignment:** Every revealed item/step `label` must match spoken narration via `lintOrderedSlots` in `meta.ts` (`semantics.ts` order = spoken order).
