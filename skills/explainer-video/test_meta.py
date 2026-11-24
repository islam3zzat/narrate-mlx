"""Per-type meta (src/visuals/<type>/meta.ts): capabilities and lint, and the registry's generic checks."""
import json, os, subprocess, tempfile, unittest
from pathlib import Path

from test_semantics import HERE, tool_env, tsx


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


def script(visual):
    return {"title": "t", "scenes": [{"id": "s1", "narration": "one two three", "visual": visual}]}


class MetaTests(unittest.TestCase):
    def test_missing_meta_fails_tsc(self):
        """An Entry without `meta`, or with a meta of the wrong shape, is a compile error."""
        cases = (
            ("missing_meta.ts", "{schema: null as never, semantics: null as never}", "meta"),
            ("bad_meta.ts", "{schema: null as never, semantics: null as never, meta: {type: 'graph'}}", "capabilities"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            reg_imp = os.path.relpath(HERE / "src/visuals/registry", tdir).replace("\\", "/")
            cfg = {"extends": str(HERE / "tsconfig.json"), "include": [fn for fn, _, _ in cases]}
            (tdir / "tsconfig.json").write_text(json.dumps(cfg), encoding="utf-8")
            for fn, body, _ in cases:
                (tdir / fn).write_text(f"import type {{Entry}} from '{reg_imp}';\nexport const bad: Entry<'graph'> = {body};\n", encoding="utf-8")
            r = subprocess.run([str(HERE / "node_modules/.bin/tsc"), "--noEmit", "-p", str(tdir)], capture_output=True, text=True, cwd=HERE, env=tool_env())
            out = r.stdout + r.stderr
            self.assertNotEqual(r.returncode, 0, out)
            for fn, _, want in cases:
                line = next((l for l in out.splitlines() if fn in l), "")
                self.assertTrue(line, f"{fn} error not found in:\n{out}")
                self.assertIn(want, out)

    def test_lint_rules_fire_on_inline_bad_visuals(self):
        bad = {
            "v1": script({"type": "bullets", "heading": "h", "items": list("abcdefg")}),
            "v2": script({"type": "steps", "heading": "h", "items": list("abcdefg")}),
            "v3": script({"type": "graph", "heading": "h", "nodes": [{"id": "a", "label": "one two three four"}, {"id": "b", "label": "b"}],
                          "edges": [{"from": "a", "to": "b"}]}),
            "v4": script({"type": "mermaid", "heading": "h", "code": "flowchart LR\n a-->b"}) | {"language": "ar"},
            "ok": script({"type": "bullets", "heading": "h", "items": ["a", "b"]}),
        }
        out = validate(bad)
        self.assertEqual(out["v1"]["warnings"], ["v1/s1: 7 items won't fit well; keep to 6 or fewer"])
        self.assertEqual(out["v2"]["warnings"], ["v2/s1: 7 items won't fit well; keep to 6 or fewer"])
        self.assertEqual(out["v3"]["warnings"], ["v3/s1: graph labels longer than three words wrap and crowd the layout"])
        self.assertEqual(len(out["v4"]["warnings"]), 1)
        self.assertIn("mermaid scenes are not mirrored", out["v4"]["warnings"][0])
        self.assertEqual(out["ok"], {"errors": [], "warnings": []})
        for v in out.values():
            self.assertEqual(v["errors"], [])

    def test_schema_errors_are_prefixed_with_video_and_scene(self):
        out = validate({"v": script({"type": "bullets", "heading": "h", "items": 5}), "w": {"title": "t"}})
        self.assertTrue(out["v"]["errors"][0].startswith("v/s1: visual.items: "), out["v"]["errors"])
        self.assertTrue(out["w"]["errors"][0].startswith("w: scenes: "), out["w"]["errors"])

    def test_capabilities_are_the_single_source(self):
        """DIAGRAM_TYPES and THREE_D_TYPES are derived from meta.capabilities; focus-with-ids and continues go together."""
        code = """
import {REGISTRY} from './src/visuals/registry';
import {DIAGRAM_TYPES, THREE_D_TYPES} from './src/schema';
const c: Record<string, any> = {};
for (const [t, e] of Object.entries(REGISTRY)) c[t] = (e as any).meta.capabilities;
const ft = Object.keys(REGISTRY).filter(t => !!(REGISTRY as any)[t].meta.focusTargets);
console.log(JSON.stringify({c, d: DIAGRAM_TYPES, t: THREE_D_TYPES, ft}));"""
        r = json.loads(tsx(["-e", code]).strip().splitlines()[-1])
        c = r["c"]
        self.assertEqual(sorted(t for t, x in c.items() if x["continues"]), sorted(r["d"]))
        self.assertEqual(sorted(t for t, x in c.items() if x["focus"]), sorted(r["ft"]))
        self.assertEqual(sorted(t for t, x in c.items() if x["focus"] and t not in ("mermaid", "svg", "timeline", "stat", "plot2d", "linked-plot", "field2d", "chart", "ablation", "matrix", "equation", "figure")), sorted(r["d"]))
        self.assertEqual(sorted(t for t, x in c.items() if "2d" not in x["modes"]), sorted(r["t"]))
        self.assertEqual(sorted(r["t"]), ["layers3d", "surface3d"])
        self.assertEqual(c["mermaid"]["focus"], "2d")
        self.assertEqual(c["svg"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "warn"})
        self.assertEqual(c["timeline"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "yes"})
        self.assertEqual(c["code"], {"modes": ["2d"], "continues": False, "focus": False, "rtl": "yes"})
        self.assertEqual(c["stat"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "warn"})
        self.assertEqual(c["plot2d"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "warn"})
        self.assertEqual(c["linked-plot"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "warn"})
        self.assertEqual(c["cancellation-grid"], {"modes": ["2d"], "continues": False, "focus": False, "rtl": "warn"})
        self.assertEqual(c["field2d"], {"modes": ["2d"], "continues": False, "focus": "2d", "rtl": "warn"})
        self.assertEqual(c["surface3d"], {"modes": ["3d"], "continues": False, "focus": False, "rtl": "warn"})
        for non_d in ("code", "stat", "plot2d", "linked-plot", "cancellation-grid", "field2d", "surface3d", "svg", "timeline"):
            self.assertNotIn(non_d, r["d"])
        self.assertEqual([t for t, x in c.items() if x["rtl"] != "yes"], ["mermaid", "svg", "stat", "plot2d", "linked-plot", "cancellation-grid", "field2d", "surface3d", "chart", "ablation", "matrix", "equation", "figure"])

    def test_chapter_rejected_on_continues_and_scene_starts(self):
        import env
        g = {"type": "graph", "heading": "h", "nodes": [{"id": "a", "label": "A"}], "edges": []}
        s = {"title": "t", "scenes": [
            {"id": "s1", "narration": "one two three", "visual": g, "chapter": "Intro"},
            {"id": "s2", "narration": "four five six", "visual": g, "continues": True, "chapter": "Bad"},
        ]}
        out = validate({"v": s})
        self.assertTrue(any("chapter cannot be combined with continues" in e for e in out["v"]["errors"]), out["v"]["errors"])
        starts, total = env.scene_starts([
            {"id": "s1", "frames": 100, "chapter": "Intro"},
            {"id": "s2", "frames": 80},
            {"id": "s3", "frames": 90, "chapter": "Part 2"},
        ])
        c, t = env.CHAPTER_FRAMES, env.TRANSITION_FRAMES
        self.assertEqual([pos for _, pos in starts], [c - t, (c - t) + 100, (c - t) + 180 + (c - 2 * t)])
        self.assertEqual(total, (c - t) + 180 + (c - 2 * t) + 90)


if __name__ == "__main__":
    unittest.main()
