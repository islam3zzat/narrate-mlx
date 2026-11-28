// What a "continues" scene carries over from the previous one. The rules themselves live in semantics/ (describe), which explainer.py
// asks for the reveal slots and what is carried.
import {interpolate, Easing} from 'remotion';
import constants from './constants.json';

/** Frames over which carried parts move from their old place to their new one, at the very start of the scene. */
export const GLIDE_FRAMES = 20;

export const glide = (frame: number) =>
  interpolate(frame, [0, GLIDE_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

import {CARRIED} from './semantics/carry';
export {CARRIED, sameType, carriedIds, carriedPrefix} from './semantics/carry';

/**
 * Frame at which each revealable item appears. Carried items are shown from the start; the others take their time from
 * `reveal` (seconds, one per item, from explainer.py) or, without it, are spread over the first 80% of the narration.
 */
export const revealFrames = (carried: boolean[], lead: number, audioFrames: number, reveal?: number[]): number[] => {
  const fresh = carried.flatMap((c, i) => (c ? [] : [i]));
  return carried.map((c, i) => {
    if (c) return CARRIED;
    if (reveal && reveal[i] !== undefined) return lead + Math.round(reveal[i] * constants.fps);
    return lead + Math.round((fresh.indexOf(i) / Math.max(fresh.length, 1)) * audioFrames * 0.8);
  });
};
