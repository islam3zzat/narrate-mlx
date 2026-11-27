"""Styles (styles/<name>.json + .md), the fact ledger as seen through `explainer.py`, .

The ledger and style rules themselves are TypeScript (tests/vectors/ledger.test.ts); these run through explainer.py / cli.ts.
"""
import contextlib, io, json, os, re, subprocess, sys, tempfile, unittest, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

import audio
import explainer
import validation
from test_semantics import HERE, tsx, tool_env

STYLES = HERE / "styles"
SKELETON_STYLES = [n for n in explainer.style_names() if n != explainer.DEFAULT_STYLE]


def run(*args, features="", cwd=None):
    env = {**tool_env(), "NARRATE_FEATURES": features}
    r = subprocess.run([sys.executable, str(HERE / "explainer.py"), *args], capture_output=True, text=True, env=env, cwd=cwd or HERE)
    return r.returncode, r.stdout, r.stderr


def make_workdir(tmp, style):
    wd = Path(tmp) / style
    code, out, err = run("init", str(wd), "--style", style)
    assert code == 0, err
    return wd


class RegistryTests(unittest.TestCase):
    def test_every_json_has_a_playbook_and_a_matching_name(self):
        names = sorted(p.stem for p in STYLES.glob("*.json"))
        self.assertGreaterEqual(len(names), 6)
        self.assertEqual(names, sorted(n for n in explainer.style_names() if (STYLES / f"{n}.json").is_file()))
        for n in names:
            self.assertTrue((STYLES / f"{n}.md").is_file(), n)
            self.assertEqual(json.loads((STYLES / f"{n}.json").read_text())["name"], n)
        self.assertEqual(sorted(p.stem for p in STYLES.glob("*.md")), names, "a playbook without a definition")

    def test_style_schema_matches_committed_file(self):
        code, out, err = run("schema", "--style", "--builtin")
        self.assertEqual(code, 0, err)
        schema = json.loads(out)
        self.assertEqual(schema, json.loads((HERE / "schema/style.schema.json").read_text(encoding="utf-8")))
        self.assertIn("bounds", schema.get("properties", {}))

    def test_custom_workdir_style_validates_without_ts_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp) / "proj"
            (wd / "styles").mkdir(parents=True)
            (wd / "scripts").mkdir(parents=True)
            custom = {
                "name": "lab-demo",
                "description": "Short lab demo",
                "audience": "engineers",
                "defaults": {"speed": 1.05},
                "bounds": {"scenes": [2, 6], "seconds": [30, 120], "wordsPerScene": [10, 50]},
                "preferredVisuals": ["bullets", "code"],
                "ledger": {"required": False, "kinds": [], "mustCover": [], "coverHigh": False, "quoteKinds": [], "allowDeferred": True},
                "sections": ["setup", "result"],
                "lint": {"blameless": False},
            }
            (wd / "styles/lab-demo.json").write_text(json.dumps(custom), encoding="utf-8")
            (wd / "styles/lab-demo.md").write_text("# lab-demo\nPlaybook.\n", encoding="utf-8")
            script = {
                "title": "Demo",
                "style": "lab-demo",
                "scenes": [
                    {"id": "s1", "section": "setup", "narration": "First we configure the lab environment.", "visual": {"type": "bullets", "heading": "Setup", "items": ["Configure"]}},
                    {"id": "s2", "section": "result", "narration": "Here is the final measured result.", "visual": {"type": "bullets", "heading": "Result", "items": ["Measured"]}},
                ],
            }
            (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")
            code, out, err = run("check", str(wd))
            self.assertEqual(code, 0, err)
            self.assertIn("[style lab-demo]", out)

    def test_every_definition_passes_the_zod_schema(self):
        """cli.ts loads the style file through StyleSchema: a bad file fails the validate call."""
        payload = {
            n: {"title": "t", "style": n, "scenes": [{"id": "s1", "narration": "one two three", "visual": {"type": "bullets", "heading": "h", "items": ["a"]}}]}
            for n in explainer.style_names()
        }
        out = json.loads(tsx(["src/cli.ts", "validate"], json.dumps(payload)))
        for n in payload:
            with self.subTest(n):
                self.assertEqual(out[n]["errors"], [])

    def test_styles_json_lists_every_style_with_its_playbook(self):
        code, out, err = run("styles", "--json")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual([s["name"] for s in data["styles"]], explainer.style_names())
        for s in data["styles"]:
            self.assertTrue(Path(s["playbook"]).is_file())
        self.assertNotIn("enabled", data)


class DefaultsTests(unittest.TestCase):
    def test_speed_cli_beats_style_beats_one(self):
        quick, none = {"style": "quick-brief"}, {}
        self.assertEqual(explainer.resolve_speed(quick, None), 1.1)
        self.assertEqual(explainer.resolve_speed(quick, 1.3), 1.3)
        self.assertEqual(explainer.resolve_speed({"style": "incident-review"}, None), 0.95)
        self.assertEqual(explainer.resolve_speed({"style": "explainer"}, None), 1.0)
        self.assertEqual(explainer.resolve_speed(none, None), 1.0)
        self.assertIsInstance(explainer.resolve_speed(none, None), float)   # the cache key prints "1.0" as before
        self.assertEqual(explainer.resolve_speed(none, 0.8), 0.8)

    def test_voice_cli_beats_style(self):
        self.assertIsNone(explainer.resolve_voice({"style": "quick-brief"}, None))
        self.assertEqual(explainer.resolve_voice({"style": "quick-brief"}, "am_michael"), "am_michael")
        self.assertIsNone(explainer.resolve_voice({}, None))

    def test_workdir_style_speed_and_voice_resolve_and_shadow_builtin(self):
        def write_wav(path: Path) -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(24000)
                w.writeframes(b"\x00\x00" * 12000)

        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp) / "proj"
            (wd / "styles").mkdir(parents=True)
            (wd / "scripts").mkdir(parents=True)
            local_style = {
                "name": "lab-pace",
                "description": "Custom workdir style",
                "audience": "engineers",
                "defaults": {"speed": 1.2, "voice": "bm_george"},
                "bounds": {"scenes": [1, 5], "seconds": [10, 120], "wordsPerScene": [2, 40]},
                "preferredVisuals": ["bullets"],
                "ledger": {"required": False, "kinds": [], "mustCover": [], "coverHigh": False, "quoteKinds": [], "allowDeferred": False},
                "lint": {"blameless": False},
            }
            (wd / "styles/lab-pace.json").write_text(json.dumps(local_style), encoding="utf-8")
            (wd / "styles/lab-pace.md").write_text("# lab-pace\nPlaybook.\n", encoding="utf-8")

            shadow = {**local_style, "name": "quick-brief", "defaults": {"speed": 1.35}}
            (wd / "styles/quick-brief.json").write_text(json.dumps(shadow), encoding="utf-8")
            (wd / "styles/quick-brief.md").write_text("# quick-brief\nShadow.\n", encoding="utf-8")

            self.assertEqual(explainer.resolve_speed({"style": "lab-pace"}, None, wd), 1.2)
            self.assertEqual(explainer.resolve_voice({"style": "lab-pace"}, None, wd), "bm_george")
            self.assertEqual(explainer.resolve_speed({"style": "quick-brief"}, None, wd), 1.35)

            script = {
                "title": "Demo",
                "style": "lab-pace",
                "scenes": [{"id": "s1", "narration": "Hello world.", "visual": {"type": "bullets", "heading": "H", "items": ["Hello"]}}],
            }
            (wd / "scripts/demo.json").write_text(json.dumps(script), encoding="utf-8")
            seen: list[tuple[str, float]] = []

            def fake_synth(speak, text, wav, model, vvoice, speed, lang="en"):
                seen.append((vvoice, speed))
                write_wav(wav)

            with (
                mock.patch("audio.find_speak", return_value=wd),
                mock.patch("audio.validate_all", return_value=[]),
                mock.patch("audio.check_mermaid", return_value=([], {})),
                mock.patch("audio.stage_figures", return_value=([], {})),
                mock.patch("audio.synth", side_effect=fake_synth),
                mock.patch("audio.align_scenes", return_value={}),
                mock.patch("audio.describe_visuals", return_value=[{"slots": [], "carried": []}]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                audio.cmd_audio(wd, ["demo"], None, None, None)
            self.assertEqual(seen, [("bm_george", 1.2)])

    def test_unknown_style_name_is_a_schema_error(self):
        out = json.loads(tsx(["src/cli.ts", "validate"], json.dumps({"v": {"title": "t", "style": "nope", "scenes": [
            {"id": "s1", "narration": "x", "visual": {"type": "bullets", "heading": "h", "items": ["a"]}}]}})))
        self.assertTrue(any("style" in e for e in out["v"]["errors"]), out)


class NoFlagTests(unittest.TestCase):
    def test_style_needs_no_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            wd = make_workdir(tmp, "quick-brief")
            self.assertEqual(run("check", str(wd), features="")[0], 0)

    def test_retired_styles_flag_is_accepted_with_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = run("init", str(Path(tmp) / "x"), "--style", "quick-brief", "--features", "styles", features="")
            self.assertEqual(code, 0, err)
            self.assertIn("no longer exist", err)
            code, _, err = run("init", str(Path(tmp) / "y"), "--style", "quick-brief", features="styles")
            self.assertEqual(code, 0, err)
            self.assertIn("no longer exist", err)
            code, _, err = run("init", str(Path(tmp) / "z"), "--style", "nope")
            self.assertIn("unknown style", err)


class InitTests(unittest.TestCase):
    def test_every_skeleton_passes_check(self):
        def check_style(n):
            with tempfile.TemporaryDirectory() as tmp:
                wd = make_workdir(tmp, n)
                code, out, err = run("check", str(wd))
                led_exists = (wd / "ledger.json").exists()
                ex_style = json.loads((wd / "scripts/example.json").read_text())["style"]
                return n, code, out, err, led_exists, ex_style

        with ThreadPoolExecutor(max(1, len(SKELETON_STYLES))) as ex:
            results = list(ex.map(check_style, SKELETON_STYLES))
        for n, code, out, err, led_exists, ex_style in results:
            with self.subTest(n):
                self.assertEqual(code, 0, err)
                self.assertIn(f"[style {n}]", out)
                led = explainer.load_style(n)["ledger"]["required"]
                self.assertEqual(led_exists, led, "a ledger stub exactly for styles that require one")
                self.assertEqual(ex_style, n)

    def test_init_without_style_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            run("init", str(Path(tmp) / "a"), features="")
            self.assertEqual((Path(tmp) / "a/scripts/example.json").read_bytes(), (HERE / "templates/example.json").read_bytes())
            self.assertFalse((Path(tmp) / "a/ledger.json").exists())

    def test_script_without_style_is_checked_without_a_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            run("init", str(Path(tmp) / "a"), features="")
            code, out, err = run("check", str(Path(tmp) / "a"), features="")
            self.assertEqual(code, 0, err)
            self.assertNotIn("style", out)

    def test_init_supports_workdir_and_user_local_styles_and_copyable_hints(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wd_skel = root / "wd-skel"
            (wd_skel / "styles").mkdir(parents=True)
            style_obj = {
                "name": "local-style",
                "description": "Local style",
                "audience": "devs",
                "defaults": {"speed": 1.0},
                "bounds": {"scenes": [1, 5], "seconds": [10, 120], "wordsPerScene": [2, 50]},
                "preferredVisuals": ["bullets"],
                "ledger": {"required": False, "kinds": [], "mustCover": [], "coverHigh": False, "quoteKinds": [], "allowDeferred": False},
                "lint": {"blameless": False},
            }
            (wd_skel / "styles/local-style.json").write_text(json.dumps(style_obj), encoding="utf-8")
            (wd_skel / "styles/local-style.md").write_text("# local-style\nPlaybook.\n", encoding="utf-8")
            (wd_skel / "styles/local-style.skeleton.json").write_text(
                json.dumps({"title": "Skel", "style": "local-style", "scenes": [{"id": "s1", "narration": "Hello.", "visual": {"type": "bullets", "heading": "H", "items": ["Hello"]}}]}),
                encoding="utf-8",
            )
            code, out, err = run("init", str(wd_skel), "--style", "local-style")
            self.assertEqual(code, 0, err)
            self.assertEqual(json.loads((wd_skel / "scripts/example.json").read_text())["title"], "Skel")
            self.assertIn(f"playbook: {wd_skel.resolve() / 'styles/local-style.md'}", out)
            self.assertIn(f"next: python3 {HERE / 'explainer.py'} check", out)

            user_styles = root / "user-styles"
            user_styles.mkdir(parents=True)
            (user_styles / "user-style.json").write_text(json.dumps({**style_obj, "name": "user-style"}), encoding="utf-8")
            (user_styles / "user-style.md").write_text("# user-style\nPlaybook.\n", encoding="utf-8")
            wd_user = root / "wd-user"
            buf = io.StringIO()
            with mock.patch.object(validation, "USER_STYLES_DIR", user_styles), contextlib.redirect_stdout(buf):
                explainer.cmd_init(wd_user, style="user-style")
            self.assertEqual(json.loads((wd_user / "scripts/example.json").read_text())["style"], "user-style")
            self.assertIn(f"playbook: {user_styles / 'user-style.md'}", buf.getvalue())

            code_missing, _, err_missing = run("check", str(root / "does-not-exist"))
            self.assertNotEqual(code_missing, 0)
            self.assertIn(f"Run: python3 {HERE / 'explainer.py'} init", err_missing)


class LedgerThroughCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.wd = make_workdir(self.tmp.name, "incident-review")

    def tearDown(self):
        self.tmp.cleanup()

    def add_fact(self, **kw):
        p = self.wd / "ledger.json"
        d = json.loads(p.read_text())
        d["facts"].append({"id": "e50", "kind": "event", "text": "Support saw a spike of tickets", "importance": "high", **kw})
        p.write_text(json.dumps(d))

    def cover(self, fid):
        p = self.wd / "scripts/example.json"
        d = json.loads(p.read_text())
        next(s for s in d["scenes"] if s.get("section") == "impact")["facts"].append(fid)
        p.write_text(json.dumps(d))

    def check_inproc(self, strict=False, ids=()):
        scripts = explainer.load_scripts(self.wd, list(ids))
        return explainer.validate_all(scripts, self.wd, strict=strict)

    def test_uncovered_high_fact_fails_and_passes_once_covered(self):
        self.assertEqual(run("check", str(self.wd))[0], 0)
        self.add_fact()
        code, _, err = run("check", str(self.wd))
        self.assertNotEqual(code, 0)
        self.assertIn("e50 (event, high)", err)
        self.assertIn("not covered by any scene", err)
        self.cover("e50")
        self.assertEqual(run("check", str(self.wd))[0], 0)

    def test_strict_refuses_deferral(self):
        code, _, err = run("check", str(self.wd), "--strict")
        self.assertNotEqual(code, 0)
        self.assertIn("strict mode", err)

    def test_unknown_fact_id_in_a_scene(self):
        self.cover("e99")
        errs = self.check_inproc()
        self.assertTrue(any('unknown fact id "e99"' in e for e in errs), errs)

    def test_missing_ledger_when_the_style_requires_one(self):
        (self.wd / "ledger.json").unlink()
        p = self.wd / "scripts/example.json"
        d = json.loads(p.read_text())
        for s in d["scenes"]:
            s.pop("facts", None)
        p.write_text(json.dumps(d))
        errs = self.check_inproc()
        self.assertTrue(any("needs a fact ledger" in e for e in errs), errs)

    def test_quote_missing_from_the_source(self):
        self.add_fact(quote="this sentence is not in the source")
        self.cover("e50")
        errs = self.check_inproc()
        self.assertTrue(any("quote not found in source.txt" in e for e in errs), errs)

    def test_tiny_quote_is_rejected(self):
        self.add_fact(quote="ail")
        self.cover("e50")
        errs = self.check_inproc()
        self.assertTrue(any("quote is too short" in e for e in errs), errs)

    def test_overlong_source_name_is_a_clean_error(self):
        p = self.wd / "ledger.json"
        d = json.loads(p.read_text())
        for src in ("a" * 301, "b" * 290, "d/" + "c" * 270):   # over the schema limit; over the file name limit
            d["source"] = src
            p.write_text(json.dumps(d))
            code, _, err = run("check", str(self.wd))
            self.assertNotEqual(code, 0, src[:5])
            self.assertNotIn("Traceback", err)

    def test_blameless_lint_is_on_for_incident_review_only(self):
        import io, contextlib
        p = self.wd / "scripts/example.json"
        d = json.loads(p.read_text())
        d["scenes"][0]["narration"] += " This was human error."
        p.write_text(json.dumps(d))
        buf = io.StringIO()
        with contextlib.redirect_stderr(buf):
            self.check_inproc()
        self.assertIn('blame phrase "human error"', buf.getvalue())
        d["style"] = "explainer"
        for s in d["scenes"]:
            s.pop("facts", None)
            s.pop("section", None)
        p.write_text(json.dumps(d))
        buf2 = io.StringIO()
        with contextlib.redirect_stderr(buf2):
            self.check_inproc()
        self.assertNotIn("blame phrase", buf2.getvalue())

    def test_style_bounds_are_warnings_not_errors(self):
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stderr(buf):
            errs = self.check_inproc()
        self.assertEqual(errs, [])
        self.assertIn('style "incident-review" wants 12 to 45', buf.getvalue())

    def test_ledger_and_source_cannot_leave_the_workdir(self):
        outside = Path(self.tmp.name) / "outside.txt"
        outside.write_text("The pager fired at 14:02 UTC for the checkout API error rate.")
        (self.wd / "source.txt").unlink()
        (self.wd / "source.txt").symlink_to(outside)
        errs = self.check_inproc()
        self.assertTrue(any("resolves outside the workdir" in e for e in errs), errs)
        (self.wd / "source.txt").unlink()
        (self.wd / "source.txt").write_text("x")
        real = self.wd / "ledger.json"
        data = real.read_text()
        real.unlink()
        (Path(self.tmp.name) / "led.json").write_text(data)
        real.symlink_to(Path(self.tmp.name) / "led.json")
        errs2 = self.check_inproc()
        self.assertTrue(any("ledger.json resolves outside the workdir" in e for e in errs2), errs2)

    def test_dotdot_and_absolute_source_paths_are_schema_errors(self):
        for src in ("../outside.txt", "/etc/hosts"):
            p = self.wd / "ledger.json"
            d = json.loads(p.read_text())
            d["source"] = src
            p.write_text(json.dumps(d))
            errs = self.check_inproc()
            self.assertTrue(any("source must be a relative path" in e for e in errs), errs)

    def test_coverage_counts_all_videos_in_the_workdir(self):
        """A fact covered by another video of the same workdir counts, even when only one video is checked."""
        self.add_fact()
        p = self.wd / "scripts/example.json"
        d = json.loads(p.read_text())
        part2 = {"title": "Part two", "style": "incident-review", "scenes": [
            {"id": "s1", "narration": "Support saw a spike of tickets in the afternoon at the time of the failure.", "facts": ["e50"],
             "visual": {"type": "bullets", "heading": "Support", "items": ["Spike of tickets"]}}]}
        (self.wd / "scripts/part2.json").write_text(json.dumps(part2))
        self.assertEqual(self.check_inproc(ids=["example"]), [])
        (self.wd / "scripts/part2.json").unlink()
        self.assertNotEqual(self.check_inproc(ids=["example"]), [])


if __name__ == "__main__":
    unittest.main()
