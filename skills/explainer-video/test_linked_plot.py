"""The `linked-plot` visual (schema, lint, focus, semantics) via cli.ts."""
import json, unittest

from test_semantics import tsx


def visual(**kw):
    base = {
        "type": "linked-plot",
        "heading": "Position and speed",
        "xDomain": [0, 4],
        "top": {"label": "Position", "yDomain": [0, 10], "unit": "m"},
        "bottom": {"label": "Speed", "yDomain": [0, 6], "unit": "m/s", "expr": "2 * x"},
        "stages": [{"label": "Start moving", "x": 1}, {"label": "Accelerate", "x": 3}],
    }
    base.update(kw)
    return base


def script(vis=None, narration="Start moving slowly, then accelerate forward.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class LinkedPlotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        v_none = visual(top={"label": "Pos", "yDomain": [0, 10]}, bottom={"label": "Spd", "yDomain": [0, 5]})
        v_oob = visual(stages=[{"label": "Far", "x": 9}])
        v_diff = visual(top={"label": "Position", "yDomain": [0, 10], "expr": "x"}, bottom={"label": "Speed", "yDomain": [0, 10], "expr": "5"})
        cls.V = validate({
            "valid": script(),
            "none": script(v_none),
            "oob": script(v_oob),
            "focus_ok": script(scene={"focus": [{"at": "accelerate", "on": ["top"]}]}),
            "focus_bad": script(scene={"focus": [{"at": "accelerate", "on": ["middle"]}]}),
            "diff_warn": script(v_diff),
        })

    def test_valid_passes_cleanly(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_schema_validation(self):
        self.assertTrue(any("at least one of top or bottom" in e for e in self.V["none"]["errors"]), self.V["none"]["errors"])
        self.assertTrue(any("inside xDomain" in e for e in self.V["oob"]["errors"]), self.V["oob"]["errors"])

    def test_focus_targets_top_and_bottom(self):
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "middle"' in e for e in self.V["focus_bad"]["errors"]))

    def test_consistency_lint_warns_when_explicit_curves_disagree(self):
        w = self.V["diff_warn"]["warnings"]
        self.assertTrue(any("derivative differs noticeably" in x for x in w), w)


if __name__ == "__main__":
    unittest.main()
