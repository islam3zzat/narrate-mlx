import json, os, tempfile, unittest
from pathlib import Path
import explainer as ex

class PronounceTests(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp()); os.environ["EXPLAINER_PRONOUNCE_FILE"] = str(self.d / "g.json")
    def tearDown(self): os.environ.pop("EXPLAINER_PRONOUNCE_FILE", None)
    def test_plurals_derived(self):
        say = ex.pronouncer(self.d)
        # letter acronyms stay plain ALL-CAPS (Kokoro reads "API" as ay-pee-eye; spaced "A P I" reads "uh pee eye")
        self.assertEqual(say("the URLs and APIs"), "the URLs and APIs")
        for k, v in ex.PRONOUNCE.items():  # no spaced-letter respellings built in ("B to B" is fine: not adjacent letters)
            self.assertNotRegex(v, r"\b[A-Z] [A-Z]\b", k)
        self.assertEqual(say("a GA release"), "a G.A. release")
        self.assertEqual(say("PKCE"), "pixie"); self.assertEqual(say("JWTs"), "jots")
    def test_layers_project_beats_global_beats_builtin(self):
        (self.d / "g.json").write_text(json.dumps({"PKCE": "pix-ee", "gRPC": "g R P C"}))
        self.assertEqual(ex.pronouncer(self.d)("PKCE gRPC"), "pix-ee g R P C")
        (self.d / "pronounce.json").write_text(json.dumps({"PKCE": "pick-see"}))
        self.assertEqual(ex.pronouncer(self.d)("PKCE"), "pick-see")
    def test_plural_forms(self):
        self.assertEqual(ex.plural_spoken("pixie"), "pixies"); self.assertEqual(ex.plural_spoken("S D K"), "S D Kays")
    def test_cli_persists_and_removes(self):
        class A: word="Okta"; spoken="ock-ta"; project=False; workdir=None; remove=False; list=False; preview=False
        ex.cmd_pronounce(A)
        self.assertEqual(ex.read_map(ex.global_pronounce_file())["Okta"], "ock-ta")
        self.assertEqual(ex.pronouncer(self.d)("Oktas"), "ock-tas")
        A.remove = True; ex.cmd_pronounce(A)
        self.assertNotIn("Okta", ex.read_map(ex.global_pronounce_file()))
    def test_synth_out_requires_text_and_does_not_persist(self):
        out = self.d / "v1.wav"
        class A: word=None; spoken=None; synth_out=out
        with self.assertRaises(SystemExit):
            ex.cmd_pronounce(A)
        self.assertFalse(ex.global_pronounce_file().exists())
if __name__ == "__main__": unittest.main()
