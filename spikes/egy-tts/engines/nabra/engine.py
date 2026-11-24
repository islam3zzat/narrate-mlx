"""Nabra-82M (Kokoro MSA fine-tune), PyTorch reference path. Expects DIACRITIZED text (use --field tashkeel)."""
import sys, numpy as np, torch, soundfile as sf
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

def load():
    from huggingface_hub import hf_hub_download
    from arabic_g2p import EXTRA_SYMBOLS, clean_phonemes, normalize_text
    from kokoro import KModel, KPipeline
    from kokoro import pipeline as kp
    repo = "oddadmix/Nabra-82M-v0.1"
    config = hf_hub_download(repo, "config.json")
    model_path = hf_hub_download(repo, "kokoro_arabic.pth")
    voice = torch.load(hf_hub_download(repo, "af_msa.pt"), map_location="cpu", weights_only=True)
    km = KModel(repo_id=repo, config=config, model=model_path, disable_complex=True).eval()
    km.vocab.update(EXTRA_SYMBOLS)
    kp.LANG_CODES.setdefault("ar", "ar")
    pipe = KPipeline(lang_code="ar", repo_id=repo, model=km)
    orig = pipe.g2p
    def g2p(t):
        ph, tok = orig(t)
        return clean_phonemes(ph), tok
    pipe.g2p = g2p
    def synth(text, out):
        text, _ = normalize_text(text)
        parts = [a.detach().cpu().numpy() for _, _, a in pipe(text, voice=voice, speed=1.0)]
        sf.write(out, np.concatenate(parts).astype(np.float32), 24000, subtype="PCM_16")
    return synth
