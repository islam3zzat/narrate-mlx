"""Transcript parsing (transcript.py), the `transcript` and `report` commands, report escaping (report.py), and the default-on
feature mechanism (`-name`). Stdlib only; run through explainer.py as a user would for the command cases."""
import json, os, re, subprocess, sys, tempfile, time, unittest
from pathlib import Path

import explainer, report, transcript

HERE = Path(__file__).resolve().parent
CORPUS = HERE / "tests/corpus"


def run(*args, features="", cwd=None):
    env = {**os.environ, "NARRATE_FEATURES": features}
    r = subprocess.run([sys.executable, str(HERE / "explainer.py"), *args], capture_output=True, text=True, env=env, cwd=cwd)
    return r.returncode, r.stdout, r.stderr


class ParseTests(unittest.TestCase):
    def test_zoom_vtt_merges_same_speaker(self):
        vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nAlex Kim: Welcome.\n\n2\n00:00:03.500 --> 00:00:06.000\nAlex Kim: Next topic.\n\n3\n01:02:03.000 --> 01:02:05.000\nPriya: Pager fired at 14:02 UTC.\n"
        lines, _ = transcript.parse(vtt)
        self.assertEqual(lines, ["[00:00:01] Alex Kim: Welcome. Next topic.", "[01:02:03] Priya: Pager fired at 14:02 UTC."])

    def test_teams_voice_tags_entities_and_other_tags(self):
        vtt = ("WEBVTT\n\nNOTE c\nmore\n\nSTYLE\n::cue {color:red}\n\nid-1/1-0\n00:00:05.120 --> 00:00:08.400 align:start position:0%\n"
               "<v Riley Chen>Ship on April&nbsp;1st &amp; <c.y>hold</c> it.</v>\n\n"
               "id-1/2-0\n00:11.000 --> 00:13.000\n<v.loud Sam>A <i>maybe</i> &lt;b&gt;</v><v Dana>Agreed.</v>\n")
        lines, _ = transcript.parse(vtt)
        self.assertEqual(lines, ["[00:00:05] Riley Chen: Ship on April 1st & hold it.", "[00:00:11] Sam: A maybe <b>", "[00:00:11] Dana: Agreed."])

    def test_plain_srt_comma_millis_ids_and_overrides(self):
        srt = "1\n00:00:01,000 --> 00:00:03,500\n{\\an8}Hello there.\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond\ncue.\n"
        self.assertEqual(transcript.parse(srt)[0], ["[00:00:01] Hello there.", "[00:00:04] Second cue."])

    def test_srt_without_speakers_is_not_merged(self):
        srt = "1\n00:00:01,000 --> 00:00:02,000\nA.\n\n2\n00:00:02,000 --> 00:00:03,000\nB.\n"
        self.assertEqual(len(transcript.parse(srt)[0]), 2)

    def test_lowercase_prefix_is_not_a_speaker(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nnote: not a name\n\n00:00:03.000 --> 00:00:04.000\nAt three: still text\n"
        lines, _ = transcript.parse(vtt)
        self.assertEqual(lines[0], "[00:00:01] note: not a name")

    def test_zoom_txt_header_form(self):
        txt = "[Alex Kim] 10:19:03\nHello all.\nSecond line.\n\n[Priya] 10:19:20\nHi.\n"
        self.assertEqual(transcript.parse(txt)[0], ["[10:19:03] Alex Kim: Hello all. Second line.", "[10:19:20] Priya: Hi."])

    def test_plain_text_passes_through(self):
        txt = "[00:00:12] Sam: Hello.\n\n  loose   line \n"
        self.assertEqual(transcript.parse(txt)[0], ["[00:00:12] Sam: Hello.", "loose line"])

    def test_corpus_fixture_covers_every_ledger_quote(self):
        lines, _ = transcript.load(CORPUS / "incident.vtt")
        text = " ".join(lines).lower()
        for f in json.loads((CORPUS / "ledger.json").read_text())["facts"]:
            self.assertIn(re.sub(r"\s+", " ", f["quote"]).lower(), text, f["id"])
        src = (CORPUS / "source.txt").read_text().splitlines()
        self.assertEqual(transcript.parse("\n".join(src))[0], src, "the ledger's source is already in normalized form")

    def test_control_characters_are_removed(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBell\x07 and ‮rtl\n"
        self.assertEqual(transcript.parse(vtt)[0], ["[00:00:01] Bell and rtl"])

    def test_malformed(self):
        with self.assertRaises(transcript.TranscriptError):
            transcript.parse("")
        with self.assertRaises(transcript.TranscriptError):
            transcript.parse("   \n\n \n")
        with self.assertRaises(transcript.TranscriptError):
            transcript.parse("WEBVTT\n\nNOTE only a note\n")
        with self.assertRaises(transcript.TranscriptError):
            transcript.parse("1\n00:00:01,000 --> 00:00:02,000\n\n")   # cue without text
        lines, warns = transcript.parse("WEBVTT\n\nstray text\n\n00:00:01.000 --> 00:00:02.000\nOk.\n\n00:00:0x --> 00:00:09.000\nNo time.\n")
        self.assertEqual(lines, ["[00:00:01] Ok.", "No time."])
        self.assertEqual(len(warns), 2)

    def test_load_rejects_huge_binary_and_non_utf8(self):
        with tempfile.TemporaryDirectory() as tmp:
            big = Path(tmp) / "big.txt"
            big.write_bytes(b"a" * (transcript.MAX_BYTES + 1))
            with self.assertRaisesRegex(transcript.TranscriptError, "over 5 MB"):
                transcript.load(big)
            bad = Path(tmp) / "bad.vtt"
            bad.write_bytes("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\ncaf\xe9\n".encode("latin-1"))
            with self.assertRaisesRegex(transcript.TranscriptError, "UTF-8"):
                transcript.load(bad)
            nul = Path(tmp) / "nul.txt"
            nul.write_bytes(b"ab\0cd")
            with self.assertRaisesRegex(transcript.TranscriptError, "binary"):
                transcript.load(nul)
            bom = Path(tmp) / "bom.srt"
            bom.write_bytes(b"\xef\xbb\xbf1\n00:00:01,000 --> 00:00:02,000\nHi.\n")
            self.assertEqual(transcript.load(bom)[0], ["[00:00:01] Hi."])
            with self.assertRaisesRegex(transcript.TranscriptError, "cannot read"):
                transcript.load(Path(tmp) / "missing.vtt")

    def test_cues_without_blank_lines_do_not_merge(self):
        vtt = "WEBVTT\n00:01.000 --> 00:02.000\nAna: one\n00:03.000 --> 00:04.000\nBob: two\n00:05.000 --> 00:06.000\nAna: three\n"
        self.assertEqual(transcript.parse(vtt)[0], ["[00:00:01] Ana: one", "[00:00:03] Bob: two", "[00:00:05] Ana: three"])
        srt = "1\n00:00:01,000 --> 00:00:02,000\nline one\nline two\n2\n00:00:03,000 --> 00:00:04,000\nsecond\n"
        lines = transcript.parse(srt)[0]
        self.assertEqual(lines, ["[00:00:01] line one line two", "[00:00:03] second"])
        for ln in transcript.parse(vtt)[0] + lines:
            self.assertNotIn("-->", ln)

    def test_only_known_tags_are_stripped(self):
        vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nif a<b and c>d then <i>x</i> <c.hot>y</c> <00:00:01.500>z <font color=\"red\">w</font>\n"
        self.assertEqual(transcript.parse(vtt)[0], ["[00:00:01] if a<b and c>d then x y z w"])

    def test_out_of_order_same_speaker_cues_stay_separate(self):
        vtt = "WEBVTT\n\n00:05.000 --> 00:09.000\n<v A>later\n\n00:01.000 --> 00:02.000\n<v A>earlier\n\n00:10.000 --> 00:11.000\n<v A>last\n"
        lines, warns = transcript.parse(vtt)
        self.assertEqual(lines, ["[00:00:05] A: later", "[00:00:01] A: earlier last"])
        self.assertEqual(len(warns), 1)
        self.assertIn("starts before", warns[0])

    def test_parse_strips_a_bom_itself(self):
        self.assertEqual(transcript.parse("\ufeffWEBVTT\n\n00:01.000 --> 00:02.000\n<v Ana>Hi\n")[0], ["[00:00:01] Ana: Hi"])
        self.assertEqual(transcript.parse("\ufeff[00:00:12] Sam: Hello.\n")[0], ["[00:00:12] Sam: Hello."])

    def test_pathological_inputs_run_in_linear_time(self):
        n = 100_000
        head = "WEBVTT\n\n00:01.000 --> 00:02.000\n"
        shapes = ["<" * n, "&" * n, "&a" * (n // 2), "[" * n, "[a" * (n // 2), "1" * n, " " * n, "a: " * (n // 3), "A " * (n // 2) + "x",
                  "<i " + "a " * (n // 2), "<c." + "x." * (n // 2), "<v" + ".x" * (n // 2), "<v " + "a" * n, "<v " * (n // 3), "{\\" * (n // 2),
                  "[a] 1:1:1 " * (n // 10), "0:" * (n // 2), "<00:" * (n // 4), "www." * (n // 4), "1." * (n // 2)]
        t0 = time.monotonic()
        for v in shapes:
            for text in (head + v + "\n", v, "\n".join([v[:200]] * (n // 200))):
                try:
                    transcript.parse(text)
                except transcript.TranscriptError:
                    pass
            report.esc(v)
        took = time.monotonic() - t0
        self.assertLess(took, 20, f"{took:.1f} s for {len(shapes)} shapes of {n} characters (these took a few seconds before the fix: 2+ minutes)")

    def test_many_cues_is_fast_enough(self):
        vtt = "WEBVTT\n\n" + "".join(f"00:00:{i % 60:02d}.000 --> 00:00:{i % 60:02d}.500\n<v A{i % 7}>word {i}</v>\n\n" for i in range(20000))
        lines, _ = transcript.parse(vtt)
        self.assertGreater(len(lines), 10000)


class CommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def test_stdout_and_flag_default_on(self):
        code, out, err = run("transcript", str(CORPUS / "incident.vtt"))
        self.assertEqual(code, 0, err)
        self.assertTrue(out.startswith("[00:00:12] Sam Example: The pager fired"))

    def test_flag_off_by_env_and_by_option(self):
        for kw in ({"features": "-transcripts"}, {"features": "svg,-transcripts"}):
            code, out, err = run("transcript", str(CORPUS / "incident.vtt"), **kw)
            self.assertEqual(code, 1)
            self.assertIn("switched off", err)
        code, out, err = run("transcript", str(CORPUS / "incident.vtt"), "--features=-transcripts")
        self.assertEqual(code, 1)
        self.assertEqual(out, "")

    def test_off_then_on_again_last_wins(self):
        code, *_ = run("transcript", str(CORPUS / "incident.vtt"), features="-transcripts,transcripts")
        self.assertEqual(code, 0)

    def test_out_does_not_overwrite_without_force(self):
        out = self.dir / "t.txt"
        self.assertEqual(run("transcript", str(CORPUS / "incident.vtt"), "--out", str(out))[0], 0)
        first = out.read_text()
        code, _, err = run("transcript", str(CORPUS / "incident.vtt"), "--out", str(out))
        self.assertEqual(code, 1)
        self.assertIn("--force", err)
        self.assertEqual(out.read_text(), first)
        self.assertEqual(run("transcript", str(CORPUS / "incident.vtt"), "--out", str(out), "--force")[0], 0)

    def test_out_refuses_symlink_input_and_missing_dir(self):
        link = self.dir / "link.txt"
        link.symlink_to(self.dir / "elsewhere.txt")
        self.assertEqual(run("transcript", str(CORPUS / "incident.vtt"), "--out", str(link), "--force")[0], 1)
        self.assertFalse((self.dir / "elsewhere.txt").exists())
        copy = self.dir / "in.vtt"
        copy.write_text((CORPUS / "incident.vtt").read_text())
        code, _, err = run("transcript", str(copy), "--out", str(copy), "--force")
        self.assertEqual(code, 1)
        self.assertIn("input", err)
        self.assertEqual(run("transcript", str(copy), "--out", str(self.dir / "nope/x.txt"))[0], 1)

    def test_bad_input_is_a_clean_error(self):
        bad = self.dir / "bad.vtt"
        bad.write_bytes(b"\xff\xfe\x00bad")
        code, out, err = run("transcript", str(bad))
        self.assertEqual(code, 1)
        self.assertNotIn("Traceback", err)


class FeatureMechanismTests(unittest.TestCase):
    def setUp(self):
        self._env = os.environ.get("NARRATE_FEATURES")
        self.addCleanup(lambda: os.environ.pop("NARRATE_FEATURES", None) if self._env is None else os.environ.__setitem__("NARRATE_FEATURES", self._env))

    def on(self, value, name):
        os.environ["NARRATE_FEATURES"] = value
        return explainer.feature_on(name)

    def test_only_transcripts_is_default_on(self):
        self.assertEqual(explainer.DEFAULT_ON_FEATURES, {"transcripts"})
        self.assertTrue(set(explainer.DEFAULT_ON_FEATURES) <= set(explainer.FEATURES))
        for name in explainer.FEATURES:
            self.assertEqual(self.on("", name), name == "transcripts", name)

    def test_minus_switches_off_and_plus_adds(self):
        self.assertFalse(self.on("-transcripts", "transcripts"))
        self.assertTrue(self.on("svg 3d", "svg"))
        self.assertTrue(self.on("svg 3d", "transcripts"))
        self.assertFalse(self.on("svg,-svg", "svg"))
        self.assertTrue(self.on("-svg,svg", "svg"))
        self.assertFalse(self.on("-3d", "3d"))   # switching an off-by-default flag off is harmless

    def test_unknown_names_are_errors_including_dash_forms(self):
        for arg in ("nope", "-nope", "-", "svg,--svg"):
            with self.assertRaises(SystemExit, msg=arg):
                explainer.apply_features_arg(arg)

    def test_features_json_marks_defaults(self):
        code, out, _ = run("features", "--json")
        data = json.loads(out)
        self.assertTrue(data["transcripts"]["default"] and data["transcripts"]["enabled"])
        self.assertFalse(any(v["default"] or v["enabled"] for k, v in data.items() if k != "transcripts"))
        code, out, _ = run("features", "--json", features="-transcripts")
        self.assertFalse(json.loads(out)["transcripts"]["enabled"])

    def test_features_enabled_exit_code(self):
        self.assertEqual(run("features", "--enabled", "transcripts")[0], 0)
        self.assertEqual(run("features", "--enabled", "transcripts", features="-transcripts")[0], 1)
        self.assertEqual(run("features", "--enabled", "arabic", features="arabic,-arabic")[0], 1)
        self.assertEqual(run("features", "--enabled", "arabic", features="-arabic,arabic")[0], 0)
        self.assertNotEqual(run("features", "--enabled", "nope")[0], 0)


LEDGER = {"source": "source.txt", "facts": [
    {"id": "e01", "kind": "event", "text": "Pager fired", "at": "14:02 UTC", "importance": "high", "status": "confirmed", "quote": "The pager fired."},
    {"id": "e02", "kind": "mitigation", "text": "Rolled back", "at": "14:31 UTC", "importance": "high"},
    {"id": "d01", "kind": "decision", "text": "Ship on April 1", "importance": "high", "owner": "Riley"},
    {"id": "a01", "kind": "action", "text": "Add a check", "importance": "high", "owner": "Platform team", "due": "2026-04-01"},
    {"id": "o01", "kind": "open_question", "text": "Was the threshold too loose?", "importance": "low"},
    {"id": "c01", "kind": "contradiction", "text": "Ack 14:09 vs 14:07", "importance": "high", "conflictsWith": ["e01"]},
    {"id": "f02", "kind": "factor", "text": "Minor thing", "importance": "low", "deferred": "report"},
]}


class ReportTests(unittest.TestCase):
    def test_contains_every_fact_id_counts_and_sections(self):
        md = report.render_report(LEDGER, {"e01": ["incident/s02"]})
        for f in LEDGER["facts"]:
            self.assertIn(f"`{f['id']}`", md)
        for h in ("## Counts", "## Timeline", "## Actions", "## Decisions", "## Contradictions and ambiguities", "## Open questions", "## Deferred facts", "## All facts"):
            self.assertIn(h, md)
        self.assertIn("- Facts: 7 (5 high importance, 2 low)", md)
        self.assertIn("Platform team", md)
        self.assertIn("incident/s02", md)
        self.assertIn("deferred to report (low importance)", md)
        self.assertIn("`e01` (Pager fired)", md)   # conflictsWith shows the other fact
        self.assertTrue(md.startswith(report.MARKER))
        self.assertLess(md.index("`e01`"), md.index("`e02`"))   # ledger order

    def test_escaping_cases(self):
        evil = "# Title | cell\n- item `code` <img src=x onerror=alert(1)> [click](http://evil.example/x) ![i](http://e/p.png) a@b.co"
        ledger = {"source": "s`x\ny", "facts": [{"id": "e01", "kind": "event", "text": evil, "quote": evil, "owner": evil, "at": evil, "importance": "high"}]}
        md = report.render_report(ledger)
        body = md.split("## All facts")[1]
        for bad in ("\n# Title", "\n- item"):
            self.assertNotIn(bad, md, bad)
        rest = md.split("\n", 1)[1]
        for ch in "<>[]":
            self.assertIsNone(re.search(r"(?<!\\)" + re.escape(ch), rest), f"unescaped {ch}")
        self.assertNotIn("http://", md)
        self.assertIn("\\`code\\`", md)
        self.assertEqual(len([l for l in body.splitlines() if l.startswith("| `e01`")]), 1)   # no extra table cells or rows
        row = [l for l in body.splitlines() if l.startswith("| `e01`")][0]
        self.assertEqual(len(re.findall(r"(?<!\\)\|", row)), 8)
        self.assertNotIn("\n", report.esc("a\nb"))
        self.assertEqual(report.esc("# h"), "\\# h")
        self.assertEqual(report.esc("- x"), "\\- x")
        self.assertEqual(report.esc("1. x"), "1\\. x")
        self.assertEqual(report.esc("2) x"), "2\\) x")
        self.assertEqual(report.esc("see www.evil.example/x"), "see www\\.evil.example/x")
        self.assertEqual(report.esc("WWW.EVIL.example"), "WWW\\.EVIL.example")
        self.assertEqual(report.esc("> q"), "\\> q")

    def test_odd_ledgers_do_not_crash(self):
        md = report.render_report({"facts": [None, "x", {"id": "e01", "kind": "weird", "conflictsWith": "no"}, {"text": "no id"}]})
        self.assertIn("`e01`", md)
        self.assertIn("skipped", md)
        self.assertIn("No facts.", report.render_report({"facts": []}))

    def test_command_writes_and_protects(self):
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            (wd / "scripts").mkdir()
            (wd / "scripts/v.json").write_text(json.dumps({"scenes": [{"id": "s01", "facts": ["e01"]}]}))
            self.assertEqual(run("report", str(wd))[0], 1)   # no ledger yet
            (wd / "ledger.json").write_text(json.dumps(LEDGER))
            code, out, err = run("report", str(wd))
            self.assertEqual(code, 0, err)
            md = (wd / "report.md").read_text()
            self.assertIn("v/s01", md)
            self.assertEqual(run("report", str(wd))[0], 0)   # replacing its own report is fine
            (wd / "report.md").write_text("my notes")
            code, _, err = run("report", str(wd))
            self.assertEqual(code, 1)
            self.assertEqual((wd / "report.md").read_text(), "my notes")
            (wd / "report.md").unlink()
            (wd / "ledger.json").write_text("{not json")
            self.assertEqual(run("report", str(wd))[0], 1)
            (wd / "ledger.json").write_text("[]")
            self.assertEqual(run("report", str(wd))[0], 1)

    def test_report_on_corpus_ledger_has_every_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            (wd / "scripts").mkdir()
            (wd / "ledger.json").write_text((CORPUS / "ledger.json").read_text())
            self.assertEqual(run("report", str(wd))[0], 0)
            md = (wd / "report.md").read_text()
            for f in json.loads((CORPUS / "ledger.json").read_text())["facts"]:
                self.assertIn(f"`{f['id']}`", md)


if __name__ == "__main__":
    unittest.main()
