"""The `stat` visual (schema, limits, character rules, lint, focus, mode rule, semantics, templates) through cli.ts / explainer.py.

The pure parts (formatting, counter, bars, change chip) are TypeScript: tests/vectors/stat.test.ts.
"""
import json, unittest

from test_semantics import tsx


def st(label, value, **kw):
    return {"label": label, "value": value, **kw}


def visual(stats=None, **kw):
    return {"type": "stat", "heading": "h", "stats": stats if stats is not None else [st("uptime", 99.9, unit="%")], **kw}


def script(vis=None, narration="Uptime reached 99.9 percent.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


def name_fix(vis):
    return vis_fix(vis)


def vis_fix(vis):
    """Test helper: `from_` is the Python spelling of the JSON key `from`."""
    for s in vis.get("stats", []):
        if "from_" in s:
            s["from"] = s.pop("from_")
    return vis


class StatSchemaTests(unittest.TestCase):
    LIMIT_CASES = (
        ("no stats", visual([]), "stats"),
        ("five stats", visual([st(f"stat{i}", i) for i in range(5)]), "stats"),
        ("label 41 cells", visual([st("x" * 41, 1)]), "41 display cells"),
        ("label 42 cells (wide)", visual([st("漢" * 21, 1)]), "42 display cells"),
        ("unit 13 chars", visual([st("a", 1, unit="x" * 13)]), "unit is 13"),
        ("decimals 5", visual([st("a", 1, decimals=5)]), "decimals"),
        ("decimals -1", visual([st("a", 1, decimals=-1)]), "decimals"),
        ("decimals 1.5", visual([st("a", 1, decimals=1.5)]), "decimals"),
        ("value 1e13", visual([st("a", 1e13)]), "too large"),
        ("negative from", visual([st("a", 5, from_=-1)]), "0 or more"),
        ("max under value", visual([st("a", 50, from_=10, max=20)]), "max 20"),
        ("duplicate id", visual([st("one", 1, id="x"), st("two", 2, id="x")]), 'duplicate stat id "x"'),
        ("decimals would round", visual([st("a", 3.14, decimals=1)]), "round it in the source"),
        ("too many inferred decimals", visual([st("a", 0.12345)]), "more than 4 decimal places"),
        ("scaled too large", visual([st("a", 1e12, decimals=4)]), "too large to show exactly"),
        ("long heading", visual(heading="h" * 51), "heading"),
        ("long caption", visual(caption="c" * 161), "caption"),
        ("unknown field", visual([{"label": "a", "value": 1, "bogus": 1}]), "bogus"),
    )
    CHAR_CASES = (("zero-width", "\u200b"), ("override", "\u202e"), ("mark", "\u200e"), ("newline", "\n"), ("C1", "\u0085"))

    @classmethod
    def setUpClass(cls):
        edge_vis = (
            visual([st(f"stat{i}", i) for i in range(4)]),
            visual([st("x" * 40, 1)]),
            visual([st("a", 1e12)]),
            visual([st("a", 1.2345, decimals=4)]),
            visual([st("dip", -3, unit="dB")]),
            visual([st("a", 97, **{"from": 92}, max=100, unit="%")]),
        )
        cases = {
            "valid": script(),
            "head_override": script(visual(heading="a\u202eb")),
            "head_mark": script(visual(heading="a\u200eb")),
        }
        for i, (_, vis, _) in enumerate(cls.LIMIT_CASES):
            cases[f"lim_{i}"] = script(json.loads(json.dumps(vis_fix(vis))))
        for i, vis in enumerate(edge_vis):
            cases[f"edge_{i}"] = script(vis_fix(vis))
        for i, (_, ch) in enumerate(cls.CHAR_CASES):
            cases[f"char_{i}"] = script(visual([st(f"a{ch}b", 1)]))
        cls.V = validate(cases)

    def test_valid_stat_passes_with_no_messages(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_limits_each_an_error_with_the_field_named(self):
        for i, (name, _, want) in enumerate(self.LIMIT_CASES):
            key = f"lim_{i}"
            with self.subTest(name):
                errs = self.V[key]["errors"]
                self.assertTrue(errs and errs[0].startswith(f"{key}/s1: visual."), errs)
                self.assertIn(want, " ".join(errs))

    def test_edge_values_pass(self):
        for i in range(6):
            self.assertEqual(self.V[f"edge_{i}"]["errors"], [], i)

    def test_character_rules_name_the_codepoint(self):
        for i, (name, _) in enumerate(self.CHAR_CASES):
            with self.subTest(name):
                errs = self.V[f"char_{i}"]["errors"]
                self.assertTrue(any("label has" in e for e in errs), errs)
        self.assertTrue(any("U+202E" in e for e in self.V["head_override"]["errors"]))
        self.assertEqual(self.V["head_mark"]["errors"], [])  # a direction mark is only a lint warning

    def test_nan_is_a_parse_error(self):
        s = json.dumps(script(visual([st("a", 1)]))).replace('"value": 1}', '"value": NaN}')
        with self.assertRaises(AssertionError):
            tsx(["src/cli.ts", "validate"], '{"v": ' + s + "}")


class StatBehaviourTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        vis_focus = visual([st("uptime", 99.9, id="a"), st("latency", 180, id="b"), st("errors", 2)])
        narr = "Uptime reached 99.9 percent. Latency fell to 180. Errors stayed at 2."
        cls.V = validate({
            "mode_3d": script(mode="3d"),
            "continues": {"title": "t", "scenes": [script()["scenes"][0], {**script()["scenes"][0], "id": "s2", "continues": True}]},
            "focus_ok": script(vis_focus, narr, scene={"focus": [{"at": "latency fell", "on": ["b"]}, {"at": "errors", "on": []}]}),
            "focus_bad": script(vis_focus, narr, scene={"focus": [{"at": "latency fell", "on": ["nope"]}]}),
        })

    def test_describe_gives_one_slot_per_label(self):
        v = vis_fix(visual([st("uptime", 99.9), st("latency", 180, from_=420)]))
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([{"visual": v, "prev": None}])))
        self.assertEqual(out, [{"slots": ["uptime", "latency"], "carried": [False, False]}])

    def test_two_d_only_and_no_continues(self):
        errs = self.V["mode_3d"]["errors"]
        self.assertTrue(any('"stat" cannot be drawn in "3d" mode' in e for e in errs), errs)
        self.assertTrue(any("continues works on" in e for e in self.V["continues"]["errors"]))

    def test_focus_names_stat_ids(self):
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in self.V["focus_bad"]["errors"]))


class StatLintTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        nat_vis = vis_fix(visual([
            st("tail latency", 180, from_=420, unit="ms", better="down"),
            st("median latency", 60, from_=95, unit="ms", better="down"),
        ]))
        cls.V = validate({
            "lbl_missing": script(visual([st("uptime", 99.9), st("latency", 180)]), "Something else entirely, 99.9 and 180."),
            "lbl_order": script(visual([st("uptime", 99.9), st("latency", 180)]), "Latency fell to 180. Uptime reached 99.9."),
            "num_missing": script(visual([st("uptime", 99.9)]), "Uptime reached 99.5 percent."),
            "num_words": script(visual([st("uptime", 99.9)]), "Uptime reached ninety nine point nine."),
            "num_comma": script(visual([st("traffic", 12500, unit="req/s")]), "Traffic reached 12,500 requests."),
            "num_in_lbl_bad": script(visual([st("saved 30%", 25)]), "Saved 30% but the number is 25."),
            "num_in_lbl_ok": script(visual([st("p99 latency", 180)]), "The p99 latency is 180."),
            "no_change": script(vis_fix(visual([st("uptime", 99, from_=99)])), "Uptime stayed at 99."),
            "ignored": script(visual([st("uptime", 99, better="up", max=100)]), "Uptime is 99."),
            "tone_contra": script(vis_fix(visual([st("latency", 180, from_=420, better="down", tone="bad")])), "Latency fell from 420 to 180."),
            "diff_units": script(vis_fix(visual([st("latency", 180, from_=420, unit="ms"), st("errors", 3, from_=2, unit="%")])),
                                 "Latency fell from 420 to 180, errors rose from 2 to 3."),
            "tiny_bar": script(vis_fix(visual([st("traffic", 5000, from_=4000, unit="req"), st("errors", 20, from_=15, unit="req")])),
                               "Traffic rose from 4000 to 5000, errors from 15 to 20."),
            "currency": script(visual([st("revenue", 12, unit="$")]), "Revenue was 12."),
            "arabic": script(visual([st("uptime", 99.9)]), "Uptime 99.9", language="ar"),
            "dir_mark": script(visual(heading="a\u200eb")),
            "natural": script(nat_vis, "Tail latency fell from 420 to 180. Median latency fell from 95 to 60."),
        })

    def test_label_not_in_narration_and_order(self):
        w = self.V["lbl_missing"]["warnings"]
        self.assertTrue(any('stat 1: its label "uptime" shares no word' in x for x in w), w)
        w = self.V["lbl_order"]["warnings"]
        self.assertTrue(any('"latency" is spoken first' in x or 'is listed after "uptime"' in x for x in w), w)

    def test_number_not_said(self):
        w = self.V["num_missing"]["warnings"]
        self.assertTrue(any("never says value 99.9" in x for x in w), w)
        self.assertEqual(self.V["num_words"]["warnings"], [])
        self.assertEqual(self.V["num_comma"]["warnings"], [])

    def test_number_in_label(self):
        w = self.V["num_in_lbl_bad"]["warnings"]
        self.assertTrue(any("neither value nor from" in x for x in w), w)
        self.assertEqual(self.V["num_in_lbl_ok"]["warnings"], [])

    def test_from_equals_value_and_ignored_fields(self):
        w = self.V["no_change"]["warnings"]
        self.assertTrue(any("no change" in x for x in w), w)
        w = self.V["ignored"]["warnings"]
        self.assertTrue(any("better` is ignored" in x for x in w) and any("max` is ignored" in x for x in w), w)

    def test_tone_contradicts_better(self):
        w = self.V["tone_contra"]["warnings"]
        self.assertTrue(any('overrides better "down"' in x for x in w), w)

    def test_units_and_bars(self):
        w = self.V["diff_units"]["warnings"]
        self.assertTrue(any("different units" in x for x in w), w)
        w = self.V["tiny_bar"]["warnings"]
        self.assertTrue(any("tiny" in x for x in w), w)

    def test_currency_symbol_in_unit(self):
        w = self.V["currency"]["warnings"]
        self.assertTrue(any("write the currency as a word" in x for x in w), w)

    def test_arabic_script_warns(self):
        w = self.V["arabic"]["warnings"]
        self.assertTrue(any("English only" in x for x in w), w)

    def test_direction_marks_in_heading_warn(self):
        w = self.V["dir_mark"]["warnings"]
        self.assertTrue(any("direction-control" in x for x in w), w)

    def test_natural_narration_triggers_no_warning(self):
        self.assertEqual(self.V["natural"], {"errors": [], "warnings": []})


if __name__ == "__main__":
    unittest.main()
