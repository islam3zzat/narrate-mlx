"""The `cancellation-grid` visual (schema, bounds, lint, no-focus, semantics) via cli.ts."""
import json, unittest

from test_semantics import tsx


def visual(theorem="curl-2d", **kw):
    base = {
        "type": "cancellation-grid",
        "heading": "Why interior cancels",
        "theorem": theorem,
        "stages": [
            {"label": "Reveal cells", "phase": "cells"},
            {"label": "Interior pairs", "phase": "interior"},
            {"label": "Cancel out", "phase": "cancel"},
            {"label": "Outer boundary", "phase": "boundary"},
        ],
    }
    base.update(kw)
    return base


def script(vis=None, narration="Reveal cells first. Interior pairs oppose each other and cancel out, leaving only the outer boundary.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class CancellationGridTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        vis_back = visual(stages=[{"label": "Outer boundary", "phase": "boundary"}, {"label": "Reveal cells", "phase": "cells"}])
        cls.V = validate({
            "valid": script(),
            "depth": script(visual("divergence-3d", depth=3)),
            "focus": script(scene={"focus": [{"at": "cells", "on": ["x"]}]}),
            "backwards": script(vis_back, "Outer boundary first then reveal cells."),
        })

    def test_valid_passes_cleanly(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_bounds_and_no_focus(self):
        self.assertTrue(any("depth must be 2" in e for e in self.V["depth"]["errors"]), self.V["depth"]["errors"])
        self.assertTrue(any("focus works on" in e for e in self.V["focus"]["errors"]), self.V["focus"]["errors"])

    def test_phase_backwards_lint_warns(self):
        w = self.V["backwards"]["warnings"]
        self.assertTrue(any("goes backwards" in x for x in w), w)


if __name__ == "__main__":
    unittest.main()
