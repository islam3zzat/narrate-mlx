"""The `plot2d` visual (schema, expression bounds, lint, focus, mode rule, semantics) via cli.ts."""
import json, unittest

from test_semantics import tsx


def visual(curves=None, **kw):
    return {
        "type": "plot2d",
        "heading": "Slope",
        "xDomain": [-2, 4],
        "yDomain": [-1, 6],
        "curves": curves if curves is not None else [{"id": "f", "label": "Parabola", "expr": "0.5 * x^2"}],
        **kw,
    }


def script(vis=None, narration="The parabola rises steadily.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class Plot2DTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        vis_focus = visual([{"id": "s", "label": "Sine", "expr": "sin(x)"}, {"id": "c", "label": "Cosine", "expr": "cos(x)"}])
        cls.V = validate({
            "valid": script(),
            "unsafe_eval": script(visual([{"label": "Bad", "expr": "eval(x)"}])),
            "unsafe_unicode": script(visual([{"label": "Bad", "expr": "x \u2212 1"}])),
            "unsafe_pow": script(visual([{"label": "Bad", "expr": "x ** 2"}])),
            "unsafe_y": script(visual([{"label": "Bad", "expr": "x + y"}])),
            "unsafe_domain": script(visual(xDomain=[4, 2])),
            "unsafe_idx": script(visual(stages=[{"kind": "point", "label": "pt", "curve": 2, "x": 1}])),
            "unsafe_zoom": script(visual(stages=[{"kind": "zoom", "label": "z", "xDomain": [0, 1]}])),
            "unsafe_dup": script(visual([{"id": "a", "label": "One", "expr": "x"}, {"id": "a", "label": "Two", "expr": "x^2"}])),
            "mode_3d": script(mode="3d"),
            "focus_ok": script(vis_focus, "Here is sine and cosine. Focus on cosine.", scene={"focus": [{"at": "Focus on cosine", "on": ["c"]}]}),
            "focus_bad": script(vis_focus, "Here is sine and cosine.", scene={"focus": [{"at": "Here is", "on": ["missing"]}]}),
            "lint_en": script(visual(stages=[{"kind": "point", "label": "Anchor", "x": 10}]), "Parabola is shown."),
            "lint_ar": script(visual(), "Parabola", language="ar"),
        })

    def test_valid_passes_without_warnings(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_unsafe_and_malformed_inputs_rejected(self):
        for key, want in (
            ("unsafe_eval", "unknown function"),
            ("unsafe_unicode", "ASCII"),
            ("unsafe_pow", "'^'"),
            ("unsafe_y", "allowed variables"),
            ("unsafe_domain", "strictly less"),
            ("unsafe_idx", "out of range"),
            ("unsafe_zoom", "xDomain and yDomain"),
            ("unsafe_dup", "duplicate curve id"),
        ):
            with self.subTest(key):
                errs = self.V[key]["errors"]
                self.assertTrue(errs, f"expected errors for {key}")
                self.assertIn(want, " ".join(errs))

    def test_2d_only_and_focus_targets(self):
        errs = self.V["mode_3d"]["errors"]
        self.assertTrue(any('"plot2d" cannot be drawn in "3d" mode' in e for e in errs), errs)
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "missing"' in e for e in self.V["focus_bad"]["errors"]))

    def test_describe_slots_follow_stages_or_curves(self):
        v1 = visual([{"label": "Sine", "expr": "sin(x)"}, {"label": "Cosine", "expr": "cos(x)"}])
        v2 = visual(stages=[{"kind": "point", "label": "Anchor", "x": 1}, {"kind": "tangent", "label": "Slope", "x": 1}])
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([{"visual": v1, "prev": None}, {"visual": v2, "prev": None}])))
        self.assertEqual(out[0]["slots"], ["Sine", "Cosine"])
        self.assertEqual(out[1]["slots"], ["Anchor", "Slope"])

    def test_lints(self):
        w = self.V["lint_en"]["warnings"]
        self.assertTrue(any("shares no word" in x for x in w), w)
        self.assertTrue(any("outside xDomain" in x for x in w), w)
        w_ar = self.V["lint_ar"]["warnings"]
        self.assertTrue(any("left to right" in x for x in w_ar), w_ar)


if __name__ == "__main__":
    unittest.main()
