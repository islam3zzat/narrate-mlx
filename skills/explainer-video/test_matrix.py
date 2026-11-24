"""Tests for the `matrix` visual (heatmap schema, highlight bounds, shorthand focus targets, lints)."""
import json, unittest

from test_semantics import tsx


def matrix_vis(**kw):
    base = {
        "type": "matrix",
        "heading": "Self-Attention Weights",
        "rowLabel": "Query Token",
        "colLabel": "Key Token",
        "rows": ["The", "quick", "fox"],
        "cols": ["The", "quick", "fox"],
        "values": [
            [0.72, 0.18, 0.10],
            [0.24, 0.56, 0.20],
            [0.12, 0.63, 0.25],
        ],
        "highlights": [
            {"id": "diag", "label": "Self alignment", "kind": "cell", "row": 0, "col": 0},
            {"id": "subj", "label": "Modifier link", "kind": "cell", "row": 2, "col": 1},
        ],
    }
    base.update(kw)
    return base


def script(vis, narration="Notice the strong Self alignment at the top corner, then the Modifier link connecting fox back to quick.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class MatrixTests(unittest.TestCase):
    def test_valid_matrix_passes(self):
        out = validate({"ok": script(matrix_vis())})
        self.assertEqual(out["ok"], {"errors": [], "warnings": []})

    def test_shape_and_highlight_bounds_rejected(self):
        out = validate({
            "ragged": script(matrix_vis(values=[[0.5, 0.5], [0.1, 0.2, 0.7], [0.3, 0.3, 0.4]])),
            "oob_hl": script(matrix_vis(highlights=[{"label": "Bad", "kind": "row", "row": 4}])),
            "bad_dom": script(matrix_vis(domain=[1.0, 0.0])),
        })
        self.assertTrue(any("must match cols length" in e for e in out["ragged"]["errors"]))
        self.assertTrue(any("out of range" in e for e in out["oob_hl"]["errors"]))
        self.assertTrue(any("domain min" in e for e in out["bad_dom"]["errors"]))

    def test_focus_accepts_highlight_and_shorthand_ids(self):
        ok = script(matrix_vis(), scene={"focus": [{"at": "corner", "on": ["diag", "r2_c1", "c0", "r1"]}]})
        bad = script(matrix_vis(), scene={"focus": [{"at": "corner", "on": ["r9_c0"]}]})
        out = validate({"ok": ok, "bad": bad})
        self.assertEqual(out["ok"]["errors"], [])
        self.assertTrue(any('unknown id "r9_c0"' in e for e in out["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
