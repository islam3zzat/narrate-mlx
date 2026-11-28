"""Two-voice dialogue contract in Python: `speakers` / scene `speaker` rules (validation.check_speakers), the shared voice list,
and the same verdicts as the TypeScript schema through `explainer.py check`-style validation (validation.validate_all)."""
from __future__ import annotations

import copy
import json
import os
import unittest
from pathlib import Path
from unittest import mock

import env
import validation
from test_semantics import HERE

SPEAKERS = {"a": {"name": "Dana", "role": "Security Engineer", "voice": "af_heart"},
            "b": {"name": "Omar", "role": "Architect", "voice": "am_michael"}}


def scene(sid: str, speaker: str | None = None) -> dict:
    return {"id": sid, **({"speaker": speaker} if speaker else {}), "narration": "Short and spoken.",
            "visual": {"type": "bullets", "heading": "H", "items": ["a", "b"]}}


def script(**more) -> dict:
    return {"title": "T", "speakers": copy.deepcopy(SPEAKERS), "scenes": [scene("s1", "a"), scene("s2", "b"), scene("s3", "a")], **more}


class VoiceListTests(unittest.TestCase):
    def test_python_reads_the_speak_skills_list(self) -> None:
        voices = env.english_voices()
        self.assertEqual(voices, json.loads((HERE.parent / "speak" / "voices.json").read_text(encoding="utf-8")))
        self.assertIn("af_heart", voices)

    def test_tts_dir_override_is_honoured(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "speak.py").write_text("")
            Path(tmp, "voices.json").write_text('["af_only"]')
            with mock.patch.dict(os.environ, {"EXPLAINER_TTS_DIR": tmp}):
                self.assertEqual(env.english_voices(), ["af_only"])

    def test_malformed_list_dies(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "speak.py").write_text("")
            Path(tmp, "voices.json").write_text('{"en": []}')
            with mock.patch.dict(os.environ, {"EXPLAINER_TTS_DIR": tmp}), self.assertRaises(SystemExit):
                env.english_voices()


class CheckSpeakersTests(unittest.TestCase):
    def errs(self, s: dict) -> list[str]:
        return validation.check_speakers("v", s)

    def test_accepts_a_dialogue_and_a_plain_script(self) -> None:
        self.assertEqual(self.errs(script()), [])
        self.assertEqual(self.errs({"title": "T", "scenes": [scene("s1")]}), [])

    def test_rejects_each_broken_rule(self) -> None:
        def has(s: dict, text: str) -> bool:
            return any(text in e for e in self.errs(s))
        one = script(); del one["speakers"]["b"]
        self.assertTrue(has(one, "exactly 2"))
        same = script(); same["speakers"]["b"]["voice"] = "af_heart"
        self.assertTrue(has(same, "share a voice"))
        bad_voice = script(); bad_voice["speakers"]["b"]["voice"] = "zf_xiaobei"
        self.assertTrue(has(bad_voice, "not a Kokoro English voice"))
        bad_id = script(); bad_id["speakers"] = {"a": SPEAKERS["a"], "B": SPEAKERS["b"]}
        self.assertTrue(has(bad_id, 'speaker id "B"'))
        missing = script(); del missing["scenes"][1]["speaker"]
        self.assertTrue(has(missing, 'v/s2: needs a "speaker"'))
        unknown = script(); unknown["scenes"][1]["speaker"] = "z"
        self.assertTrue(has(unknown, 'unknown speaker "z"'))
        unused = script(); unused["scenes"][1]["speaker"] = "a"
        self.assertTrue(has(unused, 'speaker "b" has no scene'))
        stray = {"title": "T", "scenes": [scene("s1", "a")]}
        self.assertTrue(has(stray, 'needs "speakers"'))
        self.assertTrue(has(script(language="ar"), "English only"))

    def test_rejects_hidden_and_line_break_characters_in_name_and_role(self) -> None:
        for ch in ("\u200b", "\u200e", "\u200f", "\u202a", "\u202e", "\u2066", "\u2069", "\u00ad", "\ufeff", "\u034f", "\u3164",
                   "\ufe0f", "\U000e0041", "\n", "\r", "\t", "\x00", "\u2028"):
            for field in ("name", "role"):
                s = script(); s["speakers"]["b"][field] = f"Om{ch}ar"
                self.assertTrue(any(f"speakers.b.{field} has" in e for e in self.errs(s)), (field, hex(ord(ch))))
        ok = script(); ok["speakers"]["b"]["role"] = "Staff Engineer, Platform (EMEA) - on-call"
        self.assertEqual(self.errs(ok), [])

    def test_a_huge_speakers_object_is_rejected_by_its_count(self) -> None:
        big = script(); big["speakers"] = {f"k{i}": SPEAKERS["a"] for i in range(20000)}
        self.assertEqual(self.errs(big), ["v: speakers needs exactly 2 entries"])


class ThroughValidateAllTests(unittest.TestCase):
    """The schema (zod, via cli.ts) and check_speakers agree on a valid and an invalid dialogue."""

    def test_valid_dialogue_passes_and_bad_voice_fails(self) -> None:
        self.assertEqual(validation.validate_all([("v", script())]), [])
        bad = script(); bad["speakers"]["b"]["voice"] = "zf_xiaobei"
        errs = validation.validate_all([("v", bad)])
        self.assertTrue(any("not a Kokoro English voice" in e for e in errs), errs)

    def test_scene_without_speaker_is_one_error(self) -> None:
        bad = script(); del bad["scenes"][0]["speaker"]
        errs = validation.validate_all([("v", bad)])
        self.assertEqual(len([e for e in errs if "needs a \"speaker\"" in e]), 1, errs)


if __name__ == "__main__":
    unittest.main()
