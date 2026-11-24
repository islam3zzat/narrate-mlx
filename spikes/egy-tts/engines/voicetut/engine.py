import torch
def load(speaker="Mohammed"):
    from voicetut_tts import VoiceTutTTS
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    tts = VoiceTutTTS.from_pretrained("mohammedaly22/VoiceTut-TTS", device=dev)
    def synth(text, out):
        tts.synthesize(text, speaker=speaker, output=out)
    return synth
