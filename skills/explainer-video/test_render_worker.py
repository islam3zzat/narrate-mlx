"""Unit tests for chunked render planning, audio track assembly, FFmpeg concat/mux, and worker failure cleanup."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import render


class RenderWorkerTests(unittest.TestCase):
    def test_compute_chunks_exact_coverage(self) -> None:
        self.assertEqual(render.compute_chunks(10, 4), [(0, 2), (3, 5), (6, 7), (8, 9)])
        self.assertEqual(render.compute_chunks(3, 5), [(0, 0), (1, 1), (2, 2)])
        self.assertEqual(render.compute_chunks(100, 1), [(0, 99)])
        with self.assertRaises(ValueError):
            render.compute_chunks(0, 2)

    def test_render_plan_2d_and_3d_limits_and_overrides(self) -> None:
        shell = "/tmp/cache/chrome-headless-shell"
        chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("EXPLAINER_RENDER_BROWSERS", None)
            os.environ.pop("EXPLAINER_RENDER_CONCURRENCY", None)

            self.assertEqual(render.render_plan("2d", 120, shell, cpus=10), (1, 5))
            self.assertEqual(render.render_plan("2d", 2650, shell, cpus=10), (4, 2))
            self.assertEqual(render.render_plan("2d", 2650, chrome, cpus=10), (5, 1))

            b3_short, c3_short = render.render_plan("3d", 300, shell, cpus=10)
            self.assertLessEqual(b3_short * c3_short, 4)
            b3_long, c3_long = render.render_plan("3d", 1800, shell, cpus=10)
            self.assertEqual((b3_long, c3_long), (2, 2))
            b3_chrome, c3_chrome = render.render_plan("3d", 1800, chrome, cpus=10)
            self.assertEqual((b3_chrome, c3_chrome), (4, 1))

        with mock.patch.dict(os.environ, {"EXPLAINER_RENDER_BROWSERS": "3", "EXPLAINER_RENDER_CONCURRENCY": "2"}):
            self.assertEqual(render.render_plan("2d", 1000, shell, cpus=10), (3, 2))

    def test_audio_tracks_for_delays_and_path_confinement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            pub = wd / "public"
            (pub / "audio/vid").mkdir(parents=True)
            (pub / "audio/vid/s01.wav").write_bytes(b"RIFF")
            (pub / "audio/vid/s02.wav").write_bytes(b"RIFF")
            outside = wd / "secret.wav"
            outside.write_bytes(b"RIFF")

            data = {
                "fps": 30,
                "scenes": [
                    {"id": "s01", "frames": 90, "leadFrames": 10, "chapter": "Intro", "audio": "audio/vid/s01.wav"},
                    {"id": "s02", "frames": 60, "leadFrames": 11, "audio": "audio/vid/s02.wav"},
                ],
            }
            tracks = render.audio_tracks_for(wd, data)
            # s01 has chapter (first scene): starts at 45 - 10 = 35; + lead 10 = 45 frames -> 1500 ms.
            # s02 starts at 35 + 90 = 125; + lead 11 = 136 frames -> round(136 * 1000 / 30) = 4533 ms.
            self.assertEqual(
                [(p.name, d) for p, d in tracks],
                [("s01.wav", 1500), ("s02.wav", 4533)],
            )

            bad_data = {
                "fps": 30,
                "scenes": [{"id": "s01", "frames": 30, "leadFrames": 0, "audio": "../secret.wav"}],
            }
            with self.assertRaises(SystemExit):
                render.audio_tracks_for(wd, bad_data)

    def test_mux_chunks_concat_and_audio_sync(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            c0 = root / "chunk-0.mp4"
            c1 = root / "chunk-1.mp4"
            w0 = root / "s01.wav"
            w1 = root / "s02.wav"
            out = root / "out/final.mp4"

            for c, col in ((c0, "red"), (c1, "blue")):
                subprocess.run(
                    [
                        "ffmpeg", "-v", "error", "-y",
                        "-f", "lavfi", "-i", f"color=c={col}:s=160x90:r=30:d=1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(c),
                    ],
                    check=True,
                )
            for w, freq in ((w0, 440), (w1, 660)):
                subprocess.run(
                    [
                        "ffmpeg", "-v", "error", "-y",
                        "-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate=24000:duration=0.5",
                        str(w),
                    ],
                    check=True,
                )

            render.mux_chunks([c0, c1], [(w0, 100), (w1, 1100)], total_frames=60, fps=30, out=out)
            self.assertTrue(out.is_file())
            self.assertEqual(list(out.parent.glob("*.tmp.mp4")), [])

            probe = json.loads(
                subprocess.run(
                    [
                        "ffprobe", "-v", "error", "-count_frames",
                        "-show_streams", "-show_format", "-of", "json", str(out),
                    ],
                    check=True, capture_output=True, text=True,
                ).stdout
            )
            streams = {s["codec_type"]: s for s in probe["streams"]}
            self.assertEqual(int(streams["video"]["nb_read_frames"]), 60)
            self.assertIn("audio", streams)
            self.assertAlmostEqual(float(streams["audio"]["duration"]), 2.0, delta=0.1)

    def test_mux_chunks_constant_frame_duration_across_non_divisible_chunks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            c0 = root / "chunk-0.mp4"
            c1 = root / "chunk-1.mp4"
            out = root / "out/final.mp4"

            for c, src, n in ((c0, "testsrc=s=160x90:r=30", 41), (c1, "testsrc2=s=160x90:r=30", 37)):
                subprocess.run(
                    [
                        "ffmpeg", "-v", "error", "-y",
                        "-f", "lavfi", "-i", src,
                        "-frames:v", str(n),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(c),
                    ],
                    check=True,
                )

            render.mux_chunks([c0, c1], [], total_frames=78, fps=30, out=out)
            self.assertTrue(out.is_file())
            self.assertEqual(list(root.glob("*.concat.ts")), [])

            probe = json.loads(
                subprocess.run(
                    [
                        "ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "frame=pts,duration", "-of", "json", str(out),
                    ],
                    check=True, capture_output=True, text=True,
                ).stdout
            )
            frames = probe["frames"]
            self.assertEqual(len(frames), 78)
            durations = {int(f["duration"]) for f in frames}
            pts_deltas = {int(frames[i]["pts"]) - int(frames[i - 1]["pts"]) for i in range(1, len(frames))}
            self.assertEqual(len(durations), 1)
            self.assertEqual(len(pts_deltas), 1)

    def test_compute_run_chunks_balances_unique_frames(self) -> None:
        runs = [{"frame": i * 10, "count": 5} for i in range(7)]
        slices = render.compute_run_chunks(runs, 3)
        self.assertEqual([len(s) for s in slices], [3, 2, 2])
        self.assertEqual([r["frame"] for s in slices for r in s], [r["frame"] for r in runs])
        with self.assertRaises(ValueError):
            render.compute_run_chunks([], 2)

    def test_schedule_for_respects_mode_and_env_toggle(self) -> None:
        self.assertIsNone(render.schedule_for({"mode": "3d", "totalFrames": 100}))
        with mock.patch.dict(os.environ, {"EXPLAINER_DEDUP": "0"}):
            self.assertIsNone(render.schedule_for({"mode": "2d", "totalFrames": 100}))
        with (
            mock.patch.dict(os.environ, {"EXPLAINER_DEDUP": "1"}),
            mock.patch("render.run_cli", return_value=json.dumps({"totalFrames": 100, "uniqueFrames": 100, "runs": []})),
        ):
            self.assertIsNone(render.schedule_for({"mode": "2d", "totalFrames": 100}))
        with (
            mock.patch.dict(os.environ, {"EXPLAINER_DEDUP": "1"}),
            mock.patch("render.run_cli", return_value=json.dumps({"totalFrames": 100, "uniqueFrames": 40, "runs": [{"frame": 0, "count": 100}]})),
        ):
            sched = render.schedule_for({"mode": "2d", "totalFrames": 100})
            self.assertIsNotNone(sched)
            self.assertEqual(sched["uniqueFrames"], 40)

    def test_render_videos_worker_raises_on_nonzero_exit_and_cleans_chunks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            (wd / "scripts").mkdir()
            (wd / "scripts/v1.json").write_text(json.dumps({"title": "t", "scenes": []}), encoding="utf-8")
            (wd / "public/data").mkdir(parents=True)
            (wd / "public/data/v1.json").write_text(
                json.dumps({"fps": 30, "totalFrames": 30, "mode": "2d", "scenes": [{"id": "s01", "frames": 30, "leadFrames": 0, "visual": {"type": "title"}}]}),
                encoding="utf-8",
            )
            with (
                mock.patch("render.check_mermaid", return_value=([], {})),
                mock.patch("render.stage_figures", return_value=([], {})),
                mock.patch("render.sync_svgs"),
                mock.patch("render.sync_figures"),
                mock.patch("render.sync_mode", side_effect=lambda _w, _v, _s: json.loads((wd / "public/data/v1.json").read_text())),
                mock.patch("render.schedule_for", return_value=None),
                mock.patch("render.tool_env", return_value={"PATH": os.environ.get("PATH", "")}),
                mock.patch("render.ensure_deps"),
                mock.patch("render.shutil.which", return_value="/usr/bin/node"),
                mock.patch("render.run_guarded", return_value=subprocess.CompletedProcess(["node"], 1, "", "boom")),
            ):
                with self.assertRaises(SystemExit) as cm:
                    render.cmd_render(wd, ["v1"])
                self.assertIn("render-worker failed", str(cm.exception))
            self.assertEqual(list((wd / "out").glob(".render-chunks-*")), [])

    def test_resolve_encode_opts(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("EXPLAINER_X264_PRESET", None)
            self.assertEqual(render.resolve_encode_opts(draft=False), (1.0, "veryfast"))
            self.assertEqual(render.resolve_encode_opts(draft=True), (render.DRAFT_SCALE, "ultrafast"))

        with mock.patch.dict(os.environ, {"EXPLAINER_X264_PRESET": "faster"}):
            self.assertEqual(render.resolve_encode_opts(draft=False), (1.0, "faster"))
            self.assertEqual(render.resolve_encode_opts(draft=True), (render.DRAFT_SCALE, "ultrafast"))

        with mock.patch.dict(os.environ, {"EXPLAINER_X264_PRESET": "bogus_preset"}):
            with self.assertRaises(SystemExit):
                render.resolve_encode_opts(draft=False)

    def test_bundle_cache_server_serving_and_path_confinement(self) -> None:
        tenv = render.tool_env()
        node = shutil.which("node", path=tenv.get("PATH"))
        self.assertIsNotNone(node, "node must be available on tool_env PATH")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bundle_dir = root / "bundle"
            pub_dir = root / "public"
            (bundle_dir).mkdir()
            (pub_dir / "data").mkdir(parents=True)
            (bundle_dir / "index.html").write_text("<html>ok</html>", encoding="utf-8")
            (bundle_dir / "bundle.js").write_text("console.log(1);", encoding="utf-8")
            (pub_dir / "data/v.json").write_text('{"id":"v"}', encoding="utf-8")
            secret = root / "secret.txt"
            secret.write_text("top-secret", encoding="utf-8")
            (pub_dir / "escape.txt").symlink_to(secret)

            script = """
import { startBundleServer } from './src/bundle-cache.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';

const [bundleDir, publicDir] = process.argv.slice(-2);
const srv = await startBundleServer({ bundleDir, publicDir });

const reqRaw = (reqPath) => new Promise((resolve, reject) => {
  const u = new URL(srv.serveUrl);
  const req = http.request({ host: u.hostname, port: u.port, path: reqPath, method: 'GET' }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', reject);
  req.end();
});

try {
  const r1 = await reqRaw('/index.html');
  assert.equal(r1.status, 200);
  assert.equal(r1.body, '<html>ok</html>');

  const r2 = await reqRaw('/bundle.js');
  assert.equal(r2.status, 200);
  assert.equal(r2.body, 'console.log(1);');

  const r3 = await reqRaw('/public/data/v.json');
  assert.equal(r3.status, 200);
  assert.equal(r3.body, '{"id":"v"}');

  for (const p of ['/public/../../secret.txt', '/public/%2e%2e/%2e%2e/secret.txt', '/../secret.txt', '/%2e%2e/secret.txt']) {
    const r = await reqRaw(p);
    assert.ok(r.status === 403 || r.status === 404, `unexpected status ${r.status} for ${p}`);
    assert.ok(!r.body.includes('top-secret'));
  }

  const rSym = await reqRaw('/public/escape.txt');
  assert.equal(rSym.status, 403);
  assert.ok(!rSym.body.includes('top-secret'));

  const r6 = await reqRaw('/public/data/missing.json');
  assert.equal(r6.status, 404);
} finally {
  await srv.close();
}
"""
            subprocess.run(
                [node, "--input-type=module", "-e", script, str(bundle_dir), str(pub_dir)],
                cwd=render.SKILL,
                env=tenv,
                check=True,
            )

    def test_render_progress_tracker_throttling_eta_and_finish(self) -> None:
        tenv = render.tool_env()
        node = shutil.which("node", path=tenv.get("PATH"))
        self.assertIsNotNone(node, "node must be available on tool_env PATH")

        script = """
import assert from 'node:assert/strict';
import { createProgressTracker, formatDuration } from './src/render-progress.mjs';

assert.equal(formatDuration(45), '45s');
assert.equal(formatDuration(125), '2m05s');
assert.equal(formatDuration(3665), '1h01m');

let clock = 0;
const lines = [];
const tracker = createProgressTracker({
  vid: 'demo',
  totalFrames: 100,
  stepPct: 5,
  intervalMs: 10000,
  now: () => clock,
  write: (s) => lines.push(s),
});

// Advance 4% at 1s (<5% and <10s): throttled.
clock = 1000;
for (let i = 0; i < 4; i++) tracker.onFrame(1);
assert.equal(lines.length, 0);

// Frame 5 hits 5% at 2s -> emits progress with ETA (~38s left).
clock = 2000;
tracker.onFrame(1);
assert.equal(lines.length, 1);
assert.match(lines[0], /^\\[render\\] demo: 5\\/100 frames \\(5%\\), ~38s left\\n$/);

// Frame 6 at 12.5s triggers the 10s interval throttle even at +1%.
clock = 12500;
tracker.onFrame(1);
assert.equal(lines.length, 2);
assert.match(lines[1], /^\\[render\\] demo: 6\\/100 frames \\(6%\\), ~3m16s left\\n$/);

// Complete remaining frames; finish() prints elapsed summary.
clock = 20000;
tracker.onFrame(94); // batch completion: no intermediate emit at 100%
tracker.finish();
assert.equal(lines.length, 3);
assert.equal(lines[2], '[render] demo: 100/100 frames (100%) in 20s\\n');
"""
        subprocess.run(
            [node, "--input-type=module", "-e", script],
            cwd=render.SKILL,
            env=tenv,
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
