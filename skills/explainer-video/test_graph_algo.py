"""Unit tests for the `graph-algo` visual (schema bounds, auto/explicit layout, focus, lints)."""
import json
import unittest

from test_semantics import tsx


def graph_algo_vis(**kw):
    base = {
        "type": "graph-algo",
        "heading": "BFS Traversal",
        "directed": True,
        "nodes": [
            {"id": "S", "label": "S"},
            {"id": "A", "label": "A"},
            {"id": "B", "label": "B"},
        ],
        "edges": [
            {"id": "eSA", "from": "S", "to": "A", "weight": 2},
            {"from": "S", "to": "B", "weight": 4},
        ],
        "steps": [
            {"id": "s0", "label": "Start S", "nodeStates": {"S": "active"}, "nodeBadges": {"S": "d=0"}},
            {"id": "s1", "label": "Visit A and B", "nodeStates": {"S": "sorted", "A": "frontier", "B": "frontier"}, "edgeStates": {"eSA": "frontier", "S->B": "frontier"}},
        ],
    }
    base.update(kw)
    return base


def script(vis, narration="Start S at zero, then visit A and B next.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class GraphAlgoTests(unittest.TestCase):
    def test_valid_directed_and_auto_layout_pass(self):
        undir = graph_algo_vis(directed=False)
        explicit = graph_algo_vis(
            nodes=[
                {"id": "S", "label": "S", "x": 0.1, "y": 0.5},
                {"id": "A", "label": "A", "x": 0.9, "y": 0.2},
                {"id": "B", "label": "B", "x": 0.9, "y": 0.8},
            ],
        )
        out = validate({"undir": script(undir), "explicit": script(explicit)})
        self.assertEqual(out["undir"], {"errors": [], "warnings": []})
        self.assertEqual(out["explicit"], {"errors": [], "warnings": []})

    def test_rejects_bad_endpoints_loops_duplicates_and_maps(self):
        out = validate({
            "bad_edge": script(graph_algo_vis(edges=[{"from": "S", "to": "Z"}])),
            "self_loop": script(graph_algo_vis(edges=[{"from": "S", "to": "S"}])),
            "dup_node": script(graph_algo_vis(nodes=[{"id": "S", "label": "S"}, {"id": "S", "label": "S2"}])),
            "partial_xy": script(graph_algo_vis(nodes=[{"id": "S", "label": "S", "x": 0.2}, {"id": "A", "label": "A"}, {"id": "B", "label": "B"}])),
            "bad_state": script(graph_algo_vis(steps=[{"label": "Start S", "nodeStates": {"missing": "active"}}])),
            "bad_edge_state": script(graph_algo_vis(steps=[{"label": "Start S", "edgeStates": {"missing": "active"}}])),
        })
        self.assertTrue(any("unknown target node" in e for e in out["bad_edge"]["errors"]))
        self.assertTrue(any("self-loop" in e for e in out["self_loop"]["errors"]))
        self.assertTrue(any("duplicate node id" in e for e in out["dup_node"]["errors"]))
        self.assertTrue(any("both x and y" in e for e in out["partial_xy"]["errors"]))
        self.assertTrue(any('unknown node id "missing"' in e for e in out["bad_state"]["errors"]))
        self.assertTrue(any('unknown edge key "missing"' in e for e in out["bad_edge_state"]["errors"]))

    def test_focus_targets_node_edge_and_step_ids(self):
        ok = script(graph_algo_vis(), scene={"focus": [{"at": "visit", "on": ["A", "eSA"]}]})
        bad = script(graph_algo_vis(), scene={"focus": [{"at": "visit", "on": ["nope"]}]})
        out = validate({"ok": ok, "bad": bad})
        self.assertEqual(out["ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in out["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
