"""Resilience tests for subprocess timeouts, orphan reaping, head+tail stderr clipping, ensure_deps, and golden ffmpeg checks."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import env
import render

TESTS_DIR = Path(__file__).resolve().parent / "tests"
sys.path.insert(0, str(TESTS_DIR))
import golden  # noqa: E402


class ProcessResilienceTests(unittest.TestCase):
    def test_clip_err_preserves_head_and_tail(self) -> None:
        long_err = "HEAD_EXCEPTION: missing font\n" + ("mid " * 400) + "\nTAIL_FRAME: exit 1"
        clipped = env.clip_err(long_err, head=40, tail=30)
        self.assertIn("HEAD_EXCEPTION", clipped)
        self.assertIn("TAIL_FRAME: exit 1", clipped)
        self.assertIn("truncated", clipped)

    def test_env_timeout_parsing(self) -> None:
        with mock.patch.dict(os.environ, {"EXPLAINER_TEST_TO": "15"}):
            self.assertEqual(env.env_timeout("EXPLAINER_TEST_TO", 60.0), 15.0)
        with mock.patch.dict(os.environ, {"EXPLAINER_TEST_TO": "0"}):
            self.assertIsNone(env.env_timeout("EXPLAINER_TEST_TO", 60.0))
        with mock.patch.dict(os.environ, {"EXPLAINER_TEST_TO": "bad"}):
            self.assertEqual(env.env_timeout("EXPLAINER_TEST_TO", 60.0), 60.0)

    def test_run_guarded_timeout_reaps_process_group(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pid_file = Path(tmp) / "child.pid"
            # Spawn a parent shell that forks a lingering sleeper child; timeout must reap BOTH.
            script = f"python3 -c 'import time; time.sleep(30)' & echo $! > {pid_file}; wait"
            with self.assertRaises(subprocess.TimeoutExpired):
                env.run_guarded(["bash", "-c", script], timeout=0.35)
            child_pid = int(pid_file.read_text(encoding="utf-8").strip())
            # kill -0 raises ProcessLookupError once the child process group was reaped.
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                try:
                    os.kill(child_pid, 0)
                    time.sleep(0.02)
                except ProcessLookupError:
                    break
            else:
                self.fail(f"Child process {child_pid} was not reaped within deadline")

    def test_ensure_deps_detects_missing_katex_or_shiki(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "package.json").write_text(
                json.dumps({"dependencies": {"synthetic-dep": "1.0.0"}}),
                encoding="utf-8",
            )
            with mock.patch.object(env, "SKILL", root), mock.patch("env.subprocess.run") as run_mock:
                env.ensure_deps({})
            run_mock.assert_called_once()
            self.assertEqual(run_mock.call_args.args[0][0], "npm")

            # Once .bin/{remotion,tsx} and every dependency from package.json exist, npm is skipped.
            for rel in ("node_modules/.bin/remotion", "node_modules/.bin/tsx", "node_modules/synthetic-dep/package.json"):
                p = root / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("", encoding="utf-8")
            with mock.patch.object(env, "SKILL", root), mock.patch("env.subprocess.run") as run_mock:
                env.ensure_deps({})
            run_mock.assert_not_called()

    def test_remotion_error_uses_head_tail_clip_err(self) -> None:
        long_err = "HEADER_FAIL\n" + ("x" * 1200) + "\nFOOTER_CAUSE"
        with (
            mock.patch("render.tool_env", return_value={}),
            mock.patch("render.ensure_deps"),
            mock.patch("render.run_guarded", return_value=subprocess.CompletedProcess(["remotion"], 1, "", long_err)),
            tempfile.TemporaryDirectory() as tmp,
        ):
            with self.assertRaises(subprocess.CalledProcessError) as cm:
                render.remotion(["still", "out.png"], Path(tmp), "vid", [], quiet=True)
            self.assertIn("HEADER_FAIL", cm.exception.stderr)
            self.assertIn("FOOTER_CAUSE", cm.exception.stderr)

    def test_golden_ffmpeg_helpers_raise_on_failure(self) -> None:
        with mock.patch.object(golden, "sh", return_value=subprocess.CompletedProcess([], 1, stdout="", stderr="bad png")):
            with self.assertRaises(RuntimeError):
                golden.pixmd5(Path("missing.png"))
            with self.assertRaises(RuntimeError):
                golden.small(Path("a.png"), Path("b.png"))
            with self.assertRaises(RuntimeError):
                golden.psnr(Path("a.png"), Path("b.png"))

    def test_browser_exe_prefers_env_then_newest_headless_shell_then_system(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            skill_dir = root / "skill"
            home_dir = root / "home"
            sys_chrome = root / "Google Chrome"
            sys_chrome.write_text("", encoding="utf-8")

            old_shell = home_dir / ".cache/puppeteer/chrome-headless-shell/mac_arm-140.0.1.0/chrome-headless-shell-mac-arm64/chrome-headless-shell"
            new_shell = home_dir / ".cache/puppeteer/chrome-headless-shell/mac_arm-153.0.8010.36/chrome-headless-shell-mac-arm64/chrome-headless-shell"
            for sh_path in (old_shell, new_shell):
                sh_path.parent.mkdir(parents=True, exist_ok=True)
                sh_path.write_text("#!/bin/sh\n", encoding="utf-8")
                sh_path.chmod(0o755)

            with (
                mock.patch.object(env, "SKILL", skill_dir),
                mock.patch.object(env, "_SYSTEM_BROWSERS", (str(sys_chrome),)),
                mock.patch("env.Path.home", return_value=home_dir),
            ):
                # 1. $EXPLAINER_BROWSER overrides cached chrome-headless-shell and system browsers.
                with mock.patch.dict(os.environ, {"EXPLAINER_BROWSER": "/custom/chrome"}, clear=False):
                    self.assertEqual(env.browser_exe(), "/custom/chrome")

                # 2. Cached executable chrome-headless-shell wins over system Chrome, picking newest version.
                with mock.patch.dict(os.environ, {}, clear=False):
                    os.environ.pop("EXPLAINER_BROWSER", None)
                    self.assertEqual(env.browser_exe(), str(new_shell))

                # 3. Non-executable shells are skipped and fall back to system browser, else None.
                old_shell.chmod(0o644)
                new_shell.chmod(0o644)
                with mock.patch.dict(os.environ, {}, clear=False):
                    os.environ.pop("EXPLAINER_BROWSER", None)
                    self.assertEqual(env.browser_exe(), str(sys_chrome))

            with (
                mock.patch.object(env, "SKILL", skill_dir),
                mock.patch.object(env, "_SYSTEM_BROWSERS", (str(root / "missing-chrome"),)),
                mock.patch("env.Path.home", return_value=home_dir),
                mock.patch.dict(os.environ, {}, clear=False),
            ):
                os.environ.pop("EXPLAINER_BROWSER", None)
                self.assertIsNone(env.browser_exe())


if __name__ == "__main__":
    unittest.main()
