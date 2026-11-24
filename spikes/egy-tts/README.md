# Egyptian Arabic TTS bake-off (spike)

Throwaway comparison of Egyptian-capable TTS models on Apple Silicon. Not part of the skills; nothing here touches `skills/speak`.

## Layout
- `sentences.json`: 10 test sentences (short, explainer, numbers, qaf, code-switching, long, diacritized, prosody).
- `bench.py`: stdlib driver. Loads an engine, synthesizes every sentence, writes `out/<engine>/<id>.wav` and `results.json` (generation time, audio length, RTF).
- `engines/<name>/`: one uv project per engine (their torch/transformers pins conflict), each with `engine.py` exposing `load() -> synth(text, out_path)`.

## Run
```
cd spikes/egy-tts
uv run --project engines/voicetut python bench.py voicetut [--ids greet,qaf]
uv run --project engines/namaa    python bench.py namaa
```
Don't run two engines at once (shared GPU, 32 GB machine).

## Engines
| Engine | Model | Notes |
|---|---|---|
| `voicetut` | `mohammedaly22/VoiceTut-TTS` (OmniVoice fine-tune) | OmniVoice's pyproject forces a CUDA-only torch index; `[tool.uv] no-sources = true` overrides it. Speaker `Mohammed`. |
| `namaa` | `NAMAA-Space/NAMAA-Egyptian-TTS` (Chatterbox Multilingual T3 weights) | Needs `setuptools<81` or the Perth watermarker is `None`. torchaudio writes float WAV by default; engine forces 16-bit. |

Not yet set up: EGTTS / NileTTS (XTTS v2, Coqui, heavy), Habibi (no checkpoint confirmed), Fish Speech.

## Caveats
- First sentence includes MPS warm-up, so its RTF is inflated.
- The model cards' own quality numbers (VoiceTut WER 0.40) are from a T4, not this machine.
- Word timings: none of these emit them. `explainer-video` would need the Qwen3 forced aligner (untested on Arabic) or an even spread.

## Results (2026-11-20, listened by the user)
**Egyptian:** NAMAA is bad; VoiceTut is much better and is the pick. RTF about 0.7-1.4 on M1 Max after warm-up (first call ~30 s cold).

**MSA** (`sentences_msa.json`, 8 sentences, bare and hand-vowelled variants, `out/msa/<config>/`):
| Config | RTF | Verdict |
|---|---|---|
| silma-tashkeel | 0.48 | **best** (CATT off, hand-vowelled text) |
| silma-bare | 0.45 | SILMA's own CATT diacritizer put wrong case endings on some words |
| nabra-tashkeel | 0.12 | fastest; needs vowelled input |
| voicetut-bare / -tashkeel | 0.99 | not preferred for MSA |

Setup notes for SILMA: `onnxruntime-gpu` swapped for `onnxruntime`; NeMo normalizer stubbed (pynini won't build), so digits are not expanded; it clones the bundled Arabic reference voice (`SILMA_FORCE_TASHKEEL=0` to speak text as given).
