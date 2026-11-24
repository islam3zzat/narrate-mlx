"""Pure Arabic speech-region detection, silence trimming, and pause/letter-count word timing helpers."""
from __future__ import annotations

import re

import numpy as np

DIACRITICS = re.compile("[ً-ْٰـ]")  # tashkeel, dagger alif, tatweel
ARABIC_LETTER = re.compile("[ء-يٱ-ۓ]")
FRAME = 0.010  # energy frame, seconds
MIN_GAP = 0.15  # a quiet stretch at least this long counts as a pause
EDGE_KEEP = 0.05  # silence kept at each end of a block's audio


def tashkeel_ratio(text: str) -> float:
    letters = len(ARABIC_LETTER.findall(text))
    return len(re.findall("[ً-ْ]", text)) / letters if letters else 1.0


def speech_regions(audio: np.ndarray, rate: int) -> list[tuple[float, float]]:
    """(start, end) seconds of the stretches that are not silent, pauses of MIN_GAP or more split them."""
    n = max(int(FRAME * rate), 1)
    frames = len(audio) // n
    if frames == 0:
        return []
    rms = np.sqrt(np.mean(audio[: frames * n].reshape(frames, n) ** 2, axis=1))
    peak = np.percentile(rms, 95)
    if peak <= 0:
        return []
    active = rms > peak * 0.03  # about -30 dB under the loud frames
    regions: list[list[int]] = []
    for i, a in enumerate(active):
        if a:
            if regions and i - regions[-1][1] <= MIN_GAP / FRAME:
                regions[-1][1] = i + 1
            else:
                regions.append([i, i + 1])
    return [(s * FRAME, e * FRAME) for s, e in regions if (e - s) * FRAME >= 0.05]


def trim(audio: np.ndarray, rate: int) -> np.ndarray:
    """Cut leading and trailing silence down to EDGE_KEEP."""
    regions = speech_regions(audio, rate)
    if not regions:
        return audio
    a = max(int((regions[0][0] - EDGE_KEEP) * rate), 0)
    b = min(int((regions[-1][1] + EDGE_KEEP) * rate), len(audio))
    return audio[a:b]


def estimate_words(text: str, audio: np.ndarray, rate: int, offset: float, block: int) -> list[dict]:
    """Spread the whitespace-split words over the speech in `audio`, weighted by letter count.

    Pauses are found from the energy; the words share the speech time (pauses removed) in proportion
    to their letters (diacritics not counted, plus a small constant so short words get some time),
    then speech time is mapped back to real time, so a pause lands where the weights say a word
    boundary falls. A word that straddles a pause ends where its first region ends.
    """
    words = text.split()
    if not words:
        return []
    regions = speech_regions(audio, rate) or [(0.0, len(audio) / rate)]
    weights = [len(ARABIC_LETTER.sub("a", DIACRITICS.sub("", w)).strip("\"'()[]{}.,;:!?،؛؟«»-–— ")) + 0.5 for w in words]
    total = sum(weights)
    speech_total = sum(e - s for s, e in regions)

    def real(x: float) -> tuple[float, int]:  # speech time -> (real time, region index)
        for i, (s, e) in enumerate(regions):
            if x <= e - s or i == len(regions) - 1:
                return s + min(x, e - s), i
            x -= e - s
        raise AssertionError

    out = []
    cum = 0.0
    for w, wt in zip(words, weights):
        s, si = real(cum / total * speech_total)
        e, ei = real((cum + wt) / total * speech_total)
        if ei != si:
            e = regions[si][1]
        out.append({"w": w, "start": round(offset + s, 3), "end": round(offset + max(e, s), 3), "block": block})
        cum += wt
    return out
