---
name: add-style
description: Create a custom explainer-video style profile (<name>.json, <name>.md playbook, and skeleton template) by interviewing the user about audience, tone, pacing, rules, and sections, then validating with explainer.py.
argument-hint: "[style-name] [--workdir DIR]"
allowed-tools: Bash(python3:*)
---

# add-style

Creates a custom audience/purpose style for `explainer-video` without editing TypeScript source.

Arguments: `$ARGUMENTS`

`<ev>` below means the explainer-video skill directory next to this one (`<this-skill-dir>/../explainer-video`). Substitute its absolute path.

## Steps

1. **Inspect the schema and an existing style.** Run:
   ```bash
   python3 <ev>/explainer.py schema --style
   ```
   Also read `<ev>/styles/quick-brief.json` and `<ev>/styles/quick-brief.md` as a reference for tone, fields, and playbook structure.

2. **Interview the user** (concisely, in one or two rounds) to gather:
   - **Name** (slug matching `[a-z0-9][a-z0-9-]*`, max 40 chars, e.g. `design-review`) and **description** / **audience**.
   - **Pacing & defaults**: speaking `speed` (`0.75`–`1.5`, default `1.0`), optional `voice`, target `scenes` `[min, max]`, `seconds` `[min, max]`, and `wordsPerScene` `[min, max]`.
   - **Preferred visuals**: which visual types (`bullets`, `compare`, `steps`, `flow`, `graph`, `sequence`, `code`, `stat`, `timeline`, `table`, `callout`, `mermaid`, etc.) fit best.
   - **Fact ledger & lint rules**: whether `ledger.json` is required (`ledger.required`), which fact kinds to cover (`mustCover`, `coverHigh`, `quoteKinds`, `allowDeferred`), and whether `lint.blameless` should be enabled.
   - **Sections**: optional ordered list of `section` tags (e.g. `["context", "options", "decision", "next"]`).

3. **Choose where to save the style:**
   - **Shared across all projects on this Mac (recommended)**: `~/.config/explainer-video/styles/<name>.json` and `<name>.md`.
   - **This project only**: `<workdir>/styles/<name>.json` and `<name>.md`.
   - **Built-in repo style** (if contributing to `narrate-mlx`): `<ev>/styles/<name>.json`, `<ev>/styles/<name>.md`, and `<ev>/templates/style-<name>.json`.

4. **Write the files:**
   - `<name>.json` conforming to `explainer.py schema --style` (where `"name"` matches the filename stem).
   - `<name>.md` playbook documenting the audience, pacing, preferred visuals, section flow, and narration rules.
   - A skeleton script template (`<ev>/templates/style-<name>.json` if built-in, or `<workdir>/scripts/example.json` if testing in a workdir).

5. **Validate:**
   - Confirm discovery: `python3 <ev>/explainer.py styles` (pass `--workdir <workdir>` if project-local).
   - Run `python3 <ev>/explainer.py check <workdir>` on a test or skeleton script with `"style": "<name>"` and verify zero errors.
