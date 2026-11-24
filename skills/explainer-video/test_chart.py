"""Tests for the `chart` visual (bar, line, scatter schemas, bounds, focus, lints) via cli.ts."""
import json, unittest

from test_semantics import tsx


def bar_vis(**kw):
    base = {
        "type": "chart",
        "kind": "bar",
        "heading": "Benchmark scores",
        "categories": ["MMLU", "GSM8K", "MATH"],
        "series": [
            {"id": "dense", "label": "Dense baseline", "values": [71.2, 74.0, 48.5], "errors": [1.1, 1.4, 1.8]},
            {"id": "ours", "label": "Sparse router", "values": [78.6, 84.1, 61.3], "errors": [0.9, 1.0, 1.2], "highlight": True},
        ],
        "unit": "%",
    }
    base.update(kw)
    return base


def line_vis(**kw):
    base = {
        "type": "chart",
        "kind": "line",
        "heading": "Scaling law",
        "xScale": "log",
        "series": [
            {
                "id": "iso",
                "label": "Standard dense",
                "points": [[1e18, 2.8], [1e19, 2.45], [1e20, 2.15]],
                "band": [[2.7, 2.9], [2.37, 2.53], [2.08, 2.22]],
            },
            {
                "id": "moe",
                "label": "Routed model",
                "points": [[1e18, 2.6], [1e19, 2.2], [1e20, 1.88]],
                "highlight": True,
            },
        ],
    }
    base.update(kw)
    return base


def scatter_vis(**kw):
    base = {
        "type": "chart",
        "kind": "scatter",
        "heading": "Latency vs quality",
        "betterX": "min",
        "betterY": "max",
        "points": [
            {"id": "slow", "label": "Heavy teacher", "x": 42, "y": 86.2},
            {"id": "fast", "label": "Fast student", "x": 11, "y": 84.5, "highlight": True},
        ],
    }
    base.update(kw)
    return base


def script(vis, narration, **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class ChartTests(unittest.TestCase):
    def test_valid_bar_line_scatter_pass(self):
        out = validate({
            "b": script(bar_vis(), "Dense baseline trails the Sparse router across all three tasks."),
            "l": script(line_vis(), "Standard dense scales smoothly, while the Routed model achieves lower loss."),
            "s": script(scatter_vis(), "Compared to the Heavy teacher, the Fast student sits on the frontier."),
        })
        self.assertEqual(out["b"], {"errors": [], "warnings": []})
        self.assertEqual(out["l"], {"errors": [], "warnings": []})
        self.assertEqual(out["s"], {"errors": [], "warnings": []})

    def test_mode_cross_checks(self):
        res = validate({
            "bad_bar_len": script(bar_vis(series=[{"label": "Only two", "values": [1, 2]}]), "Only two."),
            "bad_bar_both_err": script(bar_vis(series=[{"label": "Both", "values": [1, 2, 3], "errors": [0.1, 0.1, 0.1], "ci": [[0.9, 1.1], [1.9, 2.1], [2.9, 3.1]]}]), "Both."),
            "bad_line_log": script(line_vis(series=[{"label": "Zero x", "points": [[0, 2.0], [10, 1.5]]}]), "Zero x."),
            "bad_scatter_series": script(scatter_vis(series=[{"label": "Wrong", "values": [1]}]), "Heavy teacher Fast student."),
        })
        self.assertTrue(any("must match categories length" in e for e in res["bad_bar_len"]["errors"]))
        self.assertTrue(any("either errors or ci" in e for e in res["bad_bar_both_err"]["errors"]))
        self.assertTrue(any("xScale is \"log\"" in e for e in res["bad_line_log"]["errors"]))
        self.assertTrue(any("only valid for kind=\"bar\" or \"line\"" in e for e in res["bad_scatter_series"]["errors"]))

    def test_focus_targets_ids(self):
        ok = script(bar_vis(), "Dense baseline trails Sparse router.", scene={"focus": [{"at": "Sparse", "on": ["ours"]}]})
        bad = script(scatter_vis(), "Heavy teacher versus Fast student.", scene={"focus": [{"at": "Fast", "on": ["missing"]}]})
        res = validate({"ok": ok, "bad": bad})
        self.assertEqual(res["ok"]["errors"], [])
        self.assertTrue(any('unknown id "missing"' in e for e in res["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
