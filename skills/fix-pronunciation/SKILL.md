---
name: fix-pronunciation
description: Fix a word the explainer-video voiceover pronounced wrongly (spelled letter by letter, wrong stress, "URLS" for URLs) and remember the fix for every future video. Use when the user says a word was mispronounced or spoken wrong in a video, says "say X like Y", "it should be pronounced...", wants to teach the voice a term, or asks what pronunciations have been learned.
argument-hint: "[word] [how it is spoken] [--workdir DIR] [--project]"
allowed-tools: Bash(python3:*)
---

# fix-pronunciation

Teaches the explainer-video voiceover how to say a word, and remembers it so the mistake never comes back. It wraps `explainer.py pronounce`, which lives in the sibling `explainer-video` skill.

Arguments: `$ARGUMENTS`

`<ev>` below means the explainer-video skill directory next to this one (`<this-skill-dir>/../explainer-video`). Substitute its absolute path.

## Steps

1. **Get the word and offer variants for the user to decide.** Never pick the spoken form yourself and never save before the user has chosen. If the user describes a problem but gives no spelling ("too much stress on the M", "PKCE sounded wrong"), or asks for options, do this:
   1. Stop any render or audio job that is running (`pkill -f "explainer.py"`, `pkill -f "remotion render"`), because the audio is about to change.
   2. Write **three** candidate spoken forms that differ in a way that could fix the complaint (for example hyphenated `M-C-P`, plain words `em see pee`, hyphenated syllables `em-see-pee`). Keep them genuinely different.
   3. Synthesize each one **without saving anything**, in the voice the videos use (default Kokoro `af_heart`), inside one sentence taken from the real scripts that contains the word, and starting with the spoken label "Variant 1." and so on, via `explainer.py pronounce --synth-out`:

      ```bash
      mkdir -p <workdir>/out/<word>-variants
      python3 <ev>/explainer.py pronounce --synth-out <workdir>/out/<word>-variants/variant-1.wav "Variant 1. Managed M-C-P servers."
      ```
   4. Play them one after another with `afplay` in a background command (`run_in_background: true`), then show the user a short table of variant number and spoken form, and mention the WAV folder so they can replay them.
   5. Wait for the user's pick. If none works, ask what is still wrong and generate a new set of three. Only then continue to step 2. If the user already gave an exact spelling, skip the variants and go straight to step 2.

   If the user gave only the word and wants a single suggestion, propose the form people in that field really say and confirm it in one line before saving. Write the spoken form so the voice reads it correctly:
   - A word said as a word: spell it phonetically with ordinary words or hyphenated syllables: `pixie`, `jot`, `sam-ul`, `sea surf`, `jay-son`.
   - Letters said one by one: write the acronym itself in capitals and map it to itself (`URL` -> `URL`). Kokoro spells a plain ALL-CAPS acronym naturally, with one stress at the end (`API` is ay-pee-EYE). Never respell it with spaces (`A P I`): the phonemizer then reads the "A" as the article "uh" and stresses every letter, which sounds choppy. If a bare acronym is read as a word (`GA` is "gah"), use dots: `G.A.`.
   - Do not write plurals. They are derived automatically (`URL` gives `URLs`, which Kokoro reads correctly; `pixie` gives `pixies`). Give a plural entry only when the derived one is wrong.
   - Hyphenated letters are not a fix either (`M-C-P` comes out as "em-see-pee" with the wrong stress). Check by listening, or inspect the phonemes with misaki, rather than guessing.

2. **Choose where it is saved.**
   - Default: shared with every project on this Mac (`~/.config/explainer-video/pronounce.json`). Use this unless the word means something different elsewhere.
   - `--project --workdir <workdir>`: only for this project's `pronounce.json`, for a word that is special only here.

3. **Save it, and report which scenes it touches.** Pass `--workdir <workdir>` when the user is working on a video project (the current one, or the folder with `scripts/`):

   ```bash
   python3 <ev>/explainer.py pronounce <word> "<spoken form>" --workdir <workdir> --preview
   ```

   `--preview` speaks the new form aloud first, so the user can approve it before a long render. If they dislike it, run the command again with another spelling: it replaces the old entry. When the user chose a variant in step 1 you can leave `--preview` out, since they have already heard it.

4. **Redo only what changed.** Re-run the audio and render; only scenes whose spoken text changed are re-synthesized. Run it in the background (a render takes a few minutes):

   ```bash
   python3 <ev>/explainer.py all <workdir>
   ```

   Then tell the user which scenes to listen to again (the command in step 3 printed them).

5. **Offer to promote it.** If the term is useful to everyone and not just this machine, offer to add it to the built-in `PRONOUNCE` table in `<ev>/pronounce.py` so it ships with the repo.

## Other uses

- `python3 <ev>/explainer.py pronounce --list`: show what has been learned (add `--project --workdir <workdir>` to include that project's entries).
- `python3 <ev>/explainer.py pronounce --remove <word>`: forget a mapping.
- Do not guess at a mapping the user has not confirmed. A wrong one is saved for every future video. When in doubt, give the user three audible variants and let them decide (step 1).
- Ask the scope question (shared or this project only) in the same prompt as any other choice, with the shared option marked recommended, rather than assuming it.

The check and audio steps of explainer-video already warn about ALL-CAPS and camelCase words with no entry and print the exact command to fix them, so a warning is a good moment to use this skill.
