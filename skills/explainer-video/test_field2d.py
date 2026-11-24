"""The `field2d` visual (scalar & vector schemas, overlay mode checks, focus, lints) via cli.ts."""
import json, unittest

from test_semantics import tsx


def scalar_vis(**kw):
    base = {
        "type": "field2d",
        "heading": "Hill contours",
        "mode": "scalar",
        "xDomain": [-3, 3],
        "yDomain": [-2, 2],
        "expr": "exp(-(x^2 + y^2))",
        "overlays": [{"id": "grad", "kind": "gradient", "label": "Gradient arrows"}],
    }
    base.update(kw)
    return base


def vector_vis(**kw):
    base = {
        "type": "field2d",
        "heading": "Vortex",
        "mode": "vector",
        "xDomain": [-3, 3],
        "yDomain": [-2, 2],
        "fx": "-y",
        "fy": "x",
        "overlays": [{"id": "wheel", "kind": "curl", "label": "Curl wheel", "at": [0, 0]}],
    }
    base.update(kw)
    return base


def script(vis, narration="Gradient arrows point uphill.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class Field2DTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.V = validate({
            "scalar": script(scalar_vis()),
            "vector": script(vector_vis(), "Spin the curl wheel."),
            "bad_fx": script(scalar_vis(fx="x")),
            "bad_overlay": script(vector_vis(overlays=[{"kind": "slice", "label": "Slice", "axis": "x", "at": 0}])),
            "bad_expr": script(scalar_vis(expr="z + 1")),
            "focus_ok": script(scalar_vis(), "Gradient arrows point uphill.", scene={"focus": [{"at": "uphill", "on": ["grad"]}]}),
            "focus_bad": script(scalar_vis(), "Gradient arrows point uphill.", scene={"focus": [{"at": "uphill", "on": ["nope"]}]}),
            "oob_warn": script(vector_vis(overlays=[{"kind": "curl", "label": "Curl wheel", "at": [10, 0]}]), "Curl wheel."),
        })

    def test_valid_scalar_and_vector_pass(self):
        self.assertEqual(self.V["scalar"], {"errors": [], "warnings": []})
        self.assertEqual(self.V["vector"], {"errors": [], "warnings": []})

    def test_mode_cross_checks_and_expressions(self):
        self.assertTrue(any("vector mode" in e for e in self.V["bad_fx"]["errors"]), self.V["bad_fx"]["errors"])
        self.assertTrue(any("scalar mode" in e for e in self.V["bad_overlay"]["errors"]), self.V["bad_overlay"]["errors"])
        self.assertTrue(any("allowed variables" in e for e in self.V["bad_expr"]["errors"]), self.V["bad_expr"]["errors"])

    def test_focus_targets_overlay_ids(self):
        self.assertEqual(self.V["focus_ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in self.V["focus_bad"]["errors"]))

    def test_out_of_domain_overlay_warns(self):
        w = self.V["oob_warn"]["warnings"]
        self.assertTrue(any("outside plot domain" in x for x in w), w)


if __name__ == "__main__":
    unittest.main()
