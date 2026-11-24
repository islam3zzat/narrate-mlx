# Presentation principles (every video)

Read this before planning any video. These rules hold for any audience. An audience file
(e.g. `teaching.md` for learners, when it exists) adds to them; it never replaces them.
Style playbooks in `styles/<name>.md` (see `explainer.py styles`) are audience files too: they add to this one.
Mechanics (script format, visual types, word limits, commands) live in `SKILL.md`.

Most of these come from multimedia-learning research (Mayer) and ordinary good presenting.

## Shape of a video
- **Depth sets the length, not a fixed budget.** Cover the idea well enough for this audience
  to understand it, not just to recognise it. A short summary only suits viewers who already
  know the basics.
- **Segment.** One big idea per video. When a topic needs more, make a series of parts
  (`<id>-part1`, `-part2`) of a few minutes each rather than one long video or one rushed one.
- **Hook first.** Open with a question, a surprise or something the viewer already knows,
  then say what the video covers.
- **Close with what to remember**, and what the next part covers if there is one. A later part
  opens by recalling the earlier one.

## Explaining
- **Example before abstraction.** Show a concrete case, then name and generalise it. Introduce a
  new term only after the viewer has something to attach it to.
- **Give the because.** Don't state a fact without the reason or mechanism behind it.
- **One analogy per hard idea**, and say where it stops working.
- **Talk to the viewer** ("you", "your"). Use a conversational tone, not a lecture.

## Narration
- Write for the ear: short sentences, plain words, numbers as words when spoken
  ("one hundred seventy-seven").
- One scene is one thought. Say what the visual shows.

## Visuals
- **Show structure as a diagram, not as text.** Use a flow, hierarchy, relationship or exchange
  diagram whenever the content has that shape. `SKILL.md` maps each structure to a visual type.
- **Signal.** Point at what matters (`focus`) only when the narration does.
- **No redundancy.** On-screen text is a short cue, not the spoken sentence; captions already
  show that.
- **Coherence.** Leave out decorative detail that doesn't serve the idea.
- **Reuse a spoken word in every on-screen item** (bullet, step, node, column) so it appears as
  it is said. Otherwise `audio` warns "no keyword match" and only guesses the timing.
