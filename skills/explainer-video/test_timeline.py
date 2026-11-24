"""The `timeline` visual (schema, lint, focus, mode rule, semantics) and the narration lints (src/lint-narration.ts) surfacing through `check`.

The lint functions themselves are TypeScript (tests/vectors/lint-narration.test.ts); these run through cli.ts / explainer.py.
"""
import json, subprocess, sys, tempfile, unittest
from pathlib import Path

import explainer
from test_semantics import HERE, tsx


def ev(at, label, **kw):
    return {"at": at, "label": label, **kw}


def visual(events=None, **kw):
    return {"type": "timeline", "heading": "h", "events": events or [ev("14:02 UTC", "alert"), ev("14:09 UTC", "ack")], **kw}


def script(vis=None, narration="First the alert fired, then the ack came.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class TimelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evs_sm = [ev(str(i), "alert", status=s, marker=m) for i, (s, m) in enumerate(
            [("confirmed", "detected"), ("reported", "mitigated"), ("unknown", "resolved"), (None, "impact"), ("confirmed", "none")])]
        evs_sm = [{k: x for k, x in e.items() if x is not None} for e in evs_sm]
        vis_focus = visual([ev("14:02", "alert", id="a"), ev("14:09", "ack", id="b"), ev("14:20", "late")])
        two = {"title": "t", "scenes": [script()["scenes"][0], {**script()["scenes"][0], "id": "s2", "continues": True}]}
        cls.V = validate({
            "valid": script(),
            "lim_one": script(visual([ev("1", "alert")])),
            "lim_eleven": script(visual([ev(str(i), "alert") for i in range(11)])),
            "lim_status": script(visual([ev("1", "alert", status="sure"), ev("2", "ack")])),
            "lim_marker": script(visual([ev("1", "alert", marker="fixed"), ev("2", "ack")])),
            "lim_at": script(visual([ev(" ", "alert"), ev("2", "ack")])),
            "lim_dup": script(visual([ev("1", "alert", id="x"), ev("2", "ack", id="x")])),
            "all_sm": script(visual(evs_sm)),
            "mode_3d": script(mode="3d"),
            "continues": two,
            "focus_ok": script(vis_focus, scene={"focus": [{"at": "alert fired", "on": ["a"]}, {"at": "ack", "on": []}]}),
            "focus_bad": script(vis_focus, scene={"focus": [{"at": "alert fired", "on": ["nope"]}]}),
            "lint_none": script(narration="Something else entirely happened here."),
            "lint_order": script(narration="First the ack came, then the alert fired."),
            "lint_reused_ok": script(visual([ev("10:00", "Alpha"), ev("10:01", "Beta"), ev("10:02", "Alpha again"), ev("10:03", "Gamma")]),
                                     narration="Alpha first. Beta second. Alpha again. Gamma last."),
            "lint_reused_bad": script(visual([ev("10:00", "Alpha"), ev("10:01", "Beta"), ev("10:02", "Gamma")]),
                                      narration="Alpha first. Gamma second. Beta last."),
            "time_bad": script(visual([ev("14:09 UTC", "alert"), ev("14:02 UTC", "ack")])),
            "time_ok_0": script(visual([ev("23:50", "alert"), ev("00:10", "ack")])),
            "time_ok_1": script(visual([ev("Day 2", "alert"), ev("Day 1", "ack")])),
            "time_ok_2": script(visual([ev("14:09", "alert"), ev("later", "ack")])),
            "arabic": script(visual([ev("14:02", "التنبيه"), ev("14:09", "الاستجابة")]), narration="التَّنْبِيهُ ثُمَّ الِاسْتِجَابَةُ", language="ar"),
        })

    def test_valid_timeline_passes_with_no_messages(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_schema_limits_and_enums(self):
        for key, want in (
            ("lim_one", "events"),
            ("lim_eleven", "events"),
            ("lim_status", "status"),
            ("lim_marker", "marker"),
            ("lim_at", "at"),
            ("lim_dup", 'duplicate event id "x"'),
        ):
            with self.subTest(key):
                errs = self.V[key]["errors"]
                self.assertTrue(errs and errs[0].startswith(f"{key}/s1: visual."), errs)
                self.assertIn(want, " ".join(errs))

    def test_all_statuses_and_markers_accepted(self):
        self.assertEqual(self.V["all_sm"]["errors"], [])

    def test_describe_gives_one_slot_per_event_label(self):
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([{"visual": visual(), "prev": None}])))
        self.assertEqual(out, [{"slots": ["alert", "ack"], "carried": [False, False]}])

    def test_two_d_only_and_no_continues(self):
        errs = self.V["mode_3d"]["errors"]
        self.assertTrue(any('"timeline" cannot be drawn in "3d" mode' in e for e in errs), errs)
        self.assertTrue(any("continues works on" in e for e in self.V["continues"]["errors"]))

    def test_focus_names_event_ids(self):
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in self.V["focus_bad"]["errors"]))

    def test_lint_label_not_in_narration_and_order(self):
        w = self.V["lint_none"]["warnings"]
        self.assertEqual(len(w), 2)
        self.assertIn('timeline event 1: its label "alert" shares no word with the narration', w[0])
        w = self.V["lint_order"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn("is listed after", w[0])

    def test_lint_reused_label_words_in_order_do_not_warn(self):
        self.assertEqual(self.V["lint_reused_ok"]["warnings"], [])
        w = self.V["lint_reused_bad"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn('"Gamma" is listed after "Beta"', w[0])

    def test_lint_time_order(self):
        w = self.V["time_bad"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn('"14:02 UTC" comes after "14:09 UTC"', w[0])
        for key in ("time_ok_0", "time_ok_1", "time_ok_2"):
            self.assertEqual(self.V[key]["warnings"], [], key)

    def test_arabic_has_no_mirroring_warning(self):
        self.assertEqual(self.V["arabic"], {"errors": [], "warnings": []})


class NarrationLintTests(unittest.TestCase):
    def check(self, scripts):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "scripts").mkdir()
            for vid, s in scripts.items():
                (Path(d) / "scripts" / f"{vid}.json").write_text(json.dumps(s))
            r = subprocess.run([sys.executable, str(HERE / "explainer.py"), "check", d, *scripts], capture_output=True, text=True, env=explainer.tool_env(), cwd=HERE)
        return r

    def bullets(self, narration, **kw):
        return {"title": "t", "scenes": [{"id": "s1", "narration": narration, "visual": {"type": "bullets", "heading": "h", "items": ["a", "b"]}}], **kw}

    def test_check_warns_about_a_three_number_sentence(self):
        r = self.check({"v": self.bullets("At 14:02 the error rate hit 99.9% on 3 hosts.")})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("warning: v/s1: 3 numbers in one sentence", r.stderr)

    def test_check_is_quiet_for_a_clean_narration_and_for_blame_by_default(self):
        r = self.check({"v": self.bullets("The error rate rose at 14:02. It was human error, and the engineer should have checked.")})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("numbers in one sentence", r.stderr)
        self.assertNotIn("blame phrase", r.stderr)

    def test_validate_flags_acronym_and_long_sentence_and_skips_arabic(self):
        long = " ".join(["word"] * 31) + "."
        out = validate({"v": self.bullets(f"The DNS failed. {long}")})["v"]["warnings"]
        self.assertTrue(any("v/s1: acronym DNS" in w for w in out), out)
        self.assertTrue(any("31-word sentence" in w for w in out), out)
        ar = validate({"v": self.bullets("DNS 1 2 3 " + long, language="ar")})["v"]["warnings"]
        self.assertEqual([w for w in ar if "acronym" in w or "numbers" in w or "word sentence" in w], [])


if __name__ == "__main__":
    unittest.main()
