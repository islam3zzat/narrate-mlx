"""Resilience unit tests for atomic writes, corrupt-cache recovery, partial batch commits, and proxy sync."""
from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

import audio
import env


def _write_pcm_wav(path: Path, seconds: float = 0.5, rate: int = 24000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = b"\x00\x00" * int(seconds * rate)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)


class AudioCacheResilienceTests(unittest.TestCase):
    def test_atomic_write_preserves_existing_file_on_write_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "data.json"
            target.write_text('{"ok": true}', encoding="utf-8")
            with mock.patch("env.os.replace", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    env.atomic_write_text(target, '{"broken":')
            self.assertEqual(target.read_text(encoding="utf-8"), '{"ok": true}')
            # Sibling temp files are cleaned up on failure.
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["data.json"])

    def test_sync_uv_env_falls_back_to_system_certs(self) -> None:
        calls: list[list[str]] = []

        def fake_run(cmd, env=None, check=False):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0 if "--system-certs" in cmd else 1)

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch("env.subprocess.run", side_effect=fake_run):
                env.sync_uv_env(Path(tmp))
        self.assertEqual(len(calls), 2)
        self.assertNotIn("--system-certs", calls[0])
        self.assertIn("--system-certs", calls[1])

    def test_tts_timed_scenes_discards_corrupt_words_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "s01.wav"
            _write_pcm_wav(wav, seconds=0.4)
            words_file = audio.tts_words_path(wav)
            words_file.write_text("{corrupt json", encoding="utf-8")
            out, approx = audio.tts_timed_scenes([("s01", "hello world", wav, "d1")], "vid")
            self.assertEqual(out, {})
            self.assertEqual(approx, {})
            self.assertFalse(words_file.exists())

    def test_align_scenes_discards_corrupt_cache_and_writes_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            adir = Path(tmp)
            wav = adir / "s01.wav"
            _write_pcm_wav(wav, seconds=0.5)
            cache = adir / "s01.align.json"
            cache.write_text("not-json", encoding="utf-8")
            worker_out = json.dumps({
                "model": "m",
                "results": {
                    "s01": [
                        {"w": "hello", "start": 0.0, "end": 0.25},
                        {"w": "world", "start": 0.25, "end": 0.5},
                    ]
                },
            })
            with mock.patch("audio.wav_seconds", return_value=0.5), mock.patch(
                "audio.subprocess.run",
                return_value=subprocess.CompletedProcess([], 0, stdout=worker_out, stderr=""),
            ):
                out = audio.align_scenes(adir, adir, [("s01", "hello world", wav, "digest1")], "vid")
            self.assertIn("s01", out)
            saved = json.loads(cache.read_text(encoding="utf-8"))
            self.assertEqual(len(saved["words"]), 2)

    def test_cmd_audio_re_synthesizes_truncated_wav_and_commits_per_scene_stamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            (wd / "scripts").mkdir(parents=True)
            script = {
                "title": "Cache test",
                "scenes": [
                    {"id": "s01", "narration": "First scene works fine.", "visual": {"type": "title", "kicker": "K", "headline": "H"}},
                    {"id": "s02", "narration": "Second scene crashes mid run.", "visual": {"type": "title", "kicker": "K2", "headline": "H2"}},
                ],
            }
            (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")
            adir = wd / "public/audio/demo"
            adir.mkdir(parents=True)
            # Pre-seed s01 with a matching stamp but a truncated 0-byte wav so cache validation catches it.
            s01_wav = adir / "s01.wav"
            s01_wav.write_bytes(b"")
            synth_calls: list[str] = []

            def fake_synth(speak, text, wav, model, voice, speed, lang="en"):
                synth_calls.append(wav.stem)
                if wav.stem == "s02":
                    raise SystemExit("simulated s02 crash")
                _write_pcm_wav(wav, seconds=0.6)

            with (
                mock.patch("audio.find_speak", return_value=wd),
                mock.patch("audio.validate_all", return_value=[]),
                mock.patch("audio.check_mermaid", return_value=([], {})),
                mock.patch("audio.stage_figures", return_value=([], {})),
                mock.patch("audio.synth", side_effect=fake_synth),
            ):
                with self.assertRaises(SystemExit):
                    audio.cmd_audio(wd, ["demo"], None, None, None)

            # s01 succeeded and committed its .sha before s02 failed, so re-running skips s01.
            self.assertEqual(synth_calls, ["s01", "s02"])
            self.assertTrue((adir / "s01.sha").is_file())
            self.assertFalse((adir / "s02.sha").exists())

            synth_calls.clear()
            with (
                mock.patch("audio.find_speak", return_value=wd),
                mock.patch("audio.validate_all", return_value=[]),
                mock.patch("audio.check_mermaid", return_value=([], {})),
                mock.patch("audio.stage_figures", return_value=([], {})),
                mock.patch("audio.synth", side_effect=lambda s, t, w, m, v, sp, l="en": (synth_calls.append(w.stem), _write_pcm_wav(w, 0.6))),
                mock.patch("audio.align_scenes", return_value={}),
                mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}, {"slots": [], "carried": []}]),
            ):
                audio.cmd_audio(wd, ["demo"], None, None, None)
            self.assertEqual(synth_calls, ["s02"])
            self.assertTrue((wd / "public/data/demo.json").is_file())
            self.assertTrue((wd / "transcripts/demo.md").is_file())

            # Corrupt s01.wav to <=44 bytes while keeping s01.sha intact: must re-synthesize s01, not skip it.
            s01_wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVE")
            self.assertIsNone(audio._valid_wav(s01_wav))
            synth_calls.clear()
            with (
                mock.patch("audio.find_speak", return_value=wd),
                mock.patch("audio.validate_all", return_value=[]),
                mock.patch("audio.check_mermaid", return_value=([], {})),
                mock.patch("audio.stage_figures", return_value=([], {})),
                mock.patch("audio.synth", side_effect=lambda s, t, w, m, v, sp, l="en": (synth_calls.append(w.stem), _write_pcm_wav(w, 0.6))),
                mock.patch("audio.align_scenes", return_value={}),
                mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}, {"slots": [], "carried": []}]),
            ):
                audio.cmd_audio(wd, ["demo"], None, None, None)
            self.assertEqual(synth_calls, ["s01"])

    def test_synth_qwen3_cleans_temp_dir_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "s01.wav"
            qdir = wav.parent / ".qwen3"
            with mock.patch("audio.SKILL", Path(tmp)), mock.patch("audio.subprocess.run", return_value=subprocess.CompletedProcess([], 1, stdout="", stderr="boom")):
                with self.assertRaises(SystemExit):
                    audio.synth_qwen3(Path(tmp), [("s01", "hello", wav)], "Ryan")
            self.assertFalse(qdir.exists())


if __name__ == "__main__":
    unittest.main()
