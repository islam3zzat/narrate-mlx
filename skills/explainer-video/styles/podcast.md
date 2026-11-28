# Style: podcast

Two experts talk a topic through, one scene per turn, with each speaker's name and role on screen while they talk. Read `references/presentation.md` first; this adds to it. English only (the voices are Kokoro's English ones).

## Cast (decide before you write a line)
- Choose **two complementary expert roles** from the topic and the user's requirements, not two people who agree: for a migration, the architect who owns the design and the engineer who runs it; for a launch, the product lead and the support lead. Each needs a **stake** in the topic (what they gain or fear), stated to yourself before writing, and each reads the same facts differently because of it.
- Give each a first name and a role of at most a few words (`"name": "Dana", "role": "Principal Security Engineer"`). Names are labels on screen, not characters to roleplay: no backstory.
- Voices: map the two roles to **one woman's voice and one man's voice**, by default `af_heart` and `am_michael`, unless the user asks otherwise. Any two different Kokoro English voices from `skills/speak/voices.json` are valid. `--voice` cannot be used with speakers; each speaker's `voice` is used.
- Declare them at the top of the script and tag every scene:
  `"speakers": {"a": {"name": "Dana", "role": "Principal Security Engineer", "voice": "af_heart"}, "b": {"name": "Omar", "role": "Principal Architect", "voice": "am_michael"}}`, and `"speaker": "a"` on each scene. Exactly two speakers; both must speak.

## Shape (tag scenes with `section`)
1. `hook`: one speaker opens with a claim or question the listener cares about; the other reacts. Names and roles are introduced here only, in s01 and s02, and only if the screen tag does not already do it.
2. `setup`: the shared facts, short, so the argument has ground to stand on.
3. `exchange`: the body. **Each turn must do one of three things:** add a fact the other did not have, challenge the previous claim, or build on it with a consequence. A turn that only agrees is cut.
4. `disagreement`: at least **two real disagreements**, where the speakers hold different positions for stated reasons, each followed by a `resolution` that says what settled it (a number, a constraint, a trade-off one of them concedes). Never fake a disagreement and never leave one hanging.
5. `close`: three things to remember, said by the speaker who did not open, and the decision or next step.

## Turns
- One scene is one turn: one speaker, 10 to 45 words, one thought. At most two turns in a row from the same speaker (the style warns), and each speaker gets at least 30% of the words.
- **Hand over** every turn with a question or a claim the other can push on. No "great point", "exactly", "absolutely", "good question", "I couldn't agree more".
- Do not say the other's name in narration (the tag shows who speaks), and never introduce yourself outside s01. The speakers react to ideas, not to each other's manners.
- Blameless wording holds ("the pipeline", "the rollout"), not "your team should have". The lint is on.

## Spoken word
- Written for the ear, and for two voices: contractions, short sentences, numbers as words, no lists read aloud. Interruptions and half-agreements are fine; stage directions and sound words ("ha", "hmm") are not.
- Each speaker keeps their own vocabulary: the architect says "boundary", the on-call engineer says "pager". Do not let both sound like the narrator.

## Pictures
The picture follows the argument. The renderer draws the speaker's name pill top centre, so keep headings and questions short (about 40 characters) and never rely on the top 120 px of the board.
- **s01 is a `duo`** carrying the question the listener came for (the question is the topic as a question, the optional `quote` is the opener's claim in under 80 characters). The two figures face each other, the speaker of the scene lit and the other dimmed.
- **Put the disagreements on a `stance` map.** Build one or two arcs of 3 to 5 turns: the first scene holds the question and one `claim`; each later scene sets `"continues": true` and lists the full map again, the carried entries first and unchanged, plus one new entry (`disagree` or `agree` with a `ref` to the entry it answers; `resolve` with a `ref` to the `disagree` it settles, which draws a check mark over it). A disagreement therefore stays on the board until the turn that resolves it. `by` is the speaker id (`a`, `b`), at most 4 entries per speaker, 60 characters each, in words the narration says. A video with 12 or more scenes and no `stance` is warned.
- **Teach with `graph`, `sequence`, `flow` or `compare`** (and `steps`, `callout`, `table`): the picture belongs to the topic, not to the speaker, and shows the structure behind the point being made. Without `continues`, each turn gets its own picture.
- **Change the picture at least every 3 turns.** A continued stance arc counts as changing, because every turn adds an entry; three scenes in a row on an unchanged picture is a talking head.
- **`duo` is for the opening question, one pivotal claim and, if you like, the close:** at most 3 per video, never two in a row (the style warns on both). Do not use it to fill a turn that has nothing to draw.
- **The last 1 or 2 turns are `notes`** with the takeaways: the first lists the ones agreed so far, the second (with `continues`) adds the rest. Each item's `by` is the speaker id it belongs to (omit it for one both share), and at most 6 items fit well.
- `continues` on the whiteboard works for `bullets`, `steps`, `flow`, `stance` and `notes`: the leading items stay drawn exactly as they were, with no wipe between the turns, and only the new ones are written as they are spoken (keep the carried ones first and unchanged, repeat the heading). `graph`, `class` and `sequence` continue too, but their `continues` makes the script fall back to slides (the name tag works in both). `duo` is never continued.
- `duo`, `stance` and notes with a `by` need the script's `speakers`; without them `check` rejects the script.
- The name tag is drawn by the renderer: top centre on the whiteboard, and on slides at the start edge just above the caption box, so it never covers the title bar or the picture. Leave the bottom 230 px of a slide free, as for every video.

## Do not
- Do not put one speaker's whole explanation in a row of scenes; split it with a question from the other.
- Do not use more than two speakers, or give the two the same voice (`check` rejects both).
