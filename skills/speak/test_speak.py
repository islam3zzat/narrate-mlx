"""Offline unit tests for skills/speak (mdparse, highlight helpers, CLI contracts, dynamic sample rates)."""
from __future__ import annotations

import contextlib
import io
import json
import os
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

    def test_sentence_navigation_speed_and_autoscroll_helpers(self) -> None:
        text = "First sentence. Second one!\nThird line here?"
        words = [
            highlight.Word(0.0, 0, 5),    # First
            highlight.Word(0.4, 6, 15),   # sentence.
            highlight.Word(1.0, 16, 22),  # Second
            highlight.Word(1.5, 23, 27),  # one!
            highlight.Word(2.0, 28, 33),  # Third
            highlight.Word(2.4, 34, 38),  # line
            highlight.Word(2.7, 39, 44),  # here?
        ]
        starts = highlight.sentence_starts(text, words)
        self.assertEqual(starts, [0, 2, 4])
        self.assertEqual(highlight.next_sentence_index(starts, 0, 1), 2)
        self.assertEqual(highlight.next_sentence_index(starts, 2, 1), 4)
        self.assertIsNone(highlight.next_sentence_index(starts, 4, 1))
        # Mid-sentence (>1 word past sentence start) restarts current sentence; at start goes to previous.
        self.assertEqual(highlight.next_sentence_index(starts, 6, -1), 4)
        self.assertEqual(highlight.next_sentence_index(starts, 4, -1), 2)
        self.assertEqual(highlight.next_sentence_index(starts, 0, -1), 0)

        self.assertEqual(highlight.step_speed_index(0, -1), 0)
        self.assertEqual(highlight.step_speed_index(1, 1), 2)
        self.assertEqual(highlight.step_speed_index(len(highlight.SPEEDS) - 1, 1), len(highlight.SPEEDS) - 1)

        self.assertFalse(highlight.should_auto_scroll(10.0, 12.0))
        self.assertTrue(highlight.should_auto_scroll(12.0, 12.0))
        self.assertEqual(highlight.speed_labels(1.25)[1], "1.25×")


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

    def test_positional_file_path_reads_contents_and_text_flag_overrides(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "notes.md"
            note.write_text("# Heading\n\nBody text from file.", encoding="utf-8")
            out_wav = Path(tmp) / "out.wav"
            fake_audio = np.zeros(1600, dtype=np.float32)

            seen_blocks: list[list[str]] = []

            def fake_synth(blocks, voice, speed):
                seen_blocks.append([b.speech for b in blocks if b.spoken_from is not None])
                return (fake_audio, 16000, "ok", [], [], "ok", [])

            err_buf = io.StringIO()
            with (
                mock.patch.object(sys, "argv", ["speak.py", str(note), "--out", str(out_wav)]),
                mock.patch.object(speak, "synthesize", side_effect=fake_synth),
                contextlib.redirect_stderr(err_buf),
            ):
                speak.main()
            self.assertIn(f"Reading {note}", err_buf.getvalue())
            self.assertEqual(seen_blocks[-1], ["Heading", "Body text from file."])

            with (
                mock.patch.object(sys, "argv", ["speak.py", "--text", str(note), "--out", str(out_wav)]),
                mock.patch.object(speak, "synthesize", side_effect=fake_synth),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                speak.main()
            self.assertEqual(seen_blocks[-1], [str(note)])

    def test_speed_bounds_and_help_formatting(self) -> None:
        for bad in ("0", "-1", "2.5", "nan"):
            with self.subTest(bad=bad):
                with mock.patch.object(sys, "argv", ["speak.py", "--speed", bad, "hello"]), mock.patch.object(sys.stderr, "write"):
                    with self.assertRaises(SystemExit) as cm:
                        speak.main()
                    self.assertEqual(cm.exception.code, 2)

        help_buf = io.StringIO()
        with mock.patch.object(sys, "argv", ["speak.py", "-h"]), contextlib.redirect_stdout(help_buf):
            with self.assertRaises(SystemExit) as cm:
                speak.main()
            self.assertEqual(cm.exception.code, 0)
        help_text = help_buf.getvalue()
        self.assertIn("\n    uv run python speak.py notes.md\n", help_text)
        self.assertIn("0.5-2.0", help_text)

    def test_hf_model_cached_and_window_flags_passed_to_show_and_play(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            hub = Path(tmp) / "hub"
            hub.mkdir()
            with mock.patch.dict(os.environ, {"HF_HUB_CACHE": str(hub)}):
                self.assertFalse(speak.hf_model_cached("mlx-community/Kokoro-82M-bf16"))
                (hub / "models--mlx-community--Kokoro-82M-bf16" / "snapshots" / "abc").mkdir(parents=True)
                self.assertTrue(speak.hf_model_cached("mlx-community/Kokoro-82M-bf16"))

        long_text = " ".join(["word"] * 120)
        fake_audio = np.zeros(1600, dtype=np.float32)
        fake_return = (fake_audio, 16000, long_text, [], [], long_text, [])
        with (
            mock.patch.object(sys, "argv", ["speak.py", "--speed", "1.25", "--auto-close", long_text]),
            mock.patch.object(speak, "synthesize", return_value=fake_return),
            mock.patch("highlight.show_and_play") as show_mock,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            speak.main()
        show_mock.assert_called_once()
        self.assertEqual(show_mock.call_args.kwargs["base_speed"], 1.25)
        self.assertTrue(show_mock.call_args.kwargs["auto_close"])


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
