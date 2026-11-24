---
name: speak
description: Read text aloud with natural local text-to-speech (Kokoro for English, SILMA for Modern Standard Arabic, on Apple Silicon). Use when the user says "speak", "read this aloud", "read it to me", or wants a summary or file spoken. Markdown is handled (syntax not read, code blocks skipped). Long text opens a window with the spoken word highlighted, click-to-seek, pause and speed controls.
argument-hint: "[text or file path] [--lang en|ar] [--voice af_heart] [--speed 1.0]"
allowed-tools: Bash(command -v uv), Bash(uv sync:*), Bash(uv run:*)
---

# speak

Reads text aloud. The whole project (code, `pyproject.toml`, `uv.lock`) lives in this skill's own directory, so it works from anywhere and can be copied to another Mac.

Arguments: `$ARGUMENTS`

`<skill-dir>` below means this skill's base directory: the directory that contains this SKILL.md. Substitute its absolute path in every command.

## Steps

1. **Pick the input** from the arguments:
   - A path to an existing file → read that file aloud.
   - Text → read that text aloud.
   - Nothing → read your previous reply aloud, as written (Markdown is fine).
   - Flags (pass them through unchanged):
     - `--lang en|ar` (default `en`; nothing else is accepted), `--voice` (en default `af_heart`; ar default `default`), `--speed` (default `1.0`), `--out file.wav` (save instead of playing), `--timings file.json` (also save each word's start and end time).
   - `--lang ar` is Modern Standard Arabic (SILMA TTS). Use it when the text is Arabic. `--model` is `kokoro` for en and `silma` for ar (the default; a mismatch is an error). `--diacritize` lets SILMA add diacritics itself (worse than writing them). `--voice` for ar is `default` (bundled voice) or a path to a reference WAV (about 8 s; put its transcript in a `.txt` with the same name, otherwise SILMA transcribes it).
   - Voices (en): `af_*`/`am_*` are US, `bf_*`/`bm_*` are UK. Examples: `af_heart`, `af_bella`, `am_michael`, `bf_emma`, `bm_george`. The first letter must be `a` or `b`.

2. **Run it in the background** (`run_in_background: true`). It blocks until playback ends, and long text opens a window that stays open. Do not sync first: `--no-sync` skips it, and step 4 covers the case where the environment is missing or broken.

   From a file:

   ```bash
   uv run --no-sync --project <skill-dir> python <skill-dir>/speak.py [flags] < /path/to/file
   ```

   From text, via a quoted heredoc so no quoting or escaping can break the text:

   ```bash
   uv run --no-sync --project <skill-dir> python <skill-dir>/speak.py [flags] <<'SPEAK_EOF'
   ...text...
   SPEAK_EOF
   ```

   `--out` writes the file and returns quickly, so run that one in the foreground.

3. **Check the result** (for a background run, once it finishes, read its output). If it played, go to step 6. If it failed, go to step 4.

4. **Recovery, only if the run failed** with a missing environment, `ModuleNotFoundError`, `No module named`, or a missing interpreter or `.venv`:
   - Check that `uv` is installed: `command -v uv`. If it is missing, tell the user to install it (`brew install uv`) and stop. Do not install it for them.
   - Sync the environment, then run step 2 again once. The first sync on a machine installs the dependencies, which takes a few minutes, and the first speech then downloads the model.

     ```bash
     uv sync --quiet --project <skill-dir>
     ```

     Arabic has its own environment, `<skill-dir>/silma`; `speak.py --lang ar` syncs it by itself on each run (with `--system-certs` as a retry behind a TLS-inspecting proxy).

   - If the sync fails, show the error and stop. If the retry fails with something else, show the error and stop. Other failures (bad voice name, no text) are not fixed by syncing: report them.

5. **Arabic rules** (`--lang ar`). SILMA reads what is written, so prepare the text first:
   - Write it with full diacritics (tashkeel), e.g. `مَرْحَبًا بِكُمْ فِي هَذَا الشَّرْحِ`. Undiacritized text is spoken, but with wrong vowels and case endings; a warning is printed. SILMA's own diacritizer is off by default because it makes case-ending mistakes.
   - Write numbers, times and amounts as Arabic words (`مِئَتَيْنِ وَخَمْسِينَ`, not `250`): digits are not expanded.
   - No Latin letters: transliterate or translate terms, and spell acronyms in Arabic script (`إِيه بِي آي`).
   - Arabic punctuation (`،` `؛` `؟`) is kept and shapes the pauses. Markdown works as for English.
   - The first run downloads the SILMA model and vocoder (hundreds of MB); generation is about 2x real time on an M1 Max.
   - Timings (`--timings`): see below.

6. **Reply in one or two lines.** Say what is being read and which voice. Do not repeat the text. For over 100 words (or 500 characters), mention the window: click a word to jump to it, space or the button pauses, the bar changes playback speed.

## Timings file (`--timings file.json`)

`{"model": "kokoro"|"silma", "voice", "speed", "approx": false|true, "words": [{"w", "start", "end"}]}`, times in seconds into the saved WAV.
- en (Kokoro): real per-token times; punctuation is its own token.
- ar (SILMA): SILMA gives no word times and Qwen3-ForcedAligner does not support Arabic, so times are **estimated** (`approx: true`): pauses are found from the audio energy and the words are spread over the speech by letter count (diacritics not counted). Pause positions are real; the placement of words within a stretch of speech is proportional, typically off by under a few tenths of a second. The tokens are the whitespace-split words of the spoken text with punctuation attached (`الْمُبَسَّطِ.` is one token), unlike Kokoro. Consumers that map tokens onto text should match by words, not expect separate punctuation tokens.

## Notes

- Apple Silicon Macs only: Kokoro runs on MLX, SILMA on MPS/CPU, and the window uses PyObjC. Arabic text opens the window right to left.
- The first run downloads the Kokoro model (~160 MB).
- Generation takes a few seconds before audio starts. The window opens after generation, not before.
- If audio plays but no window appears, there is no GUI session (for example over SSH). Audio-only still works.
- Nothing needs installing besides `uv`: no Homebrew packages.
