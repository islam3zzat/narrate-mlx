"""Unit tests for visual_host.py (`visual init`, `visual check`, `visual list`, user-local ~/.config visuals)."""
import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import visual_host  # noqa: E402


class VisualHostTests(unittest.TestCase):
    def test_validate_slug_accepts_valid_and_rejects_bad(self):
        self.assertEqual(visual_host.validate_slug("array-algo"), "array-algo")
        for bad in ("", "A", "../escape", "a/b", "1bad", "x", "a" * 33, "bad_underscore"):
            with self.subTest(bad=bad):
                with self.assertRaises(SystemExit):
                    visual_host.validate_slug(bad)

    def test_cmd_visual_init_rejects_existing_visual(self):
        with self.assertRaises(SystemExit):
            visual_host.cmd_visual_init("stat", "basic", "builtin")
        with self.assertRaises(SystemExit):
            visual_host.cmd_visual_init("stat", "basic", "local")

    def test_build_check_frames_covers_themes_and_optional_rtl(self):
        meta_warn = {
            "durationInFrames": 240,
            "leadFrames": 11,
            "rtl": "warn",
            "defaultProps": {"type": "stat", "theme": "cel-sky", "dir": "ltr"},
        }
        specs, det = visual_host.build_check_frames(meta_warn)
        self.assertEqual(len(specs), 6)  # 4 cel-sky + 2 paper
        self.assertEqual([s["inputProps"]["theme"] for s in specs], ["cel-sky"] * 4 + ["paper"] * 2)
        self.assertEqual(det[0], 2)
        self.assertTrue(all(0 <= s["frame"] < 240 for s in specs))

        meta_rtl = {**meta_warn, "rtl": "yes"}
        specs_rtl, _ = visual_host.build_check_frames(meta_rtl)
        self.assertEqual(len(specs_rtl), 7)
        self.assertEqual(specs_rtl[-1]["inputProps"]["dir"], "rtl")

    def test_cli_visual_check_no_render_on_stat(self):
        r = subprocess.run(
            [sys.executable, str(HERE / "explainer.py"), "visual", "check", "stat", "--no-render"],
            capture_output=True,
            text=True,
            cwd=HERE,
        )
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertIn("ok lint-visual stat", r.stdout)

    def test_local_visual_init_sync_list_collision_and_ast_lint(self):
        # Stage mirrors into an isolated temp stage inside HERE/src/.tmp_test_stage? No, any directory outside
        # shared HERE/src/visuals-local avoids racing parallel test_*.py workers, while symlink or relative
        # imports work when staged inside an isolated sibling temp dir OR we verify bridge generation & AST lint.
        with tempfile.TemporaryDirectory(prefix="user-visuals-test-") as td:
            root = Path(td)
            user_dir = root / "user-visuals"
            stage_dir = root / "stage-local"
            with (
                mock.patch.dict(os.environ, {"EXPLAINER_USER_VISUALS_DIR": str(user_dir)}),
                mock.patch.object(visual_host, "LOCAL_STAGE", stage_dir),
            ):
                # 1. Scaffold local algo visual into user_dir cleanly without touching src/visuals/
                with contextlib.redirect_stdout(io.StringIO()):
                    visual_host.cmd_visual_init("demo-local", "algo", "local")

                self.assertTrue((user_dir / "demo-local/View2D.tsx").is_file())
                self.assertFalse((HERE / "src/visuals/demo-local").exists())
                self.assertTrue((stage_dir / "demo-local/View2D.tsx").is_file())
                for bridge in ("capabilities.ts", "registry.ts", "views.tsx", "catalog.ts"):
                    self.assertTrue((stage_dir / bridge).is_file(), bridge)
                self.assertIn("demo-local", (stage_dir / "registry.ts").read_text(encoding="utf-8"))

                # 2. List reports demo-local under local
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    visual_host.cmd_visual_list(as_json=True)
                listed = json.loads(buf.getvalue())
                self.assertEqual([x["slug"] for x in listed["local"]], ["demo-local"])
                self.assertIn("graph-algo", listed["builtin"])

                # 3. Duplicate local init fails cleanly
                with self.assertRaises(SystemExit):
                    visual_host.cmd_visual_init("demo-local", "basic", "local")

                # 4. Deleting from user_dir cleans stale files from stage_dir and reverts bridges to empty stubs
                for p in sorted((user_dir / "demo-local").rglob("*"), reverse=True):
                    p.unlink() if p.is_file() else p.rmdir()
                (user_dir / "demo-local").rmdir()
                self.assertEqual(visual_host.sync_local_visuals(), [])
                self.assertFalse((stage_dir / "demo-local").exists())
                self.assertEqual(
                    (stage_dir / "capabilities.ts").read_text(encoding="utf-8"),
                    "// Auto-created stub for user-local visuals (gitignored).\nexport const LOCAL_CAPABILITIES = {} as const;\n",
                )

                # 5. Built-in slug collision fails cleanly
                (user_dir / "stat").mkdir(parents=True)
                with self.assertRaises(SystemExit):
                    visual_host.sync_local_visuals()

    def test_promote_regenerates_builtin_style_schema_even_with_other_local_visuals(self):
        with tempfile.TemporaryDirectory(prefix="promote-test-") as td:
            root = Path(td)
            user_dir = root / "user-visuals"
            (user_dir / "alpha-vis").mkdir(parents=True)
            (user_dir / "beta-vis").mkdir(parents=True)
            cli_calls: list[list[str]] = []
            written: list[Path] = []

            def fake_run_cli(args):
                cli_calls.append(args)
                return "{}"

            with (
                mock.patch.dict(os.environ, {"EXPLAINER_USER_VISUALS_DIR": str(user_dir)}),
                mock.patch.object(visual_host, "sync_local_visuals", return_value=["beta-vis"]),
                mock.patch.object(visual_host.shutil, "move") as move_mock,
                mock.patch.object(visual_host, "run_cli", side_effect=fake_run_cli),
                mock.patch.object(visual_host, "atomic_write_text", side_effect=lambda p, _t: written.append(p)),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                visual_host.cmd_visual_promote("alpha-vis")

            move_mock.assert_called_once_with(str(user_dir / "alpha-vis"), str(visual_host.SKILL / "src/visuals/alpha-vis"))
            self.assertEqual(
                cli_calls,
                [["gen-visuals"], ["docs", "--write"], ["schema", "--builtin"], ["style-schema", "--builtin"]],
            )
            self.assertEqual(
                written,
                [visual_host.SKILL / "schema/script.schema.json", visual_host.SKILL / "schema/style.schema.json"],
            )

    def test_render_visual_template_substitutes_all_tokens(self):
        expected = {"capabilities.ts", "schema.ts", "semantics.ts", "meta.ts", "catalog.ts", "View2D.tsx"}
        for template in visual_host.VISUAL_TEMPLATES:
            with self.subTest(template=template):
                files = visual_host.render_visual_template(template, "my-vis")
                self.assertEqual(set(files), expected)
                for name, body in files.items():
                    self.assertIsNone(re.search(r"__[A-Z]+__", body), name)
                self.assertIn("type: z.literal('my-vis')", files["schema.ts"])
                self.assertIn("MyVisVisual", files["schema.ts"])

    def test_render_visual_template_rejects_unknown_token(self):
        with tempfile.TemporaryDirectory(prefix="tmpl-test-") as td:
            root = Path(td)
            (root / "basic").mkdir()
            (root / "basic" / "schema.ts.tmpl").write_text("export const x = '__BOGUS__';\n", encoding="utf-8")
            with mock.patch.object(visual_host, "TEMPLATE_DIR", root):
                with self.assertRaises(SystemExit):
                    visual_host.render_visual_template("basic", "my-vis")

    @unittest.skipUnless(
        shutil.which("node") and (HERE / "node_modules/typescript").exists(),
        "needs node and node_modules/typescript",
    )
    def test_scaffolded_templates_typecheck(self):
        # Slugs: plain, plain, and a reserved word (exercises `_to_ident`). Files are overlaid in memory at
        # src/visuals-local/<slug>/ (where ../../sdk imports and the ScriptVisual union resolve), so nothing
        # touches the real, shared src/visuals-local/.
        slugs = {"tmpl-basic": "basic", "tmpl-algo": "algo", "for": "basic"}
        stage = HERE / "src/visuals-local"
        overlay: dict[str, str] = {}
        entries = []
        for slug, template in slugs.items():
            files = visual_host.render_visual_template(template, slug)
            for name, body in files.items():
                overlay[str(stage / slug / name)] = body
            entries.append(visual_host._local_entry(slug, has2d=True, has3d=False))
        for name, body in visual_host._local_bridge_contents(entries).items():
            overlay[str(stage / name)] = body
        r = subprocess.run(
            ["node", str(HERE / "scripts/tsc-overlay.mjs")],
            input=json.dumps(overlay),
            capture_output=True,
            text=True,
            cwd=HERE,
            timeout=120,
        )
        self.assertEqual(r.returncode, 0, "scaffold templates do not type-check:\n" + r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
