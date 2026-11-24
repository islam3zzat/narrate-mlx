"""The `surface3d` visual (3D-only mode gating, expr/grid schema, lint, semantics) via cli.ts."""
import json, unittest

from test_semantics import tsx


def visual(**kw):
    base = {
        "type": "surface3d",
        "heading": "Height surface",
        "xDomain": [-2, 2],
        "yDomain": [-2, 2],
        "expr": "cos(x) * cos(y)",
        "overlays": [{"kind": "slice", "label": "Partial slice", "axis": "x", "at": 0}],
    }
    base.update(kw)
    return base


def script(vis=None, narration="Take a partial slice along x.", mode="3d", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "mode": mode, "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class Surface3DTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.V = validate({
            "ok_3d": script(mode="3d"),
            "bad_2d": script(mode="2d"),
            "bad_expr": script(visual(expr="unknownFn(x, y)")),
            "oob_slice": script(visual(overlays=[{"kind": "slice", "label": "Partial slice", "axis": "x", "at": 9}])),
        })

    def test_valid_3d_passes_and_2d_mode_rejected(self):
        self.assertEqual(self.V["ok_3d"], {"errors": [], "warnings": []})
        self.assertTrue(any('needs "mode": "3d"' in e for e in self.V["bad_2d"]["errors"]), self.V["bad_2d"]["errors"])

    def test_schema_and_lints(self):
        self.assertTrue(any("unknown function" in e for e in self.V["bad_expr"]["errors"]), self.V["bad_expr"]["errors"])
        self.assertTrue(any("outside domain" in x for x in self.V["oob_slice"]["warnings"]), self.V["oob_slice"]["warnings"])


if __name__ == "__main__":
    unittest.main()
