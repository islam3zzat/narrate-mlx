# narrate-mlx

Three [Claude Code](https://claude.com/claude-code) skills that run entirely on your Mac, with no cloud TTS and no API keys:

- **`/speak`** reads text aloud with natural local text-to-speech, in English or Modern Standard Arabic. A better replacement for macOS `say`. Long text opens a read-along window with the spoken word highlighted.
- **`/fix-pronunciation`** teaches the explainer voice how to say a word (PKCE is "pixie") and remembers it for every future video.
- **`/explainer-video`** turns a topic, notes or a document into a narrated MP4 with animated diagram scenes, in 2D or 3D, in English or Arabic. It writes the script, generates the voiceover with `speak`, and renders with [Remotion](https://www.remotion.dev/).

The repo is self-contained: `explainer-video` finds `speak` next to it, so there is nothing else to clone or configure.

## See it in action

All four demos were made with `/explainer-video` in the default **`cel-sky`** theme, with Kokoro-82M voiceover on Apple Silicon and Remotion 4.0.290:

| Demo | Mode | Length | Video |
|---|---|---|---|
| **All visuals (2D)** — 16 of the 2D visual types | 2D | 1 min 57 s | [all-visuals-2d.mp4](docs/video/all-visuals-2d.mp4) |
| **All visuals (3D)** — 13 of the 3D visual types | 3D | 1 min 30 s | [all-visuals-3d.mp4](docs/video/all-visuals-3d.mp4) |
| **Architectural overview (2D)** — how `narrate-mlx` works | 2D | 1 min 09 s | [arch-overview-2d.mp4](docs/video/arch-overview-2d.mp4) |
| **Architectural overview (3D)** — exact same script in 3D | 3D | 1 min 09 s | [arch-overview-3d.mp4](docs/video/arch-overview-3d.mp4) |









| All visuals (2D) | All visuals (3D) |
|---|---|
| https://github.com/user-attachments/assets/c5f12f52-8d4f-49ac-959d-280b1cd84318 | https://github.com/user-attachments/assets/ca9ae45e-889a-48eb-b480-80c552d95e0a |

| Architectural overview (2D) | Architectural overview (3D) |
|---|---|
| https://github.com/user-attachments/assets/fa569e99-928f-4610-bbea-281de6da7488 |  https://github.com/user-attachments/assets/483a5f1b-c8e5-4905-ae12-55cde0830c73 |

Scripts, transcripts and rebuild steps are in [`docs/video/`](docs/video/).

You can also browse every visual type and showcase variant interactively in the [Visual Catalog](https://islam3zzat.github.io/narrate-mlx/) (hosted on GitHub Pages via Remotion Studio).

## Requirements

- An Apple Silicon Mac (the TTS stack uses MLX and PyObjC)
- [`uv`](https://docs.astral.sh/uv/), [Node.js](https://nodejs.org/), and `ffmpeg` (`brew install uv node ffmpeg`)
- Chrome or Edge, recommended for video rendering (otherwise Remotion downloads its own browser, which can fail behind a proxy)

## Quick start

```bash
git clone https://github.com/islam3zzat/narrate-mlx.git ~/projects/narrate-mlx
cd ~/projects/narrate-mlx
make setup      # install dependencies (a few minutes the first time)
make install    # link the skills into ~/.claude/skills and ~/.agents/skills
make doctor     # check that everything works
```

Then, in Claude Code from any directory:

```
/speak read your last answer aloud
/explainer-video make a 2 minute explainer of ./notes.md
```

Keep the checkout path short (see [Troubleshooting](#troubleshooting)).

## `/speak`

```
/speak [text or file path] [--voice af_heart] [--speed 1.0]
```

With no argument it reads Claude's previous reply. Markdown is handled: syntax is not read and code blocks are skipped. Over about 100 words it opens a window where you can click any word to jump there, pause/replay with Space, skip sentences with Left/Right, change speed with Up/Down or the bar (`0.75x` to `2x`, effective rate shown), scroll freely (pauses auto-scroll for 3 s), and close with `Cmd+Q`, `Cmd+W`, or `Esc`.

You can also use it from a shell, without Claude:

```bash
cd skills/speak
uv run python speak.py "Hello there"
uv run python speak.py --voice bm_george < notes.md
uv run python speak.py --out hello.wav "Save this instead of playing it"
uv run python speak.py --out hello.wav --timings hello.json "Also save word times"
```

It uses Kokoro-82M (about 160 MB), which gives real per-word timing for the highlighting. Voices: `af_*`, `am_*` (US) and `bf_*`, `bm_*` (UK), default `af_heart`.

**Arabic** (`--lang ar`, Modern Standard Arabic, not a dialect) uses SILMA TTS v1 in its own environment (`skills/speak/silma`). It reads text exactly as written, so write it fully vowelled (tashkeel) and spell numbers out as words. The voice is `default` or a reference recording you pass with `--voice ref.wav` (about 8 s, transcript in `ref.txt`). Word times for the highlighting are estimates, and the window lays text out right to left.

```bash
echo "مَرْحَبًا بِكُمْ." | uv run python speak.py --lang ar
```

Models download on first use and are cached in `~/.cache/huggingface`.

## `/explainer-video`

```
/explainer-video [topic or file path] [--voice af_heart] [--speed 1.0] [--workdir DIR]
```

Claude reads your source, plans one to a few short videos (60 to 150 seconds, 5 to 10 scenes each), writes a JSON script, checks it, generates the audio, previews a few scenes as stills, and renders MP4s into `<workdir>/out/`. Narration is timed to the visuals, with captions, at 1920x1080 and 30 fps.

A script is plain JSON: one narration line and one visual per scene.

```json
{"title": "How an API gateway handles a request", "scenes": [
  {"id": "s01",
   "narration": "A request passes through three stages.",
   "visual": {"type": "flow", "heading": "The path of a request", "nodes": [
     {"label": "Client"}, {"label": "Gateway"}, {"label": "Service"}]}}
]}
```

Visual types: `title`, `bullets`, `compare`, `steps`, `flow`, `fanout`, `table`, `callout`, `timeline`, `code`, `stat`, `plot2d`, `linked-plot`, `cancellation-grid`, `field2d`, `chart`, `ablation`, `matrix`, `equation`, `figure`, `array-algo`, `graph-algo`, `surface3d` (`3d`), `layers3d` (`3d`), `svg` (behind the `svg` flag), and diagrams: `graph` (boxes and arrows), `class` (UML), `sequence`, and `mermaid` for everything else (state, ER, gantt, timeline, mindmap, pie, flowcharts that loop). See [`skills/explainer-video/SKILL.md`](skills/explainer-video/SKILL.md) for the fields each takes and the narration guidelines, and [`templates/example.json`](skills/explainer-video/templates/example.json) for a full example.

### Diagrams that follow the narration

- **Reveal:** bullets, steps, nodes and messages appear as the narration names them, matched against the voiceover's per-word timing.
- **`focus`:** a scene field that points at parts of a diagram when a phrase is spoken (`{"at": "the cache", "on": ["cache"]}`). Those parts stay bright and everything else dims; a crowded diagram also zooms in, and a named arrow gets a token travelling along it.
- **`continues`:** carries the previous scene's diagram across the cut. Shared parts glide to their new places and only new ones are revealed, for a story that grows a structure step by step.
- **Mermaid `build`:** `"build": true` builds up any mermaid diagram as it is narrated. Nodes pop in, arrows draw themselves in, gantt bars grow, and pie slices and timeline events appear in turn. Only turn `build` on when the narration walks every part in order with time left to read the full diagram; otherwise omit it so the whole graph stays visible from frame 0. `focus` works on it too.

### 3D mode

Set `"mode": "3d"` in the script to draw every scene in 3D. Depth carries meaning rather than decoration: steps become a staircase, a graph stands on terraces by rank, a sequence runs into depth over time, and `layers3d` (3D only) stacks an architecture or protocol stack. A 2-minute 3D video renders in about 4 minutes.

### Themes

Set `"theme"` at the top of a script to switch visual themes (works in both 2D and 3D modes, including custom `svg` scenes):

- **`cel-sky`** *(default)* — 2.5D cel-shaded sky theme: cel-painted sky gradient with diagonal sunlight shafts and subtle receding horizon grid, three-tone directional cel shading on 3D blocks, dark indigo ink outlines and shadows, skewed top bar badges, and a dark indigo caption bar. Used automatically when `"theme"` is omitted.
- **`paper`** — the original flat neo-brutalist theme: dotted paper background, pure black 4px borders, hard offset shadows, and yellow/pink/green accents (`"theme": "paper"`).

### Arabic videos

Set `"language": "ar"` (or start with `explainer.py init <workdir> --lang ar`). Narration is spoken by SILMA (see [`/speak`](#speak)), and every layout is mirrored right to left with an Arabic font (Cairo). Mermaid scenes are the exception: they are not mirrored.

### Running the pipeline by hand

You can drive the pipeline directly too. Each project lives in a *work directory* of your choosing, never inside the repo:

```bash
E=skills/explainer-video/explainer.py
python3 $E init  ~/videos/demo        # creates scripts/example.json to start from (--lang ar for Arabic)
python3 $E check ~/videos/demo        # validate scripts, no audio
python3 $E all   ~/videos/demo        # audio + render (or run audio / render separately)
python3 $E still ~/videos/demo example --scene s03   # PNG of one scene, to check layout
python3 $E studio ~/videos/demo example              # live preview in Remotion Studio
python3 $E review ~/videos/demo example              # contact sheet: frames from every scene in one image
```

Audio is cached per scene, so editing one line only regenerates that scene. Pronunciation fixes for acronyms (MCP, API, ...) apply to the voice only; add your own in `<workdir>/pronounce.json`.

Not suited to real footage, screen recordings or presenters on camera.

## `/fix-pronunciation`

```
/fix-pronunciation [word] [how it is spoken] [--workdir DIR] [--project]
```

Sample prompt:
```
/fix-pronunciation fix how PKCE was pronounced
```
The previous prompt would be enough for well-known terms.


You can also ask for variants and decide on one of them:
```
/fix-pronunciation MLX in docs/video it's spelled out but I want it said "em-el-ex", give me 6 variants
```

Text-to-speech guesses how to say a word, and it guesses wrong for jargon. **PKCE** gets spelled out as "P K C E", **JWT** the same, and plurals like **URLs** come out as "URLS". People say "pixie" and "jot", so the video sounds off. This matters most for videos full of technical terms (security, protocols, product and library names, anything with no intuitive pronunciation).

Tell Claude what went wrong ("PKCE sounded wrong") or give the fix directly (`/fix-pronunciation PKCE pixie`). If you only describe the problem, it synthesizes three candidate spellings in the video's voice, plays them, and saves the one you pick. Then re-run the audio: only the scenes that contain the word are re-voiced.

- **Remembered everywhere.** The fix goes to `~/.config/explainer-video/pronounce.json` and applies to every future video on this Mac. Use `--project --workdir DIR` to keep it in that project's `pronounce.json` instead, for a word that is special only there (this repo's own videos do that for `narrate-mlx`).
- **Voice only.** Captions and transcripts keep the original spelling.
- **Plurals are automatic.** `URL` gives `URLs`, and the voice reads it correctly.
- **You get warned in advance.** `explainer.py check` and `audio` flag ALL-CAPS or camelCase words with no entry (gRPC, mTLS, SQL) and print the exact command to fix them.

Write the spoken form phonetically for a word said as a word: `pixie`, `jay-son`. Acronyms said letter by letter (API, URL, SDK) need nothing: the voice already spells a plain ALL-CAPS acronym naturally, so don't respell it with spaces (`A P I` is read "uh pee eye"). Without the skill:

```bash
python3 skills/explainer-video/explainer.py pronounce PKCE pixie --workdir ~/videos/demo
python3 skills/explainer-video/explainer.py pronounce --list
python3 skills/explainer-video/explainer.py pronounce PKCE --remove
```

## Make targets

| Command | What it does |
|---|---|
| `make setup` | Installs dependencies: `uv sync` for `speak`, `npm ci` for `explainer-video`. Retries with system TLS certificates if `uv` fails behind a proxy. |
| `make install` | Symlinks each folder in `skills/` into `~/.claude/skills` and `~/.agents/skills`. Safe to re-run. |
| `make uninstall` | Removes those symlinks (only links that point into this repo, from every known agent skills folder). |
| `make doctor` | Checks tools, the Python and Node environments, the checkout path length, and that every skill link works. Exits non-zero on problems. |
| `make catalog` | Opens the interactive Remotion Studio **Visual Catalog** across every visual type (no `<workdir>` or audio needed). |
| `make pages` | Builds the static Remotion Studio Visual Catalog into `out/pages` (deployed to [GitHub Pages](https://islam3zzat.github.io/narrate-mlx/)). |

Options:

```bash
SKILL_DIRS="$HOME/.codex/skills" make install   # link into other agents' skill folders
FORCE=1 make install                            # replace links that point somewhere else
SMOKE=1 make doctor                             # also generate a short test speech
NARRATE_FEATURES="arabic,3d" make setup         # feature flags (off by default except transcripts; see below)
```

### Feature flags

`NARRATE_FEATURES` is a comma-separated list; everything not listed is off, except the flags marked default-on below, which a `-name` entry switches off (`--features=-transcripts`; write the `=`, because a bare `-transcripts` looks like an option to the parser). For a single task, pass `--features svg,3d` to any `explainer.py` command or to the skill (`/explainer-video <topic> --features svg`). `explainer.py features` lists the flags and which are on.

| Flag | Off means |
|---|---|
| `arabic` | `make setup` skips the SILMA environment and `make doctor` skips its checks. |
| `3d` | `explainer.py check/render/all` reject scripts with `"mode": "3d"`. |
| `svg` | `explainer.py check/render/all` reject scripts with an `svg` visual (a drawing written as strict SVG, revealed part by part; 2D only). |
| `transcripts` (default on) | `explainer.py transcript` refuses to run. On means: `explainer.py transcript meeting.vtt [--out FILE] [--force]` turns a WebVTT, SRT, Zoom or plain-text transcript (5 MB, UTF-8) into `[HH:MM:SS] Speaker: text` lines for a fact ledger's source. |

### Styles

A style is an audience/purpose profile: `explainer` (default, what a script without `style` is), `exec-overview`, `incident-review`, `status-update`, `architecture-walkthrough`, `quick-brief`. Pass `--style NAME` to the skill, or describe the audience in words and the agent picks one. `explainer.py styles` lists them; `explainer.py init <workdir> --style NAME` starts from a skeleton that passes `check`. The script's top-level `"style"` is the single source of truth. A style sets the default speaking speed (`--speed` wins), warns when scene count, length or words per scene leave its bounds, and `incident-review` turns on the blame-phrase lint. Styles for transcripts and incidents use a fact ledger (`<workdir>/ledger.json`): scenes list the fact ids they cover (`"facts": ["e01"]`), and `check` fails when a required fact is in no scene (`--strict`: when any fact is). `explainer.py report <workdir>` writes `<workdir>/report.md` from the ledger (counts, timeline, actions, decisions, contradictions, deferred facts, every fact with its quote; source text is escaped), the lossless record the incident style's closing scene points to. Each style has `styles/<name>.json` (checked by `src/styles.ts`) and a playbook `styles/<name>.md` the agent reads.

## Layout

```
skills/
  speak/            TTS skill: speak.py, mdparse.py, highlight.py, pyproject.toml, uv.lock
    silma/          Arabic backend in its own uv project (its torch/onnx pins conflict with MLX)
  explainer-video/  Video skill: explainer.py, Remotion app in src/, templates/, styles/ (audience profiles + playbooks)
scripts/            setup, install, uninstall, doctor, build-pages, golden_gate, run_pytests, lib.sh, hooks/
Makefile
CLAUDE.md           Architecture, invariants and conventions
```

`skills/speak` runs on its own with just `uv`. `skills/explainer-video` needs the sibling `skills/speak` (or `$EXPLAINER_TTS_DIR`), so copy `skills/` as a whole.

## Troubleshooting

Run `make doctor` first; it catches most of these.

- **Speech fails with `Error processing file '/Users/runner/...phontab'`.** The checkout path is too long: espeak-ng ignores its data folder when the full path to it reaches roughly 200 characters. Move the repo somewhere short, such as `~/projects/narrate-mlx`.
- **`uv sync` fails with `invalid peer certificate: UnknownIssuer`.** A TLS-inspecting proxy (for example a corporate HTTPS proxy). `make setup` retries automatically with `--system-certs`; for manual runs use `uv sync --system-certs`.
- **`node` or `npm` not found in scripts.** If you load Node through lazy nvm shell functions, scripts can't see them. `make` and `explainer.py` fall back to the newest `~/.nvm/versions/node/*`; otherwise put a real `node` on your `PATH`.
- **Remotion can't download its browser.** Install Chrome or Edge, or set `EXPLAINER_BROWSER` to a Chromium executable.
- **Mac slows down or freezes during rendering.** Renders open up to 8 Chrome tabs and TTS uses the GPU. Don't run both at once on a 16 GB machine.
- **Voiceover fails with `RemoteProtocolError: Server disconnected` (httpx).** The model's update check against Hugging Face was cut off. Once the models are downloaded, run with `HF_HUB_OFFLINE=1` (for example `HF_HUB_OFFLINE=1 python3 explainer.py audio ...`).
- **Audio plays but no window opens.** There is no GUI session (for example over SSH); audio-only still works.

## Development

[`CLAUDE.md`](CLAUDE.md) (also symlinked as `AGENTS.md`) documents the architecture, invariants, and test gates. To add a visual type, follow [`skills/add-visual/SKILL.md`](skills/add-visual/SKILL.md): scaffold with `python3 skills/explainer-video/explainer.py visual init <slug> --builtin [--template algo]` (omit `--builtin` for a user-local visual under `~/.config/explainer-video/visuals/<slug>/`), implement against `src/sdk/*`, verify with `explainer.py visual check <slug>`, and run `make docs` (regenerates the visual registries, the `SKILL.md` visuals block, and the JSON schemas; optionally place the slug in `src/visuals/order.json`). Manage Python dependencies with `uv` only; don't bump Remotion without re-testing a render, because its packages must share one version.

## License

This repository's code and documentation are licensed under the [MIT License](LICENSE). Third-party dependencies, bundled SIL Open Font License 1.1 fonts, and runtime models are subject to their respective licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (in particular, `@remotion/*` uses the Remotion License).
