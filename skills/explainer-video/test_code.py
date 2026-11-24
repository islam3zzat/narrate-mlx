"""The `code` visual: schema limits, highlight ranges, reveal slots, mode/focus/continues rules and lints (through cli.ts validate)."""
import json, unittest

from test_semantics import tsx

CODE = "def f(x):\n    y = x + 1\n    return y"


def hl(lines, label="step"):
    return {"lines": lines, "label": label}


def visual(**kw):
    v = {"type": "code", "heading": "h", "language": "python", "code": CODE, "highlights": [hl("1", "setup"), hl("2-3", "result")]}
    v.update(kw)
    return v


def script(vis=None, narration="First the setup, then the result.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis or visual()}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class CodeTests(unittest.TestCase):
    LANGS = ("ts", "tsx", "js", "jsx", "python", "go", "rust", "java", "sql", "bash", "json", "yaml", "diff", "text")
    LIMIT_CASES = (
        ("tab", "a\n\tb", "indent with spaces"),
        ("trailing newline", "a\nb\n", "trailing blank lines"),
        ("trailing blank line", "a\nb\n\n", "trailing blank lines"),
        ("empty", "  ", "empty"),
        ("31 lines", "\n".join(["x"] * 31), "31 lines; the limit is 30"),
        ("81 columns", "x" * 81, "line 1 is 81 display cells wide"),
        ("leading blank line", "\nx", "leading blank lines"),
        ("leading blank line with spaces", "  \nx", "leading blank lines"),
    )
    FORBIDDEN_CASES = (
        ("bidi RLO", "a\u202eb", "U+202E"), ("isolate", "a\u2066b", "U+2066"), ("LRM", "a\u200eb", "U+200E"), ("RLM", "a\u200fb", "U+200F"), ("ALM", "a\u061cb", "U+061C"),
        ("NUL", "a\x00b", "U+0000"), ("ESC", "a\x1bb", "U+001B"), ("DEL", "a\x7fb", "U+007F"), ("C1", "a\x85b", "U+0085"), ("LS", "a\u2028b", "U+2028"), ("PS", "a\u2029b", "U+2029"),
        ("BOM", "a\ufeffb", "U+FEFF"), ("ZWSP", "a\u200bb", "U+200B"), ("ZWNJ", "a\u200cb", "U+200C"), ("ZWJ", "a\u200db", "U+200D"), ("WJ", "a\u2060b", "U+2060"), ("lone surrogate", "a\ud800b", "U+D800"),
        ("tag char", "a\U000e0041b", "U+E0041"), ("soft hyphen", "a\u00adb", "U+00AD"), ("invisible plus", "a\u2064b", "U+2064"), ("hangul filler", "a\u3164b", "U+3164"), ("hangul choseong filler", "a\u115fb", "U+115F"),
        ("braille blank", "a\u2800b", "U+2800"), ("CGJ", "a\u034fb", "U+034F"), ("variation selector", "a\ufe0fb", "U+FE0F"), ("variation selector sup", "a\U000e0100b", "U+E0100"), ("mongolian vs", "a\u180eb", "U+180E"),
    )
    RANGE_CASES = (
        ("4", "is past line 3"), ("2-9", '"2-9" is past line 3'), ("0", "start at 1"), ("3-2", "runs backwards"),
        ("a", "not a line or a range"), ("1-", "not a line or a range"), ("", "not a line or a range"),
    )
    IDENT_CASES = (("fooBar", "First foo bar runs."), ("get_user", "Then get user runs."), ("retry()", "Then retry runs."), ("fooBar", "The foobar call."))

    @classmethod
    def setUpClass(cls):
        cases = {
            "valid": script(),
            "lang_cobol": script(visual(language="cobol")),
            "edge_30x80": script(visual(code="\n".join(["x" * 80] * 30), highlights=[hl("1")])),
            "edge_indented": script(visual(code="  indented first line\nx", highlights=[hl("1")])),
            "edge_30lines": script(visual(code="\n".join(["x"] * 30), highlights=[hl("30")])),
            "utf16_ok": script(visual(code="x" * 80, highlights=[hl("1")])),
            "utf16_combining_ok": script(visual(code='s = "' + "e\u0301" * 60 + '"', highlights=[hl("1")])),
            "utf16_bad": script(visual(code="a" + "\u0301" * 160, highlights=[hl("1")])),
            "wide_40": script(visual(code="漢" * 40, highlights=[hl("1")])),
            "wide_41": script(visual(code="漢" * 41, highlights=[hl("1")])),
            "wide_emoji": script(visual(code="😀" * 41, highlights=[hl("1")])),
            "wide_78_han": script(visual(code="x" * 78 + "漢", highlights=[hl("1")])),
            "wide_79_han": script(visual(code="x" * 79 + "漢", highlights=[hl("1")])),
            "head_50": script(visual(heading="h" * 50)),
            "head_51": script(visual(heading="h" * 51)),
            "head_500": script(visual(heading="h" * 500)),
            "cap_space": script(visual(caption="  c  ")),
            "cap_160": script(visual(caption="c" * 160)),
            "cap_161": script(visual(caption="c" * 161)),
            "cap_empty": script(visual(caption="")),
            "cap_ws": script(visual(caption="   ")),
            "bidi_warn": script(visual(heading="a\u200fb", caption="c\u061cd", highlights=[hl("1", "setup\u200e"), hl("2-3", "result")])),
            "range_ok": script(visual(highlights=[hl("1-3", "a"), hl("2", "b"), hl("2", "c"), hl("1 - 2", "d")])),
            "hl_0": script(visual(highlights=[])),
            "hl_9": script(visual(highlights=[hl("1", f"w{i}") for i in range(9)])),
            "hl_8": script(visual(highlights=[hl("1", f"w{i}") for i in range(8)])),
            "unknown_field": script(visual(theme="dark")),
            "mode_3d": script(mode="3d"),
            "focus": script(visual(), scene={"focus": [{"at": "setup", "on": ["x"]}]}),
            "continues": {"title": "t", "scenes": [script()["scenes"][0], {**script()["scenes"][0], "id": "s2", "continues": True}]},
            "lint_none": script(narration="Something else entirely happened here."),
            "lint_order": script(narration="First the result, then the setup."),
            "lint_reused_ok": script(visual(code="a\nb\nc\nd", highlights=[hl("1", "Alpha"), hl("2", "Beta"), hl("3", "Alpha again"), hl("4", "Gamma")]),
                                     narration="Alpha first. Beta second. Alpha again. Gamma last."),
            "lint_out_of_order": script(visual(code="a\nb\nc", highlights=[hl("1", "Alpha"), hl("2", "Beta"), hl("3", "Gamma")]),
                                        narration="Alpha first. Gamma second. Beta last."),
            "lint_ar_in_code": script(visual(code='print("مرحبا")', highlights=[hl("1", "setup")]), narration="The setup."),
            "arabic": script(visual(code="f(x)", highlights=[hl("1", "الدالة")]), narration="الدَّالَّةُ", language="ar"),
        }
        for lang in cls.LANGS:
            cases[f"lang_{lang}"] = script(visual(language=lang))
        for i, (_, code, _) in enumerate(cls.LIMIT_CASES):
            cases[f"lim_{i}"] = script(visual(code=code, highlights=[hl("1")]))
        for i, (_, code, _) in enumerate(cls.FORBIDDEN_CASES):
            cases[f"forb_{i}"] = script(visual(code="ok\n" + code, highlights=[hl("1")]))
        for i, code in enumerate(("\u200b", "\u200b \ufeff\u200d", "\u202e")):
            cases[f"inv_{i}"] = script(visual(code=code, highlights=[hl("1")]))
        for ci, ch in enumerate(("\u202e", "\u202b", "\u2067", "\u2069")):
            for ki, kw in enumerate(({"heading": "a" + ch + "b"}, {"caption": "c" + ch + "d"}, {"highlights": [hl("1", "setup" + ch), hl("2-3", "result")]})):
                cases[f"reord_{ci}_{ki}"] = script(visual(**kw))
        for i, (lines, _) in enumerate(cls.RANGE_CASES):
            cases[f"range_{i}"] = script(visual(highlights=[hl("1"), hl(lines)]))
        for i, code in enumerate(('x = "\u05d0"  # a', 'x = "\u0710"', 'x = "\u0780"')):
            cases[f"hebrew_{i}"] = script(visual(code=code, highlights=[hl("1", "setup")]), narration="The setup.")
        for i, (label, narr) in enumerate(cls.IDENT_CASES):
            cases[f"ident_{i}"] = script(visual(code="foo_bar = 1", highlights=[hl("1", label)]), narration=narr)
        for i, label in enumerate(("if", "=>", "x")):
            cases[f"short_{i}"] = script(visual(code="x = 1", highlights=[hl("1", label)]), narration="The setup.")
        cls.V = validate(cases)

    def test_valid_code_passes_with_no_messages(self):
        self.assertEqual(self.V["valid"], {"errors": [], "warnings": []})

    def test_every_language_is_accepted(self):
        for lang in self.LANGS:
            self.assertEqual(self.V[f"lang_{lang}"]["errors"], [], lang)
        self.assertTrue(self.V["lang_cobol"]["errors"])

    def test_code_limits_are_errors_never_trimmed(self):
        for i, (name, _, want) in enumerate(self.LIMIT_CASES):
            key = f"lim_{i}"
            with self.subTest(name):
                errs = self.V[key]["errors"]
                self.assertTrue(errs and errs[0].startswith(f"{key}/s1: visual."), errs)
                self.assertIn(want, " ".join(errs))

    def test_limits_at_the_edge_pass(self):
        for key in ("edge_30x80", "edge_indented", "edge_30lines"):
            self.assertEqual(self.V[key]["errors"], [], key)

    def test_forbidden_characters_are_errors_naming_the_character(self):
        for i, (name, _, want) in enumerate(self.FORBIDDEN_CASES):
            with self.subTest(name):
                errs = self.V[f"forb_{i}"]["errors"]
                self.assertTrue(any(want in e and "line 2" in e for e in errs), errs)

    def test_invisible_only_code_is_empty(self):
        for i in range(3):
            errs = self.V[f"inv_{i}"]["errors"]
            self.assertTrue(any("code is empty" in e for e in errs) and any("U+" in e for e in errs), errs)

    def test_line_over_160_utf16_units_is_an_error(self):
        self.assertEqual(self.V["utf16_ok"]["errors"], [])
        self.assertEqual(self.V["utf16_combining_ok"]["errors"], [])
        errs = self.V["utf16_bad"]["errors"]
        self.assertTrue(any("UTF-16 units" in e and "line 1" in e for e in errs), errs)

    def test_wide_characters_count_two_cells(self):
        self.assertEqual(self.V["wide_40"]["errors"], [])
        errs = self.V["wide_41"]["errors"]
        self.assertTrue(any("line 1 is 82 display cells wide" in e for e in errs), errs)
        self.assertTrue(self.V["wide_emoji"]["errors"])
        self.assertEqual(self.V["wide_78_han"]["errors"], [])
        self.assertTrue(self.V["wide_79_han"]["errors"])

    def test_heading_and_caption_limits(self):
        self.assertEqual(self.V["head_50"]["errors"], [])
        self.assertTrue(self.V["head_51"]["errors"])
        self.assertTrue(self.V["head_500"]["errors"])
        self.assertEqual(self.V["cap_space"]["errors"], [])
        self.assertEqual(self.V["cap_160"]["errors"], [])
        for key in ("cap_161", "cap_empty", "cap_ws"):
            self.assertTrue(self.V[key]["errors"], key)

    def test_bidi_marks_in_texts_warn_not_error(self):
        out = self.V["bidi_warn"]
        self.assertEqual(out["errors"], [])
        joined = " ".join(out["warnings"])
        for want in ("heading", "caption", "highlight 1 label", "U+200F", "U+061C", "U+200E"):
            self.assertIn(want, joined)

    def test_reordering_bidi_controls_in_texts_are_errors(self):
        for ci, (_, want) in enumerate((("\u202e", "U+202E"), ("\u202b", "U+202B"), ("\u2067", "U+2067"), ("\u2069", "U+2069"))):
            for ki in range(3):
                errs = self.V[f"reord_{ci}_{ki}"]["errors"]
                self.assertTrue(any(want in e for e in errs), (ci, ki, errs))

    def test_highlight_ranges(self):
        for i, (lines, want) in enumerate(self.RANGE_CASES):
            with self.subTest(lines):
                errs = self.V[f"range_{i}"]["errors"]
                self.assertTrue(any("highlights.1.lines" in e or "highlights[1].lines" in e for e in errs), errs)
                self.assertIn(want, " ".join(errs))
        self.assertEqual(self.V["range_ok"]["errors"], [])

    def test_highlight_count(self):
        self.assertTrue(self.V["hl_0"]["errors"])
        self.assertTrue(self.V["hl_9"]["errors"])
        self.assertEqual(self.V["hl_8"]["errors"], [])

    def test_unknown_fields_are_rejected(self):
        self.assertTrue(self.V["unknown_field"]["errors"])

    def test_describe_gives_one_slot_per_highlight_label(self):
        out = json.loads(tsx(["src/cli.ts", "describe"], json.dumps([{"visual": visual(), "prev": None}])))
        self.assertEqual(out, [{"slots": ["setup", "result"], "carried": [False, False]}])

    def test_two_d_only_no_focus_no_continues(self):
        self.assertTrue(any('"code" cannot be drawn in "3d" mode' in e for e in self.V["mode_3d"]["errors"]))
        self.assertTrue(any("focus works on" in e for e in self.V["focus"]["errors"]), self.V["focus"]["errors"])
        self.assertTrue(any("continues works on" in e for e in self.V["continues"]["errors"]))

    def test_lint_label_not_in_narration_and_order(self):
        w = self.V["lint_none"]["warnings"]
        self.assertEqual(len(w), 2)
        self.assertIn('code highlight 1: its label "setup" shares no word with the narration', w[0])
        w = self.V["lint_order"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn("is listed after", w[0])

    def test_lint_reused_words_in_order_do_not_warn(self):
        self.assertEqual(self.V["lint_reused_ok"]["warnings"], [])

    def test_lint_genuinely_out_of_order_still_warns(self):
        w = self.V["lint_out_of_order"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn("is listed after", w[0])

    def test_lint_arabic_letters_in_code(self):
        w = self.V["lint_ar_in_code"]["warnings"]
        self.assertEqual(len(w), 1)
        self.assertIn("right-to-left letters", w[0])

    def test_lint_hebrew_and_other_rtl_letters_in_code(self):
        for i in range(3):
            w = self.V[f"hebrew_{i}"]["warnings"]
            self.assertTrue(any("right-to-left letters" in m for m in w), (i, w))

    def test_lint_identifier_labels_match_spoken_words(self):
        for i, pair in enumerate(self.IDENT_CASES):
            w = self.V[f"ident_{i}"]["warnings"]
            self.assertEqual(w, [], (pair, w))

    def test_lint_label_without_a_matchable_word_warns(self):
        for i, label in enumerate(("if", "=>", "x")):
            w = self.V[f"short_{i}"]["warnings"]
            self.assertTrue(any("no word of 3 or more letters" in m for m in w), (label, w))

    def test_arabic_script_has_no_mirroring_warning(self):
        self.assertEqual(self.V["arabic"], {"errors": [], "warnings": []})


if __name__ == "__main__":
    unittest.main()
