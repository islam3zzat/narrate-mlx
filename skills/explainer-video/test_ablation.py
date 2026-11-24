"""Tests for the `ablation` visual (waterfall schema, yDomain checks, focus, lints) via cli.ts."""
import json, unittest

from test_semantics import tsx


def ablation_vis(**kw):
    base = {
        "type": "ablation",
        "heading": "Component Ablation on Accuracy",
        "metric": "Accuracy (%)",
        "unit": "%",
        "baseline": {"id": "base", "label": "Baseline", "value": 64.0},
        "steps": [
            {"id": "rope", "label": "Rotary encoding", "delta": 4.2},
            {"id": "norm", "label": "Layer norm", "delta": 1.8},
            {"id": "clip", "label": "Hard clip", "delta": -1.5},
        ],
        "totalId": "full",
        "totalLabel": "Full System",
    }
    base.update(kw)
    return base


def script(vis, narration="Starting from the Baseline, Rotary encoding gains points, Layer norm helps, Hard clip drops slightly, reaching our Full System.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class AblationTests(unittest.TestCase):
    def test_valid_ablation_passes(self):
        out = validate({"ok": script(ablation_vis())})
        self.assertEqual(out["ok"], {"errors": [], "warnings": []})

    def test_duplicate_ids_and_bad_domain_rejected(self):
        out = validate({
            "dup": script(ablation_vis(totalId="base")),
            "dom": script(ablation_vis(yDomain=[80, 70])),
        })
        self.assertTrue(any("duplicate id" in e for e in out["dup"]["errors"]))
        self.assertTrue(any("yDomain min" in e for e in out["dom"]["errors"]))

    def test_focus_targets_baseline_step_and_total(self):
        ok = script(ablation_vis(), scene={"focus": [{"at": "Rotary", "on": ["rope"]}, {"at": "Full System", "on": ["full"]}]})
        bad = script(ablation_vis(), scene={"focus": [{"at": "Rotary", "on": ["nope"]}]})
        out = validate({"ok": ok, "bad": bad})
        self.assertEqual(out["ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in out["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
