"""Pure timing logic (no ML, no I/O): turns aligned word times into caption and reveal times.

explainer.py feeds this the word list produced by align_worker.py and stores the result in
public/data/<id>.json. Everything here is deterministic and unit-tested (test_timing.py).
"""
from __future__ import annotations

import functools
import re

SENT_RE = re.compile(r"[^.!?\u061F]+[.!?\u061F]+(?:\s|$)|[^.!?\u061F]+$")   # \u061F is the Arabic question mark
STOP = set("""a an the and or but of to in on at for with by from as is are was were be been it its this that these
those then than so not no into out up down over about per via your you we they their our i he she his her them
which who whom what when where how why can could should would will may might do does did has have had""".split())
# Arabic function words, normalised (see `norm`); compared after clitics are stripped
STOP_AR = set("""في من على الي عن مع هذا هذه ذلك تلك الذي التي الذين ما لا لم لن ان ان ثم او كل قد هو هي هم كما اذا حتي بعد
قبل عند لكن بل اي ايضا هنا هناك نحن انت انا كان تكون يكون""".split())
REVEAL_LEAD = 0.12      # seconds: show an item slightly before its word is spoken
MIN_GAP = 0.25          # seconds between consecutive reveals
MAX_DRIFT = 0.35        # aligned end of speech may differ from the wav duration by at most this much (s)


# ---------------------------------------------------------------- Arabic-aware word comparison
# Narration and TTS words are compared after `norm`: lowercase, Arabic marks (tashkeel U+064B-065F, dagger alef,
# tatweel, Quranic marks) dropped, alef forms unified, ى -> ي, ة -> ه, then only Latin letters, digits and Arabic
# letters kept. This is for MATCHING only; nothing displayed or spoken is changed. src/schema.ts (normWord) mirrors it.
AR_MARKS = re.compile("[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]")
AR_DIACRITICS = re.compile("[\u064B-\u0652\u0670]")      # the vowel marks a hand-vowelled text carries
AR_LETTER = re.compile("[\u0621-\u064A\u066E-\u06D3]")
_NOT_WORD = re.compile("[^a-z0-9\u0621-\u063A\u0641-\u064A\u066E-\u06D3]")
AR_TOKENS = re.compile("[A-Za-z0-9]+|[\u0621-\u065F\u0670\u066E-\u06D3]+")   # keyword tokens: Latin/digit runs or Arabic runs


def norm(w: str) -> str:
    w = AR_MARKS.sub("", w.lower())
    w = re.sub("[\u0622\u0623\u0625\u0671]", "\u0627", w).replace("\u0649", "\u064A").replace("\u0629", "\u0647")
    return _NOT_WORD.sub("", w)


def norm_words(text: str) -> list[str]:
    """The normalised whitespace words of a text (what phrases and keywords are searched in)."""
    return [norm(w) for w in text.split()]


def has_arabic(s: str) -> bool:
    return bool(AR_LETTER.search(s))


@functools.lru_cache(maxsize=4096)
def ar_variants(w: str) -> frozenset:
    """An Arabic word with its prefix clitics peeled off in every way (و/ف, then ب/ل/ك, then ال), including itself.

    Arabic attaches conjunctions, prepositions and the article to the next word (والخادم = "and the server"), so a
    keyword written bare must still find it. Mirrors arVariants in src/schema.ts.
    """
    out = {w}
    frontier = [w]
    for group in ("\u0648\u0641", "\u0628\u0644\u0643"):
        added = [x[1:] for x in frontier for c in group if x.startswith(c) and len(x) - 1 >= 3]
        frontier += added
        out.update(added)
    for x in list(out):
        if x.startswith("\u0627\u0644") and len(x) - 2 >= 3:
            out.add(x[2:])
        if x.startswith("\u0644\u0644") and len(x) - 2 >= 3:    # للخادم = ل + ال + خادم
            out.add(x[2:])
            out.add("\u0627\u0644" + x[2:])
    return frozenset(out)


def word_eq(a: str, b: str) -> bool:
    """Same normalised word? Exact, or (Arabic) one carries prefix clitics the other lacks. Mirrors sameWord in schema.ts."""
    if a == b:
        return True
    if not (has_arabic(a) and has_arabic(b)):
        return False
    va, vb = ar_variants(a), ar_variants(b)
    return b in va or a in vb or any(len(x) >= 4 and x in vb for x in va)


AR_SUFFIXES = ("\u0627\u062A", "\u0648\u0646", "\u064A\u0646", "\u0627\u0646", "\u0647\u0627", "\u0647\u0645", "\u0647\u0646",
               "\u0643\u0645", "\u0646\u0627", "\u0647", "\u064A", "\u0627")      # ات ون ين ان ها هم هن كم نا ه ي ا


@functools.lru_cache(maxsize=4096)
def ar_stem(w: str) -> str:
    """Light stem for fuzzy keyword matching: shortest clitic-stripped form, minus up to two plural/pronoun endings."""
    core = min(sorted(ar_variants(w)), key=len)
    for _ in range(2):      # up to two endings: خدماتها = خدم + ات + ها
        for suf in AR_SUFFIXES:
            if core.endswith(suf) and len(core) - len(suf) >= 3:
                core = core[: -len(suf)]
                break
        else:
            break
    return core


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENT_RE.findall(text) if s.strip()] or [text.strip()]


def validate_alignment(items: list[dict], spoken: str, dur: float) -> str | None:
    """Return None if the alignment is usable, else the reason it is not."""
    toks = spoken.split()
    if len(items) != len(toks):
        return f"aligner returned {len(items)} words for {len(toks)} spoken words"
    prev = 0.0
    for k, it in enumerate(items):
        s, e = it["start"], it["end"]
        if not (0 <= s <= e <= dur + 0.05):
            return f"word {k} '{it['w']}' has an impossible span {s:.2f}-{e:.2f}s (audio is {dur:.2f}s)"
        if s < prev - 0.02:
            return f"word {k} '{it['w']}' starts before the previous word"
        prev = s
    if items and abs(items[-1]["end"] - dur) > max(MAX_DRIFT, 0.12 * dur):
        return f"speech ends at {items[-1]['end']:.2f}s but the audio is {dur:.2f}s"
    return None


MAX_UNTIMED = 0.1       # share of the TTS tokens that may lack times before the TTS timing is not trusted


def words_from_tts(tokens: list[dict], spoken: str) -> list[dict] | None:
    """Turn the TTS model's own token times into one {w, start, end} per whitespace word of `spoken`.

    Tokens are as the TTS split the text ([{w, start, end}], Kokoro: punctuation separate, a word can be split or merged
    with its neighbour; SILMA: the whitespace words of the text, punctuation attached), so both sides are compared letter by letter (`norm`: lowercase letters and digits, Arabic marks dropped): each
    spoken word takes the time span of the letters it covers, spread evenly within a token. Returns None when
    the letters differ (the TTS rewrote the text) or too many tokens are untimed; the caller then falls back to
    forced alignment.
    """
    toks = spoken.split()
    timed = [t for t in tokens if norm(t["w"])]
    untimed = sum(t.get("start") is None or t.get("end") is None for t in timed)
    if not toks or not timed or untimed > MAX_UNTIMED * len(timed):
        return None
    timed = [t for t in timed if t.get("start") is not None and t.get("end") is not None]
    if not timed:
        return None
    # start and end time of each letter of the TTS text, spread evenly within its token (pauses between tokens kept)
    letters, starts, ends = [], [], []
    for t in timed:
        n = norm(t["w"]); step = (t["end"] - t["start"]) / len(n)
        letters.append(n)
        starts.extend(t["start"] + step * i for i in range(len(n)))
        ends.extend(t["start"] + step * (i + 1) for i in range(len(n)))
    # untimed tokens were dropped above, so their letters are missing; then the texts differ and we give up
    if "".join(letters) != "".join(norm(w) for w in toks):
        return None
    out, pos, prev_end = [], 0, 0.0
    for w in toks:
        n = len(norm(w))
        if n == 0:  # a word with no letters (a lone dash): zero length at the previous word's end
            out.append({"w": w, "start": round(prev_end, 3), "end": round(prev_end, 3)})
            continue
        s, e = starts[pos], ends[pos + n - 1]
        out.append({"w": w, "start": round(s, 3), "end": round(e, 3)})
        pos += n; prev_end = e
    return out


def sentence_starts(narration: str, spoken: str, items: list[dict]) -> list[dict]:
    """[{text, start}] with `text` as written in the narration and `start` from the aligned spoken words."""
    spoken_sents = split_sentences(spoken)
    shown = split_sentences(narration)
    counts = [len(s.split()) for s in spoken_sents]
    starts, k = [], 0
    for c in counts:
        starts.append(items[min(k, len(items) - 1)]["start"])
        k += c
    if len(shown) == len(spoken_sents):
        return [{"text": t, "start": round(s, 3)} for t, s in zip(shown, starts)]
    # Pronunciation rewrites changed the sentence count: place each shown sentence by its share of the words.
    total = sum(len(s.split()) for s in shown) or 1
    out, acc = [], 0
    for t in shown:
        idx = min(int(acc / total * len(items)), len(items) - 1)
        out.append({"text": t, "start": round(items[idx]["start"], 3)})
        acc += len(t.split())
    return out


def keywords(text: str) -> list[str]:
    out = []
    for w in AR_TOKENS.findall(text):
        if has_arabic(w):
            n = norm(w)
            core = min(sorted(ar_variants(n)), key=len)
            if n in STOP_AR or core in STOP_AR or len(core) < 3:
                continue
            out.append(n)
            continue
        n = w.lower()
        if n in STOP or len(n) < 3 or n.isdigit():
            continue
        out.append(n)
    return out


def _match(kw: str, word: str) -> bool:
    if not word:
        return False
    if kw == word:
        return True
    if has_arabic(kw) and has_arabic(word):
        if word_eq(kw, word):
            return True
        a, b = ar_stem(kw), ar_stem(word)
        return a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))
    k = min(len(kw), len(word), 5)
    return k >= 4 and kw[:k] == word[:k]


def _find_phrase(phrase: str, words: list[str], from_idx: int) -> int | None:
    parts = [norm(p) for p in phrase.split() if norm(p)]
    if not parts:
        return None
    for i in range(from_idx, len(words) - len(parts) + 1):
        if all(_match(p, words[i + j]) or p == words[i + j] for j, p in enumerate(parts)):
            return i
    return None


def reveal_times(slots: list[str], items: list[dict], explicit: list[str] | None, dur: float) -> tuple[list[float], list[int]]:
    """Seconds (from the start of the narration audio) at which each slot should appear, plus indexes that fell back.

    Order is preserved (slots are revealed in sequence). A slot is placed at the first spoken word that matches its
    keywords inside the densest 10-word window after the previous slot; `explicit[i]` (a word or phrase from the
    narration) overrides that. Slots with no match are interpolated between their neighbours.
    """
    n = len(slots)
    words = [norm(it["w"]) for it in items]
    idx: list[int | None] = [None] * n
    pos = 0
    for i, text in enumerate(slots):
        hit = None
        cue = (explicit[i] if explicit and i < len(explicit) else "") or ""
        if cue.strip():
            hit = _find_phrase(cue, words, pos)
        else:
            kws = keywords(text)
            if kws:
                best = (0, None)
                for s in range(pos, len(words)):
                    window = words[s:s + 10]
                    if not _match_any(kws, words[s]):
                        continue
                    score = len({k for k in kws if any(_match(k, w) for w in window)})
                    if score > best[0]:
                        best = (score, s)
                hit = best[1]
        if hit is not None:
            idx[i] = hit
            pos = hit + 1
    # Interpolate unmatched slots between matched neighbours (by word index), preserving order.
    fallback = [i for i, x in enumerate(idx) if x is None]
    known = [(i, x) for i, x in enumerate(idx) if x is not None]
    last = len(words)
    for i in fallback:
        lo = max(((j, x) for j, x in known if j < i), default=(-1, 0), key=lambda p: p[0])
        hi = min(((j, x) for j, x in known if j > i), default=(n, int(last * 0.85)), key=lambda p: p[0])
        frac = (i - lo[0]) / (hi[0] - lo[0])
        idx[i] = int(lo[1] + frac * (hi[1] - lo[1]))
    times = []
    for i in range(n):
        t = items[min(idx[i], len(items) - 1)]["start"] - REVEAL_LEAD
        t = max(t, times[-1] + MIN_GAP if times else 0.0)
        times.append(round(min(t, max(dur - 0.3, 0)), 3))
    return times, fallback


def _match_any(kws: list[str], word: str) -> bool:
    return any(_match(k, word) for k in kws)


# ---------------------------------------------------------------- focus

FOCUS_LEAD = 0.08       # seconds: the focus lands just as its phrase starts


def find_phrase(phrase: str, words: list[str], start: int = 0) -> int | None:
    """Index of the first word at or after `start` where `phrase` begins (whole normalised words, in sequence).

    Same rule as findPhrase in src/schema.ts, which checks at `check` time that every focus phrase is in the narration
    (exact normalised words; Arabic words also match with or without prefix clitics).
    """
    parts = [norm(p) for p in phrase.split() if norm(p)]
    if not parts:
        return None
    for i in range(start, len(words) - len(parts) + 1):
        if all(word_eq(words[i + j], p) for j, p in enumerate(parts)):
            return i
    return None


def focus_times(phrases: list[str], spoken: str, items: list[dict] | None, dur: float) -> tuple[list[float], list[int]]:
    """Seconds (from the start of the narration audio) at which each focus change happens, plus indexes not found.

    `phrases` are in spoken form (pronunciation fixes applied) and are searched in order. With word times, a focus
    lands at its phrase's first word; without them, at the phrase's share of the words. A phrase that is not found
    (possible only if a pronunciation rewrite split it) goes just after the previous one.
    """
    words = [norm(w) for w in spoken.split()]
    total = max(len(words), 1)
    times: list[float] = []
    missing: list[int] = []
    pos = 0
    for i, ph in enumerate(phrases):
        hit = find_phrase(ph, words, pos)
        if hit is None:
            missing.append(i)
            hit = min(pos, total - 1)
        pos = hit + 1
        t = items[min(hit, len(items) - 1)]["start"] - FOCUS_LEAD if items else hit / total * dur
        t = max(t, times[-1] + MIN_GAP if times else 0.0)
        times.append(round(min(max(t, 0.0), max(dur - 0.3, 0)), 3))
    return times, missing
