"""Loudness matching of the two-voice dialogue audio (audio.match_loudness) and the proof that scripts without `speakers` are untouched:
their cache keys (scene_digest, the .sha stamps) are byte-identical to the original formula. Synthetic wavs only; needs ffmpeg."""
from __future__ import annotations

import hashlib
import json
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

import audio

RATE = 24000


def write_wav(path: Path, samples: list[float]) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", max(-32768, min(32767, round(x * 32767)))) for x in samples))


def tone(seconds: float, amp: float, hz: float = 220.0) -> list[float]:
    """A 220 Hz tone with a slow amplitude wobble (so it is not a pure steady sine): a stand-in for speech level."""
    return [amp * math.sin(2 * math.pi * hz * i / RATE) * (0.75 + 0.25 * math.sin(2 * math.pi * 3 * i / RATE)) for i in range(int(seconds * RATE))]


class GainTests(unittest.TestCase):
    def test_gain_reaches_the_target(self) -> None:
        self.assertAlmostEqual(audio.loudness_gain_db(-28.0, -12.0), 2.0)      # a quiet scene is raised
        self.assertAlmostEqual(audio.loudness_gain_db(-24.0, -5.0), -2.0)      # a loud one is trimmed
        self.assertAlmostEqual(audio.loudness_gain_db(audio.LOUDNESS_TARGET_LUFS, -9.0), 0.0)

    def test_boost_is_limited_by_the_peak_ceiling_and_a_cut_never_is(self) -> None:
        self.assertAlmostEqual(audio.loudness_gain_db(-30.0, -2.5), 1.5)       # wants +4, only 1.5 dB of room to -1.0
        self.assertEqual(audio.loudness_gain_db(-30.0, 0.0), 0.0)              # already over the ceiling: no boost at all
        self.assertAlmostEqual(audio.loudness_gain_db(-20.0, 0.0), -6.0)       # a cut is applied in full


class MatchLoudnessTests(unittest.TestCase):
    def test_two_levels_end_within_a_tenth_of_an_lu(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp, "a.wav"), Path(tmp, "b.wav")
            write_wav(a, tone(4.0, 0.30))
            write_wav(b, tone(4.0, 0.20))
            before = [audio.measure_loudness(w)[0] for w in (a, b)]
            self.assertGreater(abs(before[0] - before[1]), 3.0)
            dur = [audio.wav_seconds(w) for w in (a, b)]
            for w in (a, b):
                audio.match_loudness(w)
            after = [audio.measure_loudness(w)[0] for w in (a, b)]
            self.assertLess(abs(after[0] - after[1]), 0.1, after)
            self.assertLess(abs(after[0] - audio.LOUDNESS_TARGET_LUFS), 0.3, after)
            self.assertEqual([audio.wav_seconds(w) for w in (a, b)], dur)       # timings stay valid
            with wave.open(str(a)) as w:
                self.assertEqual((w.getframerate(), w.getnchannels(), w.getsampwidth()), (RATE, 1, 2))
            self.assertEqual([p.name for p in Path(tmp).iterdir() if p.name not in ("a.wav", "b.wav")], [], "no temp file is left behind")

    def test_it_is_idempotent_within_the_skip_threshold(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp, "a.wav")
            write_wav(w, tone(4.0, 0.12))
            audio.match_loudness(w)
            self.assertLess(abs(audio.match_loudness(w)), 0.2)   # a second pass has (almost) nothing left to do

    def test_the_peak_guard_prevents_clipping(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp, "p.wav")
            s = tone(4.0, 0.02)           # very quiet body: would need a big boost
            s[RATE] = 0.89                # with one loud click (about -1 dBFS)
            write_wav(w, s)
            audio.match_loudness(w)
            lufs, peak = audio.measure_loudness(w)
            self.assertLessEqual(peak, audio.LOUDNESS_PEAK_CEIL_DB + 0.3, peak)
            self.assertLess(lufs, audio.LOUDNESS_TARGET_LUFS - 1.0, "the boost was held back, not forced")

    def test_silence_and_very_short_audio_are_left_alone(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            for name, samples in (("silent.wav", [0.0] * RATE), ("tiny.wav", tone(0.1, 0.1))):
                w = Path(tmp, name)
                write_wav(w, samples)
                before = w.read_bytes()
                self.assertEqual(audio.match_loudness(w), 0.0)
                self.assertEqual(w.read_bytes(), before, name)


class CacheKeyTests(unittest.TestCase):
    """A script without `speakers` keeps exactly the keys it had before loudness matching existed."""

    @staticmethod
    def legacy(text, vmodel, voice, speed, extra, lang, vfinger) -> str:
        return hashlib.sha256((f"{text}|{vmodel}|{voice}|{speed}|{extra}" + (f"|{lang}|{vfinger}" if lang != "en" else "")).encode()).hexdigest()

    def test_digest_without_norm_is_the_original_formula(self) -> None:
        for args in (("Hello there.", "kokoro", "af_heart", 1.0, "", "en", ""),
                     ("Hello there.", "qwen3", "Ryan", 1.1, audio.QWEN3_INSTRUCT, "en", ""),
                     ("مرحبا", "silma", "default", 1.0, "", "ar", "abc123")):
            self.assertEqual(audio.scene_digest(*args), self.legacy(*args), args)
        self.assertNotEqual(audio.scene_digest("t", "kokoro", "af_heart", 1.0, "", "en", "", audio.LOUDNESS_NORM), self.legacy("t", "kokoro", "af_heart", 1.0, "", "en", ""))

    def run_cmd_audio(self, script: dict, tmp: str) -> tuple[Path, list[str]]:
        wd = Path(tmp)
        (wd / "scripts").mkdir(parents=True)
        (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")
        levelled: list[str] = []
        with (
            mock.patch("audio.find_speak", return_value=wd),
            mock.patch("audio.validate_all", return_value=[]),
            mock.patch("audio.check_mermaid", return_value=([], {})),
            mock.patch("audio.stage_figures", return_value=([], {})),
            mock.patch("audio.synth", side_effect=lambda s, t, w, m, v, sp, l="en": write_wav(w, tone(0.6, 0.2))),
            mock.patch("audio.match_loudness", side_effect=lambda w: levelled.append(w.stem) or 0.0),
            mock.patch("audio.align_scenes", return_value={}),
            mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}] * len(script["scenes"])),
        ):
            audio.cmd_audio(wd, ["demo"], None, None, None)
        return wd / "public/audio/demo", levelled

    def scene(self, sid: str, who: str | None = None) -> dict:
        return {"id": sid, **({"speaker": who} if who else {}), "narration": "A short line.", "visual": {"type": "title", "kicker": "K", "headline": "H"}}

    def test_a_script_without_speakers_is_never_levelled_and_keeps_its_stamps(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            adir, levelled = self.run_cmd_audio({"title": "T", "scenes": [self.scene("s01"), self.scene("s02")]}, tmp)
            self.assertEqual(levelled, [])
            want = self.legacy("A short line.", "kokoro", "af_heart", 1.0, "", "en", "")
            self.assertEqual((adir / "s01.sha").read_text(encoding="utf-8"), want)
            self.assertEqual((adir / "s02.sha").read_text(encoding="utf-8"), want)

    def test_a_dialogue_is_levelled_before_its_stamp_and_has_its_own_key(self) -> None:
        speakers = {"a": {"name": "Dana", "role": "Eng", "voice": "af_heart"}, "b": {"name": "Omar", "role": "Eng", "voice": "am_michael"}}
        with tempfile.TemporaryDirectory() as tmp:
            adir, levelled = self.run_cmd_audio({"title": "T", "speakers": speakers, "scenes": [self.scene("s01", "a"), self.scene("s02", "b")]}, tmp)
            self.assertEqual(sorted(levelled), ["s01", "s02"])
            self.assertEqual((adir / "s01.sha").read_text(encoding="utf-8"), audio.scene_digest("A short line.", "kokoro", "af_heart", 1.0, "", "en", "", audio.LOUDNESS_NORM))
            self.assertEqual((adir / "s02.sha").read_text(encoding="utf-8"), audio.scene_digest("A short line.", "kokoro", "am_michael", 1.0, "", "en", "", audio.LOUDNESS_NORM))


if __name__ == "__main__":
    unittest.main()
