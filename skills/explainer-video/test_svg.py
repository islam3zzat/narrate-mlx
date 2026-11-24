"""The `svg` visual: feature flag, schema errors at `check`, focus ids, lint, mode rules, and reveal timing against the corpus audio.

Parser and theme tests are TypeScript (tests/vectors/svg.test.ts, svg-render.test.ts); these run through cli.ts / explainer.py.
"""
import json, os, unittest
from pathlib import Path
from unittest import mock

import explainer
import timing
from test_semantics import HERE, tsx

GOOD = ('<svg viewBox="0 0 1700 560"><rect x="10" y="10" width="100" height="60" fill="primary"/>'
        '<g id="a"><rect x="200" y="200" width="100" height="60"/><text x="210" y="240">Alpha</text></g>'
        '<g id="b"><line x1="300" y1="230" x2="600" y2="230" arrow="end"/></g></svg>')


def visual(svg=GOOD, parts=None):
    return {"type": "svg", "heading": "h", "parts": parts or [{"id": "a", "label": "alpha"}, {"id": "b", "label": "beta"}], "svg": svg}


def script(vis=None, **kw):
    sc = {"id": "s1", "narration": "First alpha, then beta, then the rest.", "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class SvgSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cont = script()
        cont["scenes"].append({"id": "s2", "narration": "More alpha and beta.", "visual": visual(), "continues": True})
        cls.V = validate({
            "valid": script(),
            "bad_script": script(visual(GOOD.replace("</svg>", "<script>alert(1)</script></svg>"))),
            "bad_onclick": script(visual(GOOD.replace('fill="primary"', 'fill="primary" onclick="x()"'))),
            "bad_hex": script(visual(GOOD.replace('fill="primary"', 'fill="#ff0000"'))),
            "bad_doctype": script(visual("<!DOCTYPE svg>" + GOOD)),
            "bad_unclosed": script(visual(GOOD.replace("</svg>", ""))),
            "missing": script(visual(parts=[{"id": "a", "label": "alpha"}, {"id": "b", "label": "beta"}, {"id": "c", "label": "gamma"}])),
            "unlisted": script(visual(parts=[{"id": "a", "label": "alpha"}])),
            "dup": script(visual(parts=[{"id": "a", "label": "alpha"}, {"id": "a", "label": "alpha again"}, {"id": "b", "label": "beta"}])),
            "dupgroups": script(visual(GOOD.replace('<g id="b">', '<g id="a">'))),
            "mode_3d": script(mode="3d"),
            "mode_2d": script(mode="2d"),
            "focus_ok": script(scene={"focus": [{"at": "beta", "on": ["b"]}]}),
            "focus_bad": script(scene={"focus": [{"at": "beta", "on": ["zzz"]}]}),
            "focus_link": script(scene={"focus": [{"at": "beta", "on": ["a->b"]}]}),
            "focus_other": script(vis={"type": "bullets", "heading": "h", "items": ["a"]}, scene={"focus": [{"at": "beta", "on": ["a"]}]}),
            "continues": cont,
            "lint_missing": script(visual(parts=[{"id": "a", "label": "alpha"}, {"id": "b", "label": "zebra crossing"}])),
            "lint_ar": script(scene={"narration": "العميل ثم الخادم"}, language="ar", vis=visual(parts=[{"id": "a", "label": "العميل"}, {"id": "b", "label": "الخادم"}])),
        })

    def test_valid_drawing_passes_with_no_messages(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_markup_is_rejected_not_stripped(self):
        for key, want in (
            ("bad_script", "<script> is not allowed"),
            ("bad_onclick", "event handlers"),
            ("bad_hex", "colour name"),
            ("bad_doctype", "DOCTYPE"),
            ("bad_unclosed", "never closed"),
        ):
            with self.subTest(key):
                errs = self.V[key]["errors"]
                self.assertTrue(errs and errs[0].startswith(f"{key}/s1: visual.svg: "), errs)
                self.assertTrue(any(want in e for e in errs), errs)

    def test_parts_and_groups_must_match_both_ways(self):
        self.assertIn('no top-level <g id="c">', self.V["missing"]["errors"][0])
        self.assertIn('<g id="b"> is not listed in parts', self.V["unlisted"]["errors"][0])
        self.assertIn('duplicate part id "a"', " ".join(self.V["dup"]["errors"]))
        self.assertIn("duplicate id", " ".join(self.V["dupgroups"]["errors"]))

    def test_svg_is_two_d_only(self):
        errs = self.V["mode_3d"]["errors"]
        self.assertTrue(any('"svg" cannot be drawn in "3d" mode' in e for e in errs), errs)
        self.assertEqual(self.V["mode_2d"]["errors"], [])

    def test_focus_resolves_part_ids(self):
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "zzz"' in e for e in self.V["focus_bad"]["errors"]), self.V["focus_bad"])
        self.assertTrue(any('no edge, relation or message "a->b"' in e for e in self.V["focus_link"]["errors"]), self.V["focus_link"])
        msg = self.V["focus_other"]["errors"][0]
        self.assertIn("svg", msg)

    def test_continues_is_not_supported(self):
        errs = self.V["continues"]["errors"]
        self.assertTrue(any("continues works on graph, class and sequence" in e for e in errs), errs)

    def test_lint_label_without_a_narration_word(self):
        w = self.V["lint_missing"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn('svg part "b"', w[0])
        self.assertIn("shares no word with the narration", w[0])
        self.assertEqual(self.V["valid"]["warnings"], [])

    def test_lint_arabic_geometry_not_mirrored(self):
        w = self.V["lint_ar"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn("not mirrored", w[0])

    def test_describe_gives_one_slot_per_part(self):
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([{"visual": visual(), "prev": None}])))
        self.assertEqual(out, [{"slots": ["alpha", "beta"], "carried": [False, False]}])


class SvgFeatureFlagTests(unittest.TestCase):
    def run_validate(self, flags, s=None):
        s = s or script()
        with mock.patch.dict(os.environ, {"NARRATE_FEATURES": flags}):
            return explainer.validate_all([("v", s)])

    def test_off_by_default_with_the_flag_message(self):
        errs = self.run_validate("")
        self.assertEqual(len(errs), 1)
        self.assertIn('"svg" visuals are behind a feature flag that is off (add --features svg or set NARRATE_FEATURES=svg', errs[0])
        self.assertEqual(self.run_validate("3d"), errs)

    def test_on_with_the_flag(self):
        self.assertEqual(self.run_validate("svg"), [])
        self.assertEqual(self.run_validate("3d,svg"), [])
        self.assertEqual(self.run_validate("arabic svg"), [])

    def test_other_visuals_unaffected_when_off(self):
        self.assertEqual(self.run_validate("", script(vis={"type": "bullets", "heading": "h", "items": ["a"]})), [])

    def test_svg_in_a_3d_script_fails_even_with_both_flags(self):
        errs = self.run_validate("3d,svg", script(mode="3d"))
        self.assertTrue(any('"svg" cannot be drawn in "3d" mode' in e for e in errs), errs)


class SvgTimingTests(unittest.TestCase):
    """Reveal times of the corpus svg scenes (needs `make golden-audio` to have run): monotonic, and each part lands
    on its label word (a distinct word in the narration), REVEAL_LEAD before it is spoken."""
    DATA = HERE / "tests/corpus/public/data/svg.json"

    def test_reveals_follow_the_label_words(self):
        if not self.DATA.exists():
            self.skipTest("no corpus audio (run make golden-audio)")
        data = json.loads(self.DATA.read_text(encoding="utf-8"))
        checked = 0
        for sc in data["scenes"]:
            v = sc["visual"]
            rs = sc["revealSec"]
            self.assertEqual(len(rs), len(v["parts"]))
            self.assertEqual(rs, sorted(rs), f"{sc['id']}: reveals not monotonic: {rs}")
            pos = 0
            for part, t in zip(v["parts"], rs):
                key = timing.norm(part["label"].split()[0])
                hit = next(i for i in range(pos, len(sc["words"])) if timing.norm(sc["words"][i]["w"]) == key)
                pos = hit + 1
                want = sc["words"][hit]["start"] - timing.REVEAL_LEAD
                self.assertLessEqual(abs(t - want), 0.1, f"{sc['id']} part {part['id']}: reveal {t}s, label word '{part['label']}' at {want:.3f}s")
                checked += 1
        self.assertEqual(checked, 11)


if __name__ == "__main__":
    unittest.main()
