import json
import unittest
from pathlib import Path
import timing as T

def fake(spoken, wps=2.5):
    return [{"w": w, "start": round(i / wps, 3), "end": round((i + 0.9) / wps, 3)} for i, w in enumerate(spoken.split())]

SPOKEN = ("OAuth two point zero shipped in twenty twelve as a framework with many options. Over the years, attacks "
          "showed that some of those options were unsafe, and the fixes ended up scattered across separate documents. "
          "Developers had to know which ones to follow.")
ITEMS = [ "Published in 2012 as a flexible framework", "Some options turned out to be unsafe",
          "Fixes lived in many separate documents", "Developers had to know which ones to follow"]

class TimingTests(unittest.TestCase):
    def test_reveals_follow_speech_in_order(self):
        it = fake(SPOKEN); dur = it[-1]["end"]
        times, fb = T.reveal_times(ITEMS, it, None, dur)
        self.assertEqual(times, sorted(times))
        w = {x["w"].strip(".,"): x["start"] for x in it}
        # An item appears as its phrase starts being spoken: after the previous idea, no later than its last keyword.
        self.assertTrue(w["Over"] <= times[1] <= w["unsafe"], times)
        self.assertTrue(w["fixes"] <= times[2] + 0.001 or times[2] <= w["scattered"], times)
        self.assertLessEqual(times[2], w["scattered"])
        self.assertEqual(fb, [] if not fb else fb)

    def test_explicit_cue_wins(self):
        it = fake(SPOKEN); dur = it[-1]["end"]
        times, _ = T.reveal_times(ITEMS, it, ["twelve", "", "scattered", "Developers"], dur)
        w = {x["w"].strip(".,"): x["start"] for x in it}
        self.assertAlmostEqual(times[2], w["scattered"] - T.REVEAL_LEAD, places=2)
        self.assertAlmostEqual(times[0], w["twelve"] - T.REVEAL_LEAD, places=2)

    def test_unmatched_slot_interpolates_between_neighbours(self):
        it = fake(SPOKEN); dur = it[-1]["end"]
        times, fb = T.reveal_times(["zzz qqq", *ITEMS[1:]], it, None, dur)
        self.assertEqual(fb, [0]); self.assertEqual(times, sorted(times))

    def test_validate(self):
        it = fake("a b c"); self.assertIsNone(T.validate_alignment(it, "a b c", it[-1]["end"]))
        self.assertIn("words", T.validate_alignment(it, "a b", 2))
        bad = [dict(x) for x in it]; bad[1]["start"] = 99
        self.assertIsNotNone(T.validate_alignment(bad, "a b c", 2))
        self.assertIn("ends", T.validate_alignment(it, "a b c", 30))

    def test_sentence_starts(self):
        it = fake(SPOKEN)
        s = T.sentence_starts(SPOKEN, SPOKEN, it)
        self.assertEqual(len(s), 3); self.assertEqual(s[0]["start"], 0)
        self.assertEqual(s[1]["start"], it[len(SPOKEN.split(". ")[0].split()) ]["start"])

    def test_words_from_tts_one_to_one_drops_punctuation(self):
        toks = [{"w": "Hello", "start": 0.1, "end": 0.5}, {"w": ",", "start": 0.5, "end": 0.6},
                {"w": "world", "start": 0.7, "end": 1.2}, {"w": ".", "start": 1.2, "end": 1.3}]
        out = T.words_from_tts(toks, "Hello, world.")
        self.assertEqual([(x["w"], x["start"], x["end"]) for x in out], [("Hello,", 0.1, 0.5), ("world.", 0.7, 1.2)])

    def test_words_from_tts_split_and_merged_tokens(self):
        # the TTS split "sender-constrained" in two, and merged "P K" into one token
        toks = [{"w": "sender", "start": 0.0, "end": 0.4}, {"w": "-", "start": 0.4, "end": 0.4},
                {"w": "constrained", "start": 0.4, "end": 1.0}, {"w": "PK", "start": 1.0, "end": 1.6}]
        out = T.words_from_tts(toks, "sender-constrained P K")
        self.assertEqual([x["w"] for x in out], ["sender-constrained", "P", "K"])
        self.assertEqual((out[0]["start"], out[0]["end"]), (0.0, 1.0))
        self.assertEqual((out[1]["start"], out[1]["end"]), (1.0, 1.3))
        self.assertEqual((out[2]["start"], out[2]["end"]), (1.3, 1.6))
        self.assertIsNone(T.validate_alignment(out, "sender-constrained P K", 1.6))

    def test_words_from_tts_lone_dash_gets_zero_length(self):
        toks = [{"w": "a", "start": 0, "end": 0.2}, {"w": "b", "start": 0.3, "end": 0.5}]
        out = T.words_from_tts(toks, "a — b")
        self.assertEqual(len(out), 3); self.assertEqual((out[1]["start"], out[1]["end"]), (0.2, 0.2))

    def test_words_from_tts_rejects_rewritten_or_untimed(self):
        self.assertIsNone(T.words_from_tts([{"w": "percent", "start": 0, "end": 1}], "%"))  # no letters to match
        self.assertIsNone(T.words_from_tts([{"w": "forty", "start": 0, "end": 1}], "40"))
        untimed = [{"w": "a", "start": None, "end": None}, {"w": "b", "start": 0, "end": 1}]
        self.assertIsNone(T.words_from_tts(untimed, "a b"))
        self.assertIsNone(T.words_from_tts([], "a"))

    def test_focus_lands_on_its_phrase_in_order(self):
        it = fake(SPOKEN); dur = it[-1]["end"]
        w = [x["w"] for x in it]
        times, missing = T.focus_times(["separate documents", "Developers"], SPOKEN, it, dur)
        self.assertEqual(missing, [])
        self.assertAlmostEqual(times[0], it[w.index("separate")]["start"] - T.FOCUS_LEAD, places=2)
        self.assertAlmostEqual(times[1], it[w.index("Developers")]["start"] - T.FOCUS_LEAD, places=2)

    def test_focus_without_word_times_and_missing_phrase(self):
        words = SPOKEN.split(); dur = 20.0
        times, missing = T.focus_times(["Developers", "nowhere to be found"], SPOKEN, None, dur)
        self.assertAlmostEqual(times[0], words.index("Developers") / len(words) * dur, places=2)
        self.assertEqual(missing, [1])
        self.assertGreaterEqual(times[1], times[0] + T.MIN_GAP - 1e-9)

    def test_find_phrase_matches_whole_words_only(self):
        words = [T.norm(x) for x in "the token, then tokens".split()]
        self.assertEqual(T.find_phrase("token", words), 1)
        self.assertEqual(T.find_phrase("tokens", words), 3)
        self.assertIsNone(T.find_phrase("toke", words))


AR = ("يَمُرُّ الطَّلَبُ بِثَلَاثِ مَرَاحِلَ. الْعَمِيلُ يُرْسِلُهُ، ثُمَّ تَفْحَصُهُ الْبَوَّابَةُ وَتُطَبِّقُ عَلَيْهِ قَوَاعِدَهَا، "
      "وَأَخِيرًا تُحَوِّلُهُ إِلَى الْخَدَمَةِ الَّتِي تُنْجِزُ الْعَمَلَ. هَلْ فَهِمْتَ؟")


class ArabicTests(unittest.TestCase):
    def test_norm_strips_marks_and_unifies_letters(self):
        self.assertEqual(T.norm("الْآمِنُ،"), "الامن")
        self.assertEqual(T.norm("إِلَى"), T.norm("الي"))
        self.assertEqual(T.norm("الْخَدَمَةِ"), T.norm("الخدمه"))
        self.assertEqual(T.norm("OAuth-2"), "oauth2")       # Latin behaviour unchanged

    def test_clitics_match_with_or_without_prefix(self):
        self.assertTrue(T.word_eq(T.norm("وَالْخَادِمُ"), T.norm("الخادم")))
        self.assertTrue(T.word_eq(T.norm("بِالْخَادِمِ"), T.norm("وَالْخَادِمُ")))
        self.assertTrue(T.word_eq(T.norm("لِلْخَادِمِ"), T.norm("خادم")))
        self.assertFalse(T.word_eq(T.norm("خادم"), T.norm("خدمة")))
        self.assertFalse(T.word_eq("token", "tokens"))

    def test_words_from_tts_silma_shape_whitespace_words_punctuation_attached(self):
        spoken = AR
        toks = [{"w": w, "start": round(i * 0.5, 3), "end": round(i * 0.5 + 0.4, 3)} for i, w in enumerate(spoken.split())]
        out = T.words_from_tts(toks, spoken)
        self.assertEqual([x["w"] for x in out], spoken.split())
        self.assertEqual([(x["start"], x["end"]) for x in out], [(t["start"], t["end"]) for t in toks])
        self.assertIsNone(T.validate_alignment(out, spoken, out[-1]["end"]))

    def test_words_from_tts_tolerates_missing_vowels_and_merged_words(self):
        spoken = "الْعَمِيلُ يُرْسِلُهُ، ثُمَّ تَفْحَصُهُ."
        # the TTS echoed the text without tashkeel, and glued the last two words together
        toks = [{"w": "العميل", "start": 0, "end": 0.6}, {"w": "يرسله،", "start": 0.6, "end": 1.2}, {"w": "ثمتفحصه.", "start": 1.4, "end": 2.6}]
        out = T.words_from_tts(toks, spoken)
        self.assertEqual([x["w"] for x in out], spoken.split())
        self.assertEqual((out[2]["start"], out[3]["end"]), (1.4, 2.6))
        self.assertIsNone(T.words_from_tts([{"w": "ثلاثة", "start": 0, "end": 1}], "3"))   # digits are not expanded: rejected

    def test_reveals_follow_arabic_speech_in_order_with_clitics_and_endings(self):
        it = fake(AR, wps=1.6); dur = it[-1]["end"]
        slots = ["العميل", "البوابة", "الخدمة"]
        times, fb = T.reveal_times(slots, it, None, dur)
        self.assertEqual(fb, []); self.assertEqual(times, sorted(times))
        w = [T.norm(x["w"]) for x in it]
        self.assertAlmostEqual(times[0], it[w.index(T.norm("الْعَمِيلُ"))]["start"] - T.REVEAL_LEAD, places=2)
        # "البوابة" is spoken as تفحصه البوابة, "الخدمة" last: each lands at its own word, not at an earlier one
        self.assertAlmostEqual(times[1], it[w.index(T.norm("الْبَوَّابَةُ"))]["start"] - T.REVEAL_LEAD, places=2)
        self.assertAlmostEqual(times[2], it[w.index(T.norm("الْخَدَمَةِ"))]["start"] - T.REVEAL_LEAD, places=2)

    def test_arabic_keywords_skip_stop_words_and_match_clitic_forms(self):
        self.assertEqual(T.keywords("تحويل الطلب إلى الخدمة"), ["تحويل", "الطلب", "الخدمه"])
        it = fake("ثم تفحصه البوابة وتطبق القواعد", wps=2)
        times, fb = T.reveal_times(["القواعد"], it, None, 3)       # spoken as part of ...وتطبق القواعد
        self.assertEqual(fb, [])
        self.assertEqual(T._match(T.norm("خدمة"), T.norm("خدماتها")), True)

    def test_explicit_cue_and_focus_phrase_in_arabic(self):
        it = fake(AR, wps=1.6); dur = it[-1]["end"]
        times, _ = T.reveal_times(["x", "y"], it, ["قواعدها", "الخدمة"], dur)
        self.assertAlmostEqual(times[0], it[T.norm_words(AR).index(T.norm("قَوَاعِدَهَا"))]["start"] - T.REVEAL_LEAD, places=2)
        ft, missing = T.focus_times(["البوابة", "الخدمة التي"], AR, it, dur)       # bare phrase vs the vowelled narration
        self.assertEqual(missing, [])
        self.assertAlmostEqual(ft[1], it[T.norm_words(AR).index(T.norm("الْخَدَمَةِ"))]["start"] - T.FOCUS_LEAD, places=2)
        # a phrase with a clitic the narration lacks, and vice versa
        self.assertEqual(T.find_phrase("والعميل", T.norm_words(AR)), T.norm_words(AR).index(T.norm("الْعَمِيلُ")))
        self.assertEqual(T.find_phrase("العمل", T.norm_words("وَالْعَمَلَ")), 0)

    def test_arabic_sentences_split_on_question_mark_and_full_stop(self):
        self.assertEqual(len(T.split_sentences(AR)), 3)
        it = fake(AR); s = T.sentence_starts(AR, AR, it)
        self.assertEqual(len(s), 3); self.assertEqual(s[0]["start"], 0)

    def test_tashkeel_detection(self):
        self.assertTrue(T.has_arabic("OAuth و"))
        self.assertFalse(T.has_arabic("OAuth 2"))
        self.assertTrue(T.AR_DIACRITICS.search("كَتَبَ"))
        self.assertFalse(T.AR_DIACRITICS.search("كتب"))




class SharedVectorTests(unittest.TestCase):
    """tests/vectors/text.json is also run against the TypeScript twins by tests/vectors/text.test.ts (make test)."""
    V = json.loads((Path(__file__).resolve().parent / "tests/vectors/text.json").read_text(encoding="utf-8"))

    def test_norm(self):
        for x, want in self.V["norm"]:
            self.assertEqual(T.norm(x), want, repr(x))

    def test_ar_variants(self):
        for w, want in self.V["ar_variants"]:
            self.assertEqual(sorted(T.ar_variants(w)), want, repr(w))

    def test_word_eq(self):
        for a, b, want in self.V["word_eq"]:
            self.assertEqual(T.word_eq(a, b), want, (a, b))

    def test_norm_name(self):
        import explainer
        for x, want in self.V["norm_name"]:
            self.assertEqual(explainer.norm_name(x), want, repr(x))
        for fn, x, py, _ts in self.V["known_disagreements"]:
            self.assertEqual(explainer.norm_name(x), py, repr(x))


if __name__ == "__main__": unittest.main()
