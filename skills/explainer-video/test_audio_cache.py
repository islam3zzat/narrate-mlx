"""Resilience unit tests for atomic writes, corrupt-cache recovery, partial batch commits, and proxy sync."""
from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import wave
from pathlib import Path
from unittest import mock

import audio
import env
import explainer


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
        stdouts: list[object] = []

        def fake_run(cmd, env=None, check=False, **kw):
            calls.append(cmd)
            stdouts.append(kw.get("stdout"))
            return subprocess.CompletedProcess(cmd, 0 if "--system-certs" in cmd else 1)

        err_buf = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch("env.find_uv", return_value="uv"),
                mock.patch("env.subprocess.run", side_effect=fake_run),
                contextlib.redirect_stderr(err_buf),
            ):
                env.sync_uv_env(Path(tmp))
        self.assertEqual(len(calls), 2)
        self.assertNotIn("--system-certs", calls[0])
        self.assertIn("--system-certs", calls[1])
        self.assertEqual(stdouts, [err_buf, err_buf])

    def test_find_uv_resolves_path_fallback_or_dies_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake_uv = Path(tmp) / "uv"
            fake_uv.write_text("#!/bin/sh\n", encoding="utf-8")
            fake_uv.chmod(0o755)
            with (
                mock.patch("env.shutil.which", return_value=None),
                mock.patch("env.Path.home", return_value=Path(tmp) / "nohome"),
                mock.patch("env.Path.is_file", autospec=True, side_effect=lambda p: str(p) == "/opt/homebrew/bin/uv"),
                mock.patch("env.os.access", side_effect=lambda p, m: str(p) == "/opt/homebrew/bin/uv"),
            ):
                self.assertEqual(env.find_uv(), "/opt/homebrew/bin/uv")

            with (
                mock.patch("env.shutil.which", return_value=None),
                mock.patch("env.Path.home", return_value=Path(tmp) / "nohome"),
                mock.patch("env.Path.is_file", return_value=False),
            ):
                with self.assertRaises(SystemExit) as cm:
                    env.find_uv()
                self.assertTrue(str(cm.exception).startswith("explainer: uv not found"), cm.exception)

    def test_audio_cli_rejects_out_of_range_speed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            for bad in ("0", "-1", "3", "nan"):
                with self.subTest(bad=bad):
                    r = subprocess.run(
                        [sys.executable, str(env.SKILL / "explainer.py"), "audio", tmp, "--speed", bad],
                        capture_output=True,
                        text=True,
                        cwd=env.SKILL,
                    )
                    self.assertEqual(r.returncode, 2, r.stderr)
                    self.assertIn("0.5 and 2.0", r.stderr)

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
            with (
                mock.patch("audio.find_uv", return_value="uv"),
                mock.patch("audio.announce_model_download_if_missing", return_value=False),
                mock.patch("audio.wav_seconds", return_value=0.5),
                mock.patch(
                    "audio.run_guarded",
                    return_value=subprocess.CompletedProcess([], 0, stdout=worker_out, stderr=""),
                ),
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
            with (
                mock.patch("audio.find_uv", return_value="uv"),
                mock.patch("audio.announce_model_download_if_missing", return_value=False),
                mock.patch("audio.SKILL", Path(tmp)),
                mock.patch("audio.run_guarded", return_value=subprocess.CompletedProcess([], 1, stdout="", stderr="boom")),
            ):
                with self.assertRaises(SystemExit):
                    audio.synth_qwen3(Path(tmp), [("s01", "hello", wav)], "Ryan")
            self.assertFalse(qdir.exists())

    def test_synth_and_align_timeouts_reap_child_processes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pid_file = root / "grandchild.pid"
            stub_uv = root / "uv"
            stub_uv.write_text(
                "#!/bin/sh\n"
                f"python3 -c 'import time; time.sleep(30)' &\n"
                f"echo $! > '{pid_file}'\n"
                "wait\n",
                encoding="utf-8",
            )
            stub_uv.chmod(0o755)

            def assert_reaped() -> None:
                child_pid = int(pid_file.read_text(encoding="utf-8").strip())
                deadline = time.monotonic() + 2.0
                while time.monotonic() < deadline:
                    try:
                        os.kill(child_pid, 0)
                        time.sleep(0.02)
                    except ProcessLookupError:
                        return
                self.fail(f"Child process {child_pid} was not reaped")

            wav = root / "s01.wav"
            with (
                mock.patch("audio.find_uv", return_value=str(stub_uv)),
                mock.patch.dict(os.environ, {"EXPLAINER_TTS_TIMEOUT": "0.35"}),
            ):
                with self.assertRaises(SystemExit) as cm:
                    audio.synth(root, "hello", wav, "kokoro", "af_heart", 1.0)
                self.assertIn("TTS timed out", str(cm.exception))
            assert_reaped()

            pid_file.unlink(missing_ok=True)
            _write_pcm_wav(wav, seconds=0.5)
            err_buf = io.StringIO()
            with (
                mock.patch("audio.find_uv", return_value=str(stub_uv)),
                mock.patch("audio.announce_model_download_if_missing", return_value=False),
                mock.patch.dict(os.environ, {"EXPLAINER_ALIGN_TIMEOUT": "0.35"}),
                contextlib.redirect_stderr(err_buf),
            ):
                out = audio.align_scenes(root, root, [("s01", "hello", wav, "d1")], "vid")
            self.assertEqual(out, {})
            self.assertIn("alignment timed out", err_buf.getvalue())
            assert_reaped()

    def test_hf_cache_download_notice_and_per_scene_counts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            hub = root / "hub"
            hub.mkdir()
            with mock.patch.dict(os.environ, {"HF_HUB_CACHE": str(hub)}):
                self.assertFalse(env.hf_model_cached(env.KOKORO_MODEL))
                snaps = hub / f"models--{env.KOKORO_MODEL.replace('/', '--')}" / "snapshots" / "rev1"
                snaps.mkdir(parents=True)
                self.assertTrue(env.hf_model_cached(env.KOKORO_MODEL))

            # Empty HF cache prints setup notice once and prints (1/2), (2/2) progress counts.
            empty_hub = root / "empty-hub"
            empty_hub.mkdir()
            wd = root / "proj"
            (wd / "scripts").mkdir(parents=True)
            script = {
                "title": "Progress test",
                "scenes": [
                    {"id": "s01", "narration": "First line.", "visual": {"type": "title", "kicker": "K", "headline": "H"}},
                    {"id": "s02", "narration": "Second line.", "visual": {"type": "title", "kicker": "K2", "headline": "H2"}},
                ],
            }
            (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")
            out_buf, err_buf = io.StringIO(), io.StringIO()
            with (
                mock.patch.dict(os.environ, {"HF_HUB_CACHE": str(empty_hub)}),
                mock.patch("audio.find_speak", return_value=wd),
                mock.patch("audio.validate_all", return_value=[]),
                mock.patch("audio.check_mermaid", return_value=([], {})),
                mock.patch("audio.stage_figures", return_value=([], {})),
                mock.patch("audio.synth", side_effect=lambda s, t, w, m, v, sp, l="en": _write_pcm_wav(w, 0.5)),
                mock.patch("audio.align_scenes", return_value={}),
                mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}, {"slots": [], "carried": []}]),
                contextlib.redirect_stdout(out_buf),
                contextlib.redirect_stderr(err_buf),
            ):
                audio.cmd_audio(wd, ["demo"], None, None, None)

            self.assertIn(f"[setup] downloading {env.KOKORO_MODEL}", err_buf.getvalue())
            self.assertIn("[tts] demo/s01 (1/2)", out_buf.getvalue())
            self.assertIn("[tts] demo/s02 (2/2)", out_buf.getvalue())


class DialogueAudioTests(unittest.TestCase):
    SPEAKERS = {"a": {"name": "Dana *", "role": "Principal [Architect]", "voice": "af_heart"},
                "b": {"name": "Omar", "role": "Security Lead", "voice": "am_michael"}}

    def _run(self, wd: Path, script: dict, model=None, voice=None, calls=None):
        (wd / "scripts").mkdir(parents=True, exist_ok=True)
        (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")

        def fake_synth(speak, text, wav, mdl, vc, speed, lang="en"):
            if calls is not None:
                calls.append((wav.stem, vc))
            _write_pcm_wav(wav, 0.5)

        n = len(script["scenes"])
        with (
            mock.patch("audio.find_speak", return_value=wd),
            mock.patch("audio.validate_all", return_value=[]),
            mock.patch("audio.check_mermaid", return_value=([], {})),
            mock.patch("audio.stage_figures", return_value=([], {})),
            mock.patch("audio.synth", side_effect=fake_synth),
            mock.patch("audio.align_scenes", return_value={}),
            mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}] * n),
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            audio.cmd_audio(wd, ["demo"], model, voice, None)

    def _script(self, speakers: bool) -> dict:
        v = {"type": "title", "kicker": "K", "headline": "H"}
        order = ["a", "b", "a", "b"]
        scenes = [{"id": f"s0{i + 1}", "narration": f"Line number {i + 1}.", "visual": v, **({"speaker": order[i]} if speakers else {})}
                  for i in range(4)]
        return {"title": "T", "scenes": scenes, **({"speakers": self.SPEAKERS} if speakers else {})}

    def test_non_podcast_digest_is_unchanged(self) -> None:
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            self._run(wd, self._script(False))
            stamp = (wd / "public/audio/demo/s01.sha").read_text(encoding="utf-8")
            old_formula = hashlib.sha256("Line number 1.|kokoro|af_heart|1.0|".encode()).hexdigest()
            self.assertEqual(stamp, old_formula)
            data = json.loads((wd / "public/data/demo.json").read_text(encoding="utf-8"))
            self.assertNotIn("speakers", data)
            self.assertIn("## Scene s01 (", (wd / "transcripts/demo.md").read_text(encoding="utf-8"))

    def test_each_scene_uses_its_speakers_voice_grouped_by_voice(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wd, calls = Path(tmp), []
            self._run(wd, self._script(True), calls=calls)
            self.assertEqual(calls, [("s01", "af_heart"), ("s03", "af_heart"), ("s02", "am_michael"), ("s04", "am_michael")])
            data = json.loads((wd / "public/data/demo.json").read_text(encoding="utf-8"))
            self.assertEqual(data["speakers"], {"a": {"name": "Dana *", "role": "Principal [Architect]"},
                                                "b": {"name": "Omar", "role": "Security Lead"}})
            self.assertEqual([s["speaker"] for s in data["scenes"]], ["a", "b", "a", "b"])
            md = (wd / "transcripts/demo.md").read_text(encoding="utf-8")
            self.assertIn("## Scene s01 - Dana \\* (Principal \\[Architect\\]) (", md)
            self.assertIn("## Scene s02 - Omar (Security Lead) (", md)
            # second run: everything cached, so a changed voice for one speaker re-synthesizes only that speaker's scenes
            calls.clear()
            self._run(wd, self._script(True), calls=calls)
            self.assertEqual(calls, [])
            sp = json.loads(json.dumps(self._script(True)))
            sp["speakers"]["b"]["voice"] = "am_adam"
            self._run(wd, sp, calls=calls)
            self.assertEqual(calls, [("s02", "am_adam"), ("s04", "am_adam")])

    def test_voice_or_qwen3_with_speakers_dies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            with self.assertRaises(SystemExit) as cm:
                self._run(wd, self._script(True), voice="am_adam")
            self.assertIn("--voice", str(cm.exception))
            with self.assertRaises(SystemExit) as cm:
                self._run(wd, self._script(True), model="qwen3")
            self.assertIn("qwen3", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
