import torch, torchaudio as ta
from huggingface_hub import snapshot_download
from safetensors.torch import load_file
def load():
    from chatterbox import mtl_tts
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    ck = snapshot_download("NAMAA-Space/NAMAA-Egyptian-TTS")
    m = mtl_tts.ChatterboxMultilingualTTS.from_pretrained(device=dev)
    m.t3.load_state_dict(load_file(f"{ck}/t3_mtl23ls_v2.safetensors", device=dev))
    m.t3.to(dev).eval()
    def synth(text, out):
        ta.save(out, m.generate(text, language_id="ar").cpu(), m.sr, encoding="PCM_S", bits_per_sample=16)
    return synth
