"""Unit tests for the `array-algo` visual (schema bounds, bars/cells rules, focus, lints)."""
import json
import unittest

from test_semantics import tsx


def array_algo_vis(**kw):
    base = {
        "type": "array-algo",
        "heading": "Two Pointer Search",
        "mode": "cells",
        "steps": [
            {
                "id": "init",
                "label": "Initialize pointers",
                "items": [{"id": "a", "value": 2}, {"id": "b", "value": 7}, {"id": "c", "value": 11}],
                "pointers": [{"name": "L", "index": 0}, {"name": "R", "index": 2}],
                "window": {"start": 0, "end": 2, "label": "range"},
            },
            {
                "id": "narrow",
                "label": "Narrow window",
                "items": [{"id": "a", "value": 2}, {"id": "b", "value": 7}, {"id": "c", "value": 11}],
                "pointers": [{"name": "L", "index": 1}, {"name": "R", "index": 2}],
                "window": {"start": 1, "end": 2, "label": "sum = 18"},
            },
        ],
    }
    base.update(kw)
    return base


def script(vis, narration="First initialize pointers at both ends, then narrow the window inward.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class ArrayAlgoTests(unittest.TestCase):
    def test_valid_cells_and_bars_pass(self):
        bars = array_algo_vis(
            mode="bars",
            steps=[
                {"id": "s1", "label": "Initialize pointers", "items": [{"id": "x", "value": 10}, {"id": "y", "value": 4}]},
                {"id": "s2", "label": "Narrow window", "items": [{"id": "y", "value": 4}, {"id": "x", "value": 10}]},
            ],
        )
        out = validate({"cells": script(array_algo_vis()), "bars": script(bars)})
        self.assertEqual(out["cells"], {"errors": [], "warnings": []})
        self.assertEqual(out["bars"], {"errors": [], "warnings": []})

    def test_rejects_bad_bars_values_duplicates_and_bounds(self):
        out = validate({
            "neg": script(array_algo_vis(mode="bars", steps=[{"label": "Initialize pointers", "items": [{"id": "a", "value": -3}]}])),
            "str": script(array_algo_vis(mode="bars", steps=[{"label": "Initialize pointers", "items": [{"id": "a", "value": "hi"}]}])),
            "dup_item": script(array_algo_vis(steps=[{"label": "Initialize pointers", "items": [{"id": "a", "value": 1}, {"id": "a", "value": 2}]}])),
            "bad_ptr": script(array_algo_vis(steps=[{"label": "Initialize pointers", "items": [{"id": "a", "value": 1}], "pointers": [{"name": "i", "index": 2}]}])),
            "bad_win": script(array_algo_vis(steps=[{"label": "Initialize pointers", "items": [{"id": "a", "value": 1}, {"id": "b", "value": 2}], "window": {"start": 1, "end": 0}}])),
        })
        self.assertTrue(any("values >= 0" in e for e in out["neg"]["errors"]))
        self.assertTrue(any("numeric item values" in e for e in out["str"]["errors"]))
        self.assertTrue(any("duplicate item id" in e for e in out["dup_item"]["errors"]))
        self.assertTrue(any("pointer index 2 out of range" in e for e in out["bad_ptr"]["errors"]))
        self.assertTrue(any("window.start" in e for e in out["bad_win"]["errors"]))

    def test_focus_targets_step_and_item_ids(self):
        ok = script(array_algo_vis(), scene={"focus": [{"at": "narrow", "on": ["b", "c"]}]})
        bad = script(array_algo_vis(), scene={"focus": [{"at": "narrow", "on": ["missing"]}]})
        out = validate({"ok": ok, "bad": bad})
        self.assertEqual(out["ok"]["errors"], [])
        self.assertTrue(any('unknown id "missing"' in e for e in out["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
