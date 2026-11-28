// How a scene of the whiteboard layout relates to the scenes it continues. Pure (no React): a run of `continues` scenes is
// one board that grows, so each scene must draw what it carries exactly as the previous scene ended: same place, same
// size, same pen wobble, no redraw.
import {BOARD_CONTINUES_TYPES} from '../visuals/capabilities';
import {describe} from '../visuals/registry';
import type {Scene} from '../types';
import type {BoardCtx} from '../sdk/board-kit';

export type BoardPlan = {
  /** The board-kit context fields (carried slots, carried heading, the run's visuals); absent for a scene outside any run. */
  ctx: Pick<BoardCtx, 'carried' | 'carriedHead' | 'chain' | 'origin'>;
  /** Seed of the pen wobble: the first scene of the run's number, so a carried item repeats the previous scene's strokes exactly. */
  seedIndex: number;
  /** The next scene continues this one: the board is not wiped at the end of this scene. */
  nextContinues: boolean;
};

/** The plan for scene `i`. Scenes whose type does not opt in (capabilities.boardContinues) are never part of a run. */
export const boardPlan = (scenes: readonly Scene[], i: number): BoardPlan => {
  const joins = (k: number) => !!scenes[k]?.continues && k > 0 && BOARD_CONTINUES_TYPES.includes(scenes[k].visual.type) && scenes[k - 1].visual.type === scenes[k].visual.type;
  let head = i, tail = i;
  while (joins(head)) head--;
  while (joins(tail + 1)) tail++;
  if (head === tail) return {ctx: {}, seedIndex: i + 1, nextContinues: false};
  const visual = scenes[i].visual;
  const cont = joins(i);
  const carried = cont ? describe(visual, scenes[i - 1].visual).carried : undefined;
  // a carried slot keeps what its first scene's narration picked out: walk back to the scene that drew it fresh
  const origin = carried?.map((c, slot) => {
    if (!c) return undefined;
    let k = i;
    while (k > head && describe(scenes[k].visual, scenes[k - 1].visual).carried[slot]) k--;
    return scenes[k];
  });
  // the title line of a visual: `heading`, or the `question` of stance and duo
  const headOf = (v: Scene['visual']): string | undefined => { const h = v as {heading?: string; question?: string}; return h.heading ?? h.question; };
  const carriedHead = cont && headOf(visual) !== undefined && headOf(scenes[i - 1].visual) === headOf(visual);
  return {
    ctx: {carried, carriedHead, origin, chain: scenes.slice(head, tail + 1).map((s) => s.visual)},
    seedIndex: head + 1,
    nextContinues: i < tail,
  };
};
