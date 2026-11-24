"""SILMA TTS v1 (F5-TTS style, clones the bundled Arabic reference voice).
SILMA_FORCE_TASHKEEL=1 (default): its own CATT diacritizer runs on the input.
SILMA_FORCE_TASHKEEL=0: speak the text exactly as given (use with --field tashkeel).
NeMo text normalization is stubbed out (pynini won't build), so digits are NOT expanded."""
import os
from importlib.resources import files

REF_TEXT = "ويدقق النظر في القرآن الكريم وسائر الكتب السماوية ويتبع مسالك الرسل العظام عليهم الصلاة والسلام."

def load():
    from silma_tts.api import SilmaTTS
    force = os.environ.get("SILMA_FORCE_TASHKEEL", "1") == "1"
    tts = SilmaTTS(enable_normalizer=False, force_tashkeel=force)
    ref = str(files("silma_tts").joinpath("infer/ref_audio_samples/ar.ref.24k.wav"))
    def synth(text, out):
        tts.infer(ref_file=ref, ref_text=REF_TEXT, gen_text=text, file_wave=out,
                  normalize_numbers=False, force_tashkeel=force, seed=42)
    return synth
