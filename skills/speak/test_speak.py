"""Offline unit tests for skills/speak (mdparse, highlight helpers, CLI contracts, dynamic sample rates)."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

import numpy as np

import highlight
import mdparse
import speak

sys.path.insert(0, str(Path(__file__).resolve().parent / "silma"))
import timing_ar  # noqa: E402


class MarkdownParseTests(unittest.TestCase):
    def test_headings_lists_inline_spans_and_code_blocks(self) -> None:
        doc = (
            "# Title\n\n"
            "Read **bold** and `code` with *italics*.\n\n"
            "- first\n"
            "  1. nested\n\n"
            "```python\nprint('skip')\n```\n"
        )
        blocks = mdparse.parse(doc)
        kinds = [b.kind for b in blocks]
        self.assertEqual(kinds, ["h1", "paragraph", "list", "list", "codeblock"])
        self.assertEqual(blocks[0].speech, "Title")
        self.assertIn(("bold", "bold"), [(blocks[1].text[s:e], k) for s, e, k in blocks[1].spans])
        self.assertIn(("code", "code"), [(blocks[1].text[s:e], k) for s, e, k in blocks[1].spans])
        self.assertIn(("italics", "italic"), [(blocks[1].text[s:e], k) for s, e, k in blocks[1].spans])
        self.assertIsNone(blocks[-1].spoken_from)
        self.assertEqual(blocks[-1].speech, "")

    def test_empty_open_spans_guard_on_unbalanced_tokens(self) -> None:
        class _Tok:
            def __init__(self, t: str, content: str = "") -> None:
                self.type = t
                self.content = content

        b = mdparse._inline([_Tok("strong_close"), _Tok("text", "ok")], "", "paragraph")
        self.assertEqual(b.text, "ok")
        self.assertEqual(b.spans, [])


class HighlightHelperTests(unittest.TestCase):
    def test_utf16_offsets_handle_surrogate_pairs(self) -> None:
        text = "hi 🎉 ok"
        u = highlight._utf16_offsets(text)
        self.assertEqual(len(u), len(text) + 1)
        # 🎉 is at index 3 and takes 2 UTF-16 code units.
        self.assertEqual(u[4] - u[3], 2)
        self.assertEqual(u[-1], len(text) + 1)

    def test_seek_index_empty_and_boundaries(self) -> None:
        self.assertIsNone(highlight.seek_index([], 0))
        begins = [0, 6, 12]
        self.assertEqual(highlight.seek_index(begins, 0), 0)
        self.assertEqual(highlight.seek_index(begins, 5), 0)
        self.assertEqual(highlight.seek_index(begins, 6), 1)
        self.assertEqual(highlight.seek_index(begins, 99), 2)


class SpeakCliTests(unittest.TestCase):
    def test_rejects_mismatched_lang_model_or_diacritize_en(self) -> None:
        for argv in (
            ["speak.py", "--lang", "en", "--model", "silma", "hello"],
            ["speak.py", "--lang", "ar", "--model", "kokoro", "مرحبا"],
            ["speak.py", "--lang", "en", "--diacritize", "hello"],
            ["speak.py", "```python\nx = 1\n```"],
        ):
            with mock.patch.object(sys, "argv", argv), mock.patch.object(sys.stderr, "write"):
                with self.assertRaises(SystemExit) as cm:
                    speak.main()
                self.assertEqual(cm.exception.code, 2)

    def test_main_uses_returned_sample_rate_and_writes_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_wav = Path(tmp) / "out.wav"
            out_timings = Path(tmp) / "words.json"
            fake_audio = np.zeros(1600, dtype=np.float32)  # 0.1 s at 16 kHz
            fake_return = (fake_audio, 16000, "Hello", [highlight.Word(0.0, 0, 5)], [], "Hello", [{"w": "Hello", "start": 0.0, "end": 0.1}])
            with (
                mock.patch.object(sys, "argv", ["speak.py", "--out", str(out_wav), "--timings", str(out_timings), "Hello"]),
                mock.patch.object(speak, "synthesize", return_value=fake_return),
            ):
                speak.main()
            with wave.open(str(out_wav), "rb") as w:
                self.assertEqual(w.getframerate(), 16000)
                self.assertEqual(w.getnframes(), 1600)
            timings = json.loads(out_timings.read_text(encoding="utf-8"))
            self.assertFalse(timings["approx"])
            self.assertEqual(timings["words"][0]["w"], "Hello")


class ArabicTimingTests(unittest.TestCase):
    def test_tashkeel_ratio(self) -> None:
        self.assertAlmostEqual(timing_ar.tashkeel_ratio("مَرْحَبًا"), 0.8)
        self.assertEqual(timing_ar.tashkeel_ratio("مرحبا"), 0.0)
        self.assertEqual(timing_ar.tashkeel_ratio("... 123"), 1.0)

    def test_speech_regions_split_pauses_and_merge_short_dips(self) -> None:
        rate = 1000
        # 0.2s burst, 0.25s silence (>= MIN_GAP=0.15 -> splits), 0.15s burst, 0.05s dip (< MIN_GAP -> merges), 0.15s burst
        audio = np.concatenate([
            np.full(200, 0.5, dtype=np.float32),
            np.zeros(250, dtype=np.float32),
            np.full(150, 0.5, dtype=np.float32),
            np.zeros(50, dtype=np.float32),
            np.full(150, 0.5, dtype=np.float32),
        ])
        self.assertEqual(timing_ar.speech_regions(np.zeros(500, dtype=np.float32), rate), [])
        regions = timing_ar.speech_regions(audio, rate)
        self.assertEqual(len(regions), 2)
        self.assertAlmostEqual(regions[0][0], 0.0, places=2)
        self.assertAlmostEqual(regions[0][1], 0.20, places=2)
        self.assertAlmostEqual(regions[1][0], 0.45, places=2)
        self.assertAlmostEqual(regions[1][1], 0.80, places=2)

    def test_trim_keeps_edge_margin_and_preserves_silence(self) -> None:
        rate = 1000
        silence = np.zeros(400, dtype=np.float32)
        self.assertEqual(len(timing_ar.trim(silence, rate)), len(silence))
        padded = np.concatenate([np.zeros(300, dtype=np.float32), np.full(200, 0.5, dtype=np.float32), np.zeros(300, dtype=np.float32)])
        trimmed = timing_ar.trim(padded, rate)
        # Speech is [0.30, 0.50], kept with EDGE_KEEP=0.05 -> [0.25, 0.55] = 0.30s = 300 samples.
        self.assertEqual(len(trimmed), 300)

    def test_estimate_words_respects_pauses_weights_and_offset(self) -> None:
        rate = 1000
        self.assertEqual(timing_ar.estimate_words("   ", np.zeros(100, dtype=np.float32), rate, 0.0, 0), [])
        # Two equal 0.25s bursts separated by a 0.30s pause.
        audio = np.concatenate([
            np.full(250, 0.5, dtype=np.float32),
            np.zeros(300, dtype=np.float32),
            np.full(250, 0.5, dtype=np.float32),
        ])
        words = timing_ar.estimate_words("كَتَبَ وَلَدٌ الدَّرْسَ", audio, rate, offset=1.25, block=2)
        self.assertEqual([w["w"] for w in words], ["كَتَبَ", "وَلَدٌ", "الدَّرْسَ"])
        self.assertTrue(all(w["block"] == 2 for w in words))
        self.assertEqual(words[0]["start"], 1.25)
        # Middle word starts in region 0 and straddles the pause, so it clamps to region 0's end (1.25 + 0.25).
        self.assertAlmostEqual(words[1]["end"], 1.50, places=3)
        self.assertGreaterEqual(words[2]["start"], 1.25 + 0.55)
        self.assertAlmostEqual(words[2]["end"], 1.25 + 0.80, places=3)

        # Pure silence falls back to spreading across total duration.
        silent_words = timing_ar.estimate_words("أ ب", np.zeros(400, dtype=np.float32), rate, offset=0.0, block=0)
        self.assertEqual(silent_words[0]["start"], 0.0)
        self.assertEqual(silent_words[1]["end"], 0.4)


if __name__ == "__main__":
    unittest.main()
