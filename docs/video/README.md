# Demo videos

Four demos rendered with `explainer-video` in the default **`cel-sky`** theme:

- **`all-visuals-2d.mp4`** — all 16 supported 2D visual types (`title`, `bullets`, `compare`, `steps`, `flow`, `fanout`, `table`, `graph`, `sequence`, `class`, `mermaid`, `timeline`, `code`, `stat`, `svg`, `callout`).
- **`all-visuals-3d.mp4`** — all 13 supported 3D visual types (`title`, `bullets`, `compare`, `steps`, `flow`, `fanout`, `table`, `graph`, `sequence`, `class`, `mermaid`, `layers3d`, `callout`).
- **`arch-overview-2d.mp4`** — 7-scene architectural overview of `narrate-mlx` in 2D mode.
- **`arch-overview-3d.mp4`** — the exact same 7-scene architectural overview rendered in 3D mode.

## Rebuild

From the repository root:

```bash
python3 skills/explainer-video/explainer.py all docs/video --features 3d,svg
```

Scripts are in [`scripts/`](scripts/) and generated transcripts are in [`transcripts/`](transcripts/).
