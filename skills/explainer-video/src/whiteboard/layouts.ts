// Per-visual-type annotation layouts for the whiteboard layout. Each type draws itself in src/visuals/<type>/board.ts
// (shared helpers: sdk/board-kit.ts) and the generated visuals/boards.ts maps type to drawing. This file is the dispatcher:
// it runs the type's drawing and squeezes the late items to finish before the eraser wipe.
import type {Visual} from '../types';
import {Board, type Item} from '../sdk/annotate';
import type {BoardCtx} from '../sdk/board-kit';
import {BOARDS} from '../visuals/boards';

export type Ctx = BoardCtx;

/** Frames at the end of a scene kept free for the eraser wipe (10) plus a margin. */
const WIPE_MARGIN = 14;

/**
 * Items are timed from the narration, so the last ones can start late and their fixed draw times then run past the
 * end of the scene (text frozen half-written). Squeeze only those late items to finish before the wipe; earlier
 * items keep their narration-synced timing. Very short scenes end up drawn fast, never cut off.
 */
const fitToScene = (items: Item[], frames: number): Item[] => {
  const deadline = frames - WIPE_MARGIN;
  for (const it of items) {
    it.t0 = Math.min(it.t0, deadline - 4);
    it.dur = Math.max(4, Math.min(it.dur, deadline - it.t0));
  }
  return items;
};


/** The scene's board as timed Items, or null when the type has no hand drawing (or declines this content: the scene then falls back to the normal view). */
export const buildBoard = (visual: Visual, c: Ctx, seed: number): Item[] | null => {
  const draw = (BOARDS as Record<string, ((v: never, c: Ctx, b: Board) => boolean) | undefined>)[visual.type];
  if (!draw) return null;
  const b = new Board(seed);
  if (!draw(visual as never, c, b)) return null;
  return fitToScene(b.items, c.frames);
};
