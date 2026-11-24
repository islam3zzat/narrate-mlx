"""Tests for the `equation` visual (KaTeX term tagging, strict sanitization, focus, lints) via cli.ts."""
import json, unittest

from test_semantics import tsx


def eq_vis(**kw):
    base = {
        "type": "equation",
        "heading": "Scaled Dot-Product Attention",
        "equations": [
            {
                "latex": r"\operatorname{Attn}(Q, K, V) = \operatorname{softmax}\left(\frac{\term{dot}{Q K^T}}{\term{scale}{\sqrt{d_k}}}\right) \term{val}{V}"
            }
        ],
        "terms": [
            {"id": "dot", "label": "Dot similarity", "gloss": "Measures compatibility between queries and every key."},
            {"id": "scale", "label": "Dimension scaling", "gloss": "Divides by root depth so softmax gradients stay stable.", "tone": "accent"},
            {"id": "val", "label": "Weighted values", "gloss": "Aggregates value vectors by attention probabilities.", "tone": "secondary"},
        ],
    }
    base.update(kw)
    return base


def script(vis, narration="We compute Dot similarity between queries and keys, apply Dimension scaling by root depth, and average Weighted values.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class EquationTests(unittest.TestCase):
    def test_valid_equation_passes(self):
        out = validate({"ok": script(eq_vis())})
        self.assertEqual(out["ok"], {"errors": [], "warnings": []})

    def test_hostile_latex_and_mismatch_rejected(self):
        out = validate({
            "href": script(eq_vis(equations=[{"latex": r"\term{dot}{\href{https://evil.com}{x}} + \term{scale}{y} + \term{val}{z}"}])),
            "html": script(eq_vis(equations=[{"latex": r"\term{dot}{<script>alert(1)</script>} + \term{scale}{y} + \term{val}{z}"}])),
            "macro": script(eq_vis(equations=[{"latex": r"\def\foo{bar} \term{dot}{x} + \term{scale}{y} + \term{val}{z}"}])),
            "catcode": script(eq_vis(equations=[{"latex": r"\catcode`\@=11 \term{dot}{x} + \term{scale}{y} + \term{val}{z}"}])),
            "missing_term": script(eq_vis(equations=[{"latex": r"\term{dot}{x} + \term{unknown}{y}"}])),
            "dollar": script(eq_vis(equations=[{"latex": r"\term{dot}{$x$} + \term{scale}{y} + \term{val}{z}"}])),
            "bad_katex": script(eq_vis(equations=[{"latex": r"\term{dot}{\frac{a}} + \term{scale}{y} + \term{val}{z}"}])),
        })
        self.assertTrue(any("disallowed LaTeX command" in e for e in out["href"]["errors"]))
        self.assertTrue(any("raw HTML tags" in e for e in out["html"]["errors"]))
        self.assertTrue(any("disallowed LaTeX command" in e for e in out["macro"]["errors"]))
        self.assertTrue(any("disallowed LaTeX command" in e for e in out["catcode"]["errors"]))
        self.assertTrue(any("not listed in terms" in e for e in out["missing_term"]["errors"]))
        self.assertTrue(any('unescaped "$"' in e for e in out["dollar"]["errors"]))
        self.assertTrue(any("KaTeX parse error" in e for e in out["bad_katex"]["errors"]))

    def test_focus_targets_term_ids(self):
        ok = script(eq_vis(), scene={"focus": [{"at": "Dimension", "on": ["scale"]}]})
        bad = script(eq_vis(), scene={"focus": [{"at": "Dimension", "on": ["nope"]}]})
        out = validate({"ok": ok, "bad": bad})
        self.assertEqual(out["ok"]["errors"], [])
        self.assertTrue(any('unknown id "nope"' in e for e in out["bad"]["errors"]))


if __name__ == "__main__":
    unittest.main()
