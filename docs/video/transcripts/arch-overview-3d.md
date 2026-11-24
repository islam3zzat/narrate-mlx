# Narrate Architecture — 3D

## Scene s01 (7.0s)

Narrate turns a plain JSON script into a fully narrated, timed explainer video on Apple Silicon.

## Scene s02 (9.5s)

Every video runs through four stages: validate the script, synthesize speech locally, align word timings, and render frames with Remotion.

## Scene s03 (8.7s)

At the core, the schema feeds a single visual registry that dispatches each scene to either its two-dimensional or three-dimensional view.

## Scene s04 (10.2s)

During audio generation, the CLI sends narration to Kokoro, receives per-word timestamps, and writes a timing manifest that drives every reveal.

## Scene s05 (8.8s)

Zooming out, the full build loop validates the script, loops back on errors, skips synthesis on cache hits, and renders the final video.

## Scene s06 (10.2s)

Both rendering modes share the exact same script format: two-dimensional mode maximizes diagram density, while three-dimensional mode adds spatial depth.

## Scene s07 (8.2s)

And the final callout: write your story once, and switch between two-dimensional and three-dimensional rendering with a single mode field.


_Total runtime: 69s_
