"""Unit tests for `scripts/golden_gate.py` diff routing and `tests/golden.py` CLI parsing."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(HERE / "tests"))

import golden  # noqa: E402
import golden_gate  # noqa: E402

EV = golden_gate.EV


class GoldenGatePlanTests(unittest.TestCase):
    def test_single_and_multi_visual_edits_batch_into_one_scoped_run(self):
        kind, types, vids, _ = golden_gate.plan([EV + "src/visuals/chart/View2D.tsx"])
        self.assertEqual((kind, types, vids), ("scoped", ["chart"], []))
        self.assertEqual(golden_gate.cmd_args(kind, types, vids), ["compare", "--types", "chart"])

        kind, types, vids, _ = golden_gate.plan([
            EV + "src/visuals/bullets/View2D.tsx",
            EV + "src/visuals/chart/View2D.tsx",
        ])
        self.assertEqual((kind, types, vids), ("scoped", ["bullets", "chart"], []))
        self.assertEqual(golden_gate.cmd_args(kind, types, vids), ["compare", "--types", "bullets,chart"])

    def test_stat_cross_dependency_includes_chart(self):
        kind, types, vids, _ = golden_gate.plan([EV + "src/visuals/stat/format.ts"])
        self.assertEqual((kind, types, vids), ("scoped", ["chart", "stat"], []))

    def test_corpus_and_golden_edits_scope_to_videos_not_full(self):
        kind, types, vids, _ = golden_gate.plan([
            EV + "src/visuals/matrix/View2D.tsx",
            EV + "tests/corpus/scripts/matrix.json",
            EV + "tests/golden/matrix/stills.md5",
        ])
        self.assertEqual((kind, types, vids), ("scoped", ["matrix"], ["matrix"]))
        self.assertEqual(golden_gate.cmd_args(kind, types, vids), ["compare", "--types", "matrix", "--videos", "matrix"])

    def test_shared_atoms_and_unknown_src_files_fail_safe_to_full(self):
        for rel in (
            "src/SceneChrome.tsx",
            "src/still-worker.mjs",
            "src/new-unknown-helper.ts",
            "src/visuals/plot-kit.ts",
            "tests/golden.py",
            "tests/corpus/ledger.json",
            "tests/corpus/public/audio/example/s01.wav",
        ):
            with self.subTest(rel):
                kind, _, _, _ = golden_gate.plan([EV + rel])
                self.assertEqual(kind, "full")

    def test_data_only_catalog_docs_and_wiring_run_data_only(self):
        kind, types, vids, _ = golden_gate.plan([
            EV + "src/cli.ts",
            EV + "src/gen-visuals.ts",
            EV + "src/visual-lint.ts",
            EV + "visual_host.py",
            EV + "src/visuals/registry.ts",
            EV + "src/visuals/order.json",
            EV + "src/visuals/meta-lint.ts",
            EV + "src/visuals/chart/catalog.ts",
            EV + "SKILL.md",
            EV + "tests/vectors/chart.test.ts",
        ])
        self.assertEqual((kind, types, vids), ("data", [], []))
        self.assertEqual(golden_gate.cmd_args(kind, types, vids), ["compare", "--type", "-"])

    def test_needs_verify_seq_flags_three_scene_chrome_svg_and_view3d(self):
        for p in (
            EV + "src/three/Scene3D.tsx",
            EV + "src/SceneChrome.tsx",
            EV + "src/visuals/svg/View2D.tsx",
            EV + "src/visuals/surface3d/View3D.tsx",
        ):
            self.assertTrue(golden_gate.needs_verify_seq([p]), p)
        self.assertFalse(golden_gate.needs_verify_seq([EV + "src/visuals/chart/View2D.tsx"]))


class GoldenCliParseTests(unittest.TestCase):
    def test_parse_compare_args(self):
        self.assertEqual(golden.parse_compare_args([]), (None, None, False))
        self.assertEqual(golden.parse_compare_args(["--type", "-"]), (None, None, True))
        self.assertEqual(golden.parse_compare_args(["--types", "chart,ablation", "--videos", "edge,matrix"]),
                         ({"chart", "ablation"}, {"edge", "matrix"}, False))

    def test_parse_det_args_and_chrome_major(self):
        self.assertEqual(golden.parse_det_args([]), (None, 2))
        self.assertEqual(golden.parse_det_args(["chart", "--runs", "8"]), (["chart"], 8))
        self.assertEqual(golden.chrome_major("Google Chrome 157.0.8103.79"), "157")
        self.assertIsNone(golden.chrome_major("unknown"))


if __name__ == "__main__":
    unittest.main()
