"""Semantics (src/semantics, TypeScript) against the recorded outputs of the old Python slot_texts / carried_flags.

tests/semantics_cases.jsonl (one case per line) holds every corpus scene plus generated variants (shuffled ids, sequence prefixes, empty lists,
Arabic labels, type changes), with the outputs recorded from the Python versions before they were deleted. The generator
is in git history (commit c0be762, tests/gen_semantics_cases.py). Add a case by appending a line with a hand-checked expectation.
"""
import json, os, subprocess, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TSX = HERE / "node_modules/.bin/tsx"


def tool_env():
    import explainer
    return explainer.tool_env()


def tsx(args, stdin=""):
    r = subprocess.run([str(TSX), *args], input=stdin, capture_output=True, text=True, cwd=HERE, env=tool_env())
    if r.returncode:
        raise AssertionError(r.stderr[-800:])
    return r.stdout


def load_cases():
    return [json.loads(l) for l in (HERE / "tests/semantics_cases.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]


class SemanticsTests(unittest.TestCase):
    def test_describe_matches_recorded_python(self):
        cases = load_cases()
        out = json.loads(tsx(["src/cli.ts", "describe", "--no-validate"], json.dumps([
            {"visual": c["visual"], "prev": c["prev"], **({"rendered": c["rendered"]} if "rendered" in c else {})}
            for c in cases
        ])))
        self.assertEqual(len(out), len(cases))
        bad = [(c["name"], c["slots"], o["slots"], c["carried"], o["carried"]) for c, o in zip(cases, out)
               if c["slots"] != o["slots"] or c["carried"] != o["carried"]]
        self.assertEqual(bad, [], f"{len(bad)} of {len(cases)} cases differ; first: {bad[:1]}")

    def test_describe_rejects_invalid_input_naming_the_item(self):
        good = {"type": "bullets", "heading": "h", "items": ["a"]}
        bad = {"type": "bullets", "heading": "h", "items": 5}
        with self.assertRaises(AssertionError) as cm:
            tsx(["src/cli.ts", "describe"], json.dumps([{"visual": good, "prev": None}, {"visual": bad, "prev": None}]))
        self.assertIn("item 1 visual", str(cm.exception))

    def test_cases_cover_every_visual_type(self):
        cases = load_cases()
        types = {c["visual"]["type"] for c in cases}
        expected = set(json.loads(tsx(["-e", "import {BUILTIN_CAPABILITIES} from './src/visuals/capabilities.ts'; console.log(JSON.stringify(Object.keys(BUILTIN_CAPABILITIES)))"]).strip().splitlines()[-1]))
        self.assertGreaterEqual(len(types), 27)
        self.assertTrue(types.issubset(expected), f"unknown types in semantics_cases.jsonl: {types - expected}")
        self.assertTrue(any(any(c["carried"]) for c in cases), "no case exercises carrying")

    def test_catalog_semantics_cover_every_visual_type(self):
        """Every visual type in BUILTIN_CAPABILITIES has a valid BUILTIN_CATALOG[t].default entry producing matching slots/carried arrays."""
        code = ("import {BUILTIN_CATALOG} from './src/visuals/catalog.ts';"
                " const items = Object.entries(BUILTIN_CATALOG).map(([t, e]) => ({type: t, visual: e.default.visual, prev: e.default.prev ?? null, ...(e.default.mermaidRendered ? {rendered: e.default.mermaidRendered} : {})}));"
                " console.log(JSON.stringify(items));")
        catalog_items = json.loads(tsx(["-e", code]).strip().splitlines()[-1])
        expected = set(json.loads(tsx(["-e", "import {BUILTIN_CAPABILITIES} from './src/visuals/capabilities.ts'; console.log(JSON.stringify(Object.keys(BUILTIN_CAPABILITIES)))"]).strip().splitlines()[-1]))
        self.assertEqual({x["type"] for x in catalog_items}, expected)
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([
            {"visual": x["visual"], "prev": x["prev"], **({"rendered": x["rendered"]} if "rendered" in x else {})}
            for x in catalog_items
        ])))
        self.assertEqual(len(out), len(catalog_items))
        for item, res in zip(catalog_items, out):
            self.assertIsInstance(res["slots"], list, item["type"])
            self.assertIsInstance(res["carried"], list, item["type"])
            self.assertEqual(len(res["slots"]), len(res["carried"]), item["type"])

    def test_pure_list_loads_without_react(self):
        """The pure registry (src/visuals/registry.ts) and src/sdk/pure.ts must load in plain node: no react, remotion or three."""
        code = ("Promise.all([import('./src/visuals/registry.ts'), import('./src/sdk/pure.ts')]).then(() => {"
                " const m = (typeof require !== 'undefined' && require.cache) || {};"
                " const bad = Object.keys(m).filter((k) => /node_modules\\/(react|react-dom|remotion|three|@remotion|@react-three|reactflow|@xyflow)\\//.test(k));"
                " console.log(JSON.stringify(bad)); })")
        bad = json.loads(tsx(["-e", code]).strip().splitlines()[-1])
        self.assertEqual(bad, [])
        # and statically: the pure files import only zod and each other (never a .tsx file or a View2D/View3D)
        pure = [HERE / "src/visuals/registry.ts", HERE / "src/visuals/common.ts", HERE / "src/visuals/capabilities.ts",
                HERE / "src/visuals/meta-lint.ts", HERE / "src/visuals/chars.ts", HERE / "src/visuals/math-expr.ts",
                HERE / "src/visuals/plot-kit.ts", HERE / "src/visuals/equation/parse.ts", HERE / "src/visuals/stat/format.ts",
                HERE / "src/visuals/surface3d/mesh.ts", HERE / "src/visuals/catalog-types.ts", HERE / "src/visuals/catalog.ts",
                HERE / "src/sdk/pure.ts", *(HERE / "src/sdk").glob("*-math.ts"),
                HERE / "src/words.ts", HERE / "src/schema.ts", HERE / "src/types.ts",
                *(HERE / "src/semantics").glob("*.ts"), *(HERE / "src/visuals").glob("*/capabilities.ts"),
                *(HERE / "src/visuals").glob("*/schema.ts"), *(HERE / "src/visuals").glob("*/compute.ts"),
                *(HERE / "src/visuals").glob("*/semantics.ts"), *(HERE / "src/visuals").glob("*/meta.ts"),
                *(HERE / "src/visuals").glob("*/catalog.ts")]
        self.assertGreater(len(pure), 10)
        ast_script = ("import fs from 'node:fs'; import ts from 'typescript';"
                      " const files = JSON.parse(fs.readFileSync(0, 'utf8'));"
                      " const out = Object.fromEntries(files.map((f) => [f, ts.preProcessFile(fs.readFileSync(f, 'utf8'), true, true).importedFiles.map((x) => x.fileName)]));"
                      " console.log(JSON.stringify(out));")
        imports_by_file = json.loads(tsx(["-e", ast_script], json.dumps([str(p) for p in pure])).strip().splitlines()[-1])
        for p in pure:
            rel = p.relative_to(HERE)
            for src in imports_by_file[str(p)]:
                self.assertTrue(src.startswith(".") or src == "zod", f"{rel}: import of {src} (pure files may import only zod and each other)")
                if src.startswith("."):
                    target = os.path.normpath(os.path.join(p.parent, src)).replace(str(HERE) + "/", "")
                    self.assertNotRegex(target, r"View[23]D|\.tsx$|^src/(visuals|kit2d|flow|focus|continuity|rtl|theme|sdk/(view2d|algo-2d))$", f"{rel}: pure file imports a rendering module: {src}")


if __name__ == "__main__":
    unittest.main()
